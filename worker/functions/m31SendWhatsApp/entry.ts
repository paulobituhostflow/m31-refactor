// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31SendWhatsApp v11 — ENFILEIRA APENAS (sem UAZAPI direta)
 *
 * REFACTOR: esta função NÃO chama mais /send/text nem /send/media.
 * Apenas enfileira em M31FilaMensagem. O envio real é exclusivo do m31DrenarFila.
 *
 * Mantém a tranca internal-only (header X-Internal-Secret ou body internal_secret).
 */

function normalizePhone(phone: string): string {
  let d = (phone || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10) return `55${d}`;
  return d;
}

function hojeRecife(): string {
  return new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const token = config('UAZAPI_TOKEN');
    if (!token) return Response.json({ error: 'UAZAPI_TOKEN não configurado' }, { status: 500 });

    const reqBody = await req.json().catch(() => ({}));

    // ── TRANCA: internal-only ──
    const headerSecret = req.headers.get('x-internal-secret') || '';
    const bodySecret = reqBody?.internal_secret || '';
    if (headerSecret !== token && bodySecret !== token) {
      return Response.json({ error: 'forbidden_internal_only' }, { status: 403 });
    }

    const phone = reqBody?.phone;
    const message = reqBody?.message || '';
    const imageUrl = reqBody?.image_url || '';

    if (!phone || !message) {
      return Response.json({ error: 'phone e message obrigatórios' }, { status: 400 });
    }

    // ── KILL-SWITCH GLOBAL ──
    const hoje = hojeRecife();
    const controls = await base44.asServiceRole.entities.M31WhatsAppControl.filter({ data: hoje });
    if (controls[0]?.bloqueado === true) {
      return Response.json({ sucesso: false, error: 'kill_switch_global_ativo' }, { status: 403 });
    }

    // ── ENFILEIRAR (nunca chamar UAZAPI) ──
    const phoneSanitized = normalizePhone(phone);
    const dedupKey = `DIRETO:${phoneSanitized}:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`;

    const filaItem = await base44.asServiceRole.entities.M31FilaMensagem.create({
      dedup_key: dedupKey,
      participante_id: phoneSanitized,
      telefone: phoneSanitized,
      automacao: 'OPERACIONAL',
      template: null,
      versao: 'V1',
      origem: 'm31SendWhatsApp',
      mensagens: [{ message, image_url: imageUrl || null }],
      status: 'pendente',
      aprovado_para_envio: false,
      prioridade: 7,
    });

    return Response.json({
      sucesso: true,
      enfileirado: true,
      fila_id: filaItem.id,
      telefone: phoneSanitized,
      note: 'Enfileirado em M31FilaMensagem. Envio real exige aprovação + drenador.',
    });

  } catch (error) {
    return Response.json({ error: (error as Error).message, sucesso: false }, { status: 500 });
  }
})(req);
}
