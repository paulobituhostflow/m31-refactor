import { withGestaoCreateLock } from './gestaoMutationLock.js';

const AREAS = ['inscritas', 'voluntarias', 'caravanas', 'camisas'];
const PROTECTED_PROFILES = new Set(['admin', 'super_admin']);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DELEGATED_SAFE_FLAGS = { pode_checkin: false, pode_ver_financeiro: false, pode_ver_dashboard: false, pode_ver_inscricoes: false };

export function equipeError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

const fail = (code, message, status) => { throw equipeError(code, message, status); };
const emailOf = (value) => String(value || '').trim().toLowerCase();
const changed = (result) => (result?.updated ?? result?.modified_count ?? result?.modifiedCount ?? 0) === 1;

async function all(entity, filter = {}) {
  const records = new Map();
  for (let offset = 0; ; offset += 500) {
    const page = await entity.filter(filter, 'id', 500, offset);
    for (const record of page) {
      if (!record.id || records.has(record.id)) fail('pagination_uncertain', 'A lista foi alterada durante a consulta. Atualize e tente novamente.', 409);
      records.set(record.id, record);
    }
    if (page.length < 500) return [...records.values()];
  }
}

export function validateEquipeFields(fields, current = null) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) fail('invalid_fields', 'Preencha os dados do acesso.');
  const permitted = new Set(['nome', 'user_email', 'whatsapp', 'gestao_acesso_modo', 'gestao_areas']);
  if (Object.keys(fields).some((key) => !permitted.has(key))) fail('forbidden_field', 'A delegação não permite alterar perfis administrativos.', 403);
  const nome = String(fields.nome || '').trim().replace(/\s+/g, ' ');
  const user_email = emailOf(fields.user_email);
  let whatsapp = String(fields.whatsapp || '').replace(/\D/g, '');
  if (whatsapp.length >= 10 && whatsapp.length <= 11) whatsapp = `55${whatsapp}`;
  if (nome.length < 3 || nome.length > 160) fail('invalid_name', 'Informe o nome completo.');
  if (!EMAIL.test(user_email) || user_email.length > 254) fail('invalid_email', 'Informe um e-mail válido para o login individual.');
  if (current && emailOf(current.user_email) !== user_email) fail('email_immutable', 'O e-mail identifica a conta e não pode ser alterado. Cadastre outro acesso.');
  if (whatsapp && !/^55[1-9]\d(?:9\d{8}|[2-5]\d{7})$/.test(whatsapp)) fail('invalid_whatsapp', 'Confira o WhatsApp com DDD.');
  const modo = fields.gestao_acesso_modo;
  if (!['consulta', 'operacao'].includes(modo)) fail('invalid_access_mode', 'Escolha Consulta ou Operação.');
  if (!Array.isArray(fields.gestao_areas) || fields.gestao_areas.length === 0 || fields.gestao_areas.some((area) => !AREAS.includes(area))) fail('invalid_areas', 'Selecione ao menos uma área permitida.');
  return { nome, user_email, whatsapp, gestao_acesso_modo: modo, gestao_areas: AREAS.filter((area) => fields.gestao_areas.includes(area)) };
}

async function accountFor(S, email, strict = false) {
  try {
    const users = await S.User?.filter?.({ email: emailOf(email) }, '-created_date', 2).catch(() => []);
    if (!users) return { available: true, user: null };
    if (users.length > 1) fail('account_ambiguous', 'A conta precisa de revisão administrativa.', 409);
    return { available: true, user: users[0] || null };
  } catch (error) {
    if (strict) throw equipeError('account_verification_unavailable', 'Não foi possível verificar a proteção da conta. Tente novamente.', 503);
    return { available: false, user: null };
  }
}

function protectedMember(member, account, actor) {
  return emailOf(member.user_email) === emailOf(actor.email)
    || PROTECTED_PROFILES.has(member.perfil)
    || account.user?.role === 'admin'
    || account.available === false;
}

function publicMember(member, account, actor) {
  const hasLogin = Boolean(member.gestao_login_confirmado_em && member.auth_user_id);
  return {
    id: member.id, nome: member.nome, user_email: member.user_email, whatsapp: member.whatsapp || '',
    ativo: member.ativo !== false, perfil: member.perfil,
    gestao_acesso_modo: member.gestao_acesso_modo || null,
    gestao_areas: Array.isArray(member.gestao_areas) ? member.gestao_areas : [],
    gestao_versao: Number(member.gestao_versao || 0), updated_date: member.updated_date,
    gestao_convite_status: member.gestao_convite_status || 'nao_enviado',
    gestao_convite_enviado_em: member.gestao_convite_enviado_em || null,
    gestao_login_confirmado_em: member.gestao_login_confirmado_em || null,
    login_status: hasLogin ? 'confirmado' : account.available && account.user?.disabled === true ? 'indisponivel' : 'nao_confirmado',
    protegido: protectedMember(member, account, actor),
    acesso_legado: member.perfil !== 'gestao_delegada',
  };
}

