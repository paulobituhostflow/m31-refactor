// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31ConsultarQuotaUazapi — diagnóstico read-only da quota/capping da instância UAZAPI.
 * NÃO envia nenhuma mensagem. Apenas consulta o status da instância.
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const token = config('UAZAPI_TOKEN');
    const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');
    if (!token) return Response.json({ error: 'UAZAPI_TOKEN não configurado' }, { status: 500 });

    const resultados: Record<string, unknown> = {};

    // Consulta status da instância (inclui capping/quota quando exposto)
    for (const path of ['/instance/status', '/status', '/instance/info']) {
      try {
        const r = await fetch(`${baseUrl}${path}`, { headers: { token } });
        const body = await r.text();
        let json: unknown = null;
        try { json = JSON.parse(body); } catch { /* não-JSON */ }
        resultados[path] = { http_status: r.status, body: json || body.substring(0, 1500) };
      } catch (e) {
        resultados[path] = { erro: e.message };
      }
    }

    return Response.json({ consultado_em: new Date().toISOString(), resultados });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
