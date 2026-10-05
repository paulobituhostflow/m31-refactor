// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31BackfillPagamentoConfirmado — Backfill do timestamp financeiro real
 *
 * Preenche pagamento_confirmado_em para inscrições APROVADAS que ainda não têm
 * esse carimbo (campo introduzido depois delas). A data vem EXCLUSIVAMENTE do
 * Asaas (confirmedDate → paymentDate → clientPaymentDate), normalizada para UTC.
 *
 * Regras (idênticas às do webhook m31AsaasWebhook):
 *  - Append-only: nunca sobrescreve um pagamento_confirmado_em já existente.
 *  - Fail-closed: sem asaas_payment_id ou sem data financeira válida → NÃO grava
 *    (a inscrição permanece bloqueada; motivo registrado no retorno).
 *  - NUNCA usa new Date() nem aproximação — só a data real do provedor.
 *
 * Admin-only. Read-mostly: só escreve o campo financeiro, não dispara mensagens.
 */

function normalizarDataFinanceira(valor) {
  if (!valor || typeof valor !== 'string') return null;
  const somenteData = /^\d{4}-\d{2}-\d{2}$/.test(valor.trim());
  const iso = somenteData ? `${valor.trim()}T00:00:00.000Z` : valor;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function fetchAsaas(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error(`Timeout Asaas ${timeoutMs / 1000}s`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const limite = Math.min(body?.limite || 150, 300);
    const dryRun = body?.dry_run === true;

    const ASAAS_KEY = config('ASAAS_API_KEY');
    if (!ASAAS_KEY) return Response.json({ error: 'ASAAS_API_KEY ausente' }, { status: 500 });

    const aprovadas = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { status_pagamento: 'aprovado' }, '-created_date', 500
    );

    // Só as que ainda não têm o carimbo financeiro e possuem asaas_payment_id.
    const alvo = aprovadas
      .filter((i) => !i.pagamento_confirmado_em && i.asaas_payment_id)
      .slice(0, limite);

    let gravados = 0;
    let semDataValida = 0;
    const detalhes = [];

    for (const insc of alvo) {
      let data = null;
      let status = null;
      try {
        const resp = await fetchAsaas(`__ASAAS_API__/payments/${insc.asaas_payment_id}`, {
          headers: { 'access_token': ASAAS_KEY },
        });
        const payment = await resp.json();
        status = payment?.status || null;
        data = normalizarDataFinanceira(payment?.confirmedDate)
          || normalizarDataFinanceira(payment?.paymentDate)
          || normalizarDataFinanceira(payment?.clientPaymentDate);
      } catch (e) {
        detalhes.push({ id: insc.id, nome: insc.nome, resultado: 'erro_asaas', erro: e.message });
        continue;
      }

      if (!data) {
        semDataValida++;
        detalhes.push({ id: insc.id, nome: insc.nome, resultado: 'sem_data_financeira', status_asaas: status });
        continue;
      }

      if (!dryRun) {
        await base44.asServiceRole.entities.EventoM31Inscricao.update(insc.id, {
          pagamento_confirmado_em: data,
        });
      }
      gravados++;
      detalhes.push({ id: insc.id, nome: insc.nome, resultado: dryRun ? 'seria_gravado' : 'gravado', data });
    }

    return Response.json({
      success: true,
      dry_run: dryRun,
      total_aprovadas: aprovadas.length,
      candidatas_backfill: alvo.length,
      gravados,
      sem_data_valida: semDataValida,
      restam_sem_payment_id: aprovadas.filter((i) => !i.pagamento_confirmado_em && !i.asaas_payment_id).length,
      detalhes,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
