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
    const { cpf, externalReference } = body;

    const ASAAS_KEY = config("ASAAS_API_KEY");
    const ASAAS_BASE = "__ASAAS_API__";

    const resultados = {};

    // Buscar por externalReference (codigo_inscricao)
    if (externalReference) {
      const resp = await fetch(`${ASAAS_BASE}/payments?externalReference=${encodeURIComponent(externalReference)}&limit=50`, {
        headers: { 'access_token': ASAAS_KEY }
      });
      const data = await resp.json();
      resultados.por_codigo = {
        total: data.totalCount ?? (data.data?.length ?? 0),
        pagamentos: (data.data || []).map(p => ({
          id: p.id,
          status: p.status,
          value: p.value,
          billingType: p.billingType,
          dueDate: p.dueDate,
          description: p.description,
          externalReference: p.externalReference,
          createdAt: p.dateCreated,
          creditCard: p.creditCard ? {
            brand: p.creditCard.creditCardBrand,
            mask: p.creditCard.creditCardNumber
          } : null,
          paymentDate: p.paymentDate,
          clientPaymentDate: p.clientPaymentDate,
          confirmedDate: p.confirmedDate,
          errorMessage: p.errorMessage || null,
          invoiceUrl: p.invoiceUrl
        }))
      };
    }

    // Buscar por CPF/CNPj — filtrar apenas pagamentos de hoje
    if (cpf) {
      const resp = await fetch(`${ASAAS_BASE}/payments?cpfCnpj=${encodeURIComponent(cpf)}&limit=50&dateCreated.ge=2026-07-02`, {
        headers: { 'access_token': ASAAS_KEY }
      });
      const data = await resp.json();
      resultados.por_cpf = {
        total: data.totalCount ?? (data.data?.length ?? 0),
        pagamentos: (data.data || []).map(p => ({
          id: p.id,
          status: p.status,
          value: p.value,
          billingType: p.billingType,
          description: p.description,
          externalReference: p.externalReference,
          createdAt: p.dateCreated,
          creditCard: p.creditCard ? {
            brand: p.creditCard.creditCardBrand,
            mask: p.creditCard.creditCardNumber
          } : null,
          clientPaymentDate: p.clientPaymentDate,
          confirmedDate: p.confirmedDate,
          errorMessage: p.errorMessage || null
        }))
      };

      // Resumo agrupado por status
      const todos = data.data || [];
      resultados.resumo = {
        total_hoje: todos.length,
        por_status: todos.reduce((acc, p) => {
          acc[p.status] = (acc[p.status] || 0) + 1;
          return acc;
        }, {}),
        valores: todos.map(p => ({ id: p.id, status: p.status, value: p.value, desc: p.description, card: p.creditCard?.creditCardNumber, err: p.errorMessage }))
      };
    }

    // Buscar cliente por CPF
    if (cpf) {
      const resp = await fetch(`${ASAAS_BASE}/customers?cpfCnpj=${encodeURIComponent(cpf)}&limit=10`, {
        headers: { 'access_token': ASAAS_KEY }
      });
      const data = await resp.json();
      resultados.cliente = (data.data || []).map(c => ({
        id: c.id,
        name: c.name,
        email: c.email,
        cpfCnpj: c.cpfCnpj,
        phone: c.phone,
        createdAt: c.dateCreated
      }));
    }

    return Response.json(resultados);
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack?.slice(0, 500) }, { status: 500 });
  }
})(req);
}
