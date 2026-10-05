// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31DiagnosticoAsaasKey — Diagnóstico read-only da ASAAS_API_KEY.
 *
 * Lê o secret do env, faz 1 GET /myAccount na API Asaas e retorna o resultado literal.
 * Não escreve em entidade nenhuma, não cria cobrança, não confirma pagamento.
 * Uso pontal de auditoria — não integrar em automações.
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const apiKey = config('ASAAS_API_KEY');

    if (!apiKey) {
      return Response.json({
        validado: false,
        motivo: 'ASAAS_API_KEY não está definida no ambiente (secret ausente ou vazio)',
      });
    }

    // GET read-only de baixo risco: /myAccount retorna dados da conta, não altera nada.
    const apiUrl = '__ASAAS_API__/myAccount';
    const resp = await fetch(apiUrl, {
      method: 'GET',
      headers: { 'access_token': apiKey },
    });

    const body = await resp.text();

    let parsed = null;
    try { parsed = JSON.parse(body); } catch (_) { /* mantém body como string */ }

    const validado = resp.status === 200 && !parsed?.errors;

    return Response.json({
      validado,
      http_status: resp.status,
      endpoint: apiUrl,
      resposta: parsed || body,
      ...(validado && parsed ? {
        conta: parsed.name || parsed.email,
        wallet_id: parsed.walletId,
      } : {}),
    });

  } catch (error) {
    return Response.json({
      validado: false,
      erro: error.message,
    }, { status: 500 });
  }
})(req);
}
