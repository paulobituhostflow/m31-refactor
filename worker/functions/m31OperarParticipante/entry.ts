// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

const SAFE_FIELDS = ['nome', 'whatsapp', 'email', 'cpf', 'cidade', 'estado'];
const ACTIONS = new Set(['editar_participante', 'substituir_titular', 'mover_caravana', 'incluir_caravana', 'retirar_caravana']);
const PROFILES = new Set(['gestao_operacional', 'super_admin', 'coordenacao_participantes', 'gestora_inscricoes', 'visualizacao', 'admin']);

function text(value: unknown): string {
  return String(value ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
}

function cpf(value: unknown): string { return String(value ?? '').replace(/\D/g, ''); }
function email(value: unknown): string { return text(value).toLowerCase(); }
function firstName(value: unknown): string { return text(value).split(' ')[0] || ''; }

function safeFields(body: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of SAFE_FIELDS) {
    if (!(field in body)) continue;
    const value = field === 'cpf' ? cpf(body[field]) : field === 'email' ? email(body[field]) : field === 'estado' ? text(body[field]).toUpperCase() : text(body[field]);
    if (field === 'estado' && value && value.length !== 2) throw new Error('estado_invalido');
    if (field === 'email' && value && !/^\S+@\S+\.\S+$/.test(value)) throw new Error('email_invalido');
    patch[field] = value;
  }
  return patch;
}

function assertNoForbiddenFields(body: Record<string, unknown>) {
  const forbidden = ['valor_pago', 'status_pagamento', 'asaas_payment_id', 'payment_id', 'qrcode_token', 'qrcode_url', 'codigo_inscricao', 'cartinha_texto', 'delete'];
  const found = forbidden.find(field => field in body);
  if (found) throw new Error(`campo_nao_permitido:${found}`);
}

function updateGreeting(value: unknown, name: string): string {
  const original = String(value ?? '');
  if (!original) return original;
  const lineEnd = original.search(/[\r\n]/);
  const firstLine = lineEnd >= 0 ? original.slice(0, lineEnd) : original;
  const rest = lineEnd >= 0 ? original.slice(lineEnd) : '';
  const match = firstLine.match(/^((?:Querida|Amada)\s+)[^,!]+([,!]?)(.*)$/i);
  return match ? `${match[1]}${name}${match[2]}${match[3]}${rest}` : original;
}

async function authenticate(base44: any, body: Record<string, unknown>) {
  const user = await base44.auth.me();
  if (!user?.email) return { error: 'Unauthorized', status: 401 };
  const sessionId = text(body.session_id);
  const sessions = await base44.asServiceRole.entities.M31OperacaoSessao.filter({ session_id: sessionId, ativa: true }, '-created_date', 1);
  const session = sessions[0];
  if (!session || session.auth_email !== user.email || (session.expires_at && new Date(session.expires_at) <= new Date())) return { error: 'session_expired', status: 403 };
  const members = await base44.asServiceRole.entities.EventoM31Membro.filter({ user_email: user.email, ativo: true }, '-created_date', 1);
  const member = members[0] || (user.role === 'admin' ? { perfil: 'admin' } : null);
  if (!member || !PROFILES.has(member.perfil) || member.perfil === 'visualizacao') return { error: 'permission_denied', status: 403 };
  const allowed = Array.isArray(session.operacoes_permitidas) ? session.operacoes_permitidas : [];
  if (!allowed.includes('inscritas') && !allowed.includes('caravanas') && !allowed.includes('super_admin')) return { error: 'operational_scope_forbidden', status: 403 };
  return { user, session, member };
}

function relevant(row: Record<string, unknown>) {
  return { nome: row.nome, whatsapp: row.whatsapp, email: row.email, cpf: row.cpf, cidade: row.cidade, estado: row.estado, tipo: row.tipo, caravana_id: row.caravana_id, caravana_nome: row.caravana_nome, cartinha_primeiro_nome: row.cartinha_primeiro_nome };
}

async function audit(base44: any, ctx: any, action: string, before: any, after: any) {
  await base44.asServiceRole.entities.EventoM31ActionLog.create({
    user_email: ctx.user.email, user_nome: ctx.session.operador_nome || ctx.user.email, user_perfil: ctx.member.perfil,
    acao: action, modulo: action.includes('caravana') ? 'caravanas' : 'inscricoes', entidade_id: after.id, entidade_nome: after.nome,
    dados_anteriores: JSON.stringify(relevant(before)), dados_novos: JSON.stringify(relevant(after)),
  });
}

async function findDuplicate(base44: any, current: any, candidate: any) {
  const rows: any[] = [];
  const seenIds = new Set();
  for (let offset = 0; ; offset += 500) {
    const page = await base44.asServiceRole.entities.EventoM31Inscricao.list('-id', 500, offset);
    for (const row of page) {
      if (seenIds.has(row.id)) throw new Error('pagination_did_not_advance');
      seenIds.add(row.id);
    }
    rows.push(...page);
    if (page.length < 500) break;
  }
  const candidateCpf = cpf(candidate.cpf);
  const candidatePhone = cpf(candidate.whatsapp);
  const candidateEmail = email(candidate.email);
  return rows.find((row: any) => row.id !== current.id && row.status_pagamento !== 'cancelado' && (
    candidateCpf.length >= 11 && cpf(row.cpf) === candidateCpf ||
    candidatePhone && cpf(row.whatsapp) === candidatePhone ||
    candidateEmail && email(row.email) === candidateEmail
  ));
}

