// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31ConsultarTransferencia — LEITURA PÚBLICA (sem login)
 *
 * Lê os dados mínimos para renderizar a tela pública /transferir/{token}.
 * NUNCA expõe CPF/telefone/e-mail do titular atual — apenas o primeiro nome
 * e o nome do evento, além do estado do token (válido/expirado/concluído).
 *
 * Payload: { token }
 * Response: {
 *   valido, motivo_invalido?, titular_atual_nome, evento_nome, data_limite_transferencia
 * }
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const token = body?.token;
    if (!token) return Response.json({ error: 'token é obrigatório' }, { status: 400 });

    const encontrados = await base44.asServiceRole.entities.M31TransferenciaInscricao.filter({ token }, null, 1);
    const transferencia = encontrados?.[0];
    if (!transferencia) {
      return Response.json({ valido: false, motivo_invalido: 'nao_encontrado' });
    }

    // Config do evento (nome + data limite)
    const configs = await base44.asServiceRole.entities.EventoM31Config.list('-created_date', 1);
    const dataLimite = configs?.[0]?.data_limite_transferencia || null;
    const eventoNome = 'M31 Filhas';

    const agora = new Date();
    let valido = true;
    let motivo = null;

    if (transferencia.status === 'concluida') { valido = false; motivo = 'concluida'; }
    else if (transferencia.status === 'expirada') { valido = false; motivo = 'expirada'; }
    else if (transferencia.token_expira_em && agora >= new Date(transferencia.token_expira_em)) { valido = false; motivo = 'expirada'; }
    else if (dataLimite && agora >= new Date(dataLimite)) { valido = false; motivo = 'prazo_evento'; }

    // Nome do titular atual (apenas primeiro nome, sem outros dados sensíveis)
    let titularAtualNome = null;
    try {
      const insc = await base44.asServiceRole.entities.EventoM31Inscricao.get(transferencia.inscricao_id);
      titularAtualNome = (insc?.nome || '').split(' ')[0] || null;
    } catch (_) {}

    return Response.json({
      valido,
      motivo_invalido: motivo,
      titular_atual_nome: titularAtualNome,
      evento_nome: eventoNome,
      data_limite_transferencia: dataLimite,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
