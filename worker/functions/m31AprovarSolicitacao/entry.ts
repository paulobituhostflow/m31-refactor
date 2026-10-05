// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31AprovarSolicitacao — Aprova solicitação e cria membro em EventoM31Membro
 *
 * Payload: { solicitacao_id, perfil }
 *
 * Cria EventoM31Membro com user_email, nome e perfil selecionados.
 * Marca a solicitação como 'aprovado'.
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { solicitacao_id, perfil } = body;

    if (!solicitacao_id) return Response.json({ error: 'solicitacao_id é obrigatório' }, { status: 400 });
    if (!perfil) return Response.json({ error: 'perfil é obrigatório' }, { status: 400 });

    // Busca a solicitação
    const solicitacao = await base44.asServiceRole.entities.M31SolicitacaoAcesso.get(solicitacao_id);
    if (!solicitacao) return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });

    // Verifica se já existe membro com este e-mail
    const membroExistente = await base44.asServiceRole.entities.EventoM31Membro.filter({
      user_email: solicitacao.email,
      ativo: true,
    });

    if (membroExistente.length > 0) {
      // Já é membro — apenas marca solicitação como aprovada
      await base44.asServiceRole.entities.M31SolicitacaoAcesso.update(solicitacao_id, {
        status: 'aprovado',
        processado_em: new Date().toISOString(),
        processado_por: user.email,
        perfil_atribuido: perfil,
      });
      return Response.json({
        success: true,
        message: 'Usuário já era membro. Solicitação marcada como aprovada.',
        ja_existia: true,
      });
    }

    // Cria o membro
    const novoMembro = await base44.asServiceRole.entities.EventoM31Membro.create({
      user_email: solicitacao.email,
      nome: solicitacao.nome,
      perfil,
      ativo: true,
    });

    // Marca solicitação como aprovada
    await base44.asServiceRole.entities.M31SolicitacaoAcesso.update(solicitacao_id, {
      status: 'aprovado',
      processado_em: new Date().toISOString(),
      processado_por: user.email,
      perfil_atribuido: perfil,
    });

    return Response.json({
      success: true,
      membro_id: novoMembro.id,
      perfil_atribuido: perfil,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
