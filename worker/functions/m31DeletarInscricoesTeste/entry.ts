// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const emailsTeste = ['teste2@m31.com', 'midia2@m31.com', 'voluntaria@m31.com'];
    const deletados = [];

    for (const email of emailsTeste) {
      const inscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ email });
      
      if (inscricoes && inscricoes.length > 0) {
        for (const insc of inscricoes) {
          await base44.asServiceRole.entities.EventoM31Inscricao.delete(insc.id);
          deletados.push({
            id: insc.id,
            email: insc.email,
            nome: insc.nome,
            status: 'deletado'
          });
        }
      }
    }

    return Response.json({
      sucesso: true,
      total_deletados: deletados.length,
      registros: deletados
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
