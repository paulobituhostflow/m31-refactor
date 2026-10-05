import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { handleCartinhas } from '../worker/functions/m31Cartinhas/cartinhaService.js';
import { titularRef, snapshotTitular } from '../worker/functions/m31Cartinhas/cartinhaIdentidade.js';
import { carregarParticipantes } from '../worker/functions/m31Cartinhas/participantes.js';
import { createCartinhaAutosave } from '../src/components/m31/cartinhas/cartinhaAutosave.js';
import { createCartinhasApi, cartinhaImprimivel, mesmoLoteCartinhas } from '../src/lib/m31CartinhasApi.js';
import { concluidasHoje, podeCelebrar, metaDiariaCartinhas, diaCartinhas } from '../src/components/m31/cartinhas/cartinhaMetas.js';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const user = { id: 'autora-teste', email: 'autora@example.invalid', full_name: 'Autora teste' };
const baseRow = () => ({ id: 'inscricao-teste', nome: 'Participante teste', cpf: '00000000000', tipo: 'publico_geral', estado_canonico: 'confirmada', status_pagamento: 'aprovado', cartinha_status: 'pendente', cartinha_versao: 0, cartinha_texto: '', cartinha_historico: [] });
function match(row, query) {
  return Object.entries(query).every(([key, val]) => {
    if (key === '$or') return val.some(q => match(row,q));
    if (val && typeof val === 'object') {
      if ('$ne' in val) return row[key] !== val.$ne;
      if ('$exists' in val) return (row[key] !== undefined) === val.$exists;
    }
    return val === null ? row[key] == null : row[key] === val;
  });
}
function environment(initial = baseRow()) {
  let row = structuredClone(initial), writes = 0;
  const S = {
    EventoM31Config: { list: async () => [{ id: 'config', cartinha_autora_user_id: user.id, cartinha_data_evento: '2026-11-21' }] },
    EventoM31Membro: { filter: async () => [{ user_email: user.email, ativo: true }] },
    EventoM31Inscricao: {
      get: async id => id === row.id ? structuredClone(row) : null,
      filter: async () => [structuredClone(row)],
      updateMany: async (q, update) => { if (!match(row,q)) return { updated: 0 }; row = { ...row, ...structuredClone(update.$set) }; writes++; return { updated: 1 }; },
    },
    get M31TransacaoFinanceira() { throw new Error('Financeiro não deve ser acessado'); },
    get M31PendenciaConciliacao() { throw new Error('Conciliação não deve ser acessada'); },
    get M31InscricaoTimeline() { throw new Error('Timeline não deve bloquear salvamento'); },
  };
  return { S, row: () => row, writes: () => writes, call: body => handleCartinhas({ user, body, S, now: () => '2026-09-22T14:00:00.000Z' }) };
}
async function payload(row, extra = {}) { return { action: 'salvar', inscricao_id: row.id, texto: 'Texto sintético de teste.', status: 'em_elaboracao', versao: row.cartinha_versao, titular_ref: await titularRef(row), id_transacao: crypto.randomUUID(), ...extra }; }
const tick = () => new Promise(resolve => setImmediate(resolve));

test('transferência preserva a carta antiga, exige revisão e reinicia contagem da titular', async () => {
  const { prepararCartinhaTransferencia } = await import('../worker/functions/m31ConcluirTransferencia/cartinhaTransferencia.js');
  const row = { ...baseRow(), cartinha_texto: 'Carta para a titular anterior', cartinha_status: 'pronta', cartinha_dias_concluidos: ['2026-09-22'] };
  const { patch } = prepararCartinhaTransferencia(row, 'transferencia-teste', '2026-09-22T15:00:00Z');
  assert.equal(patch.cartinha_texto, ''); assert.equal(patch.cartinha_status, 'revisar_cartinha');
  assert.equal(patch.cartinha_historico[0].texto, row.cartinha_texto); assert.deepEqual(patch.cartinha_dias_concluidos, []);
  assert.equal(patch.cartinha_espelho_pendente, true);
});
test('transferência sem carta anterior permanece por escrever', async () => {
  const { prepararCartinhaTransferencia } = await import('../worker/functions/m31ConcluirTransferencia/cartinhaTransferencia.js');
  assert.equal(prepararCartinhaTransferencia(baseRow(), 'transferencia-teste', '2026-09-22T15:00:00Z').patch.cartinha_status, 'pendente');
});
function memoryStore(initial = null, fail = false) { let value = initial; return { read: async () => value, write: async v => { if(fail) throw new Error('quota'); value = structuredClone(v); }, value: () => value }; }
async function autosaveFixture(options = {}) {
  const e = environment();
  const row = { ...e.row(), titular_ref: await titularRef(e.row()) };
  const controller = createCartinhaAutosave({ inscricao: row, delay: 100000,
    save: async body => { const r = await e.call({ action: 'salvar', ...body }); if(r.status !== 200) throw Object.assign(new Error(r.body.error), {status:r.status}); return r.body.inscricao; }, ...options });
  await controller.ready;
  return { e, controller, row };
}

