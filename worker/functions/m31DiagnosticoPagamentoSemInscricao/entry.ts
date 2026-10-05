// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const paymentId = body.payment_id || 'pay_dnvcaqig41pt8ala';
    const codigoBusca = body.codigo_inscricao || null;
    const ASAAS_KEY = config('ASAAS_API_KEY');

    // 1. Buscar pagamento no Asaas
    const payRes = await fetch(`__ASAAS_API__/payments/${paymentId}`, {
      headers: { 'access_token': ASAAS_KEY }
    });
    const payment = await payRes.json();

    // 2. Buscar cliente no Asaas
    let customer = null;
    if (payment.customer) {
      const custRes = await fetch(`__ASAAS_API__/customers/${payment.customer}`, {
        headers: { 'access_token': ASAAS_KEY }
      });
      customer = await custRes.json();
    }

    // 3. Buscar inscrição no banco pelo codigo_inscricao (externalReference atual)
    const byExtRef = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { codigo_inscricao: payment.externalReference }
    );

    // 4. Buscar inscrição no banco pelo asaas_payment_id
    const byPayId = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { asaas_payment_id: paymentId }
    );

    // 5. Buscar logs completos do webhook (usar código informado ou externalReference do pagamento)
    const codigoLog = `codigo: ${codigoBusca || payment.externalReference}`;
    const logs = await base44.asServiceRole.entities.M31MessageLog.filter(
      { inscricao_nome: codigoLog }, '-enviado_em', 5
    );

    // 6. Buscar inscrição pelo código informado (caso seja diferente do externalReference)
    let byCodigoBusca = [];
    if (codigoBusca && codigoBusca !== payment.externalReference) {
      byCodigoBusca = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
        { codigo_inscricao: codigoBusca }
      );
    }

    // 7. Buscar duplicatas no Asaas por externalReference
    let duplicatasAsaas = [];
    try {
      const dupRes = await fetch(`__ASAAS_API__/payments?externalReference=${codigoBusca || payment.externalReference}&limit=20`, {
        headers: { 'access_token': ASAAS_KEY }
      });
      const dupData = await dupRes.json();
      duplicatasAsaas = (dupData.data || []).map(p => ({ id: p.id, status: p.status, value: p.value, billingType: p.billingType, dateCreated: p.dateCreated }));
    } catch (_) {}

    return Response.json({
      asaas_payment: {
        id: payment.id,
        externalReference: payment.externalReference,
        customer_id: payment.customer,
        value: payment.value,
        status: payment.status,
        billingType: payment.billingType,
        description: payment.description,
        dueDate: payment.dueDate,
        dateCreated: payment.dateCreated
      },
      asaas_customer: customer ? {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        mobilePhone: customer.mobilePhone,
        cpfCnpj: customer.cpfCnpj
      } : null,
      inscricao_by_externalRef: byExtRef.map(r => ({ id: r.id, nome: r.nome, codigo: r.codigo_inscricao, status: r.status_pagamento })),
      inscricao_by_paymentId: byPayId.map(r => ({ id: r.id, nome: r.nome, codigo: r.codigo_inscricao, status: r.status_pagamento, whatsapp: r.whatsapp, email: r.email })),
      inscricao_by_codigo_busca: byCodigoBusca.map(r => ({ id: r.id, nome: r.nome, codigo: r.codigo_inscricao, status: r.status_pagamento })),
      duplicatas_asaas: duplicatasAsaas,
      webhook_logs: logs.map(l => ({
        stage: l.stage,
        erro: l.erro,
        enviado_em: l.enviado_em,
        event: (() => { try { return JSON.parse(l.mensagem).event; } catch (_) { return null; } })(),
        payment_id_log: (() => { try { return JSON.parse(l.mensagem).payment?.id; } catch (_) { return null; } })()
      }))
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
