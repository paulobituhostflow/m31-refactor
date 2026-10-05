// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

/**
 * m31BackfillBillingType — One-time backfill
 * Busca todos os pagamentos recebidos/confirmados no Asaas e atualiza
 * as inscrições correspondentes com o método de pagamento (billingType).
 */
return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = config('ASAAS_API_KEY');
    if (!apiKey) return Response.json({ error: 'ASAAS_API_KEY não configurada' }, { status: 500 });

    const baseURL = '__ASAAS_API__';
    const headers = { 'access_token': apiKey, 'Content-Type': 'application/json' };

    // Buscar inscrições aprovadas com payment_id que ainda não têm billing_type
    const aprovadas = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { status_pagamento: 'aprovado' },
      '-created_date', 500
    );
    const semBilling = aprovadas.filter(i => i.asaas_payment_id && !i.asaas_billing_type);

    // Buscar todos os pagamentos do Asaas (RECEIVED + CONFIRMED) e mapear por ID
    const paymentMap = {};
    for (const status of ['RECEIVED', 'CONFIRMED']) {
      let offset = 0;
      let hasMore = true;
      while (hasMore && offset < 2000) {
        const res = await fetch(`${baseURL}/payments?status=${status}&offset=${offset}&limit=100`, { headers });
        if (!res.ok) break;
        const data = await res.json();
        for (const p of (data.data || [])) {
          paymentMap[p.id] = p.billingType;
        }
        hasMore = data.hasMore || false;
        offset += 100;
      }
    }

    // Atualizar inscrições
    let atualizadas = 0;
    const updates = [];
    for (const insc of semBilling) {
      const billingType = paymentMap[insc.asaas_payment_id];
      if (billingType) {
        updates.push({ id: insc.id, asaas_billing_type: billingType });
      }
    }

    if (updates.length > 0) {
      await base44.asServiceRole.entities.EventoM31Inscricao.bulkUpdate(updates);
      atualizadas = updates.length;
    }

    return Response.json({
      total_aprovadas: aprovadas.length,
      sem_billing_type_antes: semBilling.length,
      payments_encontrados_asaas: Object.keys(paymentMap).length,
      atualizadas,
      faltam: semBilling.length - atualizadas
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
