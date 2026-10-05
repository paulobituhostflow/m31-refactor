// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31NegarSolicitacao — Marca solicitação como negada
 *
 * Payload: { solicitacao_id }
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { solicitacao_id } = body;

    if (!solicitacao_id) return Response.json({ error: 'solicitacao_id é obrigatório' }, { status: 400 });

    const solicitacao = await base44.asServiceRole.entities.M31SolicitacaoAcesso.get(solicitacao_id);
    if (!solicitacao) return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });

    await base44.asServiceRole.entities.M31SolicitacaoAcesso.update(solicitacao_id, {
      status: 'negado',
      processado_em: new Date().toISOString(),
      processado_por: user.email,
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
