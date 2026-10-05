// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31WhatsAppService — ENFILEIRA APENAS (sem UAZAPI direta)
 *
 * REFACTOR: esta função NÃO chama mais /send/text nem /send/media.
 * Apenas enfileira em M31FilaMensagem. O envio real é exclusivo do m31DrenarFila.
 */

function sanitizePhone(phone: string): string {
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
    const body = await req.json();
    const { phone, message, image_url } = body;

    if (!phone) return Response.json({ error: 'phone é obrigatório' }, { status: 400 });
    if (!message) return Response.json({ error: 'message é obrigatório' }, { status: 400 });

    // ── KILL-SWITCH GLOBAL ──
    const hoje = hojeRecife();
    const controls = await base44.asServiceRole.entities.M31WhatsAppControl.filter({ data: hoje });
    if (controls[0]?.bloqueado === true) {
      return Response.json({
        sucesso: false, status: 403, error: 'kill_switch_global_ativo',
        body: 'Kill-switch manual ATIVO. Nenhum disparo permitido.',
        tipo: 'bloqueado', phone,
      }, { status: 403 });
    }

    // ── ENFILEIRAR (nunca chamar UAZAPI) ──
    const phoneSanitized = sanitizePhone(phone);
    const dedupKey = `DIRETO:${phoneSanitized}:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`;

    const filaItem = await base44.asServiceRole.entities.M31FilaMensagem.create({
      dedup_key: dedupKey,
      participante_id: phoneSanitized,
      telefone: phoneSanitized,
      automacao: 'OPERACIONAL',
      template: null,
      versao: 'V1',
      origem: 'm31WhatsAppService',
      mensagens: [{ message, image_url: image_url || null }],
      status: 'pendente',
      aprovado_para_envio: false,
      prioridade: 7,
    });

    return Response.json({
      sucesso: true,
      enfileirado: true,
      fila_id: filaItem.id,
      tipo: image_url ? 'imagem' : 'texto',
      phone: phoneSanitized,
      note: 'Enfileirado em M31FilaMensagem. Envio real exige aprovação + drenador.',
    });

  } catch (error) {
    return Response.json({
      sucesso: false, error: (error as Error).message, status: 500,
      body: '', tipo: 'erro', phone: 'desconhecido',
    }, { status: 500 });
  }
})(req);
}
