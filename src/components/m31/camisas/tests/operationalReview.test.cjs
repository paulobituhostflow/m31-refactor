const harness = require('../../../../../tests/support/legacy-harness.cjs');
/* Isolated regressions for the Dulce shirt operations area (m31CamisasOperacional
 * + m31AbrirSessaoOperacional scope rules). Run with Node's built-in test runner
 * in an isolated checkout. No SDK, real database, Google Sheets, network,
 * credentials or messages are used: everything is mocked in memory and the
 * harness loads the REAL implementation sources at runtime.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const root = path.resolve(__dirname, '../../../../..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const future = new Date(Date.now() + 3600000).toISOString();
const past = new Date(Date.now() - 3600000).toISOString();
const DULCE_EMAIL = 'dulce@exemplo.teste';
const VALID_SESSION = 'sess-dulce-valida-01';

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
    async create(data) { const row = { id: `mock_${Math.random().toString(36).slice(2)}`, ...copy(data) }; rows.push(row); return copy(row); },
    async update(id, patch) { const row = rows.find(r => r.id === id); if (!row) throw new Error('not_found'); Object.assign(row, copy(patch)); return copy(row); },
    async updateMany(filter, patch) { const selected = rows.filter(r => matches(r, filter)); selected.forEach(r => Object.assign(r, copy(patch.$set || {}))); return { updated: selected.length }; },
  };
}

function operationalHarness({ operatorName = 'Dulce', memberProfile = 'camisas' } = {}) {
  const sessions = entity([
    { id: 'sess_1', session_id: VALID_SESSION, auth_email: DULCE_EMAIL, operador_nome: operatorName, operador_whatsapp: '5581994060437', operacoes_permitidas: ['camisas'], ativa: true, expires_at: future },
    { id: 'sess_2', session_id: 'sess-dulce-estrangeira', auth_email: 'outra@exemplo.teste', operador_nome: 'Dulce', operador_whatsapp: '5581994060437', operacoes_permitidas: ['camisas'], ativa: true, expires_at: future },
    { id: 'sess_3', session_id: 'sess-dulce-expirada-1', auth_email: DULCE_EMAIL, operador_nome: 'Dulce', operador_whatsapp: '5581994060437', operacoes_permitidas: ['camisas'], ativa: true, expires_at: past },
    { id: 'sess_4', session_id: 'sess-dulce-sem-escopo-1', auth_email: DULCE_EMAIL, operador_nome: 'Dulce', operador_whatsapp: '5581994060437', operacoes_permitidas: ['inscritas'], ativa: true, expires_at: future },
  ]);
  const pedidos = entity([
    { id: 'pedido_pago_0001', pedido_token: '00000000-0000-4000-8000-0000000000aa', nome: 'Compradora Paga', whatsapp: '5581999990000', itens: [{ modelo: 'jesus', cor: 'preta', tamanho: 'M', entregue: false }, { modelo: 'milagres', cor: null, tamanho: 'G', entregue: true }], quantidade: 2, valor_total: 120, status_pagamento: 'pago', external_reference: 'M31CAMISA:pedido_pago_0001', asaas_payment_id: 'pay_mock_1' },
    { id: 'pedido_pend0001', pedido_token: '00000000-0000-4000-8000-0000000000bb', nome: 'Compradora Pendente', whatsapp: '5581999990001', itens: [{ modelo: 'filhas', cor: null, tamanho: 'P', entregue: false }], quantidade: 1, valor_total: 65, status_pagamento: 'checkout_pendente', external_reference: 'M31CAMISA:pedido_pend0001' },
  ]);
  const config = entity([{ id: 'cfg_1', camisas_pre_venda_ativo: false, camisas_pre_venda_preco_1: 0, camisas_pre_venda_preco_2: 0, camisas_pre_venda_preco_3: 0, camisas_pre_venda_modelos_ativos: [], camisas_order_bump_ativo: false }]);
  const estoque = entity([]);
  const inscricoes = entity([]);
  const actionLogs = entity([]);
  const invoked = [];
  const sdk = {
    auth: { me: async () => ({ email: DULCE_EMAIL }) },
    asServiceRole: {
      entities: { EventoM31Membro: entity([{ user_email: DULCE_EMAIL, ativo: true, perfil: memberProfile }]), M31OperacaoSessao: sessions, EventoM31CamisaPedido: pedidos, EventoM31Config: config, EventoM31CamisaEstoque: estoque, EventoM31Inscricao: inscricoes, EventoM31ActionLog: actionLogs },
      connectors: { getConnection: async () => ({ accessToken: 'mock_token' }) },
      functions: { invoke: async (name, payload) => { invoked.push({ name, payload }); return { data: { sucesso: true, erro: 'pedido_camisa_pago_aviso_enfileirado' } }; } },
    },
  };
  const sheetVolunteers = [['Maria Souza', 'Intercessão', 'M', 'pago', '', '', 'x', '']];
  const sheetSales = [['Ana Lima', 'filhas', 'P', '65', 'pago', '']];
  const sheetWrites = [];
  const fetchSheets = async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/values:batchGet')) return Response.json({ valueRanges: [{ values: sheetSales }] });
    if (decodeURIComponent(parsed.pathname).includes('/values/VENDAS!A2:F2')) return Response.json({ values: [sheetSales[0]] });
    if (options.method === 'PUT') { sheetWrites.push({ url, options }); return Response.json({}); }
    if (parsed.pathname.includes('/values/CAMISAS!')) return Response.json({ values: [['pago', '', '', '']] });
    throw new Error('unexpected_sheets_request:' + parsed.pathname);
  };
  let handler;
  const context = vm.createContext({ Request, Response, URL, AbortController, console, crypto: webcrypto, fetch: fetchSheets, mockSdk: sdk, Deno: { env: { get: () => undefined }, serve: fn => { handler = fn; } } });
  const rules = read('worker/functions/m31CamisasOperacional/shirtOperationalRules.js').replace(/^export /gm, '');
  const plain = harness.prepare(read('worker/functions/m31CamisasOperacional/entry.ts'))
    .replace(/^import \{ createClientFromRequest \}[^\n]+\n/m, 'const createClientFromRequest = () => mockSdk;\n')
    .replace(/^import \{ buildOperationalShirtRows[^\n]+\n/m, '')
;
  const compiled = require('typescript').transpileModule(plain, { compilerOptions: { target: require('typescript').ScriptTarget.ES2022, module: require('typescript').ModuleKind.None } }).outputText;
  vm.runInContext(rules + '\n' + compiled, context);
  return { sessions, pedidos, config, estoque, inscricoes, actionLogs, sdk, invoked, sheetWrites, async request(body) { const response = await handler(new Request('https://example.invalid/operacional', { method: 'POST', body: JSON.stringify(body) })); return { status: response.status, body: await response.json() }; } };
}

test('sessions bind to the authenticated account, expiry and scope', async () => {
  const h = operationalHarness();
  const foreign = await h.request({ action: 'listar', session_id: 'sess-dulce-estrangeira' });
  assert.equal(foreign.status, 403); assert.equal(foreign.body.error, 'session_expired');
  const expired = await h.request({ action: 'listar', session_id: 'sess-dulce-expirada-1' });
  assert.equal(expired.status, 403); assert.equal(expired.body.error, 'session_expired');
  const scopeless = await h.request({ action: 'listar', session_id: 'sess-dulce-sem-escopo-1' });
  assert.equal(scopeless.status, 403); assert.equal(scopeless.body.error, 'operational_scope_forbidden');
  const missing = await h.request({ action: 'listar', session_id: '' });
  assert.equal(missing.status, 403);
  const unsupported = await h.request({ action: 'listar_tudo', session_id: VALID_SESSION });
  assert.equal(unsupported.status, 400);
});

test('repeated listing never duplicates rows', async () => {
  const h = operationalHarness();
  const first = await h.request({ action: 'listar', session_id: VALID_SESSION });
  const second = await h.request({ action: 'listar', session_id: VALID_SESSION });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(first.body.rows.length, 4);
  assert.equal(second.body.rows.length, first.body.rows.length);
  assert.equal(second.body.summary.total, 4);
  assert.equal(h.pedidos.rows.length, 2);
});

test('production grade exposes model, color and size per presale item', async () => {
  const h = operationalHarness();
  const result = await h.request({ action: 'listar', session_id: VALID_SESSION });
  assert.equal(result.status, 200);
  const pedidoRows = result.body.rows.filter(r => r.registro_tipo === 'pedido_camisa');
  assert.equal(pedidoRows.length, 3);
  const jesus = pedidoRows.find(r => r.modelo === 'jesus');
  assert.equal(jesus.cor, 'preta');
  assert.equal(jesus.tamanho, 'M');
  assert.equal(jesus.observacao, 'Cor: preta');
  assert.ok(pedidoRows.every(r => r.tamanho && r.modelo));
  const jesusModel = result.body.inventory.find(m => m.id === 'jesus|preta');
  assert.equal(jesusModel.tamanhos.M.reservadas, 1);
  assert.equal(jesusModel.tamanhos.M.cadastrado, false);
});

test('manual size adjustment updates only the target item of a paid order', async () => {
  const h = operationalHarness();
  const ok = await h.request({ action: 'ajustar_tamanho', session_id: VALID_SESSION, row_id: 'pedido:pedido_pago_0001:0', tamanho: 'GG' });
  assert.equal(ok.status, 200); assert.ok(ok.body.ok); assert.equal(ok.body.operador, 'Dulce');
  const order = h.pedidos.rows.find(r => r.id === 'pedido_pago_0001');
  assert.equal(order.itens[0].tamanho, 'GG');
  assert.equal(order.itens[0].cor, 'preta');
  assert.equal(order.itens[1].tamanho, 'G');
  const pending = await h.request({ action: 'ajustar_tamanho', session_id: VALID_SESSION, row_id: 'pedido:pedido_pend0001:0', tamanho: 'GG' });
  assert.equal(pending.status, 409);
  const invalid = await h.request({ action: 'ajustar_tamanho', session_id: VALID_SESSION, row_id: 'pedido:pedido_pago_0001:0', tamanho: 'ZZ' });
  assert.equal(invalid.status, 400);
  assert.equal(h.pedidos.rows.length, 2);
});

test('estoque separa demanda, recebido, reserva, disponível e falta comprar', async () => {
  const h = operationalHarness();
  const entrada = await h.request({ action: 'ajustar_estoque', session_id: VALID_SESSION, modelo: 'jesus', cor: 'preta', tamanho: 'M', quantidade: 10 });
  assert.equal(entrada.status, 200);
  const antes = await h.request({ action: 'listar', session_id: VALID_SESSION });
  const jesus = antes.body.inventory.find((item) => item.id === 'jesus|preta').tamanhos.M;
  assert.deepEqual({ demanda: jesus.demanda, recebido: jesus.recebido, reservadas: jesus.reservadas, disponivel: jesus.disponivel, falta: jesus.falta_comprar }, { demanda: 1, recebido: 10, reservadas: 1, disponivel: 9, falta: 0 });
  const entregue = await h.request({ action: 'confirmar_entrega', session_id: VALID_SESSION, row_id: 'pedido:pedido_pago_0001:0' });
  assert.equal(entregue.status, 200);
  const depois = await h.request({ action: 'listar', session_id: VALID_SESSION });
  const jesusDepois = depois.body.inventory.find((item) => item.id === 'jesus|preta').tamanhos.M;
  assert.deepEqual({ reservadas: jesusDepois.reservadas, entregues: jesusDepois.entregues, disponivel: jesusDepois.disponivel }, { reservadas: 0, entregues: 1, disponivel: 9 });
});

test('legacy sale item supports editing model, color and size from the order summary', async () => {
  const h = operationalHarness();
  const result = await h.request({ action: 'ajustar_item', session_id: VALID_SESSION, row_id: 'sheet:sale:2', modelo: 'jesus', cor: 'cereja', tamanho: 'GG' });
  assert.equal(result.status, 200); assert.ok(result.body.ok);
  assert.equal(h.sheetWrites.length, 2);
  assert.ok(h.sheetWrites.some((write) => decodeURIComponent(write.url).includes('VENDAS!B2')));
  assert.ok(h.sheetWrites.some((write) => decodeURIComponent(write.url).includes('VENDAS!C2')));
});

test('delivery confirmation requires payment and is idempotent', async () => {
  const h = operationalHarness();
  const unpaid = await h.request({ action: 'confirmar_entrega', session_id: VALID_SESSION, row_id: 'pedido:pedido_pend0001:0' });
  assert.equal(unpaid.status, 409); assert.equal(unpaid.body.error, 'payment_not_confirmed');
  const first = await h.request({ action: 'confirmar_entrega', session_id: VALID_SESSION, row_id: 'pedido:pedido_pago_0001:0' });
  assert.equal(first.status, 200); assert.ok(first.body.ok);
  const order = h.pedidos.rows.find(r => r.id === 'pedido_pago_0001');
  assert.equal(order.itens[0].entregue, true);
  assert.equal(order.itens[0].entregue_por, 'Dulce');
  assert.equal(typeof order.itens[0].entregue_em, 'string');
  const repeat = await h.request({ action: 'confirmar_entrega', session_id: VALID_SESSION, row_id: 'pedido:pedido_pago_0001:0' });
  assert.equal(repeat.status, 200); assert.ok(repeat.body.noop);
});

test('presale configuration works without any physical stock', async () => {
  const h = operationalHarness();
  assert.equal(h.estoque.rows.length, 0);
  const result = await h.request({ action: 'configurar_pre_venda', session_id: VALID_SESSION, ativo: true, modelos: ['jesus', 'milagres', 'filhas'], precos: { 1: 65, 2: 120, 3: 165 } });
  assert.equal(result.status, 200); assert.ok(result.body.ok);
  const cfg = h.config.rows[0];
  assert.equal(cfg.camisas_pre_venda_ativo, true);
  assert.equal(cfg.camisas_pre_venda_preco_1, 65);
  assert.equal(cfg.camisas_pre_venda_modelos_ativos.length, 3);
  const incomplete = await h.request({ action: 'configurar_pre_venda', session_id: VALID_SESSION, ativo: true, modelos: [], precos: { 1: 65 } });
  assert.equal(incomplete.status, 400);
  const stock = await h.request({ action: 'ajustar_estoque', session_id: VALID_SESSION, modelo: 'jesus', tamanho: 'M', quantidade: 10 });
  assert.equal(stock.status, 200);
  assert.equal(h.estoque.rows.length, 1);
  assert.equal(h.estoque.rows[0].atualizado_por, 'Dulce');
});

test('notice resume delegates to the webhook worker without local side effects', async () => {
  const h = operationalHarness();
  const invalid = await h.request({ action: 'retomar_aviso_camisa', session_id: VALID_SESSION, pedido_id: 'curto' });
  assert.equal(invalid.status, 400);
  const ok = await h.request({ action: 'retomar_aviso_camisa', session_id: VALID_SESSION, pedido_id: 'pedido_pago_0001' });
  assert.equal(ok.status, 200);
  assert.equal(h.invoked.length, 1);
  assert.equal(h.invoked[0].name, 'm31AvisoCompraConfirmada');
  assert.equal(h.invoked[0].payload.pedido_id, 'pedido_pago_0001');
  const order = h.pedidos.rows.find(r => r.id === 'pedido_pago_0001');
  assert.equal(order.status_pagamento, 'pago');
  assert.equal(order.itens[0].entregue, false);
});

test('Dulce cannot create or edit a commercial shirt into Equipe', async () => {
  const h = operationalHarness();
  const create = await h.request({ action: 'criar_pedido', session_id: VALID_SESSION, nome: 'Cliente Comercial', whatsapp: '5581999990011', modelo: 'equipe', tamanho: 'M', quantidade: 1, valor_total: 65 });
  assert.equal(create.status, 400);
  const edit = await h.request({ action: 'ajustar_item', session_id: VALID_SESSION, row_id: 'pedido:pedido_pago_0001:0', modelo: 'equipe', cor: '', tamanho: 'M' });
  assert.equal(edit.status, 400);
  assert.equal(h.pedidos.rows.find(p => p.id === 'pedido_pago_0001').itens[0].modelo, 'jesus');
});

test('Edilândia can still operate an Equipe shirt through the scoped backend', async () => {
  const h = operationalHarness({ operatorName: 'Edilândia', memberProfile: 'gestao_operacional' });
  const result = await h.request({ action: 'ajustar_item', session_id: VALID_SESSION, row_id: 'pedido:pedido_pago_0001:0', modelo: 'equipe', cor: '', tamanho: 'M' });
  assert.equal(result.status, 200);
  assert.equal(h.pedidos.rows.find(p => p.id === 'pedido_pago_0001').itens[0].modelo, 'equipe');
});

test('shared-account aliases declare the permitted restriction', async () => {
  const source = read('worker/functions/m31AbrirSessaoOperacional/operatorAccessRules.js').replace(/^export /gm, '');
  const context = vm.createContext({});
  vm.runInContext(source + '\nglobalThis.resolve = resolveOperationalScope;', context);
  const resolve = context.resolve;
  const scope = name => JSON.stringify(resolve(name));
  assert.equal(scope('Dulce'), JSON.stringify(['camisas']));
  assert.equal(scope('Dulce Alves'), JSON.stringify(['camisas']));
  assert.equal(scope('Visitante'), JSON.stringify([]));
  // The session endpoint intersects these aliases with authenticated membership.
  assert.equal(scope('Thalita'), JSON.stringify(['inscritas', 'voluntarias', 'caravanas', 'camisas']));
});

test('changing the operator name cannot expose Equipe to a commercial account', async () => {
  const h = operationalHarness({ operatorName: 'Paulo' });
  const result = await h.request({ action: 'ajustar_item', session_id: VALID_SESSION, row_id: 'pedido:pedido_pago_0001:0', modelo: 'equipe', cor: '', tamanho: 'M' });
  assert.equal(result.status, 400);
});

test('quantity represents pieces in summary, reservations and production grade', async () => {
  const h = operationalHarness();
  h.pedidos.rows[0].itens[0].quantidade = 3;
  const result = await h.request({ action: 'listar', session_id: VALID_SESSION });
  assert.equal(result.body.summary.pecas_pagas, 5);
  assert.equal(result.body.inventory.find(item => item.id === 'jesus|preta').tamanhos.M.reservadas, 3);
  assert.equal(result.body.summary.vendas_pagas, 185);
});

test('paid inscription items can change model, color and size while preserving other items and finance', async () => {
  const h = operationalHarness();
  await h.inscricoes.create({ id: 'signup_1', nome: 'VALIDACAO', comprou_camisa: true, camisa_status: 'confirmada', camisa_pagamento_id: 'pay_shirt', valor_pago: 139, status_pagamento: 'aprovado', camisas: [{ modelo: 'filhas', tamanho: 'M' }, { modelo: 'milagres', tamanho: 'G', entregue: true }] });
  h.sdk.asServiceRole.connectors.getConnection = async () => { throw new Error('Google offline'); };
  const result = await h.request({ action: 'ajustar_item', session_id: VALID_SESSION, row_id: 'inscricao:signup_1:0', modelo: 'jesus', cor: 'cereja', tamanho: 'GG' });
  assert.equal(result.status, 200);
  assert.deepEqual(h.inscricoes.rows[0].camisas[0], { modelo: 'jesus', cor: 'cereja', tamanho: 'GG' });
  assert.equal(h.inscricoes.rows[0].camisas[1].entregue, true);
  assert.equal(h.inscricoes.rows[0].valor_pago, 139);
  assert.equal(h.inscricoes.rows[0].camisa_pagamento_id, 'pay_shirt');
  assert.equal(h.actionLogs.rows.length, 1);
  const listed = await h.request({ action: 'listar', session_id: VALID_SESSION });
  assert.equal(listed.status, 200); assert.ok(listed.body.warning);
  assert.equal(listed.body.rows.filter(item => item.registro_id === 'signup_1').length, 2);
});

test('closed charges do not count as pending sales or allow manual payment confirmation', async () => {
  const h = operationalHarness();
  h.pedidos.rows[1].status_pagamento = 'substituido';
  const listed = await h.request({ action: 'listar', session_id: VALID_SESSION });
  assert.equal(listed.body.summary.aguardando_pagamento, 0);
  const result = await h.request({ action: 'confirmar_pagamento', session_id: VALID_SESSION, pedido_id: 'pedido_pend0001' });
  assert.equal(result.status, 409); assert.equal(h.invoked.length, 0);
});

test('presale settings write the same unit prices and deadline consumed by checkout', async () => {
  const h = operationalHarness();
  const result = await h.request({ action: 'configurar_pre_venda', session_id: VALID_SESSION, ativo: true, modelos: ['filhas'], preco_unitario: 65, preco_promocional: 60, promo_ate: '2026-10-07' });
  assert.equal(result.status, 200);
  assert.equal(h.config.rows[0].camisas_pre_venda_preco_unitario, 65);
  assert.equal(h.config.rows[0].camisas_pre_venda_preco_promocional, 60);
  assert.equal(h.config.rows[0].camisas_pre_venda_promo_ate, '2026-10-07');
  assert.equal(h.config.rows[0].camisas_pre_venda_preco_3, 180);
});
