// Regressão: cadastro mínimo, identidade por inscrição, QR e busca unificada.
// Tudo em memória: nenhuma cobrança, mensagem ou escrita real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearGestaoSearchCache } from '../../worker/functions/m31OperarParticipante/gestaoSearch.js';
import { operarParticipante } from '../../worker/functions/m31OperarParticipante/core.js';

const future = new Date(Date.now() + 3600000).toISOString();
const copy = v => JSON.parse(JSON.stringify(v));
function cond(value, c) {
  if (c && typeof c === 'object' && !Array.isArray(c)) {
    if ('$in' in c) return c.$in.some(item => item === null ? value == null : value === item);
    if ('$exists' in c && (value !== undefined) !== c.$exists) return false;
    if ('$nin' in c) return !c.$nin.some(item => item === null ? value == null : value === item);
    if ('$ne' in c) return value !== c.$ne;
    if ('$regex' in c) return new RegExp(c.$regex, c.$options || '').test(String(value ?? ''));
  }
  return c === null ? value == null : value === c;
}
const matches = (row, f = {}) => Object.entries(f).every(([k, c]) => k === '$or' ? c.some(x => matches(row, x)) : cond(row[k], c));
function entity(seed = []) {
  const rows = seed.map(copy); let n = 0;
  return { rows,
    async filter(f = {}) { return rows.filter(r => matches(r, f)).map(copy); },
    async list() { return rows.map(copy); },
    async get(id) { const r = rows.find(x => x.id === id); if (!r) throw new Error('not_found'); return copy(r); },
    async create(d) { const r = { id: `new_${++n}_${rows.length}`, updated_date: new Date().toISOString(), ...copy(d) }; rows.push(r); return copy(r); },
    async update(id, p) { const r = rows.find(x => x.id === id); Object.assign(r, copy(p)); return copy(r); },
    async delete(id) { rows.splice(rows.findIndex(x => x.id === id), 1); },
    async updateMany(f, { $set }) { const hit = rows.filter(r => matches(r, f)); hit.forEach(r => Object.assign(r, copy($set), { updated_date: new Date(Date.now() + 1).toISOString() })); return { updated: hit.length }; },
  };
}
function client(seed = []) {
  clearGestaoSearchCache();
  const E = {
    EventoM31Inscricao: entity(seed), M31PendenciaConciliacao: entity(), EventoM31ActionLog: entity(), M31GestaoRequisicao: entity(),
    EventoM31Caravana: entity([{ id: 'car_1', nome: 'Recife', ativa: true }]),
    EventoM31Membro: entity([{ id: 'm1', user_email: 'op@example.com', perfil: 'gestao_operacional', ativo: true, operacoes_permitidas: ['inscritas', 'caravanas'] }]),
    M31OperacaoSessao: entity([{ id: 's1', session_id: 'sess', auth_email: 'op@example.com', operacoes_permitidas: ['inscritas', 'caravanas'], ativa: true, expires_at: future }]),
  };
  const invoked = [];
  return { E, invoked, sdk: { auth: { me: async () => ({ id: 'u1', email: 'op@example.com' }) }, asServiceRole: { entities: E, functions: { invoke: async (name) => { invoked.push(name); return { data: { success: true } }; } } } } };
}
const cadastrar = (c, fields, extra = {}) => operarParticipante(c.sdk, { action: 'cadastrar', session_id: 'sess', request_id: crypto.randomUUID(), fields, ...extra });
const PAGA = { id: 'ins_paga', nome: 'Maria Souza', whatsapp: '5581999990000', cpf: '52998224725', email: 'maria@example.com', tipo: 'publico_geral', status_pagamento: 'aprovado', estado_canonico: 'confirmada', asaas_payment_id: 'pay_1', valor_pago: 150, codigo_inscricao: 'M31-PAGA0001', updated_date: '2026-10-01T00:00:00.000Z' };

test('cadastro só com nome e WhatsApp, sem CPF/e-mail/cidade, cria ID e QR próprios', async () => {
  const c = client();
  const r = await cadastrar(c, { nome: 'Ana Lima', whatsapp: '(81) 98888-7777' });
  assert.equal(r.ok, true);
  const row = c.E.EventoM31Inscricao.rows[0];
  assert.match(row.codigo_inscricao, /^M31-[A-Z0-9]{8}$/);
  assert.equal(row.status_pagamento, 'pendente');
  assert.equal(r.coincidencias.length, 0);
  assert.equal(c.invoked.length, 0);
});

test('WhatsApp compartilhado não gera aviso, bloqueio nem conferência', async () => {
  const c = client([PAGA]);
  const r = await cadastrar(c, { nome: 'Joana Souza', whatsapp: '81999990000' });
  assert.equal(r.ok, true);
  assert.equal(r.coincidencias.length, 0);
  assert.equal(c.E.M31PendenciaConciliacao.rows.length, 0);
  const nova = c.E.EventoM31Inscricao.rows.find(x => x.id !== PAGA.id);
  assert.notEqual(nova.codigo_inscricao, PAGA.codigo_inscricao);
});

