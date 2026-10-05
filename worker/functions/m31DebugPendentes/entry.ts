// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const logs = await base44.asServiceRole.entities.M31MessageLog.filter(
      { tipo: 'cobranca' }, '-enviado_em', 100
    );

    // Agrupar por inscricao_id: mostrar o mais recente de cada
    const porId = {};
    for (const l of logs) {
      if (!porId[l.inscricao_id] || l.enviado_em > porId[l.inscricao_id].enviado_em) {
        porId[l.inscricao_id] = l;
      }
    }

    const resumo = Object.values(porId).map(l => ({
      nome: l.inscricao_nome,
      telefone: l.telefone,
      sucesso: l.sucesso,
      enviado_em: l.enviado_em,
      erro: l.erro || null
    }));

    return Response.json({
      total_logs: logs.length,
      inscricoes_unicas: resumo.length,
      com_sucesso: resumo.filter(r => r.sucesso).length,
      com_falha: resumo.filter(r => !r.sucesso).length,
      detalhes: resumo
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
