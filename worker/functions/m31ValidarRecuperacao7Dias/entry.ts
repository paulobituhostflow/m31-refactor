// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31ValidarRecuperacao7Dias
 *
 * Valida candidatos à recuperação de checkout nos últimos 7 dias.
 * NÃO envia mensagens — apenas valida, regenera links inválidos e
 * marca os aptos na fila_recuperacao para aprovação manual.
 *
 * Validações obrigatórias por candidato:
 * 1. Confirmar que não possui inscrição aprovada
 * 2. Confirmar que pagamento não está aprovado/recebido/compensado
 * 3. Cruzar telefone, CPF, e-mail e código para duplicidades
 * 4. Verificar se existe outra inscrição válida vinculada à mesma pessoa
 * 5. Não enviar cobrança para quem já estiver inscrita
 * 6. Confirmar se cobrança Asaas ainda está pendente
 * 7. Testar se link Asaas está ativo
 * 8. Validar valor, lote e dados da cobrança
 * 9. Se link vencido/cancelado/inválido → atualizar/gerar nova cobrança
 * 10. Salvar novo link antes do envio
 * 11. Não criar cobrança duplicada
 * 12. Inconsistência/presenteada/dúvida → revisão manual
 */

const ASAAS_BASE = '__ASAAS_API__';
const ASAAS_PAGO = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'];

