// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { church_id, group_jid = '120363423189586769@g.us', dias_lookback = 60 } = body || {};

    if (!church_id) {
      return Response.json({ ok: false, error: 'church_id obrigatório' }, { status: 400 });
    }

    const aprovadas = await base44.asServiceRole.entities.EventoM31Inscricao.filter({
      status_pagamento: 'aprovado'
    });

    const membros = await base44.asServiceRole.entities.M31GrupoMembro.filter({
      church_id,
      group_jid,
      status: 'ativa'
    });

    const norm = (s) => {
      let d = (s || '').replace(/\D/g, '');
      // Remove prefixo 55 duplicado: 5555... → 55...
      if (d.startsWith('5555') && d.length >= 14) d = d.slice(2);
      // Brasil: 12 dígitos (55 + DDD 2 + 8 dígitos) → insere 9 após DDD
      // Ex: 558196000813 → 5581996000813
      if (d.length === 12 && d.startsWith('55')) {
        d = d.slice(0, 4) + '9' + d.slice(4);
      }
      return d;
    };
    const phones_no_grupo = new Set(membros.map(m => norm(m.phone)));
    const inscricoes_por_phone = new Map();

    for (const i of aprovadas) {
      const p = norm(i.whatsapp);
      if (!p) continue;
      const existing = inscricoes_por_phone.get(p);
      if (!existing || new Date(i.data_envio_boas_vindas) > new Date(existing.data_envio_boas_vindas)) {
        inscricoes_por_phone.set(p, i);
      }
    }

    const ja_no_grupo = [];
    const nao_entraram = [];

    for (const [phone, inscricao] of inscricoes_por_phone) {
      const data_ref = inscricao.data_envio_boas_vindas || inscricao.created_date;
      const item = {
        phone,
        nome: inscricao.nome,
        email: inscricao.email,
        inscricao_id: inscricao.id,
        data_pagamento: data_ref,
        dias_desde_pagamento: Math.floor((Date.now() - new Date(data_ref).getTime()) / (1000 * 60 * 60 * 24)),
        tipo: inscricao.tipo,
      };

      if (phones_no_grupo.has(phone)) {
        ja_no_grupo.push(item);
      } else {
        nao_entraram.push(item);
      }
    }

    const phones_inscritos = new Set(inscricoes_por_phone.keys());
    const no_grupo_sem_inscricao = membros.filter(m => !phones_inscritos.has(norm(m.phone))).map(m => ({
      phone: m.phone,
      lid: m.lid,
      is_admin: m.is_admin,
      primeira_deteccao: m.primeira_deteccao,
    }));

    nao_entraram.sort((a, b) => a.dias_desde_pagamento - b.dias_desde_pagamento);

    const total_inscritas = inscricoes_por_phone.size;
    const total_no_grupo = ja_no_grupo.length;
    const conversao_pct = total_inscritas > 0 ? Math.round((total_no_grupo / total_inscritas) * 1000) / 10 : 0;

    return Response.json({
      ok: true,
      summary: {
        timestamp: new Date().toISOString(),
        dias_lookback,
        total_inscricoes_aprovadas: total_inscritas,
        total_no_grupo_e_inscritas: total_no_grupo,
        total_pagaram_nao_entraram: nao_entraram.length,
        total_membros_grupo: membros.length,
        conversao_pct,
      },
      nao_entraram,
      ja_no_grupo: ja_no_grupo.slice(0, 10),
      no_grupo_sem_inscricao,
    }, { status: 200 });

  } catch (err) {
    return Response.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 });
  }
})(req);
}
