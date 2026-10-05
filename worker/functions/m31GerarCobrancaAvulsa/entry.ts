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

    const { inscricao_id } = await req.json();
    if (!inscricao_id) return Response.json({ error: 'inscricao_id obrigatório' }, { status: 400 });

    const insc = await base44.asServiceRole.entities.EventoM31Inscricao.get(inscricao_id);
    if (!insc) return Response.json({ error: 'Inscrição não encontrada' }, { status: 404 });

    const ASAAS_KEY = config('ASAAS_API_KEY');
    const ASAAS_BASE = '__ASAAS_API__';
    const cpfLimpo = (insc.cpf || '').replace(/\D/g, '');

    // 1. Find or create Asaas customer by CPF
    let customerId;
    if (cpfLimpo.length === 11) {
      const custRes = await fetch(`${ASAAS_BASE}/customers?cpfCnpj=${cpfLimpo}`, {
        headers: { 'access_token': ASAAS_KEY }
      });
      const custData = await custRes.json();
      if (custData.data?.length > 0) customerId = custData.data[0].id;
    }
    if (!customerId) {
      const createRes = await fetch(`${ASAAS_BASE}/customers`, {
        method: 'POST',
        headers: { 'access_token': ASAAS_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: insc.nome,
          cpfCnpj: cpfLimpo || undefined,
          email: insc.email || undefined,
          mobilePhone: insc.whatsapp || undefined,
          notificationDisabled: true,
        })
      });
      const created = await createRes.json();
      if (!created.id) return Response.json({ error: 'Erro ao criar customer no Asaas', details: created }, { status: 500 });
      customerId = created.id;
    }

    // BEGIN BASE44_ONLY_NOTIFICATIONS: also enforce for reused Asaas customers.
    const noticeResponse = await fetch('__ASAAS_API__/customers/' + customerId, {
      method: 'PUT', headers: { access_token: ASAAS_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationDisabled: true }),
      redirect: 'error', signal: AbortSignal.timeout(12000),
    });
    const noticeCustomer = await noticeResponse.json();
    if (!noticeResponse.ok || noticeCustomer.id !== customerId || noticeCustomer.notificationDisabled !== true)
      throw new Error('Não foi possível garantir a comunicação exclusiva pelo Base44. Nenhuma nova cobrança foi criada.');
    // END BASE44_ONLY_NOTIFICATIONS

    // 2. Determine value from active lote or inscription
    const lotes = await base44.asServiceRole.entities.EventoM31Lote.filter({ ativo: true });
    const lote = lotes[0];
    const valor = insc.valor_pago > 0 ? insc.valor_pago : (lote?.valor || 0);
    if (!valor) return Response.json({ error: 'Não foi possível determinar o valor' }, { status: 400 });

    // 3. dueDate: event date if future, else +30 days (no 24h expiry)
    let dueDate;
    const configs = await base44.asServiceRole.entities.EventoM31Configuracao.list('-created_date', 1);
    const eventData = configs[0]?.data_inicio;
    if (eventData) {
      const eventDate = new Date(eventData);
      if (eventDate > new Date()) dueDate = eventData.slice(0, 10);
    }
    if (!dueDate) dueDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    // 4. POST /payments — billingType UNDEFINED = customer chooses PIX or card on invoice
    const payRes = await fetch(`${ASAAS_BASE}/payments`, {
      method: 'POST',
      headers: { 'access_token': ASAAS_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: customerId,
        billingType: 'UNDEFINED',
        value: valor,
        dueDate,
        description: `M31 Filhas - Inscricao ${insc.codigo_inscricao || ''}`,
        externalReference: insc.codigo_inscricao || insc.id,
      })
    });
    const payment = await payRes.json();
    if (!payment.id) return Response.json({ error: 'Erro ao criar cobrança no Asaas', details: payment }, { status: 500 });

    // 5. Save to inscription
    await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao_id, {
      asaas_charge_url: payment.invoiceUrl,
      asaas_payment_id: payment.id,
      status_pagamento: 'pendente',
      valor_pago: valor,
      asaas_billing_type: 'UNDEFINED',
    });

    return Response.json({
      success: true,
      invoiceUrl: payment.invoiceUrl,
      payment_id: payment.id,
      pix_qr: payment.pixTransaction?.qrCode || null,
      pix_payload: payment.pixTransaction?.payload || null,
      value: valor,
      dueDate,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
