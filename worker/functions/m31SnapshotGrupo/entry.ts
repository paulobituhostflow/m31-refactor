// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31SnapshotGrupo — Snapshot dos membros de um grupo WhatsApp via UAZAPI.
 * Sincroniza M31GrupoMembro: cria novos, atualiza existentes, marca "saiu" quem sumiu.
 *
 * Input: { church_id?, group_jid } (group_jid @g.us). church_id apenas para segmentar
 * os registros em M31GrupoMembro (não é mais usado para credenciais — provider é UAZAPI global).
 */

// Extrai telefone (somente dígitos) de "558398270372@s.whatsapp.net"
function extrairPhone(p: any): string | null {
  const raw = p?.PhoneNumber || p?.phoneNumber || p?.phone || '';
  const d = String(raw).replace(/\D/g, '');
  return d || null;
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { church_id = 'm31', group_jid: group_jid_in } = body || {};

    const token = config('UAZAPI_TOKEN');
    if (!token) return Response.json({ ok: false, error: 'UAZAPI_TOKEN não configurado' }, { status: 500 });
    const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');

    const group_jid = group_jid_in || '120363423189586769@g.us';

    // 1) Buscar metadata + participantes via UAZAPI
    const r = await fetch(`${baseUrl}/group/info`, {
      method: 'POST',
      headers: { token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupjid: group_jid }),
    });

    if (!r.ok) {
      const body_text = await r.text();
      return Response.json({ ok: false, error: 'UAZAPI /group/info falhou', status: r.status, body: body_text }, { status: 502 });
    }

    const data = await r.json();
    const participants = Array.isArray(data.Participants) ? data.Participants
      : Array.isArray(data.participants) ? data.participants
      : [];

    if (participants.length === 0) {
      return Response.json({ ok: false, error: 'participants vazio — UAZAPI retornou nada' }, { status: 502 });
    }

    const now = new Date().toISOString();
    let added = 0;
    let updated = 0;
    const phones_now = [];

    // 2) Carregar TODOS os membros desta church+group em uma única query
    const existing_members = await base44.asServiceRole.entities.M31GrupoMembro.filter({
      church_id,
      group_jid,
    });
    const member_by_phone = {};
    existing_members.forEach(m => {
      member_by_phone[m.phone] = m;
    });

    // 2.1) Processar participantes atuais
    const updates_batch = [];
    const creates_batch = [];

    for (const p of participants) {
      const phone = extrairPhone(p);
      if (!phone) continue;
      phones_now.push(phone);

      const lid = p.LID || p.lid || null;
      const isAdmin = !!(p.IsAdmin ?? p.isAdmin);
      const isSuperAdmin = !!(p.IsSuperAdmin ?? p.isSuperAdmin);
      const nomeWa = p.DisplayName || p.displayName || null;

      const existing = member_by_phone[phone];
      if (existing) {
        updates_batch.push({
          id: existing.id,
          ultima_deteccao: now,
          status: 'ativa',
          is_admin: isAdmin,
          is_super_admin: isSuperAdmin,
          lid: lid || existing.lid,
          nome_whatsapp: nomeWa || existing.nome_whatsapp,
          snapshot_count: (existing.snapshot_count || 1) + 1
        });
        updated++;
      } else {
        creates_batch.push({
          church_id,
          group_jid,
          phone,
          lid,
          nome_whatsapp: nomeWa,
          is_admin: isAdmin,
          is_super_admin: isSuperAdmin,
          primeira_deteccao: now,
          ultima_deteccao: now,
          status: 'ativa',
          snapshot_count: 1
        });
        added++;
      }
    }

    // 2.2) Executar batch updates e creates (gravação em LOTE — chamadas
    // individuais aqui estouravam o rate limit e travavam o snapshot agendado)
    const E = base44.asServiceRole.entities.M31GrupoMembro;
    for (let i = 0; i < updates_batch.length; i += 100) {
      await E.bulkUpdate(updates_batch.slice(i, i + 100));
    }

    if (creates_batch.length > 0) {
      await E.bulkCreate(creates_batch);
    }

    // 3) Marca como "saiu" quem estava ativa antes mas NÃO veio nesse snapshot
    const phonesSet = new Set(phones_now);
    let left = 0;
    const saidas_batch = [];
    for (const m of existing_members) {
      if (m.status === 'ativa' && !phonesSet.has(m.phone)) {
        saidas_batch.push({ id: m.id, status: 'saiu' });
        left++;
      }
    }
    for (let i = 0; i < saidas_batch.length; i += 100) {
      await E.bulkUpdate(saidas_batch.slice(i, i + 100));
    }

    return Response.json({
      ok: true,
      summary: {
        group_jid,
        timestamp: now,
        total_no_grupo: participants.length,
        added_new: added,
        updated_existing: updated,
        marked_as_left: left
      }
    });

  } catch (error) {
    return Response.json({ ok: false, error: error.message, stack: error.stack }, { status: 500 });
  }
})(req);
}