async function getCaravana(base44: any, id: string, session: any) {
  if (!id) throw new Error('caravana_destino_obrigatoria');
  const allowedIds = Array.isArray(session.caravana_ids_permitidas) ? session.caravana_ids_permitidas : [];
  if (allowedIds.length && !allowedIds.includes(id)) throw new Error('caravana_fora_do_escopo');
  try {
    const caravana = await base44.asServiceRole.entities.EventoM31Caravana.get(id);
    if (!caravana || caravana.ativa === false) throw new Error('caravana_invalida');
    return caravana;
  } catch (error) {
    if (error.message === 'caravana_invalida') throw error;
    throw new Error('caravana_nao_encontrada');
  }
}

async function enqueueMessaging(base44: any, before: any, after: any) {
  const result = { maria: false, ana: false, erros: [] };
  const messages = [
    { destinatario: before.nome, mensagem: `Olá, ${firstName(before.nome)}. Sua vaga foi transferida para ${after.nome}. O QR Code permanece o mesmo.`, telefone: before.whatsapp },
    { destinatario: after.nome, mensagem: `Olá, ${firstName(after.nome)}! Sua inscrição no M31 está confirmada. Este é o mesmo QR Code da vaga: ${after.qrcode_url || after.qrcode_token || after.codigo_inscricao || ''}.`, telefone: after.whatsapp },
  ];
  for (let i = 0; i < messages.length; i += 1) {
    try {
      await base44.asServiceRole.functions.invoke('m31EnviarMensagemGovernada', {
        automacao: 'OPERACIONAL', inscricao_id: after.id, inscricao_nome: after.nome, telefone: messages[i].telefone,
        mensagens: [messages[i].mensagem], origem: 'm31OperarParticipante', versao: `SUBSTITUICAO_${after.id}_${i}`,
      });
      if (i === 0) result.maria = true; else result.ana = true;
    } catch (error) { result.erros.push(error.message); }
  }
  return result;
}

return (async (req: Request) => {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = text(body.action);
    if (!ACTIONS.has(action)) return Response.json({ error: 'acao_invalida', message: 'Ação operacional não suportada.' }, { status: 400 });
    const ctx = await authenticate(base44, body);
    if (ctx.error) return Response.json({ error: ctx.error }, { status: ctx.status });
    const current = await base44.asServiceRole.entities.EventoM31Inscricao.get(text(body.inscricao_id)).catch(() => null);
    if (!current) return Response.json({ error: 'inscricao_nao_encontrada' }, { status: 404 });
    const scope = ctx.session.operacoes_permitidas || [];
    const requiredScope = ['editar_participante', 'substituir_titular'].includes(action) ? 'inscritas' : 'caravanas';
    if (!scope.includes(requiredScope) && !scope.includes('super_admin')) return Response.json({ error: 'operational_scope_forbidden' }, { status: 403 });
    const allowedIds = ctx.session.caravana_ids_permitidas || [];
    if (allowedIds.length && !allowedIds.includes(current.caravana_id)) return Response.json({ error: 'caravana_fora_do_escopo' }, { status: 403 });
    if (body.expected_updated_date && current.updated_date !== body.expected_updated_date) return Response.json({ error: 'inscricao_alterada', message: 'A inscrição mudou. Recarregue antes de salvar.' }, { status: 409 });
    try { assertNoForbiddenFields(body); } catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
    let patch: Record<string, unknown> = {};
    let messaging = null;
    if (action === 'editar_participante') {
      try { patch = safeFields(body); } catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
      if (!Object.keys(patch).length) return Response.json({ error: 'nenhum_campo_editavel' }, { status: 400 });
    } else if (action === 'substituir_titular') {
      try { patch = safeFields(body); } catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
      if (!patch.nome) return Response.json({ error: 'nome_obrigatorio' }, { status: 400 });
      const duplicate = await findDuplicate(base44, current, { ...current, ...patch });
      if (duplicate) return Response.json({ error: 'conflito_operacional', message: 'Já existe uma inscrição ativa com os dados do novo titular.', conflito_id: duplicate.id }, { status: 409 });
      if (current.cartinha_texto || current.cartinha_status || current.cartinha_titular) {
        patch.cartinha_texto = updateGreeting(current.cartinha_texto, firstName(patch.nome));
        patch.cartinha_titular = { nome: patch.nome, cpf: patch.cpf ?? current.cpf ?? '' };
        patch.cartinha_primeiro_nome = firstName(patch.nome);
        patch.cartinha_versao = Number(current.cartinha_versao || 0) + 1;
      }
    } else if (action === 'mover_caravana' || action === 'incluir_caravana') {
      let destination;
      try { destination = await getCaravana(base44, text(body.caravana_destino_id), ctx.session); } catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
      patch = { caravana_id: destination.id, caravana_nome: destination.nome };
      if (action === 'incluir_caravana' && current.tipo !== 'caravana') patch.tipo = 'caravana';
    } else if (action === 'retirar_caravana') {
      patch = { caravana_id: null, caravana_nome: null };
      if (current.tipo === 'caravana') patch.tipo = 'publico_geral';
    }
    const updated = await base44.asServiceRole.entities.EventoM31Inscricao.update(current.id, patch);
    await audit(base44, ctx, action, current, updated);
    if (action === 'substituir_titular' && body.notificar === true) messaging = await enqueueMessaging(base44, current, updated);
    return Response.json({ ok: true, action, inscricao: updated, messaging });
  } catch (error) {
    logger.error('[m31OperarParticipante]', error);
    return Response.json({ error: 'erro_operacional', message: error.message }, { status: 500 });
  }
})(req);

}
