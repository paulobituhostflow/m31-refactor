// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31ReiniciarUazapi — Reinicia a instância UAZAPI para limpar estado corrompido
 * de rate-limit (cycle_end epoch zero).
 *
 * Fluxo: logout → aguardar 10s → restart → aguardar 15s → testar envio.
 */

const UAZAPI_BASE = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');
const UAZAPI_TOKEN = config('UAZAPI_TOKEN');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    try {
      const user = await base44.auth.me();
      if (!user || user.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch { /* automação — prosseguir */ }

    const acao = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const restartOnly = acao.restart_only === true;

    const headers = { 'token': UAZAPI_TOKEN, 'Content-Type': 'application/json' };
    const resultado = { etapa: '', detalhes: {} };

    // 1. LOGOUT — desconecta a sessão WhatsApp (limpa estado interno do Baileys)
    if (!restartOnly) {
      resultado.etapa = 'logout';
      try {
        const respLogout = await fetch(`${UAZAPI_BASE}/instance/logout`, {
          method: 'POST', headers,
          body: JSON.stringify({ instance: '[Alter] M31' }),
        });
        const bodyLogout = await respLogout.text();
        resultado.detalhes.logout = { status: respLogout.status, body: bodyLogout.substring(0, 300) };
      } catch (e) {
        resultado.detalhes.logout = { erro: e.message };
      }
      await sleep(10000);
    }

    // 2. RESTART — reinicia o processo da instância no servidor UAZAPI
    resultado.etapa = 'restart';
    try {
      const respRestart = await fetch(`${UAZAPI_BASE}/instance/restart`, {
        method: 'POST', headers,
        body: JSON.stringify({ instance: '[Alter] M31' }),
      });
      const bodyRestart = await respRestart.text();
      resultado.detalhes.restart = { status: respRestart.status, body: bodyRestart.substring(0, 300) };
    } catch (e) {
      resultado.detalhes.restart = { erro: e.message };
    }
    await sleep(15000);

    // 3. STATUS — verifica se reconectou
    resultado.etapa = 'status';
    try {
      const respStatus = await fetch(`${UAZAPI_BASE}/instance/status`, {
        method: 'GET', headers,
      });
      const bodyStatus = await respStatus.json();
      resultado.detalhes.status = {
        http: respStatus.status,
        connected: bodyStatus?.status?.connected ?? null,
        loggedIn: bodyStatus?.status?.loggedIn ?? null,
        instance: bodyStatus?.instance?.name ?? null,
      };
    } catch (e) {
      resultado.detalhes.status = { erro: e.message };
    }

    // 4. TESTE DE ENVIO — manda mensagem de teste para o dono da instância
    resultado.etapa = 'teste_envio';
    try {
      const respTest = await fetch(`${UAZAPI_BASE}/send/text`, {
        method: 'POST', headers,
        body: JSON.stringify({
          number: '558182800508', phone: '558182800508',
          message: '🧪 M31 — Instância reiniciada com sucesso. Canal WhatsApp operacional.',
          text: '🧪 M31 — Instância reiniciada com sucesso. Canal WhatsApp operacional.',
        }),
      });
      const bodyTest = await respTest.text();
      resultado.detalhes.teste_envio = { status: respTest.status, body: bodyTest.substring(0, 500) };
      resultado.sucesso = respTest.status === 200 && !bodyTest.includes('capping');
    } catch (e) {
      resultado.detalhes.teste_envio = { erro: e.message };
      resultado.sucesso = false;
    }

    // 5. Se o envio funcionou, liberar o disjuntor do drenador
    if (resultado.sucesso) {
      const breakers = await base44.asServiceRole.entities.M31AutomacaoLock.filter(
        { chave: 'CAPPING:CIRCUIT_BREAKER', ativo: true });
      for (const b of breakers) {
        await base44.asServiceRole.entities.M31AutomacaoLock.update(b.id, { ativo: false });
      }
      resultado.disjuntor_liberado = breakers.length;
    }

    return Response.json(resultado);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
