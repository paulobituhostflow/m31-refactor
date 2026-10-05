// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31CheckUazapiStatus
 *
 * Verifica conectividade UAZAPI + métricas de uso em tempo real.
 * Renomeado de m31CheckZapiStatus — implementação já usava UAZAPI, apenas o nome foi corrigido.
 *
 * Retorna:
 *   { connected: boolean, phone: string|null, mensagens_hoje: number, falhas_hoje: number, ultima_execucao: string }
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const token = config('UAZAPI_TOKEN');
    const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');

    let connected = false;
    let phone = null;

    if (!token) {
      return Response.json({ connected: false, error: 'UAZAPI_TOKEN não configurado' });
    }

    // UAZAPI V2 usa /instance/status (não /instance/me, que retorna 404)
    const meRes = await fetch(`${baseUrl}/instance/status`, {
      headers: { 'token': token },
    });

    if (meRes.ok) {
      const meData = await meRes.json();
      const instance = meData?.instance || meData;
      connected = instance?.status === 'connected';
      phone = instance?.phone || instance?.number || instance?.wid?.split('@')[0] || null;
    }

    // Conta mensagens enviadas hoje
    const hoje = new Date().toDateString();
    const inscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.list('-last_contact_at', 200);
    const mensagens_hoje = inscricoes.filter(i =>
      i.last_contact_at && new Date(i.last_contact_at).toDateString() === hoje
    ).length;

    const comContato = inscricoes.filter(i => i.last_contact_at).sort(
      (a, b) => new Date(b.last_contact_at) - new Date(a.last_contact_at)
    );
    const ultima_raw = comContato[0]?.last_contact_at;
    const ultima_execucao = ultima_raw
      ? new Date(ultima_raw).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : 'nunca';

    return Response.json({ connected, phone, mensagens_hoje, falhas_hoje: 0, ultima_execucao });
  } catch (error) {
    return Response.json({ connected: false, error: error.message }, { status: 500 });
  }
})(req);
}
