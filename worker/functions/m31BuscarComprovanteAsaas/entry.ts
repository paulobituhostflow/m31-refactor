// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31BuscarComprovanteAsaas — Busca o pagamento no Asaas e atualiza a URL
 * da cobrança com o comprovante permanente (transactionReceiptUrl).
 *
 * Resolve o problema: para pagamentos confirmados, o asaas_charge_url
 * (URL de checkout) expira. Esta função busca a URL permanente do comprovante
 * no Asaas e atualiza o registro.
 *
 * Uso: base44.functions.invoke('m31BuscarComprovanteAsaas', { inscricao_id: '...' })
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Apenas admin pode executar esta função' }, { status: 403 });
    }

    const { inscricao_id } = await req.json();
    if (!inscricao_id) {
      return Response.json({ error: 'inscricao_id é obrigatório' }, { status: 400 });
    }

    const insc = await base44.asServiceRole.entities.EventoM31Inscricao.get(inscricao_id);
    if (!insc) {
      return Response.json({ error: 'Inscrição não encontrada', inscricao_id }, { status: 404 });
    }

    if (!insc.asaas_payment_id) {
      return Response.json({
        error: 'Inscrição não possui asaas_payment_id',
        inscricao_id,
        nome: insc.nome,
        status_pagamento: insc.status_pagamento,
      }, { status: 400 });
    }

    const ASAAS_KEY = config("ASAAS_API_KEY");
    const resp = await fetch(`__ASAAS_API__/payments/${insc.asaas_payment_id}`, {
      headers: { 'access_token': ASAAS_KEY }
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return Response.json({
        error: 'Erro ao consultar pagamento no Asaas',
        payment_id: insc.asaas_payment_id,
        http_status: resp.status,
        details: errText.slice(0, 500),
      }, { status: 502 });
    }

    const payment = await resp.json();

    // Atualizar asaas_charge_url com o comprovante permanente
    const receiptUrl = payment.transactionReceiptUrl || null;
    let chargeUrlAtualizada = false;

    if (receiptUrl) {
      await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao_id, {
        asaas_charge_url: receiptUrl,
      });
      chargeUrlAtualizada = true;
    }

    return Response.json({
      success: true,
      inscricao_id,
      nome: insc.nome,
      cpf: insc.cpf,
      status_db: insc.status_pagamento,
      pagamento_asaas: {
        id: payment.id,
        status: payment.status,
        billing_type: payment.billingType,
        value: payment.value,
        date_created: payment.dateCreated,
        payment_date: payment.paymentDate,
        client_name: payment.customerName,
        external_reference: payment.externalReference,
      },
      urls: {
        transaction_receipt_url: receiptUrl,
        invoice_url: payment.invoiceUrl || null,
        bank_slip_url: payment.bankSlipUrl || null,
      },
      charge_url_atualizada: chargeUrlAtualizada,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
