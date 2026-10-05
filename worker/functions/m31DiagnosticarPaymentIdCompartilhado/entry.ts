// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31DiagnosticarPaymentIdCompartilhado — READ-ONLY (temporária, diagnóstica)
 *
 * NÃO grava, NÃO envia, NÃO aprova, NÃO rebaixa. Apenas lê Asaas + DB e
 * monta um relatório para decisão humana.
 *
 * Entrada: { payment_id?: string }  (default pay_by539pgbhhru8hdr)
 */

return (async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const PID = body?.payment_id || 'pay_by539pgbhhru8hdr';
  const ASAAS_KEY = config('ASAAS_API_KEY');
  if (!ASAAS_KEY) return Response.json({ error: 'ASAAS_API_KEY ausente' }, { status: 500 });

  // 1. Payment real no Asaas
  let paymentReal = null;
  try {
    const r = await fetch(`__ASAAS_API__/payments/${PID}`, { headers: { access_token: ASAAS_KEY } });
    paymentReal = await r.json();
  } catch (e) { return Response.json({ error: `erro_asaas_payment: ${e.message}` }, { status: 502 }); }
  if (paymentReal?.errors) return Response.json({ error: 'payment_nao_encontrado', asaas_errors: paymentReal.errors }, { status: 404 });

  const checkoutReal = paymentReal.checkout || null;
  const customerReal = paymentReal.customer || null;
  const externalRefReal = paymentReal.externalReference || null;

  // 2. Todas as inscrições com esse payment_id
  const inscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
    { asaas_payment_id: PID }, '-created_date', 100
  );

  // 3. Lookup Asaas por checkout_id (somente leitura)
  const checkoutIds = [...new Set(inscricoes.map(i => i.asaas_checkout_id).filter(Boolean))];
  const checkoutMap = {}; // checkout_id -> { status, payment, customer, value }
  for (const cid of checkoutIds) {
    try {
      const r = await fetch(`__ASAAS_API__/checkouts/${cid}`, { headers: { access_token: ASAAS_KEY } });
      const j = await r.json();
      checkoutMap[cid] = {
        status: j.status, // ACTIVE | PAID | EXPIRED | CANCELED
        payment_id: j.payment || null,
        customer: j.customer || null,
        amount: j.amount || null,
        billingType: j.billingType || null,
        externalReference: j.externalReference || null,
        dateCreated: j.dateCreated || null,
      };
    } catch (e) {
      checkoutMap[cid] = { error: e.message };
    }
  }

  // 4. Classificação pessoa por pessoa
  const relatorio = inscricoes.map(ins => {
    const chk = ins.asaas_checkout_id;
    const chkInfo = chk ? checkoutMap[chk] : null;
    const ehDonaReal = chk && chk === checkoutReal;
    const checkoutPago = chkInfo?.status === 'PAID';
    const paymentDoCheckout = chkInfo?.payment_id || null;
    const paymentCoincide = paymentDoCheckout === PID;
    const mesmoCustomer = chkInfo?.customer && customerReal && chkInfo.customer === customerReal;

    let categoria;
    if (ehDonaReal && checkoutPago) categoria = 'CONFIRMADA_PAGA';
    else if (checkoutPago && !paymentCoincide) categoria = 'COBRANCA_PROPRIA_PAGA'; // tem pagamento próprio, não é o PID compartilhado
    else if (chkInfo && !checkoutPago) categoria = 'CHECKOUT_NAO_PAGO'; // dados errados (está aprovado mas checkout não pagou)
    else if (!chk) categoria = 'SEM_CHECKOUT_INSUFICIENTE';
    else categoria = 'DADOS_INCERTOS';

    return {
      id: ins.id,
      nome: ins.nome,
      tipo: ins.tipo,
      status_db: ins.status_pagamento,
      valor_pago_db: ins.valor_pago,
      checkout_id: chk || null,
      checkout_status: chkInfo?.status || null,
      checkout_payment_id: paymentDoCheckout,
      checkout_customer: chkInfo?.customer || null,
      eh_dona_real: ehDonaReal,
      mesmo_customer_pagamento_real: mesmoCustomer,
      categoria,
      data_envio_bv: ins.data_envio_boas_vindas ? 'sim' : 'nao',
      created_date: ins.created_date
    };
  });

  // 5. Agrupamento por customer (descobrir compras em grupo)
  const porCustomer = {};
  for (const r of relatorio) {
    if (r.checkout_customer) {
      porCustomer[r.checkout_customer] = (porCustomer[r.checkout_customer] || 0) + 1;
    }
  }
  const comprasEmGrupo = Object.entries(porCustomer).filter(([, n]) => n > 1);

  // 6. Resumo por categoria
  const resumo = {};
  for (const r of relatorio) resumo[r.categoria] = (resumo[r.categoria] || 0) + 1;

  // 7. Root cause: timeline das inscrições (quem escreveu asaas_payment_id?)
  const amostraTimeline = {};
  const amostraIds = inscricoes.slice(0, 8).map(i => i.id);
  for (const id of amostraIds) {
    const tl = await base44.asServiceRole.entities.M31InscricaoTimeline.filter(
      { inscricao_id: id }, 'created_date', 5
    ).catch(() => []);
    amostraTimeline[id.slice(-6)] = tl.map(t => ({ evento: t.evento, origem: t.origem, status: t.status, em: t.created_date?.slice(0,16) }));
  }

  return Response.json({
    payment_real_asaas: {
      id: paymentReal.id,
      status: paymentReal.status,
      value: paymentReal.value,
      billingType: paymentReal.billingType,
      customer: customerReal,
      checkout: checkoutReal,
      externalReference: externalRefReal,
      confirmedDate: paymentReal.confirmedDate,
      dateCreated: paymentReal.dateCreated
    },
    total_inscricoes_com_pid: inscricoes.length,
    resumo_categorias: resumo,
    compras_em_grupo_por_customer: comprasEmGrupo,
    amostra_timeline: amostraTimeline,
    relatorio
  });
})(req);
}
