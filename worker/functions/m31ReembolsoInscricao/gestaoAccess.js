export const GESTAO_AREAS = ['inscritas', 'voluntarias', 'caravanas', 'camisas'];

export function inscricaoOperacional(row) {
  return ['confirmada', 'isenta'].includes(row?.estado_canonico) ||
    (row?.origem_inscricao === 'MANUAL' && row?.status_pagamento === 'pendente');
}

const LEGACY = new Set(['admin', 'super_admin', 'gestao_operacional', 'coordenacao_participantes', 'gestora_inscricoes', 'visualizacao', 'camisas']);

export function gestaoError(status, code, message) {
  return Object.assign(new Error(message || code), { status, code });
}

export async function gestaoIdentity(client) {
  const user = await client.auth.me().catch(() => null);
  if (!user?.id || !user?.email) throw gestaoError(401, 'UNAUTHENTICATED', 'Entre com sua conta pessoal.');
  const email = user.email.trim().toLowerCase();
  const members = await client.asServiceRole.entities.EventoM31Membro.filter({ user_email: email, ativo: true }, '-created_date', 2);
  if (members.length !== 1) throw gestaoError(403, 'MEMBER_INACTIVE', 'Acesso à Gestão não autorizado.');
  const member = members[0];
  if (member.auth_user_id && member.auth_user_id !== user.id && member.auth_user_id !== user.auth_id) {
    throw gestaoError(403, 'IDENTITY_MISMATCH', 'Conta diferente da autorizada.');
  }
  const admin = user.role === 'admin';
  if (!admin && member.perfil !== 'gestao_delegada' && !LEGACY.has(member.perfil)) throw gestaoError(403, 'FORBIDDEN');
  const explicit = Array.isArray(member.gestao_areas) ? member.gestao_areas : member.operacoes_permitidas;
  const areas = admin ? [...GESTAO_AREAS] : GESTAO_AREAS.filter(a => Array.isArray(explicit) && explicit.includes(a));
  const modo = !admin && (member.perfil === 'visualizacao' || member.gestao_acesso_modo === 'consulta') ? 'consulta' : 'operacao';
  const effectiveMode = member.perfil === 'gestao_delegada' && !member.gestao_acesso_modo ? 'consulta' : modo;
  return { user, member, areas, modo: effectiveMode, can_manage_team: admin };
}

export async function authenticateGestao(client, body, options = {}) {
  const ctx = await gestaoIdentity(client);
  if (!body?.session_id) throw gestaoError(401, 'SESSION_REQUIRED', 'Abra a Gestão novamente.');
  const sessions = await client.asServiceRole.entities.M31OperacaoSessao.filter({ session_id: String(body.session_id), ativa: true }, '-created_date', 2);
  const session = sessions.length === 1 ? sessions[0] : null;
  const expiry = Date.parse(session?.expires_at || '');
  if (!session || session.auth_email?.toLowerCase() !== ctx.user.email.toLowerCase() || !Number.isFinite(expiry) || expiry <= Date.now() ||
      (session.auth_user_id && session.auth_user_id !== ctx.user.id && session.auth_user_id !== ctx.user.auth_id) ||
      (session.membro_id && session.membro_id !== ctx.member.id) ||
      (ctx.member.perfil === 'gestao_delegada' && (!session.auth_user_id || !session.membro_id))) {
    throw gestaoError(401, 'SESSION_EXPIRED', 'Sua sessão expirou. Abra a Gestão novamente.');
  }
  const areas = ctx.areas.filter(a => session.operacoes_permitidas?.includes(a));
  if (options.admin && !ctx.can_manage_team) throw gestaoError(403, 'ADMIN_REQUIRED', 'Apenas o administrador pode gerenciar a equipe.');
  if (options.area && !areas.includes(options.area)) throw gestaoError(403, 'AREA_FORBIDDEN', 'Área não permitida para sua conta.');
  if (options.write && ctx.modo !== 'operacao') throw gestaoError(403, 'READ_ONLY', 'Este acesso permite somente consulta.');
  const currentIds = ctx.member.caravana_ids_permitidas;
  const oldIds = session.caravana_ids_permitidas;
  const ids = Array.isArray(currentIds) && currentIds.length
    ? currentIds.filter(id => !Array.isArray(oldIds) || !oldIds.length || oldIds.includes(id))
    : Array.isArray(oldIds) ? oldIds : [];
  const restricted = Boolean(currentIds?.length || oldIds?.length);
  return { ...ctx, areas, session: { ...session, caravana_ids_permitidas: ids }, caravana_restrita: restricted };
}

export function assertGestaoCaravana(ctx, id) {
  if (ctx.caravana_restrita && !ctx.session.caravana_ids_permitidas.includes(id)) {
    throw gestaoError(403, 'CARAVAN_FORBIDDEN', 'Caravana fora do seu acesso.');
  }
}

export async function assertLegacyGestaoWriter(client, user) {
  if (!user?.id || !user?.email) throw gestaoError(401, 'UNAUTHENTICATED');
  if (user.role === 'admin') return;
  const members = await client.asServiceRole.entities.EventoM31Membro.filter({ user_email: user.email.toLowerCase(), ativo: true }, '-created_date', 2);
  const member = members.length === 1 ? members[0] : null;
  const profiles = ['gestao_operacional','super_admin','gestora_inscricoes','coordenacao_participantes','coordenador','coordenadora_geral'];
  if (!member || member.gestao_acesso_modo === 'consulta' || !profiles.includes(member.perfil) ||
      (member.auth_user_id && member.auth_user_id !== user.id && member.auth_user_id !== user.auth_id)) {
    throw gestaoError(403, 'LEGACY_ACTION_FORBIDDEN', 'Esta ação não faz parte do acesso delegado à Gestão.');
  }
}

export function gestaoFailure(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  return Response.json({
    ok: false,
    error: status >= 500 ? 'Não foi possível concluir a operação. Recarregue antes de tentar novamente.' : error.message,
    code: error?.code || 'GESTAO_FAILED',
    ...(error?.details || {})
  }, { status });
}
