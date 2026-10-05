// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31DebugMetadata — Testa endpoints UAZAPI de metadata/participantes de um grupo (debug).
 */
return (async (req) => {
  try {
    const token = config('UAZAPI_TOKEN');
    if (!token) return Response.json({ error: 'UAZAPI_TOKEN não configurado' }, { status: 500 });
    const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');

    const body = await req.json().catch(() => ({}));
    const jid = body?.chat_id || body?.jid || '120363423189586769@g.us';

    const rotas = [
      { url: `${baseUrl}/group/info?groupjid=${encodeURIComponent(jid)}`, method: 'GET' },
      { url: `${baseUrl}/group/info`, method: 'POST', payload: { groupjid: jid } },
      { url: `${baseUrl}/group/participants`, method: 'POST', payload: { groupjid: jid } },
    ];

    const results = [];
    for (const r of rotas) {
      try {
        const resp = await fetch(r.url, {
          method: r.method,
          headers: { token, 'Content-Type': 'application/json' },
          body: r.method === 'POST' ? JSON.stringify(r.payload) : undefined,
        });
        const text = await resp.text();
        results.push({ rota: r.url, method: r.method, status: resp.status, body: text.slice(0, 800) });
      } catch (e) {
        results.push({ rota: r.url, method: r.method, erro: (e as Error).message });
      }
    }

    return Response.json({ jid, results });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
})(req);
}
