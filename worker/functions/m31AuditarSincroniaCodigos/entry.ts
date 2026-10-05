// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

const ASAAS_BASE = "__ASAAS_API__";

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run !== false; // default true
    const ASAAS_KEY = config('ASAAS_API_KEY');

    // 1. Buscar TODOS os pagamentos do Asaas com externalReference (paginação)
    const statusList = ['PENDING', 'RECEIVED', 'CONFIRMED', 'OVERDUE'];
    const allPayments = [];

    for (const status of statusList) {
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const res = await fetch(`${ASAAS_BASE}/payments?status=${status}&limit=100&offset=${offset}`, {
          headers: { 'access_token': ASAAS_KEY }
        });
        const data = await res.json();
        const payments = data.data || [];
        allPayments.push(...payments);
        hasMore = data.hasMore === true;
        offset += 100;
        if (payments.length < 100) hasMore = false;
      }
    }

    // 2. Filtrar apenas pagamentos com externalReference (gerados pelo nosso sistema)
    const paymentsComRef = allPayments.filter(p => p.externalReference && p.externalReference.startsWith('M31-'));

    // 3. Buscar todas as inscrições no banco que têm asaas_payment_id
    const inscricoesComPayment = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      {}, '-created_date', 500
    );
    const mapaPorPaymentId = new Map();
    const mapaPorCodigo = new Map();
    for (const insc of inscricoesComPayment) {
      if (insc.asaas_payment_id) mapaPorPaymentId.set(insc.asaas_payment_id, insc);
      if (insc.codigo_inscricao) mapaPorCodigo.set(insc.codigo_inscricao, insc);
    }

    // 4. Cruzar: para cada pagamento Asaas, verificar sincronia
    const dessincronizados = [];
    const semInscricao = [];
    const sincronizados = [];

    for (const payment of paymentsComRef) {
      const inscByCodigo = mapaPorCodigo.get(payment.externalReference);
      const inscByPaymentId = mapaPorPaymentId.get(payment.id);

      if (inscByCodigo) {
        // Sincronizado — codigo bate
        sincronizados.push({ payment_id: payment.id, codigo: payment.externalReference, status: payment.status, inscricao_id: inscByCodigo.id, nome: inscByCodigo.nome });
      } else if (inscByPaymentId) {
        // DESSINCRONIZADO — payment_id bate mas codigo_inscricao não corresponde ao externalReference do Asaas
        dessincronizados.push({
          payment_id: payment.id,
          externalReference_asaas: payment.externalReference,
          codigo_inscricao_banco: inscByPaymentId.codigo_inscricao,
          inscricao_id: inscByPaymentId.id,
          nome: inscByPaymentId.nome,
          whatsapp: inscByPaymentId.whatsapp,
          email: inscByPaymentId.email,
          status_pagamento: inscByPaymentId.status_pagamento,
          payment_status: payment.status,
          payment_value: payment.value
        });
      } else {
        // SEM INSCRIÇÃO — não há registro com nem o codigo nem o payment_id
        semInscricao.push({
          payment_id: payment.id,
          externalReference: payment.externalReference,
          status: payment.status,
          value: payment.value,
          dateCreated: payment.dateCreated
        });
      }
    }

    // 5. Se não for dry-run, corrigir os dessincronizados
    let corrigidos = [];
    if (!dryRun) {
      for (const d of dessincronizados) {
        // Buscar customer no Asaas para confirmar identidade
        let customerName = null;
        try {
          const payRes = await fetch(`${ASAAS_BASE}/payments/${d.payment_id}`, {
            headers: { 'access_token': ASAAS_KEY }
          });
          const payData = await payRes.json();
          if (payData.customer) {
            const custRes = await fetch(`${ASAAS_BASE}/customers/${payData.customer}`, {
              headers: { 'access_token': ASAAS_KEY }
            });
            const custData = await custRes.json();
            customerName = custData.name;
          }
        } catch (_) {}

        // Atualizar codigo_inscricao para bater com externalReference do Asaas
        await base44.asServiceRole.entities.EventoM31Inscricao.update(d.inscricao_id, {
          codigo_inscricao: d.externalReference_asaas
        });
        corrigidos.push({
          inscricao_id: d.inscricao_id,
          nome: d.nome,
          codigo_antigo: d.codigo_inscricao_banco,
          codigo_novo: d.externalReference_asaas,
          customer_asaas: customerName
        });
        // Throttle
        await new Promise(r => setTimeout(r, 200));
      }
    }

    return Response.json({
      total_payments_asaas: paymentsComRef.length,
      sincronizados: sincronizados.length,
      dessincronizados: dessincronizados.length,
      sem_inscricao: semInscricao.length,
      dry_run: dryRun,
      corrigidos: corrigidos.length,
      dessincronizados_lista: dessincronizados,
      sem_inscricao_lista: semInscricao,
      corrigidos_lista: corrigidos
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
