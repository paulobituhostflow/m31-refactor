// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
// M31 Caravana — catálogo público seguro + captura de intenção + checkout
// PIX R$ 97 por pessoa · cartão R$ 110 por pessoa (até 3x).
// Regra operacional: nunca perder uma tentativa por falha técnica do checkout.

const VALOR_PIX = 97;
const VALOR_CARTAO = 110;
const MAX_PARCELAS_CARTAO = 3;
const ASAAS_BASE = '__ASAAS_API__';
const ETAPA_RANK: Record<string, number> = {
  iniciou: 0,
  contato_capturado: 1,
  tentou_avancar: 2,
  checkout_criado: 3,
  pagamento_confirmado: 4,
};

function m31Telefone(raw: any) {
  let d = String(raw || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (!d) return { valor: '', desfecho: 'irrecuperavel', motivo: 'telefone_vazio' };
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return { valor: d, desfecho: 'certo', motivo: null };
  if (d.length === 10 || d.length === 11) return { valor: `55${d}`, desfecho: 'certo', motivo: null };
  if (d.length === 8 || d.length === 9) return { valor: d, desfecho: 'duvidoso', motivo: 'sem_ddd' };
  if (d.length > 13) return { valor: d, desfecho: 'duvidoso', motivo: 'digitos_excedentes' };
  return { valor: d, desfecho: 'irrecuperavel', motivo: 'telefone_curto' };
}

function m31Cpf(raw: any) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return { valor: '', desfecho: 'certo', motivo: null };
  if (d.length === 11) return { valor: d, desfecho: 'certo', motivo: null };
  return { valor: d, desfecho: 'duvidoso', motivo: 'cpf_incompleto' };
}

function m31Email(raw: any) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return { valor: '', desfecho: 'certo', motivo: null };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { valor: v, desfecho: 'certo', motivo: null };
  return { valor: v, desfecho: 'duvidoso', motivo: 'email_suspeito' };
}

function m31Revisao(originais: any, resultados: any[]) {
  const motivos = resultados.filter((r) => r && r.desfecho === 'duvidoso').map((r) => r.motivo);
  if (motivos.length === 0) return { revisao_dados: false, revisao_motivos: [] };
  return {
    revisao_dados: true,
    revisao_motivos: motivos,
    revisao_valores_originais: JSON.stringify(originais).slice(0, 500),
    revisao_em: new Date().toISOString(),
  };
}

function isCheckoutExpirado(updatedDate: any, maxMinutos = 1440) {
  if (!updatedDate) return true;
  return Date.now() - new Date(updatedDate).getTime() > maxMinutos * 60 * 1000;
}

function isDuplicateKeyError(err: any) {
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('duplicate') || msg.includes('e11000') || msg.includes('dedup_key') || msg.includes('unique');
}

function etapaMaisAvancada(atual: any, desejada: string): string {
  if (!atual) return desejada;
  return (ETAPA_RANK[String(atual)] ?? -1) >= (ETAPA_RANK[desejada] ?? -1) ? String(atual) : desejada;
}

function gerarCodigoCaravana() {
  return `M31-CAR-${Date.now().toString(36).toUpperCase()}`;
}

async function buscarCaravanaAtiva(S: any, caravanaId: string) {
  if (!caravanaId) return null;
  const lista = await S.EventoM31Caravana.filter({ id: caravanaId, ativa: true }, 'ordem', 1);
  return lista?.[0] || null;
}

async function localizarInscricao(S: any, opts: any) {
  if (opts.inscricao_id) {
    try {
      const byId = await S.EventoM31Inscricao.get(opts.inscricao_id);
      if (byId) return byId;
    } catch {}
  }
  if (opts.cpf && opts.cpf.length === 11) {
    const byDedup = await S.EventoM31Inscricao.filter({ dedup_key: `CPF:${opts.cpf}` }, '-updated_date', 1);
    if (byDedup?.[0]) return byDedup[0];
    const byCpf = await S.EventoM31Inscricao.filter({ cpf: opts.cpf }, '-updated_date', 1);
    if (byCpf?.[0]) return byCpf[0];
  }
  if (opts.whatsapp) {
    const byWpp = await S.EventoM31Inscricao.filter({ whatsapp: opts.whatsapp }, '-updated_date', 5);
    const ativa = (byWpp || []).find((i: any) => i.status_pagamento !== 'cancelado');
    if (ativa) return ativa;
  }
  if (opts.email) {
    const byEmail = await S.EventoM31Inscricao.filter({ email: opts.email }, '-updated_date', 5);
    const ativa = (byEmail || []).find((i: any) => i.status_pagamento !== 'cancelado');
    if (ativa) return ativa;
  }
  return null;
}

