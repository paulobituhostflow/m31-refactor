// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31UazapiStatus
 *
 * Verifica o status real da instância UAZAPI (conectividade + número conectado).
 * Renomeado de m31ZapiStatus — implementação já usava UAZAPI, apenas o nome foi corrigido.
 *
 * Retorna:
 *   { connected: boolean, status: string, phone: string|null, raw: object }
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const token = config('UAZAPI_TOKEN');
    const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');

    if (!token) {
      return Response.json({ connected: false, error: 'UAZAPI_TOKEN não configurado' });
    }

    // UAZAPI V2 usa /instance/status (não /instance/me, que retorna 404)
    const res = await fetch(`${baseUrl}/instance/status`, {
      headers: { 'token': token },
    });

    if (!res.ok) {
      return Response.json({ connected: false, error: `Status ${res.status}` });
    }

    const data = await res.json();
    const instance = data?.instance || data;
    const isConnected = instance?.status === 'connected';
    const phone = instance?.phone || instance?.number || instance?.wid?.split('@')[0] || null;

    return Response.json({
      connected: isConnected,
      status: isConnected ? 'CONNECTED' : (instance?.status || 'UNKNOWN'),
      phone,
      instance_name: instance?.name || null,
      profile_name: instance?.profileName || null,
      raw: data,
    });
  } catch (error) {
    return Response.json({ connected: false, error: error.message }, { status: 500 });
  }
})(req);
}
