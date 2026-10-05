import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleCartinhas } from '../../../../../worker/functions/m31Cartinhas/cartinhaService.js';
import { titularRef } from '../../../../../worker/functions/m31Cartinhas/cartinhaIdentidade.js';
import { carregarParticipantes } from '../../../../../worker/functions/m31Cartinhas/participantes.js';
import { createCartinhaAutosave } from '../cartinhaAutosave.js';
import { createCartinhasApi, cartinhaImprimivel } from '../../../../lib/m31CartinhasApi.js';

// Somente dados sintéticos e dependências locais. Nenhuma chamada ao banco ou à IA.
const user = { id: 'autora-sintetica', email: 'autora@example.invalid', full_name: 'Autora de teste' };
const stamp = () => '2026-09-22T15:00:00.000Z';
const uuid1 = '11111111-1111-4111-8111-111111111111';
const uuid2 = '22222222-2222-4222-8222-222222222222';
function fixture() {
  let row = { id: 'participante-sintetica', nome: 'Participante de teste', cpf: '', tipo: 'publico_geral', estado_canonico: 'confirmada', status_pagamento: 'aprovado', cartinha_status: 'pendente', cartinha_versao: 0 };
  let updates = 0;
  const S = {
    EventoM31Config: { list: async () => [{ id: 'config-test', cartinha_autora_user_id: user.id, cartinha_data_evento: '2026-11-21' }] },
    EventoM31Membro: { filter: async () => [{ user_email: user.email, ativo: true, perfil: 'cartinhas' }] },
    EventoM31Inscricao: {
      get: async () => structuredClone(row),
      filter: async () => [structuredClone(row)],
      updateMany: async (q, operation) => {
        if (q.id !== row.id || q.nome !== row.nome || (q.cartinha_versao !== undefined && q.cartinha_versao !== row.cartinha_versao)) return { updated: 0 };
        row = { ...row, ...structuredClone(operation.$set) }; updates++; return { updated: 1 };
      },
    },
    get M31TransacaoFinanceira() { throw new Error('Financeiro indisponível: não deve ser consultado'); },
    get M31PendenciaConciliacao() { throw new Error('Conciliação indisponível: não deve ser consultada'); },
    get M31InscricaoTimeline() { throw new Error('Timeline indisponível: não deve bloquear o autosave'); },
  };
  return { S, row: () => row, updates: () => updates, replace: r => { row = r; }, call: body => handleCartinhas({ user, body, S, now: stamp }) };
}
async function saveBody(f, overrides = {}) {
  return { action: 'salvar', inscricao_id: f.row().id, texto: 'Texto sintético escrito pela autora.', status: 'em_elaboracao', versao: f.row().cartinha_versao, titular_ref: await titularRef(f.row()), id_transacao: uuid1, ...overrides };
}

