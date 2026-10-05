// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31DebugGrupos — Lista todos os grupos da instância via UAZAPI (debug).
 */
return (async (req) => {
  try {
    const token = config('UAZAPI_TOKEN');
    if (!token) return Response.json({ error: 'UAZAPI_TOKEN não configurado' }, { status: 500 });
    const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');

    const url = `${baseUrl}/group/list?force=true&noparticipants=true`;
    const res = await fetch(url, { method: 'GET', headers: { token } });
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = text; }

    const grupos = Array.isArray(data) ? data
      : Array.isArray(data?.groups) ? data.groups
      : Array.isArray(data?.data) ? data.data
      : [];

    return Response.json({
      status: res.status,
      total: grupos.length,
      grupos: grupos.map((g: any) => ({
        nome: g.Name || g.name || g.subject || '(sem nome)',
        jid: g.JID || g.id || g.jid || g.groupId,
      })),
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
})(req);
}
