// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.
import { handleCartinhas } from './cartinhaService.js';
import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

const headers = { 'Cache-Control': 'no-store, private', 'Vary': 'Authorization, Cookie' };
return (async req => {
  const requestId = crypto.randomUUID();
  let action = 'nao_identificada';
  if (req.method !== 'POST') return Response.json({ error: 'Método não permitido.' }, { status: 405, headers });
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch { /* Não reutiliza sessão operacional nem chave compartilhada. */ }
    if (!user) return Response.json({ error: 'Entre com sua conta.' }, { status: 401, headers });
    let body;
    try { body = await req.json(); } catch { return Response.json({ error: 'Solicitação inválida.' }, { status: 400, headers }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({ error: 'Solicitação inválida.', request_id: requestId }, { status: 400, headers });
    action = typeof body.action === 'string' ? body.action.slice(0, 30) : 'ausente';
    const result = await handleCartinhas({ user, body, S: base44.asServiceRole.entities, invokeLLM: args => base44.asServiceRole.integrations.Core.InvokeLLM(args) });
    return Response.json(result.body, { status: result.status, headers });
  } catch (error) {
    // Sem texto pastoral, CPF, token, senha ou payload nos logs.
    logger.error(JSON.stringify({ modulo: 'cartinhas', evento: 'falha_requisicao', request_id: requestId, action, error_type: error?.name || 'Error', http_status: error?.status || error?.response?.status || null }));
    return Response.json({ error: 'Não foi possível acessar as cartinhas. Tente novamente.', request_id: requestId }, { status: 500, headers });
  }
})(req);

}
