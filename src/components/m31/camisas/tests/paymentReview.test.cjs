const harness = require('../../../../../tests/support/legacy-harness.cjs');
/* Isolated regression tests with mocked providers and notification workers.
 * Run with Node's built-in test runner in an isolated checkout.
 * No SDK, real database, real network, real credentials or messages are used.
 * Reads the actual implementation, replacing the SDK and Deno runtime in a VM.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { setImmediate } = require('node:timers');
const root = path.resolve(__dirname, '../../../../..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const token = '00000000-0000-4000-8000-000000000001';
const baseBody = { pedido_token: token, nome: 'Simulação isolada', whatsapp: '5581999990000', cpf: '12345678909', ja_inscrita_m31: false, valor_esperado: 65, itens: [{ modelo: 'milagres', tamanho: 'M' }] };
const config = { camisas_pre_venda_ativo: true, camisas_pre_venda_modelos_ativos: ['milagres', 'jesus', 'filhas'], camisas_pre_venda_preco_1: 65, camisas_pre_venda_preco_2: 120, camisas_pre_venda_preco_3: 165 };
function matches(row, filter) {
  return Object.entries(filter).every(([key, value]) => value && typeof value === 'object' ? (value.$in ? value.$in.includes(row[key]) : false) : value === null ? row[key] == null : row[key] === value);
}
function entity(seed = []) {
  const rows = seed.map(copy);
  return {
    rows,
    async list() { return rows.map(copy); },
    async filter(filter) { return rows.filter(r => matches(r, filter)).map(copy); },
    async get(id) { return copy(rows.find(r => r.id === id)); },
    async create(data) {
      if (data.pedido_token && rows.some(r => r.pedido_token === data.pedido_token)) throw new Error('unique');
      const row = { id: `mock_record_${rows.length + 1}`, ...copy(data) }; rows.push(row); return copy(row);
    },
    async update(id, patch) { const row = rows.find(r => r.id === id); Object.assign(row, copy(patch)); return copy(row); },
    async updateMany(filter, patch) { const selected = rows.filter(r => matches(r, filter)); selected.forEach(r => Object.assign(r, copy(patch.$set || {}))); return { updated: selected.length }; },
  };
}
function paymentHarness(cfg = config) {
  const orders = entity();
  const payments = [];
  const state = { lostResponse: false, financialPosts: 0 };
  const S = { EventoM31Config: entity([cfg]), EventoM31CamisaPedido: orders };
  const sdk = { asServiceRole: { entities: S, functions: { invoke: async () => ({ data: { ok: true } }) } } };
  const fakeFetch = async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/customers/mock_customer') && options.method === 'PUT') return Response.json({ id: 'mock_customer', notificationDisabled: true });
    if (parsed.pathname.endsWith('/customers')) return Response.json({ data: [{ id: 'mock_customer' }] });
    if (parsed.pathname.endsWith('/payments') && options.method === 'POST') {
      state.financialPosts++;
      const body = JSON.parse(options.body);
      const payment = { ...body, id: `mock_payment_${state.financialPosts}`, status: 'PENDING', invoiceUrl: 'https://example.invalid/mock-invoice' };
      payments.push(payment);
      if (state.lostResponse) throw new Error('simulated lost response after acceptance');
      return Response.json(payment);
    }
    if (parsed.pathname.endsWith('/payments')) return Response.json({ data: payments.filter(p => p.externalReference === parsed.searchParams.get('externalReference')), hasMore: false });
    const found = payments.find(p => parsed.pathname.endsWith('/' + p.id));
    if (found) return Response.json(found);
    throw new Error('Unexpected mock request: ' + parsed.pathname);
  };
  let handler;
  const context = vm.createContext({ Request, Response, URL, AbortController, AbortSignal, console, setTimeout, clearTimeout, crypto: webcrypto, fetch: fakeFetch, mockSdk: sdk, Deno: { env: { get: () => 'SIMULATED_NOT_A_SECRET' }, serve: fn => { handler = fn; } } });
  const source = harness.prepare(read('worker/functions/m31CamisaVendaPayment/entry.ts')).replace(/^import[^\n]+\n/, 'const createClientFromRequest = () => mockSdk;\n');
  vm.runInContext(require('typescript').transpileModule(source, { compilerOptions: { target: require('typescript').ScriptTarget.ES2022, module: require('typescript').ModuleKind.None } }).outputText, context);
  return { orders, payments, state, async request(body = baseBody) { const response = await handler(new Request('https://example.invalid/checkout', { method: 'POST', body: JSON.stringify(body) })); return { status: response.status, body: await response.json() }; } };
}
test('concurrent requests create one order and at most one financial POST', async () => {
  const h = paymentHarness();
  await Promise.all([h.request(), h.request()]);
  assert.equal(h.orders.rows.length, 1); assert.equal(h.state.financialPosts, 1);
});
test('lost provider response is recovered without another financial POST', async () => {
  const h = paymentHarness(); h.state.lostResponse = true;
  assert.equal((await h.request()).status, 202);
  assert.equal(h.orders.rows[0].cobranca_estado, 'conferencia');
  const retry = await h.request();
  assert.equal(h.state.financialPosts, 1); assert.equal(retry.body.payment_url, 'https://example.invalid/mock-invoice');
});
test('uncertain response with zero matching charges never authorizes a new POST', async () => {
  const h = paymentHarness(); h.state.lostResponse = true;
  await h.request(); h.payments.length = 0;
  assert.equal((await h.request()).status, 202); assert.equal(h.state.financialPosts, 1);
});
test('selection, quantity, size or color changes cannot reuse an old link', async () => {
  for (const patch of [
    { itens: [{ modelo: 'milagres', tamanho: 'G' }] },
    { itens: [{ modelo: 'filhas', tamanho: 'M' }] },
    { valor_esperado: 120, itens: [{ modelo: 'milagres', tamanho: 'M' }, { modelo: 'filhas', tamanho: 'P' }] },
    { itens: [{ modelo: 'jesus', tamanho: 'M', cor: 'preta' }] },
  ]) {
    const h = paymentHarness(); await h.request();
    const old = copy(h.orders.rows[0]); const result = await h.request({ ...baseBody, ...patch });
    assert.equal(result.status, 409); assert.equal(result.body.payment_url, undefined);
    assert.equal(h.orders.rows[0].valor_total, old.valor_total); assert.deepEqual(h.orders.rows[0].itens, old.itens); assert.equal(h.state.financialPosts, 1);
  }
});
test('confirmation state comes only from the server, never from navigation', async () => {
  const h = paymentHarness();
  const created = await h.request();
  assert.equal(created.body.success, true); assert.ok(created.body.payment_url);
  const tracked = await h.request({ action: 'consultar', pedido_token: token });
  assert.equal(tracked.body.status_pagamento, 'checkout_pendente');
  assert.equal(tracked.body.pago, undefined);
  assert.equal(h.orders.rows.length, 1); assert.equal(h.state.financialPosts, 1);
});
test('missing configuration fails closed without orders or payments', async () => {
  const h = paymentHarness({}); const result = await h.request({ action: 'config' });
  assert.equal(result.body.ativo, false); assert.equal(result.body.preco_unitario, 65); assert.equal(h.state.financialPosts, 0);
});
test('invalid tokens and actions are rejected before any financial POST', async () => {
  const h = paymentHarness();
  assert.equal((await h.request({ action: 'consultar', pedido_token: 'guess' })).status, 400);
  assert.equal((await h.request({ action: 'admin' })).status, 400); assert.equal(h.state.financialPosts, 0);
});
test('analytics synchronous and asynchronous errors are contained', async () => {
  const source = read('src/components/m31/camisas/shirtTracking.js').replace(/^import[^\n]+\n/, '').replace('export function', 'function');
  for (const track of [() => { throw new Error('analytics failed'); }, () => Promise.reject(new Error('analytics rejected'))]) {
    const context = vm.createContext({ base44: { analytics: { track } } });
    vm.runInContext(source + '\nglobalThis.run = trackShirtEvent;', context);
    assert.doesNotThrow(() => context.run('mock_event')); await new Promise(resolve => setImmediate(resolve));
  }
});
function webhookHarness(fullPatch = {}) {
  const order = { id: 'mock_order_1', pedido_token: token, nome: 'Simulação', whatsapp: '5581999990000', numero_pedido: 1, quantidade: 1, valor_total: 65, itens: baseBody.itens, asaas_payment_id: 'mock_payment_1', external_reference: 'M31CAMISA:mock_order_1', status_pagamento: 'checkout_pendente', payment_method: 'PIX', installment_count: 1 };
  const orders = entity([order]); const queue = entity();
  const S = { EventoM31CamisaPedido: orders, M31FilaMensagem: queue, M31AutomacaoLog: entity(), M31MessageTemplate: entity([{ chave_unica: 'obrigado_compra_camisa', is_active: true, content: '{{primeiro_nome}} {{itens}}' }]) };
  const full = { id: order.asaas_payment_id, externalReference: order.external_reference, value: 65, billingType: 'PIX', status: 'RECEIVED', ...fullPatch };
  const text = harness.prepare(read('worker/functions/m31ProcessarWebhookAsaas/entry.ts'));
  const block = text.slice(text.indexOf('async function validarCobrancaCamisa('), text.indexOf('\nasync function processarConfirmacao('));
  let cancel = text.slice(text.indexOf('async function processarCancelamento('), text.indexOf('\nDeno.serve('));
  cancel = cancel.replace(/^async function processarCancelamento[^\n]+/, 'async function processarCancelamento(base44, evento, payment) {').replace('let inscricoes: any[] = [];', 'let inscricoes = [];');
  const context = vm.createContext({ Response, console, crypto: webcrypto, Deno: { env: { get: () => 'SIMULATED' } }, fetchAsaas: async () => Response.json(full), mc: result => result.updated || 0, resolverPagamentoConfirmadoEm: () => null, DULCE_WHATSAPP: '0000000000000', normalizePhone: value => value, ITEM_EMOJI: () => '', ITEM_LABEL: () => 'Camisa' });
  vm.runInContext(require('typescript').transpileModule(block + '\n' + cancel + '\nglobalThis.confirm = processarPedidoCamisaConfirmacao; globalThis.cancel = processarCancelamento;', { compilerOptions: { target: require('typescript').ScriptTarget.ES2022, module: require('typescript').ModuleKind.None } }).outputText, context);
  return { orders, queue, full, async confirm() { return context.confirm({ asServiceRole: { entities: S } }, { event_type: 'PAYMENT_RECEIVED' }, { id: order.asaas_payment_id }, order.external_reference); }, async cancel(id, type) { return context.cancel({ asServiceRole: { entities: S } }, { event_type: type }, { id, externalReference: order.external_reference }); } };
}
test('provider status, reference and value divergences cannot mark an order paid', async () => {
  for (const patch of [{ status: 'PENDING' }, { value: 1 }, { externalReference: 'another_order' }, { id: 'another_payment' }]) {
    const h = webhookHarness(patch); const result = await h.confirm();
    assert.equal(result.sucesso, false); assert.equal(h.orders.rows[0].status_pagamento, 'checkout_pendente'); assert.equal(h.queue.rows.length, 0);
  }
});
test('old cancellation cannot regress a paid order', async () => {
  const h = webhookHarness(); h.orders.rows[0].status_pagamento = 'pago';
  await h.cancel('another_payment', 'PAYMENT_OVERDUE'); assert.equal(h.orders.rows[0].status_pagamento, 'pago');
});
test('missing financial date is not fabricated; repeated confirmations enqueue once', async () => {
  const h = webhookHarness(); await h.confirm(); await h.confirm();
  assert.equal(h.orders.rows[0].status_pagamento, 'pago'); assert.equal(h.orders.rows[0].pagamento_confirmado_em, undefined); assert.equal(h.queue.rows.length, 1);
});
test('definite queue rejection retries only the notification, preserving payment', async () => {
  const h = webhookHarness(); const create = h.queue.create;
  h.queue.create = async () => { const error = new Error('simulated rejection'); error.status = 429; throw error; };
  await h.confirm(); assert.equal(h.orders.rows[0].status_pagamento, 'pago'); assert.equal(h.orders.rows[0].aviso_dulce_status, 'pendente');
  h.queue.create = create; await h.confirm(); assert.equal(h.queue.rows.length, 1);
});
test('uncertain queue acceptance is discovered on retry without another enqueue', async () => {
  const h = webhookHarness(); const create = h.queue.create;
  h.queue.create = async data => { await create(data); throw new Error('lost queue response'); };
  await h.confirm(); await h.confirm(); assert.equal(h.queue.rows.length, 1); assert.equal(h.queue.rows.length, 1);
});