function sanitizePhone(phone) {
  let d = (phone || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (d.startsWith('55') && d.length >= 12) return d;
  return d.length >= 10 ? `55${d}` : d;
}

function buildExternalRef(cpfLimpo) {
  return cpfLimpo && cpfLimpo.length === 11 ? `${cpfLimpo}-M31FILHAS` : null;
}

async function fetchAsaas(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error(`Timeout: Asaas não respondeu em ${timeoutMs / 1000}s`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── Buscar cobrança Asaas por externalReference (âncora determinística) ──
async function buscarAsaasPorExternalRef(externalRef, ASAAS_KEY) {
  if (!externalRef) return null;
  try {
    const res = await fetchAsaas(`${ASAAS_BASE}/payments?externalReference=${encodeURIComponent(externalRef)}&limit=10`, {
      headers: { 'access_token': ASAAS_KEY },
    });
    const data = await res.json();
    if (!data?.data || data.data.length === 0) return null;
    const paga = data.data.find(p => ASAAS_PAGO.includes(p.status));
    const pendente = data.data.find(p => p.status === 'PENDING');
    const escolhida = paga || pendente || data.data[0];
    return {
      payment_id: escolhida.id,
      url: escolhida.invoiceUrl || null,
      value: escolhida.value,
      status: escolhida.status,
    };
  } catch (e) {
    logger.log('[ValidarRecuperacao] Erro buscar Asaas:', e.message);
    return null;
  }
}

// ── Buscar pagamentos por customer (CPF) ──
async function buscarAsaasPorCpf(cpfLimpo, ASAAS_KEY) {
  if (!cpfLimpo || cpfLimpo.length !== 11) return null;
  try {
    const custRes = await fetchAsaas(`${ASAAS_BASE}/customers?cpfCnpj=${cpfLimpo}`, {
      headers: { 'access_token': ASAAS_KEY },
    });
    const custData = await custRes.json();
    if (!custData?.data?.length) return null;
    for (const cust of custData.data.slice(0, 3)) {
      const payRes = await fetchAsaas(`${ASAAS_BASE}/payments?customer=${cust.id}&limit=10`, {
        headers: { 'access_token': ASAAS_KEY },
      });
      const payData = await payRes.json();
      const pago = (payData?.data || []).find(p => ASAAS_PAGO.includes(p.status));
      if (pago) return { ...pago, ja_pago: true };
      const pendente = (payData?.data || []).find(p => p.status === 'PENDING' && p.invoiceUrl);
      if (pendente) return pendente;
    }
    return null;
  } catch (e) {
    logger.log('[ValidarRecuperacao] Erro buscar por CPF:', e.message);
    return null;
  }
}

// ── Criar novo checkout Asaas (sem gerar duplicata) ──
async function gerarNovoCheckout(inscricao, lote, ASAAS_KEY) {
  const externalRef = buildExternalRef((inscricao.cpf || '').replace(/\D/g, ''));
  const valor = inscricao.valor_pago || lote?.valor || 0;
  if (!valor) return null;
  try {
    const checkoutRes = await fetchAsaas(`${ASAAS_BASE}/checkouts`, {
      method: 'POST',
      headers: { 'access_token': ASAAS_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        billingTypes: ['PIX', 'CREDIT_CARD'],
        chargeTypes: ['DETACHED', 'INSTALLMENT'],
        installment: { maxInstallmentCount: 5 },
        minutesToExpire: 1440,
        externalReference: externalRef || inscricao.codigo_inscricao,
        callback: {
          successUrl: '__APP_ORIGIN__/obrigado',
          cancelUrl: '__APP_ORIGIN__/m31-inscricao',
          expiredUrl: '__APP_ORIGIN__/m31-inscricao',
        },
        items: [{
          name: `M31 Filhas - ${lote?.nome || 'Inscrição'}`,
          description: `Inscrição M31 Filhas - ${inscricao.nome}`,
          value: valor,
          quantity: 1,
        }],
      }),
    });
    const checkout = await checkoutRes.json();
    if (checkout.link) return { link: checkout.link, payment_id: null };
    return null;
  } catch (e) {
    logger.log('[ValidarRecuperacao] Erro gerar checkout:', e.message);
    return null;
  }
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const ASAAS_KEY = config('ASAAS_API_KEY');
    const S = base44.asServiceRole.entities;

    // ── 1. Buscar candidatos: checkout_pendente ou checkout_abandonado nos últimos 7 dias ──
    const corte7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    const [pendentes, abandonados] = await Promise.all([
      S.EventoM31Inscricao.filter({ status_pagamento: 'checkout_pendente' }, '-updated_date', 200),
      S.EventoM31Inscricao.filter({ status_pagamento: 'checkout_abandonado' }, '-updated_date', 200),
    ]);

    // Filtrar apenas atualizados nos últimos 7 dias (client-side — $gte em created_date não é confiável)
    const candidatos = [...pendentes, ...abandonados].filter(i =>
      i.updated_date && i.updated_date >= corte7d &&
      i.opt_out !== true &&
      !i.fila_recuperacao // já na fila não revalidar
    );

    // Deduplicar por ID (pode aparecer em ambas as listas)
    const vistos = new Set();
    const unicos = candidatos.filter(i => {
      if (vistos.has(i.id)) return false;
      vistos.add(i.id);
      return true;
    });

    const resultado = {
      total_candidatos: unicos.length,
      validos: [] as any[],
      invalidos: [] as any[],
      revisao_manual: [] as any[],
      links_regenerados: 0,
      ja_pagos_detectados: 0,
    };

    // ── Carregar lotes para validação de valor ──
    const lotes = await S.EventoM31Lote.list('-ordem', 10);
    const lotePorCodigo = {};
    lotes.forEach(l => { lotePorCodigo[l.codigo] = l; });

    for (const insc of unicos) {
      const cpfNorm = (insc.cpf || '').replace(/\D/g, '');
      const telNorm = sanitizePhone(insc.whatsapp);
      const emailNorm = (insc.email || '').toLowerCase().trim();
      const entry: any = {
        inscricao_id: insc.id,
        nome: insc.nome,
        whatsapp: insc.whatsapp,
        email: insc.email,
        cpf: insc.cpf ? insc.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.***.***-**') : null,
        status_pagamento: insc.status_pagamento,
        valor_pago: insc.valor_pago,
        lote: insc.lote,
        codigo_inscricao: insc.codigo_inscricao,
        updated_date: insc.updated_date,
        link_asaas: insc.asaas_charge_url,
      };

      // ── Validação 1: Já possui inscrição aprovada (por CPF) ──
      if (cpfNorm) {
        const aprovadasPorCpf = await S.EventoM31Inscricao.filter(
          { cpf: cpfNorm, status_pagamento: 'aprovado' }, '-updated_date', 5);
        if (aprovadasPorCpf.some(a => a.id !== insc.id)) {
          entry.motivo = 'Já possui inscrição aprovada com este CPF';
          resultado.invalidos.push(entry);
          continue;
        }
      }

      // ── Validação 2: Pagamento não está aprovado (por telefone) ──
      const aprovadasPorTel = await S.EventoM31Inscricao.filter(
        { whatsapp: insc.whatsapp, status_pagamento: 'aprovado' }, '-updated_date', 5);
      if (aprovadasPorTel.some(a => a.id !== insc.id)) {
        entry.motivo = 'Já possui inscrição aprovada com este telefone';
        resultado.invalidos.push(entry);
        continue;
      }

      // ── Validação 3: Pagamento não está aprovado (por e-mail) ──
      if (emailNorm) {
        const aprovadasPorEmail = await S.EventoM31Inscricao.filter(
          { email: emailNorm, status_pagamento: 'aprovado' }, '-updated_date', 5);
        if (aprovadasPorEmail.some(a => a.id !== insc.id)) {
          entry.motivo = 'Já possui inscrição aprovada com este e-mail';
          resultado.invalidos.push(entry);
          continue;
        }
      }

      // ── Validação 4: Outra inscrição válida vinculada (checkout_pendente ativo) ──
      if (cpfNorm) {
        const outras = await S.EventoM31Inscricao.filter(
          { cpf: cpfNorm, status_pagamento: 'checkout_pendente' }, '-updated_date', 5);
        const outraMaisRecente = outras.find(a => a.id !== insc.id && a.updated_date > insc.updated_date);
        if (outraMaisRecente) {
          entry.motivo = `Existe checkout mais recente para este CPF (${new Date(outraMaisRecente.updated_date).toLocaleDateString('pt-BR')})`;
          resultado.invalidos.push(entry);
          continue;
        }
      }

      // ── Validação 5: Compra presenteada → revisão manual ──
      if (insc.presenteado_id || insc.presenteado_por_id) {
        entry.motivo = 'Compra presenteada — encaminhar para revisão manual';
        resultado.revisao_manual.push(entry);
        continue;
      }

      // ── Validação 6: Validar valor e lote ──
      const loteInfo = lotePorCodigo[insc.lote];
      if (loteInfo && insc.valor_pago && insc.valor_pago < loteInfo.valor * 0.5) {
        entry.motivo = `Valor suspeito: R$ ${insc.valor_pago} vs lote R$ ${loteInfo.valor}`;
        resultado.revisao_manual.push(entry);
        continue;
      }

      // ── Validação 7-11: Verificar link Asaas ──
      let linkValido = false;
      let linkAtualizado = insc.asaas_charge_url;
      let paymentIdAtual = insc.asaas_payment_id;

      if (ASAAS_KEY && cpfNorm) {
        const externalRef = buildExternalRef(cpfNorm);
        let asaasPayment = await buscarAsaasPorExternalRef(externalRef, ASAAS_KEY);

        // Se não achou por externalRef, buscar por CPF
        if (!asaasPayment) {
          asaasPayment = await buscarAsaasPorCpf(cpfNorm, ASAAS_KEY);
        }

        if (asaasPayment) {
          // ── Já pago no Asaas → marcar como aprovado, pular recuperação ──
          if (ASAAS_PAGO.includes(asaasPayment.status) || asaasPayment.ja_pago) {
            await S.EventoM31Inscricao.update(insc.id, {
              status_pagamento: 'aprovado',
              asaas_payment_id: asaasPayment.payment_id || asaasPayment.id,
              valor_pago: asaasPayment.value || insc.valor_pago,
            }).catch(() => {});
            entry.motivo = `Pagamento já confirmado no Asaas (${asaasPayment.status}) — convertido para aprovado`;
            resultado.invalidos.push(entry);
            resultado.ja_pagos_detectados++;
            continue;
          }

          // ── PENDING com URL válida → link ativo ──
          if (asaasPayment.status === 'PENDING' && asaasPayment.url) {
            linkValido = true;
            linkAtualizado = asaasPayment.url;
            paymentIdAtual = asaasPayment.payment_id || asaasPayment.id;
            // Salvar link se diferente
            if (linkAtualizado !== insc.asaas_charge_url) {
              await S.EventoM31Inscricao.update(insc.id, {
                asaas_charge_url: linkAtualizado,
                asaas_payment_id: paymentIdAtual,
              }).catch(() => {});
              resultado.links_regenerados++;
            }
          }
        }

        // ── Link inválido/vencido → gerar novo checkout (sem duplicata) ──
        if (!linkValido) {
          const novoCheckout = await gerarNovoCheckout(insc, loteInfo, ASAAS_KEY);
          if (novoCheckout?.link) {
            linkValido = true;
            linkAtualizado = novoCheckout.link;
            await S.EventoM31Inscricao.update(insc.id, {
              asaas_charge_url: linkAtualizado,
              status_pagamento: 'checkout_pendente',
            }).catch(() => {});
            resultado.links_regenerados++;
          } else {
            entry.motivo = 'Link Asaas inválido e não foi possível gerar novo checkout';
            resultado.revisao_manual.push(entry);
            continue;
          }
        }
      } else {
        // Sem ASAAS_KEY ou CPF — não é possível validar o link
        entry.motivo = 'Sem CPF ou Asaas API Key — não foi possível validar o link';
        resultado.revisao_manual.push(entry);
        continue;
      }

      // ── Tudo validado → marcar como apto para recuperação ──
      if (linkValido) {
        await S.EventoM31Inscricao.update(insc.id, {
          fila_recuperacao: true,
          status_fila_recuperacao: 'aguardando_aprovacao',
          fila_recuperacao_em: new Date().toISOString(),
          asaas_charge_url: linkAtualizado,
        });
        entry.link_asaas = linkAtualizado;
        entry.motivo = 'Validado — apto para recuperação';
        resultado.validos.push(entry);
      }
    }

    return Response.json({
      success: true,
      ...resultado,
      mensagem: `${resultado.validos.length} aptos para recuperação | ${resultado.invalidos.length} inválidos | ${resultado.revisao_manual.length} revisão manual | ${resultado.links_regenerados} links regenerados | ${resultado.ja_pagos_detectados} já pagos detectados`,
    });

  } catch (error) {
    logger.error('[ValidarRecuperacao7Dias] Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
