// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31DebugInvite — Testa a resolução de um invite code via UAZAPI (debug).
 * Input: { invite_link } ou { invite_code }.
 */
return (async (req) => {
  try {
    const token = config('UAZAPI_TOKEN');
    if (!token) return Response.json({ error: 'UAZAPI_TOKEN não configurado' }, { status: 500 });
    const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');

    const body = await req.json().catch(() => ({}));
    const inviteLink = body?.invite_link || '';
    const inviteCode = body?.invite_code || (inviteLink ? inviteLink.split('/').pop().split('?')[0] : '');
    if (!inviteCode) {
      return Response.json({ error: 'invite_link ou invite_code é obrigatório' }, { status: 400 });
    }

    const rotas = [
      { url: `${baseUrl}/group/inviteInfo`, method: 'POST', payload: { invitecode: inviteCode } },
      { url: `${baseUrl}/group/info?invitecode=${encodeURIComponent(inviteCode)}`, method: 'GET' },
    ];

    const respostas = [];
    for (const r of rotas) {
      try {
        const res = await fetch(r.url, {
          method: r.method,
          headers: { token, 'Content-Type': 'application/json' },
          body: r.method === 'POST' ? JSON.stringify(r.payload) : undefined,
        });
        const text = await res.text();
        let data: any;
        try { data = JSON.parse(text); } catch { data = text; }
        respostas.push({ rota: r.url, method: r.method, status: res.status, response: data });
      } catch (e) {
        respostas.push({ rota: r.url, method: r.method, error: (e as Error).message });
      }
    }

    return Response.json({ inviteCode, respostas });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
})(req);
}
