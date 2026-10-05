// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31ResolverInviteGrupo — Resolve metadata de um grupo a partir do invite link, via UAZAPI.
 * Input: { invite_link } (obrigatório). Output: JID + nome + metadata.
 */
return (async (req) => {
  try {
    const token = config('UAZAPI_TOKEN');
    if (!token) return Response.json({ error: 'UAZAPI_TOKEN não configurado' }, { status: 500 });
    const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');

    const body = await req.json().catch(() => ({}));
    const inviteLink = body?.invite_link || '';
    if (!inviteLink) {
      return Response.json({ error: 'invite_link é obrigatório' }, { status: 400 });
    }
    const inviteCode = inviteLink.split('/').pop().split('?')[0];

    const resp = await fetch(`${baseUrl}/group/inviteInfo`, {
      method: 'POST',
      headers: { token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ invitecode: inviteCode }),
    });

    const text = await resp.text();
    if (!resp.ok) {
      return Response.json({ error: 'invite não resolvido', status: resp.status, body: text.slice(0, 400) }, { status: 404 });
    }

    let data: any = {};
    try { data = JSON.parse(text); } catch (_) {}
    const g = data.group || data;
    const jid = g.JID || g.jid || g.id;

    return Response.json({
      invite_code: inviteCode,
      group: {
        jid,
        name: g.Name || g.name || g.subject || null,
        participants: g.ParticipantCount ?? (Array.isArray(g.Participants) ? g.Participants.length : 0),
        created_at: g.GroupCreated || null,
      },
      raw: g,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
})(req);
}
