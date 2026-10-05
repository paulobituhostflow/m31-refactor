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

    const apiKey = config('ASAAS_API_KEY');
    if (!apiKey) return Response.json({ error: 'ASAAS_API_KEY não configurada' }, { status: 500 });

    const baseURL = '__ASAAS_API__';
    const headers = { 'access_token': apiKey, 'Content-Type': 'application/json' };

    // Buscar todos os pagamentos recebidos (status=RECEIVED ou CONFIRMED)
    const metodos = { PIX: 0, BOLETO: 0, CREDIT_CARD: 0, DEBIT_CARD: 0, TRANSFER: 0, UNDEFINED: 0, OUTRO: 0 };
    const valores = { PIX: 0, BOLETO: 0, CREDIT_CARD: 0, DEBIT_CARD: 0, TRANSFER: 0, UNDEFINED: 0, OUTRO: 0 };
    let total = 0;
    let offset = 0;
    let hasMore = true;

    while (hasMore && offset < 2000) {
      const res = await fetch(`${baseURL}/payments?status=RECEIVED&offset=${offset}&limit=100`, { headers });
      if (res.status === 401) return Response.json({ error: 'ASAAS erro 401 — API Key inválida' }, { status: 401 });
      if (!res.ok) {
        const err = await res.text();
        return Response.json({ error: `ASAAS erro ${res.status}`, details: err }, { status: 500 });
      }
      const data = await res.json();
      const payments = data.data || [];
      for (const p of payments) {
        const bt = p.billingType;
        if (metodos[bt] !== undefined) {
          metodos[bt]++;
          valores[bt] += p.value || 0;
        } else {
          metodos.OUTRO++;
          valores.OUTRO += p.value || 0;
        }
        total++;
      }
      hasMore = data.hasMore || false;
      offset += 100;
    }

    // Também buscar pagamentos CONFIRMED (cartão pode estar como CONFIRMED)
    offset = 0;
    hasMore = true;
    while (hasMore && offset < 2000) {
      const res = await fetch(`${baseURL}/payments?status=CONFIRMED&offset=${offset}&limit=100`, { headers });
      if (!res.ok) break;
      const data = await res.json();
      const payments = data.data || [];
      for (const p of payments) {
        const bt = p.billingType;
        if (metodos[bt] !== undefined) {
          metodos[bt]++;
          valores[bt] += p.value || 0;
        } else {
          metodos.OUTRO++;
          valores.OUTRO += p.value || 0;
        }
        total++;
      }
      hasMore = data.hasMore || false;
      offset += 100;
    }

    return Response.json({
      total_pagamentos: total,
      por_metodo: Object.entries(metodos).filter(([_, v]) => v > 0).map(([metodo, qtd]) => ({
        metodo,
        quantidade: qtd,
        valor_total: parseFloat(valores[metodo].toFixed(2))
      })),
      resumo: metodos
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
