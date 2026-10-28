import { authenticateGestao, assertGestaoCaravana, gestaoError, inscricaoOperacional } from './gestaoAccess.js';
import { withGestaoCreateLock } from './gestaoMutationLock.js';
import { shirtsForCaravana, generateShirtLink } from './camisasCaravana.js';

const FIELDS = ['nome', 'cidade_origem', 'estado_origem', 'lider_nome', 'lider_whatsapp', 'lider_email'];
const UF = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
const STATES = new Set(['confirmada', 'isenta', 'pendente', 'revisar', 'fora_do_universo']);
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const clean = value => String(value ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
const key = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const digits = value => String(value ?? '').replace(/\D/g, '');

function normalizarTelefone(value) {
  let national = digits(value);
  if (national.startsWith('55') && national.length === 13) national = national.slice(2);
  return /^[1-9]\d9\d{8}$/.test(national) && !/^(\d)\1+$/.test(national) ? `55${national}` : '';
}

function cityParts(value) {
  const city = clean(value);
  const match = city.match(/^(.+?)\s*[-,]\s*([A-Za-z]{2})$/);
  return match && UF.has(match[2].toUpperCase()) ? { cidade: clean(match[1]), uf: match[2].toUpperCase() } : { cidade: city, uf: '' };
}

export function validateCaravanaFields(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw gestaoError(400, 'INVALID_FIELDS', 'Preencha os dados da caravana.');
  if (Object.keys(input).some(field => !FIELDS.includes(field))) throw gestaoError(400, 'FIELD_FORBIDDEN', 'Altere somente os dados cadastrais da caravana.');
  const nome = clean(input.nome), lider_nome = clean(input.lider_nome), lider_email = clean(input.lider_email).toLowerCase();
  if (nome.length < 3 || nome.length > 160) throw gestaoError(400, 'INVALID_NAME', 'Informe o nome da caravana.');
  if (lider_nome.length < 3 || lider_nome.length > 160) throw gestaoError(400, 'INVALID_LEADER', 'Informe o nome da liderança.');
  const lider_whatsapp = normalizarTelefone(input.lider_whatsapp);
  if (!lider_whatsapp) throw gestaoError(400, 'INVALID_PHONE', 'Informe o WhatsApp da liderança com DDD.');
  if (lider_email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lider_email) || lider_email.length > 254)) throw gestaoError(400, 'INVALID_EMAIL', 'Confira o e-mail da liderança.');
  const parsed = cityParts(input.cidade_origem), providedUF = clean(input.estado_origem).toUpperCase();
  if (!parsed.cidade || parsed.cidade.length > 120) throw gestaoError(400, 'INVALID_CITY', 'Informe a cidade de origem.');
  if (providedUF && !UF.has(providedUF)) throw gestaoError(400, 'INVALID_STATE', 'Selecione uma UF válida.');
  if (parsed.uf && providedUF && parsed.uf !== providedUF) throw gestaoError(400, 'CONFLICTING_STATE', 'A UF difere da cidade informada.');
  const uf = providedUF || parsed.uf;
  const cidade_origem = parsed.cidade + (uf ? ` - ${uf}` : '');
  return { nome, cidade_origem, lider_nome, lider_whatsapp, lider_email };
}

async function all(entity, filter = {}) {
  const rows = new Map();
  for (let offset = 0; ; offset += 500) {
    const page = await entity.filter(filter, '-id', 500, offset);
    if (!Array.isArray(page)) throw gestaoError(503, 'READ_UNAVAILABLE', 'Não foi possível consultar a lista completa.');
    for (const row of page) {
      if (rows.has(row.id)) throw gestaoError(503, 'PAGINATION_INCONSISTENT', 'Não foi possível consultar a lista completa.');
      rows.set(row.id, row);
    }
    if (page.length < 500) return [...rows.values()];
  }
}

async function hash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const identity = fields => { const city = cityParts(fields.cidade_origem); return `${key(fields.nome)}|${key(city.cidade)}|${city.uf}`; };
const realParticipant = row => row && row.classificacao_registro !== 'teste' && row.is_sample !== true && !row.duplicada_de_id && ['publico_geral', 'caravana'].includes(row.tipo) && inscricaoOperacional(row);
const status = row => STATES.has(row.estado_canonico) ? row.estado_canonico : null;

