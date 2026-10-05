// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const S = base44.asServiceRole.entities;
    const caravanas = await S.EventoM31Caravana.filter({ ativa: true }, 'ordem', 100);
    return Response.json({ ok: true, versao: '2026-09-17-fix', total: caravanas.length, caravanas: caravanas.map((c:any) => ({ id: c.id, nome: c.nome, cidade_origem: c.cidade_origem || '', ordem: c.ordem ?? null })) });
  } catch (e) {
    return Response.json({ ok: false, error: String((e as Error)?.message || e) }, { status: 500 });
  }
})(req);
}
