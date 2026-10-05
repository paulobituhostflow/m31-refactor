const portHarness = require('../../../../../tests/support/legacy-harness.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const root = path.resolve(__dirname, '../../../../..');
const entryPath = path.join(root, 'worker/functions/m31OperarParticipante/entry.ts');
const future = new Date(Date.now() + 3600000).toISOString();
const copy = value => JSON.parse(JSON.stringify(value));

function matches(row, filter = {}) {
  return Object.entries(filter).every(([key, value]) => value === null ? row[key] == null : row[key] === value);
}

function entity(seed = []) {
  const rows = seed.map(copy);
  return {
    rows,
    async list() { return rows.map(copy); },
    async filter(filter = {}) { return rows.filter(row => matches(row, filter)).map(copy); },
    async get(id) { const row = rows.find(item => item.id === id); if (!row) throw new Error('not_found'); return copy(row); },
    async create(data) { const row = { id: `mock_${rows.length + 1}`, ...copy(data) }; rows.push(row); return copy(row); },
    async update(id, patch) { const row = rows.find(item => item.id === id); if (!row) throw new Error('not_found'); Object.assign(row, copy(patch)); return copy(row); },
  };
}

function harness({ duplicate = false, scope = ['inscritas', 'caravanas'] } = {}) {
  const inscriptions = entity([
    {
      id: 'ins_1', nome: 'Maria Souza', whatsapp: '5581999990000', email: 'maria@example.com', cpf: '11122233344', cidade: 'Recife', estado: 'PE',
      tipo: 'caravana', caravana_id: 'car_1', caravana_nome: 'Recife', valor_pago: 150, status_pagamento: 'aprovado', asaas_payment_id: 'pay_1',
      codigo_inscricao: 'M31-0001', qrcode_token: 'qr-token-1', qrcode_url: 'https://qr/1', cartinha_texto: 'Querida Maria,\nDeus colocou no meu coração...', cartinha_status: 'concluida', cartinha_lote: 'L1', cartinha_versao: 2,
      cartinha_historico: [{ autor: 'Ju', texto: 'Deus colocou no meu coração...' }], cartinha_titular: { nome: 'Maria Souza', cpf: '11122233344' }, cartinha_primeiro_nome: 'Maria', cartinha_conhecida_titular_ref: 'old-ref', updated_date: '2026-09-30T10:00:00.000Z',
    },
    ...(duplicate ? [{ id: 'ins_dup', nome: 'Ana', whatsapp: '5581988880000', email: 'ana@example.com', cpf: '99988877766', tipo: 'publico_geral', status_pagamento: 'aprovado' }] : []),
  ]);
  const sessions = entity([{ id: 's1', session_id: 'sess_1', auth_email: 'thaysa@example.com', operador_nome: 'Thaysa', operacoes_permitidas: scope, caravana_ids_permitidas: [], ativa: true, expires_at: future }]);
  const members = entity([{ id: 'm1', user_email: 'thaysa@example.com', perfil: 'gestao_operacional', ativo: true }]);
  const caravanas = entity([{ id: 'car_1', nome: 'Recife', ativa: true }, { id: 'car_2', nome: 'Olinda', ativa: true }]);
  const audits = entity([]);
  const invoked = [];
  const sdk = { auth: { me: async () => ({ email: 'thaysa@example.com' }) }, asServiceRole: { entities: { M31OperacaoSessao: sessions, EventoM31Membro: members, EventoM31Inscricao: inscriptions, EventoM31Caravana: caravanas, EventoM31ActionLog: audits }, functions: { invoke: async (name, payload) => { invoked.push({ name, payload }); return { data: { sucesso: true } }; } } } };
  let handler;
  const source = portHarness.prepare(fs.readFileSync(entryPath, 'utf8'))
    .replace(/^import[^\n]+\n/m, 'const createClientFromRequest = () => mockSdk;\n')
;
  const compiled = require('typescript').transpileModule(source, { compilerOptions: { target: require('typescript').ScriptTarget.ES2022, module: require('typescript').ModuleKind.None } }).outputText;
  const context = vm.createContext({ Request, Response, URL, console, crypto: webcrypto, mockSdk: sdk, Deno: { serve: fn => { handler = fn; } } });
  vm.runInContext(compiled, context);
  return { inscriptions, audits, invoked, async request(body) { const response = await handler(new Request('https://example.invalid/mutate', { method: 'POST', body: JSON.stringify(body) })); return { status: response.status, body: await response.json() }; } };
}

test('function exists physically and edits only safe participant fields', async () => {
  assert.equal(fs.existsSync(entryPath), true);
  const h = harness();
  const result = await h.request({ action: 'editar_participante', session_id: 'sess_1', inscricao_id: 'ins_1', nome: 'Maria Silva', cidade: 'Olinda', valor_pago: 1 });
  assert.equal(result.status, 400);
  const ok = await h.request({ action: 'editar_participante', session_id: 'sess_1', inscricao_id: 'ins_1', nome: 'Maria Silva', cidade: 'Olinda' });
  assert.equal(ok.status, 200);
  assert.equal(h.inscriptions.rows[0].nome, 'Maria Silva');
  assert.equal(h.inscriptions.rows[0].cidade, 'Olinda');
  assert.equal(h.inscriptions.rows[0].valor_pago, 150);
  assert.equal(h.audits.rows.length, 1);
});

test('substitution preserves slot identity, payment, QR and letter while safely updating greeting', async () => {
  const h = harness();
  const result = await h.request({ action: 'substituir_titular', session_id: 'sess_1', inscricao_id: 'ins_1', nome: 'Ana Costa', whatsapp: '5581888777666', email: 'ana.costa@example.com', cpf: '55566677788' });
  assert.equal(result.status, 200);
  const row = h.inscriptions.rows[0];
  assert.equal(row.id, 'ins_1'); assert.equal(row.valor_pago, 150); assert.equal(row.asaas_payment_id, 'pay_1'); assert.equal(row.codigo_inscricao, 'M31-0001');
  assert.equal(row.qrcode_token, 'qr-token-1'); assert.equal(row.caravana_id, 'car_1'); assert.equal(row.cartinha_status, 'concluida'); assert.equal(row.cartinha_lote, 'L1');
  assert.match(row.cartinha_texto, /^Querida Ana,/); assert.match(row.cartinha_texto, /Deus colocou no meu coração/); assert.equal(row.cartinha_historico.length, 1); assert.equal(row.cartinha_primeiro_nome, 'Ana');
  assert.equal(h.invoked.length, 0);
  assert.equal(h.audits.rows[0].acao, 'substituir_titular');
});

test('duplicate candidate is blocked before any mutation', async () => {
  const h = harness({ duplicate: true });
  const result = await h.request({ action: 'substituir_titular', session_id: 'sess_1', inscricao_id: 'ins_1', nome: 'Ana', cpf: '99988877766' });
  assert.equal(result.status, 409); assert.equal(h.inscriptions.rows[0].nome, 'Maria Souza'); assert.equal(h.audits.rows.length, 0);
});

test('move, include and remove operate on the existing inscription without duplication', async () => {
  const h = harness();
  assert.equal((await h.request({ action: 'mover_caravana', session_id: 'sess_1', inscricao_id: 'ins_1', caravana_destino_id: 'car_2' })).status, 200);
  assert.equal(h.inscriptions.rows[0].caravana_id, 'car_2');
  assert.equal((await h.request({ action: 'incluir_caravana', session_id: 'sess_1', inscricao_id: 'ins_1', caravana_destino_id: 'car_2' })).status, 200);
  assert.equal(h.inscriptions.rows.length, 1); assert.equal(h.inscriptions.rows[0].tipo, 'caravana');
  assert.equal((await h.request({ action: 'retirar_caravana', session_id: 'sess_1', inscricao_id: 'ins_1' })).status, 200);
  assert.equal(h.inscriptions.rows.length, 1); assert.equal(h.inscriptions.rows[0].tipo, 'publico_geral'); assert.equal(h.inscriptions.rows[0].qrcode_token, 'qr-token-1');
});

test('permission and destructive actions are rejected', async () => {
  const denied = harness({ scope: ['camisas'] });
  assert.equal((await denied.request({ action: 'editar_participante', session_id: 'sess_1', inscricao_id: 'ins_1', nome: 'X' })).status, 403);
  const h = harness();
  assert.equal((await h.request({ action: 'delete', session_id: 'sess_1', inscricao_id: 'ins_1' })).status, 400);
});
