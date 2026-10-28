// @ts-nocheck
import type { HandlerContext } from "../../runtime/types";
import { gestaoIdentity, authenticateGestao, gestaoFailure } from "./gestaoAccess.js";

export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
  const { client } = context;
  try {
    if (req.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405 });
    const body = await req.json().catch(() => ({}));
    const ctx = body.session_id ? await authenticateGestao(client, body) : await gestaoIdentity(client);
    const S = client.asServiceRole.entities;
    let session = 'session' in ctx ? ctx.session : null;
    if (!session) {
      const now = new Date();
      session = await S.M31OperacaoSessao.create({
        session_id: crypto.randomUUID(),
        auth_email: ctx.user.email.toLowerCase(),
        auth_user_id: ctx.user.id || ctx.user.auth_id,
        membro_id: ctx.member.id,
        operador_nome: String(body.nome || '').trim().slice(0, 80) || ctx.member.nome || ctx.user.full_name || ctx.user.email,
        operador_whatsapp: String(body.whatsapp || '').replace(/\D/g, '').slice(0, 13) || ctx.member.whatsapp || '',
        operacoes_permitidas: ctx.areas,
        caravana_ids_permitidas: ctx.member.caravana_ids_permitidas || [],
        aberta_em: now.toISOString(),
        expires_at: new Date(now.getTime() + 12 * 3600000).toISOString(),
        ativa: true,
      });
      try {
        await S.EventoM31ActionLog.create({
          user_email: ctx.user.email,
          user_nome: session.operador_nome,
          user_perfil: ctx.member.perfil,
          acao: 'Abriu Gestão com conta pessoal',
          modulo: 'sistema',
          entidade_id: ctx.member.id,
        });
        await S.EventoM31Membro.update(ctx.member.id, {
          auth_user_id: ctx.user.id || ctx.user.auth_id,
          gestao_login_confirmado_em: now.toISOString(),
        });
      } catch (error) {
        await S.M31OperacaoSessao.update(session.id, { ativa: false });
        throw error;
      }
    }
    return Response.json({
      ok: true,
      session_id: session.session_id,
      auth_user_id: ctx.user.id || ctx.user.auth_id,
      operador_nome: session.operador_nome,
      operador_whatsapp: session.operador_whatsapp,
      operacoes_permitidas: ctx.areas,
      areas: ctx.areas,
      modo: ctx.modo,
      can_manage_team: ctx.can_manage_team,
      is_admin: ctx.user.role === 'admin',
      expires_at: session.expires_at,
    });
  } catch (error) {
    return gestaoFailure(error);
  }
}