async function criarOuAtualizarIntencao(S: any, body: any, caravana: any) {
  const telRes = m31Telefone(body.whatsapp);
  if (telRes.desfecho === 'irrecuperavel') {
    return { error: 'WhatsApp inválido — informe DDD + número.', status: 400 };
  }
  const cpfRes = m31Cpf(body.cpf);
  const emailRes = m31Email(body.email);
  const cpfLimpo = cpfRes.desfecho === 'certo' ? cpfRes.valor : '';
  const emailLimpo = emailRes.valor;
  const whatsappFull = telRes.valor;
  const nome = String(body.nome || '').trim();
  if (nome.length < 3) return { error: 'Informe seu nome.', status: 400 };

  const revisao = m31Revisao(
    { whatsapp: body.whatsapp || '', cpf: body.cpf || '', email: body.email || '' },
    [telRes, cpfRes, emailRes]
  );
  const existente = await localizarInscricao(S, {
    inscricao_id: body.inscricao_id,
    cpf: cpfLimpo,
    whatsapp: whatsappFull,
    email: emailLimpo,
  });
  if (existente?.status_pagamento === 'aprovado') {
    return { inscricao: existente, ja_aprovado: true };
  }

  const agora = new Date().toISOString();
  const dadosBase: any = {
    ...revisao,
    nome,
    whatsapp: whatsappFull,
    tipo: 'caravana',
    origem_inscricao: 'CARAVANA',
    caravana_id: caravana.id,
    caravana_nome: caravana.nome,
    etapa_funil: etapaMaisAvancada(existente?.etapa_funil, 'contato_capturado'),
    etapa_funil_em: agora,
    ultima_acao: 'intencao_caravana_registrada',
  };
  if (emailLimpo) dadosBase.email = emailLimpo;
  if (cpfLimpo) dadosBase.cpf = cpfLimpo;

  if (existente) {
    const patchExistente: any = {
      ...dadosBase,
      retomada_token: existente.retomada_token || crypto.randomUUID(),
    };
    await S.EventoM31Inscricao.update(existente.id, patchExistente);
    return { inscricao: { ...existente, ...patchExistente } };
  }

  const dedupKey = cpfLimpo ? `CPF:${cpfLimpo}` : `TEL:${whatsappFull}`;
  const novo: any = {
    ...dadosBase,
    dedup_key: dedupKey,
    status_pagamento: 'pendente',
    estado_jornada: 'pendente',
    falha_tecnica: false,
    valor_pago: VALOR_PIX,
    lote: 'lote_1',
    retomada_token: crypto.randomUUID(),
    recovery_attempts: 0,
    fila_recuperacao: false,
    opt_out: false,
  };
  try {
    const criada = await S.EventoM31Inscricao.create(novo);
    return { inscricao: criada };
  } catch (e: any) {
    if (!isDuplicateKeyError(e)) throw e;
    const duplicada = await localizarInscricao(S, { cpf: cpfLimpo, whatsapp: whatsappFull, email: emailLimpo });
    if (!duplicada) throw e;
    await S.EventoM31Inscricao.update(duplicada.id, dadosBase);
    return { inscricao: { ...duplicada, ...dadosBase } };
  }
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const S = base44.asServiceRole.entities;
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || 'checkout');
    // O servidor valida modalidade e parcelas; preço nunca vem do cliente.
    if (action === 'checkout') {
      const requestedMethod = String(body?.payment_method || body?.billingType || 'PIX').toUpperCase();
      const requestedInstallments = Number(body?.installments || body?.installmentCount || 1);
      if (!['PIX', 'CREDIT_CARD'].includes(requestedMethod)) {
        return Response.json({ error: 'Forma de pagamento inválida.' }, { status: 400 });
      }
      if (requestedMethod === 'PIX' && requestedInstallments !== 1) {
        return Response.json({ error: 'PIX não possui parcelas.' }, { status: 400 });
      }
      if (requestedMethod === 'CREDIT_CARD' && (!Number.isInteger(requestedInstallments) || requestedInstallments < 1 || requestedInstallments > MAX_PARCELAS_CARTAO)) {
        return Response.json({ error: 'Escolha de 1 a 3 parcelas no cartão.' }, { status: 400 });
      }
    }

    // Catálogo público mínimo: evita leitura direta de entidade protegida no navegador.
    if (action === 'catalogo' || action === 'listar_caravanas') {
      const caravanas = await S.EventoM31Caravana.filter({ ativa: true }, 'ordem', 100);
      const data = (caravanas || [])
        .map((c: any) => ({ id: c.id, nome: c.nome, lider_nome: c.lider_nome || '', cidade_origem: c.cidade_origem || '', ordem: c.ordem ?? null }))
        .sort((a: any, b: any) => {
          if (a.ordem != null && b.ordem != null) return a.ordem - b.ordem;
          if (a.ordem != null) return -1;
          if (b.ordem != null) return 1;
          return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
        });
      return Response.json({ ok: true, caravanas: data });
    }

    // Retomada pública por token aleatório: devolve apenas os campos necessários
    // para pré-preencher o formulário de caravana. Nunca expõe dados financeiros internos.
    if (action === 'retomar') {
      const token = String(body?.token || '').trim();
      if (!token) return Response.json({ error: 'Token de retomada ausente.' }, { status: 400 });
      const lista = await S.EventoM31Inscricao.filter({ retomada_token: token, tipo: 'caravana' }, '-updated_date', 1);
      const i = lista?.[0];
      if (!i) return Response.json({ error: 'Retomada não encontrada.' }, { status: 404 });
      return Response.json({
        ok: true,
        inscricao: {
          id: i.id,
          nome: i.nome || '',
          email: i.email || '',
          whatsapp: i.whatsapp || '',
          cpf: i.cpf || '',
          igreja: i.nome_igreja || '',
          ja_participou_m31: i.ja_participou_m31,
          como_conheceu: i.como_conheceu || '',
          caravana_id: i.caravana_id || '',
          caravana_nome: i.caravana_nome || '',
          status_pagamento: i.status_pagamento || 'pendente',
          ja_aprovado: ['aprovado', 'gratuito'].includes(i.status_pagamento),
        },
      });
    }

    const caravanaId = String(body?.caravana_id || '').trim();
    const caravana = await buscarCaravanaAtiva(S, caravanaId);
    if (!caravana) {
      return Response.json({ error: 'Caravana não encontrada ou indisponível. Atualize a página e tente novamente.' }, { status: 400 });
    }

    // Captura silenciosa do lead assim que já temos nome + WhatsApp + caravana.
    if (action === 'capturar_intencao') {
      const capturada = await criarOuAtualizarIntencao(S, body, caravana);
      if (capturada.error) return Response.json({ error: capturada.error }, { status: capturada.status || 400 });
      return Response.json({
        ok: true,
        inscricao_id: capturada.inscricao?.id,
        retomada_token: capturada.inscricao?.retomada_token || null,
        ja_aprovado: !!capturada.ja_aprovado,
      });
    }

    const nome = String(body?.nome || '').trim();
    const email = String(body?.email || '').trim();
    const whatsapp = String(body?.whatsapp || '').trim();
    const cpf = String(body?.cpf || '').trim();
    if (!nome || !email || !whatsapp || !cpf) {
      return Response.json({ error: 'Preencha nome, WhatsApp, e-mail e CPF para continuar.' }, { status: 400 });
    }

    const telRes = m31Telefone(whatsapp);
    const cpfRes = m31Cpf(cpf);
    const emailRes = m31Email(email);
    if (telRes.desfecho === 'irrecuperavel') return Response.json({ error: 'WhatsApp inválido — informe DDD + número.' }, { status: 400 });
    if (cpfRes.valor.length !== 11) return Response.json({ error: 'CPF deve ter 11 dígitos.' }, { status: 400 });
    if (emailRes.desfecho !== 'certo' || !emailRes.valor) return Response.json({ error: 'E-mail inválido.' }, { status: 400 });

    const whatsappFull = telRes.valor;
    const cpfLimpo = cpfRes.valor;
    const emailLimpo = emailRes.valor;
    const revisao = m31Revisao({ whatsapp, cpf, email }, [telRes, cpfRes, emailRes]);
    let inscricao = await localizarInscricao(S, {
      inscricao_id: body?.inscricao_id,
      cpf: cpfLimpo,
      whatsapp: whatsappFull,
      email: emailLimpo,
    });

    if (inscricao?.status_pagamento === 'aprovado') {
      return Response.json({
        success: true,
        inscricao_id: inscricao.id,
        codigo_inscricao: inscricao.codigo_inscricao,
        payment_url: null,
        ja_aprovado: true,
        mensagem: 'Sua inscrição já está confirmada! Não é necessário pagar novamente.',
        redirect_url: '/obrigado',
      });
    }

    const metodo = String(body?.payment_method || body?.billingType || 'PIX').toUpperCase();
    const parcelas = metodo === 'CREDIT_CARD' ? Number(body?.installments || body?.installmentCount || 1) : 1;
    const valorTotal = metodo === 'PIX' ? VALOR_PIX : VALOR_CARTAO;

    // Reaproveita somente cobrança com modalidade, parcelas e valor idênticos.
    if (
      inscricao?.status_pagamento === 'checkout_pendente' &&
      inscricao.asaas_charge_url &&
      !isCheckoutExpirado(inscricao.updated_date) &&
      Number(inscricao.valor_pago) === valorTotal &&
      String(inscricao.payment_method || 'PIX').toUpperCase() === metodo &&
      Number(inscricao.installment_count || 1) === parcelas
    ) {
      return Response.json({
        success: true,
        inscricao_id: inscricao.id,
        codigo_inscricao: inscricao.codigo_inscricao,
        payment_url: inscricao.asaas_charge_url,
        valor: valorTotal,
        reutilizado: true,
        redirect_url: '/obrigado',
      });
    }

    const cidadeRaw = String(caravana.cidade_origem || '').trim();
    const cidadeMatch = cidadeRaw.match(/^(.+?)\s*[-,]\s*([A-Z]{2})$/);
    const cidade = cidadeMatch ? cidadeMatch[1].trim() : cidadeRaw;
    const estado = cidadeMatch ? cidadeMatch[2].trim() : String(body?.estado || '').trim();
    const codigoInscricao = inscricao?.codigo_inscricao || gerarCodigoCaravana();
    const agora = new Date().toISOString();

    const preCheckout: any = {
      ...revisao,
      nome,
      email: emailLimpo,
      whatsapp: whatsappFull,
      cpf: cpfLimpo,
      cidade,
      estado,
      nome_igreja: String(body?.igreja || '').trim(),
      ja_participou_m31: body?.ja_participou === true,
      como_conheceu: body?.como_conheceu || '',
      tipo: 'caravana',
      origem_inscricao: 'CARAVANA',
      caravana_id: caravana.id,
      caravana_nome: caravana.nome,
      lote: inscricao?.lote || 'lote_1',
      valor_pago: valorTotal,
      payment_method: metodo,
      installment_count: parcelas,
      status_pagamento: 'pendente',
      codigo_inscricao: codigoInscricao,
      observacoes: body?.observacoes || '',
      etapa_funil: etapaMaisAvancada(inscricao?.etapa_funil, 'tentou_avancar'),
      etapa_funil_em: agora,
      ultima_acao: 'submit_checkout_caravana',
      retomada_token: inscricao?.retomada_token || crypto.randomUUID(),
    };

    // Persistir ANTES de chamar Asaas: se o gateway falhar, a pessoa continua recuperável.
    if (inscricao) {
      await S.EventoM31Inscricao.update(inscricao.id, preCheckout);
      inscricao = { ...inscricao, ...preCheckout };
    } else {
      const novo = {
        ...preCheckout,
        dedup_key: `CPF:${cpfLimpo}`,
        estado_jornada: 'pendente',
        retomada_token: crypto.randomUUID(),
        recovery_attempts: 0,
        fila_recuperacao: false,
        opt_out: false,
        checkin_realizado: false,
      };
      try {
        inscricao = await S.EventoM31Inscricao.create(novo);
      } catch (e: any) {
        if (!isDuplicateKeyError(e)) throw e;
        const existente = await localizarInscricao(S, { cpf: cpfLimpo, whatsapp: whatsappFull, email: emailLimpo });
        if (!existente) throw e;
        await S.EventoM31Inscricao.update(existente.id, preCheckout);
        inscricao = { ...existente, ...preCheckout };
      }
    }

    const ASAAS_KEY = config('ASAAS_API_KEY');
    if (!ASAAS_KEY) {
      await S.EventoM31Inscricao.update(inscricao.id, {
        falha_tecnica: true,
        falha_tecnica_em: new Date().toISOString(),
        falha_tecnica_etapa: 'caravana_checkout',
        falha_tecnica_http: 500,
        falha_tecnica_erro: 'ASAAS_API_KEY ausente',
        fila_recuperacao: true,
        fila_recuperacao_em: new Date().toISOString(),
        status_fila_recuperacao: 'aguardando_aprovacao',
        ultima_acao: 'falha_tecnica_checkout_caravana',
      });
      return Response.json({ error: 'Pagamento temporariamente indisponível. Seus dados foram salvos e nossa equipe poderá retomar com você.' }, { status: 503 });
    }

    let paymentRes: Response;
    let payment: any;
    try {
      const searchResp = await fetch(`${ASAAS_BASE}/customers?cpfCnpj=${encodeURIComponent(cpfLimpo)}`, {
        headers: { access_token: ASAAS_KEY },
      });
      if (!searchResp.ok) throw new Error('Não foi possível consultar os dados do pagador.');
      const search = await searchResp.json();
      let customerId = search?.data?.[0]?.id;
      if (!customerId) {
        const customerResp = await fetch(`${ASAAS_BASE}/customers`, {
          method: 'POST',
          headers: { access_token: ASAAS_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: nome,
            cpfCnpj: cpfLimpo,
            mobilePhone: whatsappFull,
            ...(emailLimpo ? { email: emailLimpo } : {}),
            notificationDisabled: true,
          }),
        });
        const customer = await customerResp.json();
        if (!customerResp.ok || !customer?.id) throw new Error('Não foi possível cadastrar o pagador. Confira seus dados.');
        customerId = customer.id;
      }

      const paymentPayload: any = {
        customer: customerId,
        billingType: metodo,
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        description: `M31 Filhas - Caravana (1 pessoa) - ${metodo === 'PIX' ? 'PIX' : `${parcelas}x cartão`}`,
        externalReference: codigoInscricao,
      };
      if (metodo === 'CREDIT_CARD' && parcelas > 1) {
        paymentPayload.installmentCount = parcelas;
        paymentPayload.totalValue = valorTotal;
      } else {
        paymentPayload.value = valorTotal;
      }

      paymentRes = await fetch(`${ASAAS_BASE}/payments`, {
        method: 'POST',
        headers: { access_token: ASAAS_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentPayload),
      });
      payment = await paymentRes.json();
    } catch (e: any) {
      await S.EventoM31Inscricao.update(inscricao.id, {
        falha_tecnica: true,
        falha_tecnica_em: new Date().toISOString(),
        falha_tecnica_etapa: 'caravana_checkout',
        falha_tecnica_http: 0,
        falha_tecnica_erro: String(e?.message || 'falha_rede_asaas').slice(0, 300),
        fila_recuperacao: true,
        fila_recuperacao_em: new Date().toISOString(),
        status_fila_recuperacao: 'aguardando_aprovacao',
        ultima_acao: 'falha_tecnica_checkout_caravana',
      });
      return Response.json({ error: 'Não conseguimos abrir o pagamento agora. Seus dados foram salvos para recuperação.' }, { status: 502 });
    }

    if (!paymentRes.ok || !payment?.invoiceUrl) {
      const erroDetalhe = JSON.stringify(payment || {}).slice(0, 300);
      await S.EventoM31Inscricao.update(inscricao.id, {
        falha_tecnica: true,
        falha_tecnica_em: new Date().toISOString(),
        falha_tecnica_etapa: 'caravana_checkout',
        falha_tecnica_http: paymentRes.status,
        falha_tecnica_erro: erroDetalhe || 'cobranca_sem_link',
        fila_recuperacao: true,
        fila_recuperacao_em: new Date().toISOString(),
        status_fila_recuperacao: 'aguardando_aprovacao',
        ultima_acao: 'falha_tecnica_checkout_caravana',
      });
      return Response.json({ error: 'Não conseguimos gerar o pagamento. Seus dados foram salvos para recuperação.' }, { status: 502 });
    }

    await S.EventoM31Inscricao.update(inscricao.id, {
      status_pagamento: 'checkout_pendente',
      asaas_charge_url: payment.invoiceUrl,
      asaas_payment_id: payment.id,
      asaas_billing_type: metodo,
      asaas_installment_count: parcelas,
      asaas_total_value: valorTotal,
      valor_pago: valorTotal,
      payment_method: metodo,
      installment_count: parcelas,
      etapa_funil: etapaMaisAvancada(inscricao.etapa_funil, 'checkout_criado'),
      etapa_funil_em: new Date().toISOString(),
      ultima_acao: 'checkout_criado',
      falha_tecnica: false,
      falha_tecnica_em: null,
      falha_tecnica_etapa: null,
      falha_tecnica_http: null,
      falha_tecnica_erro: null,
      fila_recuperacao: false,
      status_fila_recuperacao: null,
    });

    const inscritasDaCaravana = await S.EventoM31Inscricao.filter({ caravana_id: caravana.id }, '-created_date', 500);
    await S.EventoM31Caravana.update(caravana.id, { total_membros: inscritasDaCaravana.length });

    return Response.json({
      success: true,
      inscricao_id: inscricao.id,
      caravana_id: caravana.id,
      codigo_inscricao: codigoInscricao,
      payment_url: payment.invoiceUrl,
      valor: valorTotal,
      qtd_pessoas: 1,
      redirect_url: '/obrigado',
    });
  } catch (error: any) {
    return Response.json({ error: String(error?.message || 'falha_caravana').slice(0, 300) }, { status: 500 });
  }
})(req);
}
