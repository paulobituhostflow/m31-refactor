import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import harness from './support/legacy-harness.cjs';
import { ehInscritaReconhecida } from '../worker/functions/m31Cartinhas/participacaoReconhecida.js';

const copy = value => structuredClone(value);
function entity(initial = []) {
  const rows = copy(initial);
  return { rows,
    async list(_sort, limit = 500, offset = 0) { return copy(rows.slice(offset, offset + limit)); },
    async filter(filter = {}, _sort, limit = 500, offset = 0) { return copy(rows.filter(row => Object.entries(filter).every(([key, value]) => row[key] === value)).slice(offset, offset + limit)); },
    async get(id) { return copy(rows.find(row => row.id === id)); },
    async create(data) { const row = { id: `synthetic_${rows.length}`, ...copy(data) }; rows.push(row); return copy(row); },
    async update(id, patch) { const row = rows.find(row => row.id === id); Object.assign(row, copy(patch)); return copy(row); },
  };
}
function load(name, sdk, modules = []) {
  let handler;
  const source = harness.prepare(fs.readFileSync(new URL(`../worker/functions/${name}/entry.ts`, import.meta.url), 'utf8')).replace(/^import[^\n]+\n/gm, '');
  const helpers = modules.map(file => fs.readFileSync(new URL(`../worker/functions/${name}/${file}`, import.meta.url), 'utf8').replace(/^export /gm, '')).join('\n');
  const context = vm.createContext({ Request, Response, URL, Date, Intl, console, crypto, atob, fetch: async () => { throw new Error('Unexpected provider request'); }, createClientFromRequest: () => sdk, Deno: { env: { get: () => undefined }, serve: fn => { handler = fn; } } });
  vm.runInContext(helpers + '\n' + ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context);
  return async body => { const response = await handler(new Request('https://example.invalid/test', { method: 'POST', body: JSON.stringify(body) })); return { status: response.status, body: await response.json() }; };
}

test('recognition excludes tests and marked duplicates without changing financial evidence', () => {
  const record = { tipo: 'caravana', nome: 'VALIDACAO', estado_canonico: 'revisar', status_pagamento: 'aprovado' };
  assert.equal(ehInscritaReconhecida(record), true);
  assert.equal(ehInscritaReconhecida({ ...record, duplicada_de_id: 'canonical' }), false);
  assert.equal(ehInscritaReconhecida({ ...record, classificacao_registro: 'teste' }), false);
  assert.equal(fs.readFileSync(new URL('../worker/functions/m31ResumoOperacional/participacaoReconhecida.js', import.meta.url), 'utf8'), fs.readFileSync(new URL('../worker/functions/m31Cartinhas/participacaoReconhecida.js', import.meta.url), 'utf8'));
});

test('independent app uses the same-origin API and never selects a backend from query parameters', () => {
 const source=fs.readFileSync(new URL('../src/lib/app-params.js',import.meta.url),'utf8');
 assert.match(source,/serverUrl: ''/); assert.doesNotMatch(source,/base44\.app|URLSearchParams|VITE_BASE44/);
 const config=JSON.parse(fs.readFileSync('wrangler.jsonc','utf8'));assert.deepEqual(config.assets.run_worker_first,['/api/*']);
});

test('Servir lookup finds the volunteer rather than a paid participant sharing the identity', async () => {
  const registrations = entity([
    { id: 'event', cpf: '12345678909', whatsapp: '5581999990000', tipo: 'publico_geral', status_pagamento: 'aprovado', origem_pagamento: 'asaas' },
    { id: 'servir', cpf: '12345678909', whatsapp: '5581999990000', tipo: 'voluntario', status_pagamento: 'aprovado', origem_pagamento: 'asaas' },
  ]);
  const S = { EventoM31Inscricao: registrations, EventoM31Voluntario: entity([{ inscricao_id: 'servir', tamanho_camiseta: 'G' }]) };
  const request = load('m31VoluntarioPayment', { asServiceRole: { entities: S } });
  const result = await request({ mode: 'consultar', cpf: '12345678909' });
  assert.equal(result.status, 200); assert.equal(result.body.inscricao.id, 'servir');
  assert.equal(result.body.inscricao.tipo, 'voluntario'); assert.equal(result.body.inscricao.confirmada, true);
  assert.equal(result.body.inscricao.perfil_encontrado, true); assert.equal(result.body.inscricao.tamanho_camisa, 'G');
  registrations.rows.pop();
  assert.equal((await request({ mode: 'consultar', cpf: '12345678909' })).body.found, false);
});