test('pessoa não autenticada não recebe dados', async () => {
  assert.equal((await handleCartinhas({ user: null, body: { action: 'listar' }, S: {} })).status, 401);
});
test('outra conta não obtém acesso às cartas', async () => {
  const f = fixture();
  assert.equal((await handleCartinhas({ user: { ...user, id: 'outra-conta' }, body: { action: 'listar' }, S: f.S })).status, 403);
});
test('lista pagina 501 participantes sem financeiro ou conciliação', async () => {
  const f = fixture();
  const rows = Array.from({ length: 501 }, (_, i) => ({ ...f.row(), id: `fixture-${i}` }));
  f.S.EventoM31Inscricao.filter = async (q, sort, limit, skip = 0) => { assert.equal(sort, '-id'); return rows.slice(skip, skip + limit); };
  const res = await f.call({ action: 'listar' });
  assert.equal(res.status, 200); assert.equal(res.body.inscricoes.length, 501);
  assert.equal('pendencias' in res.body, false);
  assert.equal('cpf' in res.body.inscricoes[0], false);
});
test('cartinhas refuses a partial count when the provider repeats an id at a page boundary', async () => {
  const f = fixture();
  const rows = Array.from({ length: 500 }, (_, i) => ({ ...f.row(), id: `fixture-${i}` }));
  f.S.EventoM31Inscricao.filter = async (_q, _sort, _limit, skip = 0) => skip === 0 ? rows : [rows[499]];
  await assert.rejects(carregarParticipantes(f.S), /cartinhas_paginacao_inconsistente/);
});
test('rascunho salva mesmo com outros módulos indisponíveis', async () => {
  const f = fixture();
  f.S.EventoM31Inscricao.filter = async () => { throw new Error('Listagem geral indisponível'); };
  const res = await f.call(await saveBody(f));
  assert.equal(res.status, 200); assert.equal(f.row().cartinha_versao, 1);
  assert.equal(f.row().cartinha_historico.length, 1);
});
test('repetir o mesmo UUID e payload não duplica o salvamento', async () => {
  const f = fixture(); const body = await saveBody(f);
  assert.equal((await f.call(body)).status, 200);
  assert.equal((await f.call(body)).status, 200);
  assert.equal(f.updates(), 1); assert.equal(f.row().cartinha_historico.length, 1);
  assert.equal((await f.call({ ...body, texto: 'Outro texto' })).status, 409);
});
test('editar carta pronta exige revisão e preserva versão anterior', async () => {
  const f = fixture(); await f.call(await saveBody(f, { status: 'pronta' }));
  const oldText = f.row().cartinha_texto;
  const res = await f.call(await saveBody(f, { texto: 'Texto novo para revisão.', status: 'pronta', id_transacao: uuid2 }));
  assert.equal(res.status, 200); assert.equal(res.body.inscricao.cartinha_status, 'revisar_cartinha');
  assert.equal(cartinhaImprimivel(res.body.inscricao), false);
  assert.ok(f.row().cartinha_historico.some(h => h.texto === oldText));
});
test('troca de titular bloqueia salvamento com identidade antiga', async () => {
  const f = fixture(); const body = await saveBody(f);
  f.replace({ ...f.row(), nome: 'Outra participante sintética' });
  assert.equal((await f.call(body)).status, 409); assert.equal(f.updates(), 0);
});
test('resposta inválida nunca vira lista vazia bem-sucedida', async () => {
  const api = createCartinhasApi(async () => ({ data: { error: 'Falha de teste' } }));
  await assert.rejects(() => api.listar());
});
test('offline confirma cópia local e envia quando a conexão retorna', async () => {
  let online = false, stored, sends = 0;
  const c = createCartinhaAutosave({
    inscricao: { id: 'fixture-offline', titular_ref: 'a'.repeat(64), cartinha_versao: 0, cartinha_status: 'pendente', cartinha_texto: '' },
    storage: { read: async () => null, write: async value => { stored = structuredClone(value); } },
    online: () => online, uuid: () => uuid1, setTimer: () => 1, clearTimer: () => {},
    save: async body => { sends++; return { id: body.inscricao_id, cartinha_texto: body.texto, cartinha_status: body.status, cartinha_versao: 1, titular_ref: body.titular_ref }; },
  });
  await c.ready; c.edit('Rascunho sintético offline'); await c.save();
  assert.equal(sends, 0); assert.equal(c.getSnapshot().localSaved, true); assert.equal(stored.text, 'Rascunho sintético offline');
  online = true; await c.reconnect();
  assert.equal(sends, 1); assert.equal(c.getSnapshot().dirty, false); c.dispose();
});
test('resposta perdida é repetida com o mesmo UUID sem perder texto novo', async () => {
  const sent = []; let stored;
  const c = createCartinhaAutosave({
    inscricao: { id: 'fixture-retry', titular_ref: 'b'.repeat(64), cartinha_versao: 0, cartinha_status: 'pendente', cartinha_texto: '' },
    storage: { read: async () => null, write: async value => { stored = structuredClone(value); } },
    online: () => true, uuid: () => uuid1, setTimer: () => 1, clearTimer: () => {},
    save: async body => {
      sent.push(structuredClone(body));
      if (sent.length === 1) throw new Error('Resposta de rede perdida');
      return { id: body.inscricao_id, cartinha_texto: body.texto, cartinha_status: body.status, cartinha_versao: 1, titular_ref: body.titular_ref };
    },
  });
  await c.ready; c.edit('Primeiro texto'); await assert.rejects(() => c.save());
  c.edit('Texto mais recente'); await c.save();
  assert.deepEqual(sent[0], sent[1]); assert.equal(c.getSnapshot().text, 'Texto mais recente');
  assert.equal(c.getSnapshot().dirty, true); assert.equal(stored.text, 'Texto mais recente'); c.dispose();
});
test('tela não mostra indicadores antes de uma resposta válida', () => {
  const page = readFileSync(new URL('../../../../pages/M31Cartinhas.jsx', import.meta.url), 'utf8');
  const hero = readFileSync(new URL('../CartinhaHero.jsx', import.meta.url), 'utf8');
  assert.ok(page.includes('if (!data) return'));
  assert.ok(hero.includes('resumoMacroCartinhas'));
  assert.equal(hero.includes('Todas as cartinhas'), false);
  assert.equal(page.includes('data.pendencias.map'), false);
  assert.ok(page.includes('inscricao={focoInscricao}'));
});