function snapshot(member) {
  if (!member) return null;
  return Object.fromEntries(['id', 'user_email', 'nome', 'whatsapp', 'perfil', 'ativo', 'gestao_acesso_modo', 'gestao_areas', 'gestao_versao', 'gestao_convite_status', 'updated_date'].map((key) => [key, member[key] ?? null]));
}

async function audit(S, auth, action, target, data) {
  return S.EventoM31ActionLog.create({
    user_email: auth.user.email,
    user_nome: auth.user.full_name || auth.member?.nome || auth.user.email,
    user_perfil: auth.member?.perfil || auth.user.role,
    acao: action,
    modulo: 'equipe',
    entidade_id: target?.id || null,
    entidade_nome: target?.nome || target?.user_email || null,
    dados_anteriores: JSON.stringify(data),
  });
}

async function resultAudit(S, auth, action, target, data) {
  try { await audit(S, auth, action, target, data); return null; }
  catch { return 'A ação foi registrada, mas o registro complementar do resultado precisa de conferência administrativa.'; }
}

async function requireTarget(S, body, actor) {
  const target = await S.EventoM31Membro.get(String(body.id || ''));
  if (!target) fail('member_not_found', 'Acesso não encontrado.', 404);
  const account = await accountFor(S, target.user_email, true);
  if (protectedMember(target, account, actor)) fail('protected_account', 'Este acesso administrativo está protegido. Ele não pode ser alterado por esta tela.', 403);
  if (!body.expected_version || body.expected_version !== target.updated_date) fail('version_conflict', 'Outra pessoa alterou este acesso. Atualize a lista antes de salvar.', 409);
  return { target, account };
}

async function cas(S, target, patch) {
  const result = await S.EventoM31Membro.updateMany({ id: target.id, updated_date: target.updated_date }, { $set: patch });
  if (!changed(result)) fail('version_conflict', 'Outra pessoa alterou este acesso. Atualize a lista antes de salvar.', 409);
  return S.EventoM31Membro.get(target.id);
}

