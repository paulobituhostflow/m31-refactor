import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analisarLote, candidatasPorNome, recortarLote } from '../worker/functions/m31Cartinhas/cartinhaLote.js';
import { handleCartinhas } from '../worker/functions/m31Cartinhas/cartinhaService.js';
import { titularRef, precisaRevisar } from '../worker/functions/m31Cartinhas/cartinhaIdentidade.js';
import { prepararCartinhaTransferencia } from '../worker/functions/m31ConcluirTransferencia/cartinhaTransferencia.js';
import { createCartinhaAutosave } from '../src/components/m31/cartinhas/cartinhaAutosave.js';
import { prepararEnviosLote, executarEnviosLote } from '../src/components/m31/cartinhas/cartinhaLoteClient.js';
import { cartinhaImprimivel } from '../src/lib/m31CartinhasApi.js';

const user = { id: 'autora-sintetica', email: 'autora@example.invalid', full_name: 'Autora sintética' };
const participante = (id = 'p1', nome = 'Maria da Silva') => ({ id, nome, cpf: null, tipo: 'publico_geral', estado_canonico: 'confirmada', status_pagamento: 'aprovado', cartinha_versao: 0, cartinha_status: 'pendente', cartinha_texto: '', cartinha_historico: [] });
function fixture(initial = participante()) {
  let row = structuredClone(initial), updates = 0;
  const S = {
    // Estes testes de transporte exercitam lote já liberado; a contenção é testada separadamente.
    EventoM31Config: { list: async () => [{ id: 'config', cartinha_autora_user_id: user.id, cartinha_lote_liberado: true }] },
    EventoM31Membro: { filter: async () => [{ ativo: true, user_email: user.email }] },
    EventoM31Inscricao: {
      get: async () => structuredClone(row), filter: async () => [structuredClone(row)],
      updateMany: async (query, update) => {
        if (query.id !== row.id || query.nome !== row.nome || (query.cartinha_versao !== undefined && query.cartinha_versao !== row.cartinha_versao)) return { updated: 0 };
        row = { ...row, ...structuredClone(update.$set) }; updates++; return { updated: 1 };
      },
    },
  };
  const call = body => handleCartinhas({ user, body, S, now: () => '2026-09-22T16:00:00Z' });
  return { row: () => row, updates: () => updates, call,
    save: async payload => { const r = await call({ action: 'salvar', ...payload }); if (r.status !== 200) throw Object.assign(new Error(r.body.error), { status: r.status }); return r.body.inscricao; } };
}
async function payload(row, extra = {}) {
  return { inscricao_id: row.id, texto: '', status: 'pronta', versao: row.cartinha_versao, titular_ref: await titularRef(row), id_transacao: crypto.randomUUID(), ...extra };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('colagem separa mensagens e preserva 100% do texto original', async () => {
  const texto = '\nQuerida Maria da Silva,\r\nPrimeira mensagem.\r\n\r\nQuerida Ana Souza,\nSegunda mensagem.\n';
  const r = await analisarLote({ texto, participantes: [participante(), participante('p2', 'Ana Souza')] });
  assert.equal(r.cartas.length, 2); assert.equal(r.cartas.map(c => c.texto).join(''), texto);
  assert.deepEqual(r.cartas.map(c => c.inscricao_id), ['p1', 'p2']); assert.ok(r.cartas.every(c => c.selecionar));
});
test('nome parcial mesmo único não vincula automaticamente', async () => {
  const r = await analisarLote({ texto: 'Querida Maria,\nPrimeira.\n\nQuerida Ana,\nSegunda.', participantes: [participante(), participante('p2', 'Ana Souza')] });
  assert.ok(r.cartas.every(c => !c.selecionar && !c.inscricao_id)); assert.equal(r.cartas[0].candidatos_ids[0], 'p1');
});
test('homônimas são apresentadas como escolhas e nunca fundidas', () => {
  const r = candidatasPorNome('Maria da Silva', [participante(), participante('p2')]);
  assert.equal(r.exata, false); assert.equal(r.candidatas.length, 2);
});
test('formato livre usa apenas índices da IA e recorta o texto original', async () => {
  const texto = 'Olá Maria da Silva!\nTexto A.\n\nOi Ana Souza!\nTexto B.';
  const r = await analisarLote({ texto, participantes: [participante(), participante('p2', 'Ana Souza')], invokeLLM: async () => ({ cartas: [{ linha_inicio: 1, nome_destinataria: 'Maria da Silva' }, { linha_inicio: 4, nome_destinataria: 'Ana Souza' }] }) });
  assert.equal(r.cartas.map(c => c.texto).join(''), texto); assert.equal(r.gravado, false);
});
test('nome alucinado ou citado apenas no corpo é rejeitado', () => {
  assert.throws(() => recortarLote('Querida Maria,\nOlá!\nMinha amiga Ana Souza veio.', [{ linha_inicio: 1, nome_destinataria: 'Ana Souza' }]));
});
test('limites fora de ordem ou fora do texto não alteram a colagem', () => {
  assert.throws(() => recortarLote('Maria\nAna', [{ linha_inicio: 2, nome_destinataria: 'Ana' }, { linha_inicio: 1, nome_destinataria: 'Maria' }]));
  assert.throws(() => recortarLote('Maria', [{ linha_inicio: 9, nome_destinataria: 'Maria' }]));
});
test('prefixo sem destinatária fica visível para conferência', () => {
  const r = recortarLote('Anotações de hoje\n\nQuerida Maria,\nTexto.', [{ linha_inicio: 3, nome_destinataria: 'Maria' }]);
  assert.equal(r.length, 2); assert.equal(r[0].selecionar, false); assert.equal(r[0].texto, 'Anotações de hoje\n\n');
});
test('analisar não seleciona automaticamente cartas existentes', async () => {
  const r = await analisarLote({ texto: 'Querida Maria da Silva,\nUma.\nQuerida Ana Souza,\nOutra.', participantes: [{ ...participante(), cartinha_texto: 'Carta já escrita' }, participante('p2', 'Ana Souza')] });
  assert.equal(r.cartas[0].selecionar, false); assert.equal(r.cartas[1].selecionar, true);
});
test('duas mensagens selecionadas para a mesma pessoa bloqueiam o lote', () => {
  const c = { indice: 0, selecionar: true, inscricao_id: 'p1', texto: 'Carta' };
  assert.throws(() => prepararEnviosLote({ cartas: [c, { ...c, indice: 1 }], participantes: [{ id: 'p1', titular_ref: 'a'.repeat(64) }], status: 'pronta', loteId: crypto.randomUUID() }));
});
test('campo vazio continua proibido para carta digital', async () => {
  const f = fixture();
  await assert.rejects(f.save(await payload(f.row())), e => e.status === 422);
  assert.equal(f.updates(), 0);
});

test('carta física sem transcrição é pronta somente com confirmação explícita', async () => {
  const f = fixture();
  await assert.rejects(f.save(await payload(f.row(), { suporte: 'fisica' })));
  const body = await payload(f.row(), { suporte: 'fisica', confirmar_fisica: true });
  const saved = await f.save(body);
  assert.equal(saved.cartinha_status, 'pronta'); assert.equal(saved.cartinha_suporte, 'fisica');
  assert.equal(precisaRevisar(f.row()), false); assert.equal(cartinhaImprimivel(saved), false);
  await f.save(body); assert.equal(f.updates(), 1); assert.equal(f.row().cartinha_historico.length, 1);
});
test('transferência não carrega a baixa física para a nova destinatária', async () => {
  const f = fixture(); await f.save(await payload(f.row(), { suporte: 'fisica', confirmar_fisica: true }));
  const { patch } = prepararCartinhaTransferencia(f.row(), 'transferencia-teste', '2026-09-22T17:00:00Z');
  assert.equal(patch.cartinha_suporte, 'digital'); assert.equal(patch.cartinha_fisica_confirmada_em, null); assert.equal(patch.cartinha_status, 'revisar_cartinha');
});
test('colar bloco grande e concluir não exige digitação adicional', async () => {
  const f = fixture(); const c = createCartinhaAutosave({ inscricao: { ...f.row(), titular_ref: await titularRef(f.row()) }, save: f.save, setTimer: () => 1, clearTimer: () => {} });
  await c.ready; const text = 'Uma carta com parágrafos.\n\n'.repeat(1000); c.edit(text);
  const r = await c.save('pronta'); assert.ok(r.cartinha_texto.startsWith('Querida Maria,\n\n')); assert.ok(r.cartinha_texto.includes(text.trim())); assert.ok(r.cartinha_texto.endsWith('\n\nPra. Ju Beltrão')); assert.equal(r.cartinha_status, 'pronta'); assert.equal(c.getSnapshot().dirty, false); c.dispose();
});
test('concluir espera autosave anterior e confirma o texto atual', async () => {
  const f = fixture(); let release; const gate = new Promise(resolve => { release = resolve; }); let first = true;
  const c = createCartinhaAutosave({ inscricao: { ...f.row(), titular_ref: await titularRef(f.row()) }, save: async p => { if (first) { first = false; await gate; } return f.save(p); }, setTimer: () => 1, clearTimer: () => {} });
  await c.ready; c.edit('Texto colado'); const a = c.save(); await tick(); const b = c.save('pronta'); release(); await a; const r = await b;
  assert.equal(r.cartinha_status, 'pronta'); assert.equal(f.row().cartinha_texto, 'Querida Maria,\n\nTexto colado\n\nPra. Ju Beltrão'); c.dispose();
});
test('lote nunca sobrescreve carta existente silenciosamente', async () => {
  const f = fixture({ ...participante(), cartinha_texto: 'Texto antigo' });
  await assert.rejects(f.save(await payload(f.row(), { texto: 'Texto novo', lote_id: crypto.randomUUID() })), e => e.status === 409);
  assert.equal(f.row().cartinha_texto, 'Texto antigo');
});
test('retry de lote usa o mesmo UUID após resposta perdida', async () => {
  const f = fixture(); const body = await payload(f.row(), { texto: 'Texto em lote', lote_id: crypto.randomUUID(), suporte: 'digital' });
  const envio = [{ indice: 0, estado: 'aguardando', payload: body }]; let failOnce = true; const ids = []; let persisted;
  const salvar = async p => { ids.push(p.id_transacao); const r = await f.save(p); if (failOnce) { failOnce = false; throw Error('rede'); } return r; };
  const first = await executarEnviosLote({ envios: envio, salvar, persistir: async rows => { persisted = structuredClone(rows); } });
  assert.equal(first[0].estado, 'incerto');
  const second = await executarEnviosLote({ envios: persisted, salvar, persistir: async () => {} });
  assert.equal(second[0].estado, 'salvo'); assert.equal(ids[0], ids[1]); assert.equal(f.updates(), 1);
});
test('falha na persistência local impede enviar lote não recuperável', async () => {
  let calls = 0;
  await assert.rejects(executarEnviosLote({ envios: [{ estado: 'aguardando', payload: {} }], salvar: async () => { calls++; }, persistir: async () => { throw Error('quota'); } }));
  assert.equal(calls, 0);
});
test('interface mantém um campo único e ações explícitas', () => {
  const editor = readFileSync(new URL('../src/components/m31/cartinhas/CartinhaEditor.jsx', import.meta.url), 'utf8');
  const bulk = readFileSync(new URL('../src/components/m31/cartinhas/CartinhaLote.jsx', import.meta.url), 'utf8');
  assert.ok(editor.includes('Mais informações')); assert.ok(editor.includes('className="m31-editor__name"'));
  const css = readFileSync(new URL('../src/components/m31/cartinhas/cartinhaEditor.css', import.meta.url), 'utf8');
  assert.ok(css.includes('clamp(24px')); assert.ok(editor.includes('Concluir e avançar'));
  assert.ok(bulk.includes('Identificar cartinhas')); assert.ok(bulk.includes('cartinhasApi.analisarLote(job.texto)'));
});
