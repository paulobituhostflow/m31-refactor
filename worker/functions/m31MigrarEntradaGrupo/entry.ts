// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const agora = new Date().toISOString();

    const jaNoGrupo = await base44.asServiceRole.entities.EventoM31Inscricao.filter({
      status_envio_grupo: 'enviado'
    });

    let atualizadas = 0;
    for (const inscricao of jaNoGrupo) {
      try {
        await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
          entrou_no_grupo: true,
          data_entrada_grupo: inscricao.data_envio_boas_vindas || agora,
          origem_confirmacao_grupo: 'importacao'
        });
        atualizadas++;
      } catch (err) {
        logger.error(`Erro ao atualizar ${inscricao.id}:`, err.message);
      }
      await new Promise(r => setTimeout(r, 300));
    }

    return Response.json({ atualizadas, total_encontradas: jaNoGrupo.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
