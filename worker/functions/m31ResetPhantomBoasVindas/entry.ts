// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // 1. Coletar todos os inscricao_ids que têm log de boas-vindas com sucesso: true
    const logsSucesso = await base44.asServiceRole.entities.M31MessageLog.filter(
      { tipo: 'boas_vindas', sucesso: true }, '-enviado_em', 500
    );
    const idsComSucesso = new Set(logsSucesso.map(l => l.inscricao_id).filter(Boolean));

    // 2. Buscar todas as inscrições marcadas como 'enviado'
    const enviadas = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { status_envio_grupo: 'enviado' }, '-updated_date', 500
    );

    // 3. Phantom-marked: marcadas como enviado mas sem nenhum log de sucesso
    const phantom = enviadas.filter(i => !idsComSucesso.has(i.id));

    // 4. Coletar dados para retorno
    const resets = phantom.map(insc => ({
      id: insc.id,
      nome: insc.nome,
      whatsapp: insc.whatsapp,
      codigo: insc.codigo_inscricao,
    }));

    // 5. Resetar todos de uma vez com bulkUpdate
    if (phantom.length > 0) {
      await base44.asServiceRole.entities.EventoM31Inscricao.bulkUpdate(
        phantom.map(i => ({
          id: i.id,
          data_envio_boas_vindas: null,
          status_envio_grupo: 'pendente',
          boas_vindas_iniciada_em: null,
          fila_boas_vindas: false,
        }))
      );
    }

    return Response.json({
      success: true,
      total_marcadas_enviado: enviadas.length,
      total_com_log_sucesso: idsComSucesso.size,
      phantom_resetados: resets.length,
      resets,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
