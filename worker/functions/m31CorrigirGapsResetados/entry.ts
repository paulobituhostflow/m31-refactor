// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31CorrigirGapsResetados
 * 
 * Reseta recovery_attempts para 0 nos 2 leads em risco
 * para impedir duplicata amanhã 10h
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // IDs em risco
    const idsEmRisco = [
      '6a025581ad9a5e3c1c52cb6e', // Ana Clecia
      '6a0379f251e534aa13c10459'  // Wilza
    ];

    const resultados = [];
    for (const id of idsEmRisco) {
      const insc = (await base44.asServiceRole.entities.EventoM31Inscricao.filter({ id }))[0];
      if (insc) {
        await base44.asServiceRole.entities.EventoM31Inscricao.update(id, {
          recovery_attempts: 0
        });
        resultados.push({
          id,
          nome: insc.nome,
          status: 'corrigido ✅'
        });
      }
    }

    return Response.json({
      total_corrigidos: resultados.length,
      detalhes: resultados,
      aviso: 'Amanhã 10h, essas leads entrarão na régua como d0 NOVO (sem histórico)'
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