test('operational headcount equals shared recognition while the searchable list includes pending registrations', async () => {
  const registrations = [{ id: 'paid', tipo: 'publico_geral', nome: 'VALIDACAO PAGA', status_pagamento: 'aprovado', estado_canonico: 'revisar' }, { id: 'pending', tipo: 'caravana', nome: 'VALIDACAO PENDENTE', status_pagamento: 'checkout_pendente' }, { id: 'vol', tipo: 'voluntario', status_pagamento: 'aprovado' }];
  const S = new Proxy({ EventoM31Inscricao: entity(registrations), M31OperacaoSessao: entity([{ session_id: 's1', auth_email: 'test@example.invalid', ativa: true, expires_at: '2099-01-01T00:00:00Z', operacoes_permitidas: ['inscritas'] }]), EventoM31Membro: entity([{ user_email: 'test@example.invalid', ativo: true, perfil: 'gestora_inscricoes' }]) }, { get: (target, key) => target[key] || entity() });
  const request = load('m31ResumoOperacional', { auth: { me: async () => ({ email: 'test@example.invalid' }) }, asServiceRole: { entities: S } }, ['operationalRules.js', 'participacaoReconhecida.js']);
  const summary = await request({ session_id: 's1' });
  assert.equal(summary.status, 200); assert.equal(summary.body.operations.inscritas.total, 1);
  const listing = await request({ session_id: 's1', operacao: 'inscritas', view: 'todas' });
  assert.equal(listing.body.total, 2); assert.equal(listing.body.pode_editar, true);
});

test('operational headcount uses unique id ordering across equal creation dates', async () => {
  const rows = Array.from({ length: 603 }, (_, i) => ({ id: String(i).padStart(6, '0'), created_date: '2026-10-01T00:00:00Z', tipo: 'publico_geral', status_pagamento: 'aprovado' }));
  const registrations = entity(rows);
  const calls = [];
  registrations.filter = async (_query, sort, limit, offset) => {
    calls.push({ sort, offset });
    assert.equal(sort, '-id');
    return rows.toReversed().slice(offset, offset + limit);
  };
  const S = new Proxy({ EventoM31Inscricao: registrations, M31OperacaoSessao: entity([{ session_id: 's1', auth_email: 'test@example.invalid', ativa: true, expires_at: '2099-01-01T00:00:00Z', operacoes_permitidas: ['inscritas'] }]), EventoM31Membro: entity([{ user_email: 'test@example.invalid', ativo: true, perfil: 'gestora_inscricoes' }]) }, { get: (target, key) => target[key] || entity() });
  const request = load('m31ResumoOperacional', { auth: { me: async () => ({ email: 'test@example.invalid' }) }, asServiceRole: { entities: S } }, ['operationalRules.js', 'participacaoReconhecida.js']);
  const result = await request({ session_id: 's1' });
  assert.equal(result.status, 200);
  assert.equal(result.body.operations.inscritas.total, 603);
  assert.deepEqual(calls.map(call => call.offset), [0, 500]);
  registrations.filter = async (_query, _sort, limit, offset) => offset === 0 ? rows.slice(0, limit) : [rows[499], ...rows.slice(500)];
  const inconsistent = await request({ session_id: 's1' });
  assert.equal(inconsistent.status, 500);
  assert.equal(inconsistent.body.error, 'pagination_inconsistent');
});

for (const status of ['pendente', 'checkout_pendente', 'checkout_abandonado', 'cancelado']) {
  test(`check-in rejects ${status} without registering entry or increasing the device counter`, async () => {
    const S = { EventoM31Inscricao: entity([{ id: 'i1', nome: 'VALIDACAO', codigo_inscricao: 'TEST', status_pagamento: status }]), M31CheckinDispositivo: entity([{ id: 'd1', token: 'synthetic_token', status: 'ativo', total_checkins: 0 }]), EventoM31ActionLog: entity() };
    const request = load('m31Checkin', { asServiceRole: { entities: S } });
    assert.equal((await request({ device_token: 'synthetic_token', codigo_inscricao: 'TEST' })).status, 400);
    assert.equal(S.M31CheckinDispositivo.rows[0].total_checkins, 0); assert.equal(S.EventoM31Inscricao.rows[0].checkin_realizado, undefined);
  });
}
test('confirmed QR check-in is idempotent and records a single successful device operation', async () => {
  const S = { EventoM31Inscricao: entity([{ id: 'i1', nome: 'VALIDACAO', codigo_inscricao: 'TEST', tipo: 'publico_geral', status_pagamento: 'aprovado' }]), M31CheckinDispositivo: entity([{ id: 'd1', token: 'synthetic_token', status: 'ativo', total_checkins: 0 }]), EventoM31ActionLog: entity() };
  const request = load('m31Checkin', { asServiceRole: { entities: S } });
  const args = { device_token: 'synthetic_token', qrcode_token: btoa('M31|TEST') };
  assert.equal((await request(args)).body.success, true);
  assert.equal((await request(args)).body.aviso, true);
  assert.equal(S.M31CheckinDispositivo.rows[0].total_checkins, 1); assert.equal(S.EventoM31ActionLog.rows.length, 1);
});
