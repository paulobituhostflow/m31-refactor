// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31DebugMetadataDiscrepancia — Inspeciona o objeto completo de /group/info (UAZAPI),
 * revelando as chaves e a contagem de participantes (debug).
 */
return (async (req) => {
  try {
    const token = config('UAZAPI_TOKEN');
    if (!token) return Response.json({ error: 'UAZAPI_TOKEN não configurado' }, { status: 500 });
    const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');

    const body = await req.json().catch(() => ({}));
    const jid = body?.chat_id || body?.jid || '120363426312314949@g.us';

    const resp = await fetch(`${baseUrl}/group/info`, {
      method: 'POST',
      headers: { token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupjid: jid, getInviteLink: false }),
    });
    const text = await resp.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    const participants = data.Participants || data.participants || [];
    return Response.json({
      status: resp.status,
      jid,
      todas_chaves: Object.keys(data),
      participants_count: Array.isArray(participants) ? participants.length : 0,
      participant_sample: Array.isArray(participants) ? participants.slice(0, 3) : null,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
})(req);
}