function stats(participants, finance) {
  const out = { total_participantes: participants.length, confirmadas: 0, isentas: 0, regularizadas: 0, pendentes: 0, revisar: 0, fora_do_universo: 0, sem_informacao: 0 };
  let receipt = 0, missing = 0;
  for (const row of participants) {
    const state = status(row);
    if (state === 'confirmada') out.confirmadas++;
    else if (state === 'isenta') out.isentas++;
    else if (state === 'pendente') out.pendentes++;
    else if (state === 'revisar') out.revisar++;
    else if (state === 'fora_do_universo') out.fora_do_universo++;
    else out.sem_informacao++;
    if (state === 'confirmada') {
      if (typeof row.valor_pago === 'number' && Number.isFinite(row.valor_pago) && row.valor_pago >= 0) receipt += Math.round(row.valor_pago * 100);
      else missing++;
    }
  }
  out.regularizadas = out.confirmadas + out.isentas;
  if (finance) out.financeiro = { receita: missing ? null : receipt / 100, valores_nao_informados: missing };
  return out;
}

function caravanaDto(caravana, participants, finance) {
  const city = cityParts(caravana.cidade_origem);
  return {
    id: caravana.id, nome: clean(caravana.nome) || null, cidade_origem: clean(caravana.cidade_origem) || null, estado_origem: city.uf || null,
    lider_nome: clean(caravana.lider_nome) || null, lider_whatsapp: clean(caravana.lider_whatsapp) || null, lider_email: clean(caravana.lider_email) || null,
    slug: clean(caravana.slug) || null, ativa: typeof caravana.ativa === 'boolean' ? caravana.ativa : null,
    updated_date: caravana.updated_date || null, version: caravana.updated_date || null, ...stats(participants, finance),
  };
}

function participantDto(row, finance) {
  return {
    id: row.id, nome: clean(row.nome) || null, whatsapp: clean(row.whatsapp) || null, tipo: row.tipo,
    status_pagamento: row.status_pagamento || null, estado_canonico: status(row), caravana_id: row.caravana_id,
    updated_date: row.updated_date || null, version: row.updated_date || null,
    ...(finance ? { valor_pago: typeof row.valor_pago === 'number' && Number.isFinite(row.valor_pago) ? row.valor_pago : null } : {}),
  };
}

function ownData(row) {
  return Object.fromEntries(['id', 'nome', 'cidade_origem', 'lider_nome', 'lider_whatsapp', 'lider_email', 'slug'].map(field => [field, row?.[field] ?? null]));
}

async function audit(S, ctx, action, before, after, result = 'sucesso') {
  await S.EventoM31ActionLog.create({
    user_id: ctx.user.id, user_email: ctx.user.email, user_nome: ctx.member?.nome || ctx.user.full_name || ctx.user.email,
    user_perfil: ctx.member?.perfil, acao: action, modulo: 'caravanas', entidade_id: after?.id || before?.id || '', entidade_nome: after?.nome || before?.nome || '',
    dados_anteriores: JSON.stringify(before ? ownData(before) : null), dados_novos: JSON.stringify(after ? ownData(after) : null),
    session_id: ctx.session?.session_id, resultado: result,
  });
}

async function getCaravana(S, ctx, id) {
  if (!id) throw gestaoError(400, 'CARAVAN_REQUIRED', 'Escolha a caravana.');
  assertGestaoCaravana(ctx, id);
  const found = await S.EventoM31Caravana.get(id).catch(() => null);
  if (!found) throw gestaoError(404, 'CARAVAN_NOT_FOUND', 'Caravana não encontrada.');
  return found;
}

function duplicateError(row) {
  return Object.assign(gestaoError(409, 'CARAVAN_EXISTS', 'Já existe uma caravana com este nome e cidade. Confira o cadastro existente.'), {
    details: { caravana_existente: { id: row.id, nome: row.nome, cidade_origem: row.cidade_origem, ativa: row.ativa } },
  });
}

