// @ts-nocheck
import type { HandlerContext } from "../../runtime/types";
import { authenticateGestao, gestaoFailure } from "./gestaoAccess.js";
import { executeEquipe } from "./core.js";

export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
  const { client } = context;
  try {
    if (req.method !== 'POST') return Response.json({ error: 'method_not_allowed', message: 'Use uma solicitação POST.' }, { status: 405 });
    const body = await req.json().catch(() => ({}));
    const auth = await authenticateGestao(client, body, { admin: true, write: body.action !== 'listar' });
    const result = await executeEquipe(client, body, auth);
    return Response.json(result);
  } catch (error) {
    const status = Number(error?.status) || 500;
    return Response.json({
      error: error?.code || 'team_operation_failed',
      message: status < 500 ? error.message : 'Não foi possível concluir a operação. Atualize a lista para conferir o resultado.',
    }, { status });
  }
}
