// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

const ASAAS_BASE = "__ASAAS_API__";
const UAZAPI_BASE = "__UAZAPI_API__";
const FORM_LINK = "__APP_ORIGIN__/m31-inscricao";

function normPhone(phone) {
  const d = (phone || '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) return d;
  return `55${d}`;
}

// Chamada direta à UAZAPI (mesmo padrão do m31SendWhatsApp)
async function sendWhatsAppDirect(phone, message, token) {
  const res = await fetch(`${UAZAPI_BASE}/send/text`, {
    method: 'POST',
    headers: { 'token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: normPhone(phone),
      number: normPhone(phone),
      message,
      text: message,
      body: message
    }),
  });
  let data;
  try { data = await res.json(); } catch (_) { data = { raw_status: res.status }; }
  const sucesso = res.status === 200 && !data?.error;
  return { sucesso, status: res.status, data };
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const ASAAS_KEY = config("ASAAS_API_KEY");

    // 1. Buscar impactadas: checkout_abandonado + checkout_pendente sem cobrança
    const abandonados = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { status_pagamento: 'checkout_abandonado' }, '-created_date', 200
    );
    const pendentes = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { status_pagamento: 'checkout_pendente' }, '-created_date', 200
    );

    // Filtrar apenas sem cobrança Asaas
    const todosImpactados = [
      ...abandonados.filter(i => !i.asaas_payment_id && !i.asaas_charge_url),
      ...pendentes.filter(i => !i.asaas_payment_id && !i.asaas_charge_url)
    ];

    // 2. Deduplicar por id
    let unicos = [...new Map(todosImpactados.map(i => [i.id, i])).values()];

    // 3. Deduplicar por WhatsApp (manter apenas o mais recente)
    const porWhatsapp = new Map();
    for (const insc of unicos.sort((a,b) => new Date(b.created_date) - new Date(a.created_date))) {
      const wpp = normPhone(insc.whatsapp);
      if (!porWhatsapp.has(wpp)) {
        porWhatsapp.set(wpp, insc);
      }
    }
    unicos = [...porWhatsapp.values()];

    // 4. Excluir quem já pagou (mesmo CPF ou WhatsApp com status aprovado)
    const todosAprovados = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { status_pagamento: 'aprovado' }, '-created_date', 500
    );
    const cpfAprovados = new Set(todosAprovados.map(a => a.cpf).filter(Boolean));
    const whatsappAprovados = new Set(todosAprovados.map(a => normPhone(a.whatsapp)).filter(w => w !== '55'));

    unicos = unicos.filter(i => {
      const jaPagou = (i.cpf && cpfAprovados.has(i.cpf)) || whatsappAprovados.has(normPhone(i.whatsapp));
      return !jaPagou;
    });

    // 5. Excluir quem já recebeu recuperação hoje
    const hoje = new Date().toDateString();
    const logsHoje = await base44.asServiceRole.entities.M31MessageLog.filter(
      { tipo: 'recuperacao' }, '-enviado_em', 100
    );
    const jaRecebidasHoje = new Set(
      logsHoje.filter(l => l.enviado_em && new Date(l.enviado_em).toDateString() === hoje && l.sucesso).map(l => l.inscricao_id)
    );
    const jaRecebidasWppHoje = new Set(
      logsHoje.filter(l => l.enviado_em && new Date(l.enviado_em).toDateString() === hoje && l.sucesso).map(l => normPhone(l.telefone))
    );

    unicos = unicos.filter(i => {
      return !jaRecebidasHoje.has(i.id) && !jaRecebidasWppHoje.has(normPhone(i.whatsapp));
    });

    // 6. Separar: dados completos vs incompletos (excluir registros de teste)
    const ehTeste = (i) => {
      const nomeLower = (i.nome || '').toLowerCase();
      return nomeLower.includes('teste') || nomeLower.includes('debug') || nomeLower.includes('visitante') || nomeLower.trim() === '';
    };

    const temDadosCompletos = (i) => {
      const cpf = (i.cpf || '').replace(/\D/g, '');
      return i.nome && i.nome.trim().split(/\s+/).length >= 2
        && i.email && i.email.includes('@')
        && cpf.length === 11
        && i.whatsapp && i.whatsapp.replace(/\D/g, '').length >= 10;
    };

    // Excluir testes antes de processar
    unicos = unicos.filter(i => !ehTeste(i));

    const paraCheckout = unicos.filter(temDadosCompletos);
    const paraFormulario = unicos.filter(i => !temDadosCompletos(i));

    // 7. Limite de 10 envios por execução
    const MAX_ENVIOS = 10;
    let enviadosCheckout = 0;
    let enviadosFormulario = 0;
    let erros = [];
    let naoRecuperados = [];
    let detalhes = [];
    let parouPorErro = false;
    let errosConsecutivos = 0;

    // Buscar lote ativo para valor
    const lotes = await base44.asServiceRole.entities.EventoM31Lote.filter({ ativo: true });
    let loteAtivo = lotes[0];
    if (!loteAtivo) {
      const todosLotes = await base44.asServiceRole.entities.EventoM31Lote.list('-ordem', 10);
      loteAtivo = todosLotes[0];
    }

    // 8. Processar checkout primeiro
    for (const insc of paraCheckout) {
      if (enviadosCheckout + enviadosFormulario >= MAX_ENVIOS || parouPorErro) break;
      try {
        const cpfLimpo = insc.cpf.replace(/\D/g, '');
        const phone = normPhone(insc.whatsapp);
        const nome = insc.nome.trim();

        // Pular números malformados (DDI duplicado) sem bloquear o lote
        if (phone.startsWith('5555')) {
          naoRecuperados.push({ nome, whatsapp: phone, motivo: 'Número com DDI duplicado — correção manual necessária' });
          continue;
        }
        const primeiroNome = nome.split(' ')[0];

        // Criar cliente no Asaas
        const customerRes = await fetch(`${ASAAS_BASE}/customers`, {
          method: 'POST',
          headers: { 'access_token': ASAAS_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: nome,
            email: insc.email,
            mobilePhone: insc.whatsapp.replace(/\D/g, ''),
            cpfCnpj: cpfLimpo,
            notificationDisabled: true
          })
        });
        const customer = await customerRes.json();
        if (!customer.id) {
          naoRecuperados.push({ nome, whatsapp: phone, motivo: 'Erro ao criar cliente no Asaas: ' + (customer.errors?.[0]?.description || 'desconhecido') });
          continue;
        }

        // Criar cobrança — usar codigo_inscricao existente como externalReference (ou gerar novo se não tiver)
        const codigo_inscricao = insc.codigo_inscricao || `M31-${Date.now().toString(36).toUpperCase()}`;
        const chargeRes = await fetch(`${ASAAS_BASE}/payments`, {
          method: 'POST',
          headers: { 'access_token': ASAAS_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer: customer.id,
            billingType: 'UNDEFINED',
            value: loteAtivo.valor,
            dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            description: `M31 Filhas - ${loteAtivo.nome} - ${nome} (Recuperação)`,
            externalReference: codigo_inscricao,
            successUrl: '__APP_ORIGIN__/obrigado'
          })
        });
        const charge = await chargeRes.json();
        if (!charge.id) {
          naoRecuperados.push({ nome, whatsapp: phone, motivo: 'Erro ao criar cobrança no Asaas: ' + (charge.errors?.[0]?.description || 'desconhecido') });
          continue;
        }

        // Atualizar inscrição existente com novo link
        await base44.asServiceRole.entities.EventoM31Inscricao.update(insc.id, {
          asaas_payment_id: charge.id,
          asaas_charge_url: charge.invoiceUrl,
          status_pagamento: 'checkout_pendente',
          codigo_inscricao: codigo_inscricao,
          lote: loteAtivo.codigo
        });

        // Enviar mensagem via m31SendWhatsApp
        const mensagem =
          `Oi, ${primeiroNome}! 💚\n\n` +
          `Identificamos uma instabilidade no link de inscrição do M31 Filhas.\n` +
          `Já corrigimos.\n\n` +
          `Para não perder sua vaga, você pode finalizar sua inscrição por aqui:\n` +
          `${charge.invoiceUrl}\n\n` +
          `Se já tiver conseguido pagar, pode desconsiderar esta mensagem.`;

        const UAZAPI_TOKEN = config('UAZAPI_TOKEN');
        const wpRes = await sendWhatsAppDirect(phone, mensagem, UAZAPI_TOKEN);
        const sucesso = wpRes.sucesso;

        // Log
        await base44.asServiceRole.entities.M31MessageLog.create({
          inscricao_id: insc.id,
          inscricao_nome: nome,
          telefone: phone,
          tipo: 'recuperacao',
          stage: 'lote_esgotado_checkout',
          mensagem,
          sucesso,
          zapi_response: JSON.stringify(wpRes.data),
          erro: sucesso ? null : (wpRes.data?.error || `status ${wpRes.status}`),
          enviado_em: new Date().toISOString()
        });

        if (sucesso) {
          enviadosCheckout++;
          errosConsecutivos = 0;
          detalhes.push({ nome, whatsapp: phone, tipo: 'checkout', link: charge.invoiceUrl });
        } else {
          naoRecuperados.push({ nome, whatsapp: phone, motivo: 'Falha no envio WhatsApp após criar cobrança Asaas' });
          errosConsecutivos++;
          if (errosConsecutivos >= 3) { parouPorErro = true; }
        }

        // Throttle entre envios
        await new Promise(r => setTimeout(r, 3000));
      } catch (e) {
        naoRecuperados.push({ nome: insc.nome, whatsapp: normPhone(insc.whatsapp), motivo: 'Exceção: ' + e.message });
        errosConsecutivos++;
        if (errosConsecutivos >= 3) { parouPorErro = true; }
      }
    }

    // 9. Processar formulário (link simples)
    for (const insc of paraFormulario) {
      if (enviadosCheckout + enviadosFormulario >= MAX_ENVIOS || parouPorErro) break;
      try {
        const phone = normPhone(insc.whatsapp);
        const nome = insc.nome?.trim() || 'Querida';
        const primeiroNome = nome.split(' ')[0];

        // Pular números malformados (DDI duplicado) sem bloquear o lote
        if (phone.startsWith('5555')) {
          naoRecuperados.push({ nome, whatsapp: phone, motivo: 'Número com DDI duplicado — correção manual necessária' });
          continue;
        }

        const mensagem =
          `Oi, ${primeiroNome}! 💚\n\n` +
          `Identificamos uma instabilidade no link de inscrição do M31 Filhas.\n` +
          `Já corrigimos.\n\n` +
          `Para não perder sua vaga, você pode finalizar sua inscrição por aqui:\n` +
          `${FORM_LINK}\n\n` +
          `Se já tiver conseguido pagar, pode desconsiderar esta mensagem.`;

        const UAZAPI_TOKEN = config('UAZAPI_TOKEN');
        const wpRes = await sendWhatsAppDirect(phone, mensagem, UAZAPI_TOKEN);
        const sucesso = wpRes.sucesso;

        await base44.asServiceRole.entities.M31MessageLog.create({
          inscricao_id: insc.id,
          inscricao_nome: nome,
          telefone: phone,
          tipo: 'recuperacao',
          stage: 'lote_esgotado_formulario',
          mensagem,
          sucesso,
          zapi_response: JSON.stringify(wpRes.data),
          erro: sucesso ? null : (wpRes.data?.error || `status ${wpRes.status}`),
          enviado_em: new Date().toISOString()
        });

        if (sucesso) {
          enviadosFormulario++;
          errosConsecutivos = 0;
          detalhes.push({ nome, whatsapp: phone, tipo: 'formulario', link: FORM_LINK });
        } else {
          naoRecuperados.push({ nome, whatsapp: phone, motivo: 'Falha no envio WhatsApp (link formulário)' });
          errosConsecutivos++;
          if (errosConsecutivos >= 3) { parouPorErro = true; }
        }

        await new Promise(r => setTimeout(r, 3000));
      } catch (e) {
        naoRecuperados.push({ nome: insc.nome, whatsapp: normPhone(insc.whatsapp), motivo: 'Exceção: ' + e.message });
        errosConsecutivos++;
        if (errosConsecutivos >= 3) { parouPorErro = true; }
      }
    }

    return Response.json({
      total_impactadas: unicos.length,
      com_dados_completos: paraCheckout.length,
      sem_dados_completos: paraFormulario.length,
      enviados_checkout: enviadosCheckout,
      enviados_formulario: enviadosFormulario,
      total_enviados: enviadosCheckout + enviadosFormulario,
      nao_recuperados: naoRecuperados.length,
      nao_recuperados_lista: naoRecuperados,
      parou_por_erro: parouPorErro,
      detalhes,
      pendentes_proxima_execucao: unicos.length - (enviadosCheckout + enviadosFormulario) - naoRecuperados.length
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