test('CPF coincidente avisa, encaminha à conferência e não funde nem altera a outra', async () => {
  const c = client([PAGA]);
  const r = await cadastrar(c, { nome: 'Maria S.', whatsapp: '81977776666', cpf: '529.982.247-25' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.coincidencias[0].motivos, ['mesmo CPF']);
  assert.equal(r.conferencia.encaminhada, true);
  const p = c.E.M31PendenciaConciliacao.rows[0];
  assert.equal(p.status_analise, 'pendente_analise');
  const nova = c.E.EventoM31Inscricao.rows.find(x => x.id !== PAGA.id);
  assert.equal(nova.duplicada_de_id, undefined);
  assert.notEqual(nova.dedup_key, 'CPF:52998224725');
  assert.deepEqual(c.E.EventoM31Inscricao.rows.find(x => x.id === PAGA.id), PAGA);
});

test('lote de caravana com CPF coincidente cria vaga própria sem disparar confirmação', async () => {
  const c = client([PAGA]);
  const r = await cadastrar(c, { nome: 'Maria Lote', whatsapp: '81966665555', cpf: '52998224725' }, { caravana_id: 'car_1', confirmar_lote: true });
  assert.equal(r.ok, true);
  assert.equal(r.coincidencias.length, 1);
  assert.equal(c.invoked.length, 0);
  const nova = c.E.EventoM31Inscricao.rows.find(x => x.id !== PAGA.id);
  assert.equal(nova.duplicada_de_id, undefined);
  assert.equal(nova.estado_canonico, 'confirmada');
  assert.equal(nova.status_pagamento, 'pendente');
  assert.equal(nova.origem_pagamento, undefined);
  assert.equal(nova.conferida_manualmente, true);
});

test('alteração posterior de CPF/e-mail preserva ID, QR, check-in e âncoras financeiras', async () => {
  const c = client([{ ...PAGA, checkin_realizado: true, checkin_at: '2026-10-20T10:00:00.000Z' }, { id: 'outra', nome: 'Outra', whatsapp: '5581911112222', cpf: '11144477735', tipo: 'publico_geral', status_pagamento: 'pendente' }]);
  const r = await operarParticipante(c.sdk, { action: 'editar_participante', session_id: 'sess', id: 'ins_paga', expected_version: PAGA.updated_date, fields: { cpf: '11144477735', email: 'nova@example.com' } });
  assert.equal(r.ok, true);
  assert.equal(r.coincidencias.length, 1);
  const row = c.E.EventoM31Inscricao.rows.find(x => x.id === 'ins_paga');
  assert.equal(row.codigo_inscricao, PAGA.codigo_inscricao);
  assert.equal(row.checkin_realizado, true);
  assert.equal(row.asaas_payment_id, 'pay_1'); assert.equal(row.valor_pago, 150); assert.equal(row.status_pagamento, 'aprovado');
  assert.equal(row.cpf, '11144477735');
});

test('busca de nome completo, partes e variações encontra voluntária apenas com permissão', async () => {
  const voluntaria = { id: 'inez_v', nome: 'Inez Pereira de Melo', whatsapp: '5581997715253',
    tipo: 'voluntario', status_pagamento: 'aprovado', codigo_inscricao: 'M31-VOL-TESTE',
    updated_date: '2026-10-01T00:00:00.000Z' };
  const outra = { id: 'inez_pg', nome: 'Inez Pereira', whatsapp: '5581999048211',
    tipo: 'publico_geral', estado_canonico: 'confirmada', status_pagamento: 'aprovado',
    updated_date: '2026-10-01T00:00:00.000Z' };
  const c = client([voluntaria, outra]);
  c.E.EventoM31Membro.rows[0].operacoes_permitidas.push('voluntarias');
  c.E.M31OperacaoSessao.rows[0].operacoes_permitidas.push('voluntarias');
  for (const termo of ['Inez Pereira de Melo', 'INEZ MELO', 'Inês Pereira de Melo', 'Pereira de Melo']) {
    const r = await operarParticipante(c.sdk, { action: 'listar', session_id: 'sess', filtro: 'todas', search: termo, cursor: 0, limit: 25 });
    assert.equal(r.total, 1, termo);
    assert.equal(r.items[0].id, 'inez_v', termo);
  }
  const ficha = await operarParticipante(c.sdk, { action: 'detalhe', session_id: 'sess', id: 'inez_v' });
  assert.equal(ficha.inscricao.nome, 'Inez Pereira de Melo');
  assert.equal(ficha.can_operate, false);
  const semPermissao = client([voluntaria, outra]);
  const restrito = await operarParticipante(semPermissao.sdk, { action: 'listar', session_id: 'sess', filtro: 'todas', search: 'Inez Pereira de Melo' });
  assert.equal(restrito.total, 0);
});

test('busca por WhatsApp, e-mail e código não depende da página atual', async () => {
  const target = { ...PAGA, codigo_inscricao: 'M31-ZX82KQTA' };
  const c = client([target]);
  for (const termo of ['99990000', 'maria@example.com', 'M31-ZX82KQTA']) {
    const r = await operarParticipante(c.sdk, { action: 'listar', session_id: 'sess', filtro: 'todas', search: termo, cursor: 0 });
    assert.equal(r.total, 1, termo);
    assert.equal(r.items[0].id, 'ins_paga', termo);
  }
});