async function createCaravana(S, ctx, body, canFinance, markCreateStarted) {
  if (ctx.caravana_restrita) throw gestaoError(403, 'CARAVAN_CREATE_FORBIDDEN', 'Seu acesso permite operar somente as caravanas já selecionadas.');
  if (!UUID.test(body.request_id || '')) throw gestaoError(400, 'REQUEST_REQUIRED', 'Reabra o formulário para iniciar uma nova solicitação.');
  const fields = validateCaravanaFields(body.fields), payloadHash = await hash(JSON.stringify(fields));
  const requestKey = `caravana-request:${ctx.user.id}:${body.request_id}`;
  const old = (await S.M31GestaoRequisicao.filter({ chave: requestKey }, '-created_date', 1))[0];
  if (old) {
    if (old.payload_hash !== payloadHash) throw gestaoError(409, 'REQUEST_CHANGED', 'Esta solicitação já foi usada com outros dados.');
    if (old.estado === 'concluida' && old.caravana_id) {
      const row = await getCaravana(S, ctx, old.caravana_id);
      const participants = (await all(S.EventoM31Inscricao, { caravana_id: row.id })).filter(realParticipant);
      return { ok: true, reused: true, caravana: caravanaDto(row, participants, canFinance), version: row.updated_date || null };
    }
    throw gestaoError(409, 'REQUEST_IN_PROGRESS', 'Solicitação em processamento ou com resultado incerto. Atualize a lista antes de tentar novamente.');
  }
  const existing = (await all(S.EventoM31Caravana)).find(row => identity(row) === identity(fields));
  if (existing) throw duplicateError(existing);
  let request;
  try { request = await S.M31GestaoRequisicao.create({ chave: requestKey, tipo: 'caravana', request_id: body.request_id, payload_hash: payloadHash, actor_id: ctx.user.id, estado: 'processando' }); }
  catch { throw gestaoError(409, 'REQUEST_IN_PROGRESS', 'Esta solicitação já está sendo processada. Atualize a lista.'); }
  let lock;
  try { lock = await S.M31GestaoRequisicao.create({ chave: `caravana-identidade:${await hash(identity(fields))}`, tipo: 'caravana_lock', request_id: body.request_id, payload_hash: payloadHash, actor_id: ctx.user.id, estado: 'processando' }); }
  catch {
    await S.M31GestaoRequisicao.update(request.id, { estado: 'bloqueada' }).catch(() => {});
    throw gestaoError(409, 'CARAVAN_REQUEST_EXISTS', 'Outra solicitação já protege esta caravana. Confira a lista.');
  }
  let created;
  try {
    const concurrent = (await all(S.EventoM31Caravana)).find(row => identity(row) === identity(fields));
    if (concurrent) throw duplicateError(concurrent);
    await audit(S, ctx, 'Solicitou cadastro de caravana', null, fields, 'iniciado');
    const slug = key(fields.nome).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'caravana';
    markCreateStarted();
    created = await S.EventoM31Caravana.create({ ...fields, ativa: true, slug: `${slug}-${(await hash(requestKey)).slice(0, 10)}` });
    await S.M31GestaoRequisicao.update(request.id, { estado: 'concluida', caravana_id: created.id });
    await S.M31GestaoRequisicao.update(lock.id, { estado: 'concluida', caravana_id: created.id });
    await audit(S, ctx, 'Cadastrou caravana', null, created);
  } catch (error) {
    await S.M31GestaoRequisicao.update(request.id, { estado: 'incerto', ...(created?.id ? { caravana_id: created.id } : {}) }).catch(() => {});
    throw error;
  }
  return { ok: true, caravana: caravanaDto(created, [], canFinance), version: created.updated_date || null };
}