test('listar não depende de tabelas financeiras', async () => { const e = environment(); const r = await carregarParticipantes(e.S); assert.equal(r.inscricoes.length, 1); });
test('lista só oferece escopo da autora e dados válidos', async () => { const e = environment(); const r=await e.call({action:'listar'}); assert.equal(r.status,200); assert.equal(r.body.inscricoes.length,1); assert.ok(!('pendencias' in r.body)); assert.ok(!('cpf' in r.body.inscricoes[0])); });
test('sessão não autorizada nunca lê cartas', async () => { const e = environment(); assert.equal((await handleCartinhas({ user:{...user,id:'outra'}, body:{action:'listar'}, S:e.S })).status,403); });
test('salvar funciona quando a listagem inteira falha', async () => { const e = environment(); e.S.EventoM31Inscricao.filter=async()=>{throw Error('list unavailable')}; const r=await e.call(await payload(e.row())); assert.equal(r.status,200); assert.equal(e.writes(),1); });
test('mesmo UUID repetido não duplica versão/histórico', async () => { const e=environment(); const p=await payload(e.row()); const first=await e.call(p), second=await e.call(p); assert.equal(first.status,200); assert.equal(second.status,200); assert.equal(e.writes(),1); assert.equal(e.row().cartinha_historico.length,1); });
test('mesmo UUID com texto diferente é rejeitado', async()=>{const e=environment(); const p=await payload(e.row()); await e.call(p); assert.equal((await e.call({...p,texto:'Outro texto'})).status,409);assert.equal(e.writes(),1);});
test('duas gravações concorrentes da mesma versão não sobrescrevem', async()=>{const e=environment();const p=await payload(e.row());const out=await Promise.all([e.call(p),e.call({...p,id_transacao:crypto.randomUUID(),texto:'Outra edição'})]);assert.deepEqual(out.map(r=>r.status).sort(),[200,409]);assert.equal(e.writes(),1);});
test('resposta perdida e reenvio concorrente do mesmo UUID produz um commit', async()=>{const e=environment();const p=await payload(e.row());const out=await Promise.all([e.call(p),e.call(p)]);assert.ok(out.every(r=>r.status===200));assert.equal(e.writes(),1);});
test('texto alterado em pronta volta a revisar mesmo com pedido pronta', async()=>{const initial=baseRow();initial.cartinha_texto='Carta anterior';initial.cartinha_status='pronta';initial.cartinha_titular=snapshotTitular(initial);const e=environment(initial);const r=await e.call(await payload(e.row(),{status:'pronta'}));assert.equal(r.body.inscricao.cartinha_status,'revisar_cartinha');assert.equal(e.row().cartinha_historico[0].texto,'Carta anterior');});
test('troca de titular bloqueia um rascunho offline anterior', async()=>{const old=baseRow();const p=await payload(old);const e=environment({...old,nome:'Outra participante',cpf:'11111111111'});assert.equal((await e.call(p)).status,409);assert.equal(e.writes(),0);});
test('mudança de validade após leitura impede CAS', async()=>{const e=environment(); const original=e.S.EventoM31Inscricao.updateMany; e.S.EventoM31Inscricao.updateMany=async(q,u)=>original({...q,estado_canonico:'inexistente'},u);assert.equal((await e.call(await payload(e.row()))).status,409);assert.equal(e.writes(),0);});
test('controles inválidos e UUID inválido não são persistidos', async()=>{const e=environment();assert.equal((await e.call(await payload(e.row(),{texto:'abc\u0000'}))).status,422);assert.equal((await e.call(await payload(e.row(),{id_transacao:'bad'}))).status,422);assert.equal(e.writes(),0);});
test('outbox e histórico persistem junto com a carta', async()=>{const e=environment();await e.call(await payload(e.row()));assert.equal(e.row().cartinha_espelho_pendente,true);assert.equal(e.row().cartinha_historico[0].texto,e.row().cartinha_texto);});
test('conclusão do dia conta uma vez por participante, não por autosave', async()=>{const e=environment(); await e.call(await payload(e.row(),{status:'pronta'})); await e.call(await payload(e.row(),{status:'pronta',texto:'Texto alterado'})); await e.call(await payload(e.row(),{status:'pronta',texto:'Texto alterado'}));assert.deepEqual(e.row().cartinha_dias_concluidos,['2026-09-22']);assert.equal(concluidasHoje([e.row()],'2026-09-22'),1);});
test('cópia offline confirmada e envio ao reconectar', async()=>{let online=false;const storage=memoryStore();const {controller,e}=await autosaveFixture({storage,online:()=>online});controller.edit('Rascunho offline');await controller.save();assert.equal(controller.getSnapshot().localSaved,true);assert.equal(e.writes(),0);online=true;await controller.reconnect();assert.equal(e.row().cartinha_texto,'Rascunho offline');assert.equal(controller.getSnapshot().dirty,false);controller.dispose();});
test('quota local não produz confirmação falsa de salvo no dispositivo', async()=>{const storage=memoryStore(null,true);const {controller}=await autosaveFixture({storage,online:()=>false});controller.edit('Sem espaço');await controller.save();assert.equal(controller.getSnapshot().localSaved,false);assert.ok(controller.getSnapshot().localError);controller.dispose();});
test('retry mantém o UUID quando o servidor salvou mas a resposta se perdeu', async()=>{const e=environment(),storage=memoryStore();const ids=[];let lost=true;const {controller}=await autosaveFixture({storage,save:async body=>{ids.push(body.id_transacao);const r=await e.call({action:'salvar',...body});if(lost){lost=false;throw Error('network');}return r.body.inscricao;}});controller.edit('Texto com retorno perdido');await assert.rejects(controller.save());await controller.reconnect();assert.equal(ids[0],ids[1]);assert.equal(e.writes(),1);controller.dispose();});
test('edição durante requisição não é substituída pela resposta', async()=>{let release;const gate=new Promise(r=>release=r);const e=environment();const {controller}=await autosaveFixture({save:async body=>{await gate;return (await e.call({action:'salvar',...body})).body.inscricao;}});controller.edit('Primeiro');const saving=controller.save();await tick();controller.edit('Segundo');release();await saving;assert.equal(controller.getSnapshot().text,'Segundo');assert.equal(controller.getSnapshot().dirty,true);await controller.save();assert.equal(e.row().cartinha_texto,'Segundo');controller.dispose();});
test('cópia de outra titular não é reenviada automaticamente', async()=>{const storage=memoryStore({dirty:true,text:'Texto antigo',status:'em_elaboracao',version:0,titularRef:'outra',savedText:''});const {controller,e}=await autosaveFixture({storage});assert.equal(controller.getSnapshot().conflict,true);await controller.reconnect();assert.equal(e.writes(),0);controller.dispose();});
test('resposta inválida da listagem não vira lista vazia',async()=>{const api=createCartinhasApi(async()=>({data:{}}));await assert.rejects(api.listar());});
test('zero registros e carregamento não celebram',()=>{assert.equal(podeCelebrar({carregada:false,total:100,antes:9,agora:10,meta:10}),false);assert.equal(podeCelebrar({carregada:true,total:0,antes:0,agora:0,meta:0}),false);assert.equal(podeCelebrar({carregada:true,total:100,antes:9,agora:10,meta:10}),true);});
test('metas separam 1000 planejadas e contagem real',()=>{assert.equal(metaDiariaCartinhas({cartinha_meta_diaria:20},30),null);assert.equal(metaDiariaCartinhas({},0),null);assert.equal(diaCartinhas('2026-09-23T01:00:00Z'),'2026-09-22');});
test('impressão recusa revisão e detecta mudanças de titular/versão',()=>{const p={id:'x',cartinha_elegivel:true,cartinha_status:'pronta',cartinha_texto:'Teste',titular_ref:'a',cartinha_versao:1};assert.equal(cartinhaImprimivel({...p,cartinha_revisao_necessaria:true}),false);assert.equal(mesmoLoteCartinhas([p],[{...p,titular_ref:'b'}]),false);});
test('UI tem erro antes do hero e editores vinculados a snapshots estáveis',()=>{const page=readFileSync(new URL('../src/pages/M31Cartinhas.jsx',import.meta.url),'utf8');assert.ok(page.indexOf('if (!data) return')<page.indexOf('<CartinhaHero'));assert.ok(!page.includes('key={proximaPendente.id}'));assert.equal((page.match(/<CartinhaEditor/g)||[]).length,(page.match(/key=\{(?:editando|focoInscricao)\.id\}/g)||[]).length);assert.ok(!page.includes('data.pendencias'));assert.ok(page.includes('<CartinhaMetaDia'));});