export async function executeEquipe(client, body, auth, options = {}) {
  if (auth?.user?.role !== 'admin' || !auth.member || auth.member.ativo === false || !auth.session) fail('forbidden', 'Somente a administração pode gerenciar acessos.', 403);
  const S = client.asServiceRole.entities;
  const now = options.now || (() => new Date().toISOString());
  const action = String(body.action || 'listar');
  if (!['listar', 'salvar', 'definir_ativo', 'convidar'].includes(action)) fail('invalid_action', 'Ação de equipe inválida.');

  if (action === 'listar') {
    const members = await all(S.EventoM31Membro);
    let accounts;
    try {
      const users = await all(S.User).catch(() => []);
      const byEmail = new Map();
      for (const user of users) {
        const key = emailOf(user.email);
        const matches = byEmail.get(key) || [];
        matches.push(user); byEmail.set(key, matches);
      }
      accounts = members.map((member) => {
        const matches = byEmail.get(emailOf(member.user_email)) || [];
        return { available: matches.length <= 1, user: matches.length === 1 ? matches[0] : null };
      });
    } catch { accounts = members.map(() => ({ available: false, user: null })); }
    return { items: members.map((member, i) => publicMember(member, accounts[i], auth.user)), total: members.length };
  }

  const operationId = options.operationId || crypto.randomUUID();
  if (action === 'salvar' && !body.id) {
    const fields = validateEquipeFields(body.fields);
    if (fields.user_email === emailOf(auth.user.email)) fail('protected_account', 'Sua própria conta administrativa está protegida.', 403);
    return withGestaoCreateLock(client, async (markCreateStarted) => {
      const account = await accountFor(S, fields.user_email, true);
      if (account.user?.role === 'admin') fail('protected_account', 'A conta já possui acesso administrativo e está protegida.', 403);
      const existing = (await all(S.EventoM31Membro)).filter((member) => emailOf(member.user_email) === fields.user_email);
      if (existing.length) fail('member_exists', 'Já existe um membro com este e-mail. Edite o acesso existente.', 409);
      await audit(S, auth, 'equipe.cadastro.solicitado', fields, { operation_id: operationId, campos: fields });
      let created;
      try {
        markCreateStarted();
        created = await S.EventoM31Membro.create({ ...fields, ...DELEGATED_SAFE_FLAGS, perfil: 'gestao_delegada', ativo: true, gestao_versao: 1, gestao_convite_status: 'nao_enviado' });
      } catch {
        fail('member_creation_uncertain', 'Não foi possível confirmar o cadastro. Atualize a lista antes de qualquer nova solicitação.', 503);
      }
      const warning = await resultAudit(S, auth, 'equipe.cadastro.concluido', created, { operation_id: operationId, depois: snapshot(created) });
      return { item: publicMember(created, account, auth.user), warning };
    });
  }

  const { target, account } = await requireTarget(S, body, auth.user);
  if (action === 'salvar') {
    const fields = validateEquipeFields(body.fields, target);
    const patch = { ...fields, ...DELEGATED_SAFE_FLAGS, perfil: 'gestao_delegada', operacoes_permitidas: fields.gestao_areas, gestao_versao: Number(target.gestao_versao || 0) + 1 };
    await audit(S, auth, 'equipe.acesso.alteracao_solicitada', target, { operation_id: operationId, antes: snapshot(target), depois: patch });
    const updated = await cas(S, target, patch);
    const warning = await resultAudit(S, auth, 'equipe.acesso.alterado', updated, { operation_id: operationId, antes: snapshot(target), depois: snapshot(updated) });
    return { item: publicMember(updated, account, auth.user), warning };
  }
  if (action === 'definir_ativo') {
    if (typeof body.ativo !== 'boolean') fail('invalid_active', 'Informe se o acesso deve ficar ativo.');
    const patch = { ativo: body.ativo, gestao_versao: Number(target.gestao_versao || 0) + 1 };
    await audit(S, auth, 'equipe.ativacao.solicitada', target, { operation_id: operationId, antes: snapshot(target), depois: patch });
    const updated = await cas(S, target, patch);
    const warning = await resultAudit(S, auth, body.ativo ? 'equipe.acesso.ativado' : 'equipe.acesso.desativado', updated, { operation_id: operationId, antes: snapshot(target), depois: snapshot(updated) });
    return { item: publicMember(updated, account, auth.user), warning };
  }

  if (target.ativo === false) fail('member_inactive', 'Ative este acesso antes de enviar um convite.', 409);
  if (['enviando', 'incerto'].includes(target.gestao_convite_status)) fail('invite_pending', 'O envio anterior precisa de conferência; não será reenviado automaticamente.', 409);
  if (target.gestao_convite_status === 'enviado' && body.confirm_resend !== true) fail('invite_already_sent', 'O convite já foi enviado. Confirme se deseja reenviar.', 409);
  if (typeof client.users?.inviteUser !== 'function') fail('native_invite_unavailable', 'O convite nativo não está disponível nesta configuração. O cadastro foi preservado.', 503);
  await audit(S, auth, 'equipe.convite.solicitado', target, { operation_id: operationId, antes: snapshot(target), role: 'user' });
  await cas(S, target, { gestao_convite_status: 'enviando', gestao_versao: Number(target.gestao_versao || 0) + 1 });
  let providerStatus = 'enviado';
  try { await client.users.inviteUser(target.user_email, 'user'); }
  catch (error) {
    const status = Number(error?.status || error?.response?.status || 0);
    providerStatus = status >= 400 && status < 500 && ![408, 429].includes(status) ? 'falha' : 'incerto';
  }
  const invitePatch = { gestao_convite_status: providerStatus, ...(providerStatus === 'enviado' ? { gestao_convite_enviado_em: now() } : {}) };
  const recorded = await S.EventoM31Membro.updateMany({ id: target.id, gestao_convite_status: 'enviando' }, { $set: invitePatch });
  if (!changed(recorded)) fail('invite_result_uncertain', 'O resultado do convite precisa de conferência. Não reenvie automaticamente.', 503);
  const updated = await S.EventoM31Membro.get(target.id);
  const warning = await resultAudit(S, auth, `equipe.convite.${providerStatus}`, updated, { operation_id: operationId, resultado: providerStatus, role: 'user' });
  return { item: publicMember(updated, account, auth.user), warning, convite_resultado: providerStatus };
}