export async function executeCaravanas(client, body) {
  const action = clean(body?.action);
  if (!['listar', 'detalhe', 'cadastrar', 'editar', 'excluir','gerar_link_camisas'].includes(action)) throw gestaoError(400, 'INVALID_ACTION', 'Ação não reconhecida.');
  const write = ['cadastrar', 'editar', 'excluir','gerar_link_camisas'].includes(action);
  const ctx = await authenticateGestao(client, body, { area: 'caravanas', write });
  const S = client.asServiceRole.entities, canFinance = ctx.user.role === 'admin';
  const access = { can_view_finance: canFinance, can_operate: ctx.modo === 'operacao', can_create: ctx.modo === 'operacao' && !ctx.caravana_restrita };
  if (action === 'cadastrar') return withGestaoCreateLock(client, async mark => ({ ...await createCaravana(S, ctx, body, canFinance, mark), ...access }));
  if (action === 'listar') {
    const [caravanas, registrations] = await Promise.all([all(S.EventoM31Caravana), all(S.EventoM31Inscricao)]);
    const allowed = caravanas.filter(row => !ctx.caravana_restrita || ctx.session.caravana_ids_permitidas.includes(row.id));
    const ids = new Set(allowed.map(row => row.id));
    const participants = registrations.filter(row => ids.has(row.caravana_id) && realParticipant(row));
    const byCaravana = new Map(allowed.map(row => [row.id, []]));
    for (const row of participants) byCaravana.get(row.caravana_id).push(row);
    const items = allowed.map(row => caravanaDto(row, byCaravana.get(row.id), canFinance));
    const search = key(body.search), filter = clean(body.filtro || body.view || 'todas');
    if (!['todas', 'regularizadas', 'acao', 'oficiais', 'sem_lider', 'com_pendentes'].includes(filter)) throw gestaoError(400, 'INVALID_FILTER', 'Filtro não reconhecido.');
    const filtered = items.filter(row => {
      if (['regularizadas', 'oficiais'].includes(filter) && !(row.total_participantes > 0 && row.regularizadas === row.total_participantes)) return false;
      if (['acao', 'com_pendentes'].includes(filter) && !(row.pendentes || row.revisar || row.sem_informacao || !row.lider_nome || !row.lider_whatsapp)) return false;
      if (filter === 'sem_lider' && row.lider_nome && !key(row.lider_nome).includes('definir')) return false;
      return !search || key(`${row.nome || ''} ${row.cidade_origem || ''} ${row.lider_nome || ''} ${row.lider_whatsapp || ''}`).includes(search);
    }).sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR') || a.id.localeCompare(b.id));
    const offset = body.cursor == null || body.cursor === '' ? 0 : Number(body.cursor), limit = body.limit == null ? 25 : Number(body.limit);
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw gestaoError(400, 'INVALID_PAGE', 'Página inválida.');
    const ranking = [...items].sort((a, b) => b.total_participantes - a.total_participantes || (a.nome || '').localeCompare(b.nome || '', 'pt-BR')).slice(0, 5);
    return { ok: true, items: filtered.slice(offset, offset + limit), total: filtered.length,
      next_cursor: offset + limit < filtered.length ? String(offset + limit) : null,
      resumo: { total_caravanas: allowed.length, ...stats(participants, canFinance) }, ranking, ...access };
  }
  const current = await getCaravana(S, ctx, clean(body.id || body.caravana_id));
  if (action === 'gerar_link_camisas') return { ok: true, promocao: await generateShirtLink(client, S, ctx, current, body), ...access };
  if (action === 'excluir') {
    if (ctx.user.role !== 'admin') throw gestaoError(403, 'CARAVAN_DELETE_FORBIDDEN', 'Apenas o administrador pode excluir caravanas.');
    if (key(clean(body.confirmacao)) !== key(current.nome)) throw gestaoError(400, 'CONFIRM_REQUIRED', 'Digite o nome da caravana para confirmar a exclusão.');
    const participants = await all(S.EventoM31Inscricao, { caravana_id: current.id });
    const expected = clean(body.expected_version);
    if (expected && current.updated_date !== expected) throw gestaoError(409, 'CARAVAN_CHANGED', 'Outra pessoa alterou esta caravana. Reabra para conferir.');
    await audit(S, ctx, 'Solicitou exclusão de caravana', current, null, 'iniciado');
    if (participants.length) {
      let released = 0;
      for (let batch = 0; batch < 40; batch++) {
        const result = await S.EventoM31Inscricao.updateMany({ caravana_id: current.id }, { $set: { caravana_id: null, caravana_nome: null } });
        released += Number(result?.updated ?? result?.modified_count ?? result?.modifiedCount ?? 0);
        if (!result?.has_more) break;
      }
      if (released !== participants.length) throw gestaoError(409, 'CARAVAN_RELEASE_INCOMPLETE', 'Não foi possível desvincular todas as participantes. A caravana não foi excluída.');
    }
    try { await S.EventoM31Caravana.delete(current.id); }
    catch { throw gestaoError(409, 'CARAVAN_DELETE_UNCONFIRMED', 'A exclusão não foi confirmada. Atualize a lista antes de repetir.'); }
    const remaining = await S.EventoM31Caravana.get(current.id).catch(() => null);
    if (remaining?.id) throw gestaoError(409, 'CARAVAN_DELETE_UNCONFIRMED', 'A exclusão não foi confirmada. Atualize a lista antes de repetir.');
    await audit(S, ctx, 'Excluiu caravana', current, null);
    return { ok: true, excluida: true, participantes_desvinculadas: participants.length, ...access };
  }
  if (action === 'editar') {
    if (!body.expected_version || typeof body.expected_version !== 'string') throw gestaoError(400, 'VERSION_REQUIRED', 'Reabra a caravana antes de salvar.');
    if (current.updated_date !== body.expected_version) throw gestaoError(409, 'CARAVAN_CHANGED', 'Outra pessoa alterou esta caravana. Reabra para conferir.');
    const fields = validateCaravanaFields(body.fields);
    const duplicate = (await all(S.EventoM31Caravana)).find(row => row.id !== current.id && identity(row) === identity(fields));
    if (duplicate) throw duplicateError(duplicate);
    await audit(S, ctx, 'Solicitou edição de caravana', current, { ...current, ...fields }, 'iniciado');
    const result = await S.EventoM31Caravana.updateMany({ id: current.id, updated_date: body.expected_version }, { $set: fields });
    if (result?.updated !== 1) throw gestaoError(409, 'CARAVAN_CHANGED', 'Outra pessoa alterou esta caravana. Reabra para conferir.');
    const saved = await S.EventoM31Caravana.get(current.id);
    await audit(S, ctx, 'Editou dados da caravana', current, saved);
    const participants = (await all(S.EventoM31Inscricao, { caravana_id: current.id })).filter(realParticipant);
    return { ok: true, caravana: caravanaDto(saved, participants, canFinance), version: saved.updated_date || null, ...access };
  }
  const participants = (await all(S.EventoM31Inscricao, { caravana_id: current.id })).filter(realParticipant);
  return { ok: true, caravana: caravanaDto(current, participants, canFinance), participantes: participants.map(row => participantDto(row, canFinance)),
    camisas: await shirtsForCaravana(S, current, client), version: current.updated_date || null, ...access };
}
