// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31AtribuirOrdemOperacional — Atribui o próximo número operacional interno (#NNN).
 * Disparada por automação de entidade (create + update) quando status vira confirmado.
 *
 * REGRAS PERMANENTES:
 *   - Numerar SOMENTE inscrições confirmadas (aprovado ou gratuito).
 *   - Sequência sempre crescente: MAX(ordem_operacional) + 1. Nunca COUNT.
 *   - Números NUNCA são reutilizados nem removidos — mesmo se a inscrição for
 *     cancelada depois de confirmada, o número permanece (histórico permanente).
 *   - NUNCA sobrescreve ordem_operacional existente.
 *   - Concorrência: lock global exclusivo (unique index em M31AutomacaoLock) +
 *     verificação pós-escrita de duplicado.
 *   - Campo é EXCLUSIVAMENTE interno: não entra em QR Code, Asaas, webhooks,
 *     WhatsApp, e-mails ou qualquer mensagem a participantes.
 */

const LOCK_KEY = 'ORDEM_OPERACIONAL:GLOBAL';
const LOCK_TTL_MS = 30 * 1000;

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json().catch(() => ({}));
    const entityId = payload?.event?.entity_id || payload?.inscricao_id;
    if (!entityId) return Response.json({ error: 'entity_id ausente' }, { status: 400 });

    const regs = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ id: entityId }).catch(() => []);
    if (!regs || regs.length === 0) {
      return Response.json({ error: 'Inscrição não encontrada' }, { status: 404 });
    }
    const insc = regs[0];

    // Numerar SOMENTE inscrições confirmadas (aprovado ou gratuito).
    if (!['aprovado', 'gratuito'].includes(insc.status_pagamento)) {
      return Response.json({ ok: true, skipped: true, motivo: 'nao_confirmada' });
    }

    // Nunca sobrescrever (número já atribuído é permanente)
    if (insc.ordem_operacional != null) {
      return Response.json({ ok: true, skipped: true, ordem: insc.ordem_operacional });
    }

    // ── LOCK GLOBAL (concorrência) ──
    // Unique index (chave, ativo) em M31AutomacaoLock garante exclusividade:
    // apenas uma execução consegue criar o lock ativo por vez.
    const executionId = crypto.randomUUID();
    let lockAdquirido = false;
    for (let tentativa = 0; tentativa < 6 && !lockAdquirido; tentativa++) {
      // Expira locks órfãos
      const ativos = await base44.asServiceRole.entities.M31AutomacaoLock.filter({ chave: LOCK_KEY, ativo: true });
      const vivo = ativos.find((l) => new Date(l.expira_em) > new Date());
      if (!vivo && ativos.length > 0) {
        await base44.asServiceRole.entities.M31AutomacaoLock.updateMany(
          { chave: LOCK_KEY, ativo: true }, { $set: { ativo: false } }).catch(() => {});
      }
      if (!vivo) {
        try {
          await base44.asServiceRole.entities.M31AutomacaoLock.create({
            chave: LOCK_KEY, ativo: true, execution_id: executionId,
            criado_em: new Date().toISOString(),
            expira_em: new Date(Date.now() + LOCK_TTL_MS).toISOString(),
          });
          lockAdquirido = true;
          break;
        } catch (_) { /* outra execução ganhou o lock */ }
      }
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 700));
    }
    if (!lockAdquirido) {
      return Response.json({ ok: false, motivo: 'lock_indisponivel_retentar' }, { status: 409 });
    }

    let ordem = null;
    try {
      // Re-checar dentro do lock (outra execução pode ter numerado)
      const atual = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ id: entityId });
      if (atual?.[0]?.ordem_operacional != null) {
        return Response.json({ ok: true, skipped: true, ordem: atual[0].ordem_operacional });
      }

      // Maior número existente + 1 (nunca reutiliza)
      const top = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
        { ordem_operacional: { $gte: 1 } }, '-ordem_operacional', 1);
      const max = top?.[0]?.ordem_operacional || 0;
      ordem = max + 1;

      await base44.asServiceRole.entities.EventoM31Inscricao.update(entityId, { ordem_operacional: ordem });

      // Verificação pós-escrita: se por qualquer motivo houver duplicado, corrige para MAX+1
      const duplicados = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
        { ordem_operacional: ordem }, null, 5);
      if (duplicados.length > 1) {
        const outros = duplicados.filter((d) => d.id !== entityId);
        if (outros.length > 0) {
          const top2 = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
            { ordem_operacional: { $gte: 1 } }, '-ordem_operacional', 1);
          ordem = (top2?.[0]?.ordem_operacional || ordem) + 1;
          await base44.asServiceRole.entities.EventoM31Inscricao.update(entityId, { ordem_operacional: ordem });
        }
      }
    } finally {
      // Liberar lock
      await base44.asServiceRole.entities.M31AutomacaoLock.updateMany(
        { chave: LOCK_KEY, execution_id: executionId }, { $set: { ativo: false } }).catch(() => {});
    }

    return Response.json({ ok: true, ordem });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
