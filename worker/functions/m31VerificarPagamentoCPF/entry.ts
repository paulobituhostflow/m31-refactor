// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31VerificarPagamentoCPF — Consulta pontual no Asaas por CPF.
 *
 * Fonte de verdade para saber se uma pessoa pagou, independente de janela de data.
 * Busca o cliente no Asaas pelo CPF e lista TODOS os pagamentos dele com status.
 *
 * Admin-only. Uso: base44.functions.invoke('m31VerificarPagamentoCPF', { cpf: '...' })
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Apenas admin' }, { status: 403 });
    }

    const { cpf } = await req.json();
    if (!cpf) return Response.json({ error: 'cpf é obrigatório' }, { status: 400 });

    const cpfLimpo = cpf.replace(/\D/g, '');
    // redeploy trigger
    const ASAAS_KEY = config('ASAAS_API_KEY');
    const ASAAS_BASE = '__ASAAS_API__';

    // 1. Buscar cliente pelo CPF
    const custResp = await fetch(`${ASAAS_BASE}/customers?cpfCnpj=${cpfLimpo}`, {
      headers: { 'access_token': ASAAS_KEY },
    });
    const custData = await custResp.json();
    const clientes = custData.data || [];

    if (clientes.length === 0) {
      return Response.json({ cpf: cpfLimpo, cliente_encontrado: false, pagamentos: [] });
    }

    // 2. Para cada cliente, listar pagamentos
    const resultado = [];
    for (const cliente of clientes) {
      const payResp = await fetch(`${ASAAS_BASE}/payments?customer=${cliente.id}&limit=100`, {
        headers: { 'access_token': ASAAS_KEY },
      });
      const payData = await payResp.json();
      for (const p of (payData.data || [])) {
        resultado.push({
          customer_id: cliente.id,
          customer_name: cliente.name,
          payment_id: p.id,
          installment_id: p.installment || null,
          status: p.status,
          billing_type: p.billingType,
          value: p.value,
          net_value: p.netValue,
          installment_count: p.installmentCount || null,
          date_created: p.dateCreated,
          payment_date: p.paymentDate || p.clientPaymentDate || null,
          due_date: p.dueDate,
          external_reference: p.externalReference || null,
          receipt_url: p.transactionReceiptUrl || null,
          invoice_url: p.invoiceUrl || null,
        });
      }
    }

    const pago = resultado.some((p) => ['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'].includes(p.status));

    return Response.json({
      cpf: cpfLimpo,
      cliente_encontrado: true,
      total_clientes: clientes.length,
      pagou: pago,
      pagamentos: resultado,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
