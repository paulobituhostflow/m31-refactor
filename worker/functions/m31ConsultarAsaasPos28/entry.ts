// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const apiKey = config('ASAAS_API_KEY');
    const baseUrl = '__ASAAS_API__';

    // Buscar pagamentos confirmados/recebidos após 28/05
    const url = `${baseUrl}/payments?status=RECEIVED&dateCreated[ge]=2026-05-28&limit=100&offset=0`;

    const res = await fetch(url, {
      headers: {
        'access_token': apiKey,
        'Content-Type': 'application/json'
      }
    });

    const data = await res.json();

    if (!res.ok) {
      return Response.json({ error: data }, { status: res.status });
    }

    const pagamentos = (data.data || []).map(p => ({
      id: p.id,
      externalReference: p.externalReference,
      customer: p.customer,
      value: p.value,
      status: p.status,
      dateCreated: p.dateCreated,
      paymentDate: p.paymentDate,
      confirmedDate: p.confirmedDate,
      description: p.description,
      billingType: p.billingType
    }));

    // Também buscar CONFIRMED
    const url2 = `${baseUrl}/payments?status=CONFIRMED&dateCreated[ge]=2026-05-28&limit=100&offset=0`;
    const res2 = await fetch(url2, {
      headers: {
        'access_token': apiKey,
        'Content-Type': 'application/json'
      }
    });
    const data2 = await res2.json();
    const pagamentos2 = (data2.data || []).map(p => ({
      id: p.id,
      externalReference: p.externalReference,
      customer: p.customer,
      value: p.value,
      status: p.status,
      dateCreated: p.dateCreated,
      paymentDate: p.paymentDate,
      confirmedDate: p.confirmedDate,
      description: p.description,
      billingType: p.billingType
    }));

    // Buscar PENDING
    const url3 = `${baseUrl}/payments?status=PENDING&dateCreated[ge]=2026-05-28&limit=100&offset=0`;
    const res3 = await fetch(url3, {
      headers: { 'access_token': apiKey, 'Content-Type': 'application/json' }
    });
    const data3 = await res3.json();
    const pendentes = (data3.data || []).map(p => ({
      id: p.id,
      externalReference: p.externalReference,
      value: p.value,
      status: p.status,
      dateCreated: p.dateCreated,
      dueDate: p.dueDate,
      description: p.description,
      billingType: p.billingType,
      invoiceUrl: p.invoiceUrl
    }));

    // Buscar OVERDUE
    const url4 = `${baseUrl}/payments?status=OVERDUE&dateCreated[ge]=2026-05-28&limit=100&offset=0`;
    const res4 = await fetch(url4, {
      headers: { 'access_token': apiKey, 'Content-Type': 'application/json' }
    });
    const data4 = await res4.json();
    const vencidos = (data4.data || []).map(p => ({
      id: p.id,
      externalReference: p.externalReference,
      value: p.value,
      status: p.status,
      dateCreated: p.dateCreated,
      dueDate: p.dueDate,
      description: p.description,
      billingType: p.billingType,
      invoiceUrl: p.invoiceUrl
    }));

    return Response.json({
      total_received: pagamentos.length,
      total_confirmed: pagamentos2.length,
      total_pending: pendentes.length,
      total_overdue: vencidos.length,
      received: pagamentos,
      confirmed: pagamentos2,
      pending: pendentes,
      overdue: vencidos
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
