// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31AsaasWebhook v7 — THIN RECEIVER (recebimento apenas)
 *
 * REFACTOR: separa recebimento de processamento.
 * O endpoint apenas:
 *   1. Valida asaas-access-token contra config('ASAAS_WEBHOOK_TOKEN')
 *   2. Extrai body.id como event_id (chave idempotente)
 *   3. Persiste o evento em M31AsaasWebhookEvento (unique index em event_id)
 *   4. Retorna HTTP 200
 *
 * NÃO processa pagamento diretamente. NÃO consulta UAZAPI. NÃO envia WhatsApp.
 * Após persistir, ACIONA o worker (m31ProcessarWebhookAsaas) — o processamento
 * pesado fica lá, agora sem depender das tarefas agendadas (que estão inertes).
 *
 * Idempotência: event_id tem unique index real. Evento duplicado
 * (mesmo body.id reenviado pelo Asaas) → E11000 → HTTP 200 sem novo efeito.
 */

const EVENTOS_MAPEADOS = [
  'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED',
  'PAYMENT_OVERDUE', 'PAYMENT_REFUNDED', 'PAYMENT_DELETED',
];

return (async (req: Request): Promise<Response> => {
  let base44;
  try {
    base44 = createClientFromRequest(req);

    // ── 1. AUTENTICAÇÃO ──
    const tokenHeader = req.headers.get('asaas-access-token');
    const storedToken = config('ASAAS_WEBHOOK_TOKEN');
    if (!storedToken || tokenHeader !== storedToken) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── 2. PARSE BODY ──
    let body: any;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const eventId = body?.id;
    const eventType = body?.event;
    const payment = body?.payment;

    // Sem body.id = não há chave idempotente — não pode persistir
    if (!eventId) {
      return Response.json({ received: true, note: 'sem body.id — ignorado' });
    }

    // Sem payment = evento não-financeiro — persistir como ignorado
    if (!payment) {
      try {
        await base44.asServiceRole.entities.M31AsaasWebhookEvento.create({
          event_id: eventId,
          event_type: eventType || 'UNKNOWN',
          payment_id: null,
          external_reference: null,
          payload_json: JSON.stringify(body).substring(0, 50000),
          status: 'ignorado',
          recebido_em: new Date().toISOString(),
          erro: 'sem payment no payload',
        });
      } catch (e: any) {
        if (isDuplicateKeyError(e)) {
          return Response.json({ received: true, note: 'evento duplicado (sem payment)' });
        }
      }
      return Response.json({ received: true, note: 'sem payment — persistido como ignorado' });
    }

    // Evento não-mapeado — persistir como ignorado (para auditoria)
    if (eventType && !EVENTOS_MAPEADOS.includes(eventType)) {
      try {
        await base44.asServiceRole.entities.M31AsaasWebhookEvento.create({
          event_id: eventId,
          event_type: eventType,
          payment_id: payment.id || null,
          external_reference: payment.externalReference || null,
          payload_json: JSON.stringify(body).substring(0, 50000),
          status: 'ignorado',
          recebido_em: new Date().toISOString(),
          erro: `evento não mapeado: ${eventType}`,
        });
      } catch (e: any) {
        if (isDuplicateKeyError(e)) {
          return Response.json({ received: true, note: 'evento duplicado (não mapeado)' });
        }
      }
      return Response.json({ received: true, note: `evento ${eventType} não mapeado — persistido como ignorado` });
    }

    // ── 3. PERSISTIR EVENTO (idempotência por event_id) ──
    try {
      await base44.asServiceRole.entities.M31AsaasWebhookEvento.create({
        event_id: eventId,
        event_type: eventType,
        payment_id: payment.id || null,
        external_reference: payment.externalReference || null,
        payload_json: JSON.stringify(body).substring(0, 50000),
        status: 'recebido',
        recebido_em: new Date().toISOString(),
        tentativas: 0,
      });
    } catch (e: any) {
      // Unique index em event_id: evento duplicado = HTTP 200 sem novo efeito
      if (isDuplicateKeyError(e)) {
        logger.log(`[Webhook] Evento duplicado ignorado: event_id=${eventId}`);
        return Response.json({ received: true, note: 'evento duplicado — idempotente' });
      }
      // Erro real de persistência — NÃO retornar 200 silenciosamente
      logger.error('[Webhook] Erro ao persistir evento:', e.message);
      return Response.json({ error: 'persistencia_falhou', detalhe: e.message }, { status: 500 });
    }

    // ── 4. ACORDAR O WORKER (processamento direto) ──
    // As tarefas agendadas estão inertes (causa raiz plataforma em investigação).
    // O receptor aciona o worker logo após persistir: o evento é processado
    // segundos após o pagamento. O worker tem claim atômico + idempotência —
    // invocações concorrentes são seguras. max_eventos limitado mantém a resposta
    // ao Asaas rápida; erro do worker NUNCA falha o 200 (evento já está persistido).
    let workerNota = 'processamento acionado';
    try {
      await base44.asServiceRole.functions.invoke('m31ProcessarWebhookAsaas', { max_eventos: 2 });
    } catch (e: any) {
      workerNota = 'evento persistido — worker indisponível, aguarda regularização';
      logger.error('[Webhook] Falha ao acionar worker:', e?.message || e);
    }

    // ── 5. RETORNAR 200 (após persistência confirmada) ──
    logger.log(`[Webhook] Evento persistido: event_id=${eventId}, type=${eventType}, payment=${payment.id}`);
    return Response.json({
      received: true,
      event_id: eventId,
      event_type: eventType,
      payment_id: payment.id,
      note: workerNota,
    });

  } catch (error) {
    logger.error('[Webhook] Erro não tratado:', error);
    // Retornar 200 para evitar retry infinito do Asaas, MAS logar o erro
    if (base44) {
      try {
        await base44.asServiceRole.entities.M31AsaasWebhookEvento.create({
          event_id: `ERRO_${Date.now()}_${crypto.randomUUID()}`,
          event_type: 'ERRO_INTERNO',
          payment_id: null,
          external_reference: null,
          payload_json: JSON.stringify({ error: error.message }).substring(0, 5000),
          status: 'falha',
          recebido_em: new Date().toISOString(),
          erro: error.message,
        }).catch(() => {});
      } catch {}
    }
    return Response.json({ received: true, note: 'erro interno — evento não persistido' });
  }
})(req);

function isDuplicateKeyError(err: any): boolean {
  const msg = (err?.message || '').toLowerCase();
  return msg.includes('duplicate') || msg.includes('e11000') || msg.includes('unique');
}
}
