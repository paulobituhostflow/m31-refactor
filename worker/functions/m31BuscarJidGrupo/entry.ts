// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31BuscarJidGrupo — Resolve o JID (@g.us) de um grupo via UAZAPI.
 * Aceita { invite_link } (resolve pelo convite) OU { nome } (busca em /group/list).
 */
return (async (req) => {
  try {
    const token = config('UAZAPI_TOKEN');
    if (!token) return Response.json({ error: 'UAZAPI_TOKEN não configurado' }, { status: 500 });
    const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');

    const body = await req.json().catch(() => ({}));
    const inviteLink = body?.invite_link || '';
    const nome = (body?.nome || '').toLowerCase();

    // ── 1. Por invite link ──────────────────────────────────────
    if (inviteLink) {
      const inviteCode = inviteLink.split('/').pop().split('?')[0];
      const resp = await fetch(`${baseUrl}/group/inviteInfo`, {
        method: 'POST',
        headers: { token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitecode: inviteCode }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const g = data.group || data;
        return Response.json({
          success: true,
          via: 'invite',
          jid: g.JID || g.jid || g.id,
          nome: g.Name || g.name || g.subject,
        });
      }
      return Response.json({ success: false, error: 'invite não resolvido', status: resp.status }, { status: 404 });
    }

    // ── 2. Por nome (busca na lista) ────────────────────────────
    const listResp = await fetch(`${baseUrl}/group/list?force=true&noparticipants=true`, {
      method: 'GET', headers: { token },
    });
    const listData = await listResp.json();
    const grupos = Array.isArray(listData) ? listData
      : Array.isArray(listData?.groups) ? listData.groups
      : Array.isArray(listData?.data) ? listData.data : [];

    const alvo = nome || 'filhas';
    const encontrado = grupos.find((g: any) =>
      (g.Name || g.name || g.subject || '').toLowerCase().includes(alvo)
    );

    if (encontrado) {
      return Response.json({
        success: true,
        via: 'nome',
        nome: encontrado.Name || encontrado.name || encontrado.subject,
        jid: encontrado.JID || encontrado.id || encontrado.jid,
      });
    }

    return Response.json({ success: false, error: 'Nenhum grupo encontrado', total: grupos.length }, { status: 404 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
})(req);
}
