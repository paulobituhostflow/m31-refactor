// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31BackfillValorCartao — Corrige inscrições onde o webhook gravou o valor
 * da parcela individual (R$ 25,80) em vez do valor total do ingresso (R$ 129).
 *
 * Critério de afetados:
 * - status_pagamento = aprovado
 * - asaas_billing_type = CREDIT_CARD
 * - valor_pago < valor do lote (indício de parcela individual)
 *
 * Estratégia de correção (em ordem):
 * 1. Buscar pagamento no Asaas → installmentCount × installmentValue
 * 2. Fallback: valor do lote (EventoM31Lote) da inscrição
 * 3. Se indeterminado: logar em M31AuditLog para revisão manual
 *
 * Admin-only.
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const ASAAS_KEY = config("ASAAS_API_KEY");

    // 1. Mapear valores dos lotes
    const lotes = await base44.asServiceRole.entities.EventoM31Lote.list();
    const loteValorMap: Record<string, number> = {};
    lotes.forEach((l: any) => { loteValorMap[l.codigo] = l.valor; });

    // 2. Buscar inscrições aprovadas com cartão
    const aprovadas = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { status_pagamento: 'aprovado', asaas_billing_type: 'CREDIT_CARD' },
      '-updated_date', 500
    );

    // 3. Filtrar afetadas: valor_pago < valor do lote
    const afetadas = aprovadas.filter((i: any) => {
      const valorLote = loteValorMap[i.lote] || 129;
      return (i.valor_pago || 0) < valorLote;
    });

    const resultados: any[] = [];
    let corrigidas = 0;
    let indeterminadas = 0;

    for (const insc of afetadas) {
      let valorTotal: number | null = null;
      let parcelas = insc.asaas_installment_count || null;
      let valorParcela = insc.asaas_installment_value || null;

      // a) Buscar pagamento no Asaas para obter installmentCount
      if (insc.asaas_payment_id) {
        try {
          const resp = await fetch(`__ASAAS_API__/payments/${insc.asaas_payment_id}`, {
            headers: { 'access_token': ASAAS_KEY }
          });
          const payment = await resp.json();
          if (payment.installmentCount && payment.installmentValue) {
            valorTotal = Math.round(payment.installmentCount * payment.installmentValue * 100) / 100;
            parcelas = payment.installmentCount;
            valorParcela = payment.installmentValue;
          }
        } catch (e) {
          // tentar próxima estratégia
        }
      }

      // b) Fallback: valor do lote da inscrição
      if (valorTotal === null) {
        const valorLote = loteValorMap[insc.lote];
        if (valorLote && valorLote > 0) {
          valorTotal = valorLote;
        }
      }

      // c) Atualizar ou logar para revisão
      if (valorTotal && valorTotal > 0) {
        await base44.asServiceRole.entities.EventoM31Inscricao.update(insc.id, {
          valor_pago: valorTotal,
          asaas_total_value: valorTotal,
          asaas_installment_count: parcelas,
          asaas_installment_value: valorParcela,
        });
        corrigidas++;
        resultados.push({
          id: insc.id,
          nome: insc.nome,
          valor_anterior: insc.valor_pago,
          valor_correto: valorTotal,
          parcelas,
          status: 'corrigido',
        });
      } else {
        indeterminadas++;
        resultados.push({
          id: insc.id,
          nome: insc.nome,
          valor_anterior: insc.valor_pago,
          status: 'indeterminado',
        });
        await base44.asServiceRole.entities.M31AuditLog.create({
          chave_unica: `backfill_valor_${insc.id}`,
          tipo_erro: 'valor_total_indeterminado',
          gravidade: 'medio',
          origem: 'asaas',
          descricao: `Backfill não conseguiu determinar valor total para ${insc.nome} (${insc.id}). valor_pago atual: ${insc.valor_pago}`,
          possivel_causa: 'Pagamento sem installmentCount no Asaas e sem lote definido na inscrição',
          acao_recomendada: 'Verificar manualmente no Asaas o payment_id e determinar o valor total',
          status: 'novo',
        });
      }
    }

    return Response.json({
      total_analisadas: aprovadas.length,
      total_afetadas: afetadas.length,
      corrigidas,
      indeterminadas,
      resultados,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
