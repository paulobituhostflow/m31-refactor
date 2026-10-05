// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31DiagnosticoFinanceiroAsaas — READ-ONLY
 * Consulta TODOS os pagamentos no Asaas e retorna totais + lista detalhada.
 * NÃO modifica nenhum registro no banco.
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = config('ASAAS_API_KEY');
    if (!apiKey) return Response.json({ error: 'ASAAS_API_KEY não configurado' }, { status: 500 });

    const baseUrl = '__ASAAS_API__/payments';
    const headers = { 'access_token': apiKey };

    // Buscar TODOS os pagamentos (todos os status) com paginação
    const todosPagamentos = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const url = `${baseUrl}?limit=${limit}&offset=${offset}`;
      const resp = await fetch(url, { headers });
      const data = await resp.json();

      if (!data.data || data.data.length === 0) {
        hasMore = false;
        break;
      }

      todosPagamentos.push(...data.data);
      hasMore = todosPagamentos.length < (data.totalCount || 0);
      offset += limit;

      if (offset > 5000) break; // safety limit
    }

    // Agrupar por status
    const porStatus = {};
    todosPagamentos.forEach(p => {
      const s = p.status;
      if (!porStatus[s]) porStatus[s] = { count: 0, valor: 0 };
      porStatus[s].count++;
      porStatus[s].valor += (p.value || 0);
    });

    // Status confirmados (mesma lista do webhook)
    const STATUS_CONFIRMADOS = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'];
    const confirmados = todosPagamentos.filter(p => STATUS_CONFIRMADOS.includes(p.status));

    const somaConfirmados = confirmados.reduce((s, p) => s + (p.value || 0), 0);

    // Pagamentos cancelados/estornados
    const cancelados = todosPagamentos.filter(p => p.status === 'CANCEL' || p.status === 'REFUNDED');
    const somaCancelados = cancelados.reduce((s, p) => s + (p.value || 0), 0);

    // Duplicatas no Asaas (mesmo payment_id aparecendo mais de uma vez — não deveria)
    const idsAsaas = {};
    confirmados.forEach(p => {
      if (!idsAsaas[p.id]) idsAsaas[p.id] = [];
      idsAsaas[p.id].push(p);
    });
    const duplicatasAsaas = Object.entries(idsAsaas).filter(([_, arr]) => arr.length > 1);

    // Lista detalhada dos confirmados
    const confirmadosDetalhe = confirmados.map(p => ({
      id: p.id,
      value: p.value,
      status: p.status,
      billingType: p.billingType,
      description: p.description,
      customerName: p.customerName,
      dateCreated: p.dateCreated,
      paymentDate: p.paymentDate,
    }));

    return Response.json({
      timestamp: new Date().toISOString(),
      total_pagamentos_asaas: todosPagamentos.length,
      por_status: porStatus,
      confirmados: {
        count: confirmados.length,
        soma_valores: somaConfirmados,
        ticket_medio: confirmados.length > 0 ? somaConfirmados / confirmados.length : 0,
      },
      cancelados_estornados: {
        count: cancelados.length,
        soma_valores: somaCancelados,
        lista: cancelados.map(p => ({ id: p.id, value: p.value, status: p.status, description: p.description, customerName: p.customerName })),
      },
      duplicatas_asaas_id: duplicatasAsaas.length,
      confirmados_detalhe: confirmadosDetalhe,
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
})(req);
}
