// Contenção de vínculos: dados exclusivamente sintéticos, sem acesso à produção.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleCartinhas } from '../worker/functions/m31Cartinhas/cartinhaService.js';
import { titularRef, snapshotTitular } from '../worker/functions/m31Cartinhas/cartinhaIdentidade.js';
import { candidataLivre, handleEntrada } from '../worker/functions/m31Cartinhas/cartinhaDistribuicao.js';
import { participanteDasCartinhas } from '../worker/functions/m31Cartinhas/participantes.js';
import { cartinhaImprimivel } from '../src/lib/m31CartinhasApi.js';
import { createCartinhaAutosave } from '../src/components/m31/cartinhas/cartinhaAutosave.js';

const user = {id:'autora-teste',email:'autora@example.invalid',full_name:'Autora de teste'};
const base = (extra={}) => ({id:'p1',nome:'Ana Sintética',tipo:'publico_geral',estado_canonico:'confirmada',status_pagamento:'aprovado',cartinha_texto:'',cartinha_status:'pendente',cartinha_versao:0,cartinha_historico:[],...extra});
function match(row,q) {
  return Object.entries(q).every(([k,v]) => {
    if(k==='$or') return v.some(child=>match(row,child));
    if(v && typeof v==='object') {
      if('$ne' in v) return row[k]!==v.$ne;
      if('$exists' in v) return (row[k]!==undefined)===v.$exists;
    }
    return v===null ? row[k]==null : row[k]===v;
  });
}
function fixture({rows=[base()],liberado}={}) {
  const db=new Map(rows.map(r=>[r.id,structuredClone(r)]));
  const config={id:'config',cartinha_autora_user_id:user.id,...(liberado===undefined?{}:{cartinha_lote_liberado:liberado})};
  let writes=0;
  const S={
    EventoM31Config:{list:async()=>[structuredClone(config)]},
    EventoM31Membro:{filter:async()=>[{user_email:user.email,ativo:true}]},
    EventoM31Inscricao:{
      get:async id=>db.has(id)?structuredClone(db.get(id)):null,
      filter:async(q={},sort,limit=500,skip=0)=>[...db.values()].filter(r=>match(r,q)).slice(skip,skip+limit).map(r=>structuredClone(r)),
      updateMany:async(q,u)=>{const r=db.get(q.id);if(!r||!match(r,q))return{updated:0};db.set(r.id,{...r,...structuredClone(u.$set)});writes++;return{updated:1};},
    },
    get M31TransacaoFinanceira(){throw Error('Não consultar financeiro');},
    get M31PendenciaConciliacao(){throw Error('A conferência operacional não pode bloquear rascunho');},
  };
  return {S,db,config,writes:()=>writes,call:body=>handleCartinhas({user,body,S,now:()=> '2026-09-23T04:00:00Z'})};
}
async function payload(row,extra={}) {
  return {action:'salvar',inscricao_id:row.id,texto:'Texto sintético preservado.',status:'em_elaboracao',versao:row.cartinha_versao,titular_ref:await titularRef(row),id_transacao:crypto.randomUUID(),...extra};
}
test('configuração ausente bloqueia conclusão em lote, não rascunho',async()=>{
  const f=fixture();const row=f.db.get('p1');
  assert.equal((await f.call(await payload(row,{lote_id:crypto.randomUUID(),status:'pronta'}))).status,422);
  assert.equal(f.writes(),0);
  assert.equal((await f.call(await payload(row,{lote_id:crypto.randomUUID()}))).status,200);
});
test('configuração false não pode ser contornada por atributo enviado pelo navegador',async()=>{
  const f=fixture({liberado:false});const r=await f.call(await payload(f.db.get('p1'),{status:'pronta',lote_id:crypto.randomUUID(),cartinha_lote_liberado:true}));
  assert.equal(r.status,422);assert.equal(f.writes(),0);
});
test('contenção global preserva escrita e conclusão individual de pessoa sem conflito',async()=>{
  const f=fixture({liberado:false});const r=await f.call(await payload(f.db.get('p1'),{status:'pronta'}));
  assert.equal(r.status,200);assert.equal(r.body.inscricao.cartinha_status,'pronta');assert.equal(cartinhaImprimivel(r.body.inscricao),false);
});
test('lista mantém as participantes e não modifica o texto pronto durante bloqueio',async()=>{
  const row=base({cartinha_texto:'Querida Ana,\n\nTexto anterior.\n\nPra. Ju Beltrão',cartinha_status:'pronta'});row.cartinha_titular=snapshotTitular(row);
  const f=fixture({rows:[row],liberado:false});const r=await f.call({action:'listar'});
  assert.equal(r.body.inscricoes.length,1);assert.equal(r.body.inscricoes[0].cartinha_status,'pronta');
  assert.equal(r.body.inscricoes[0].cartinha_texto,row.cartinha_texto);assert.equal(cartinhaImprimivel(r.body.inscricoes[0]),false);assert.equal(f.writes(),0);
});
test('bloqueio de vínculo individual impede concluir e entregar, inclusive física',async()=>{
  const f=fixture({rows:[base({cartinha_vinculo_bloqueado:true})],liberado:true});
  for(const status of ['pronta','entregue']) {
    const r=await f.call(await payload(f.db.get('p1'),{status,suporte:'fisica',confirmar_fisica:true,texto:''}));
    assert.equal(r.status,422);
  }
  assert.equal(f.writes(),0);
});
test('rascunho com vínculo bloqueado salva sem dependência de financeiro ou auditoria',async()=>{
  const f=fixture({rows:[base({cartinha_vinculo_bloqueado:true})],liberado:false});const r=await f.call(await payload(f.db.get('p1')));
  assert.equal(r.status,200);assert.equal(f.writes(),1);assert.equal(f.db.get('p1').cartinha_vinculo_bloqueado,true);assert.equal(r.body.inscricao.cartinha_revisao_necessaria,true);
});
test('novo bloqueio entre leitura e commit impede conclusão concorrente',async()=>{
  const f=fixture({liberado:true});const original=f.S.EventoM31Inscricao.updateMany;
  f.S.EventoM31Inscricao.updateMany=async(q,u)=>{f.db.get('p1').cartinha_vinculo_bloqueado=true;return original(q,u);};
  const r=await f.call(await payload(f.db.get('p1'),{status:'pronta'}));assert.equal(r.status,409);assert.equal(f.writes(),0);
});
test('bloqueada permanece na lista nominal mas nunca é candidata aleatória',()=>{
  const row=base({cartinha_vinculo_bloqueado:true});assert.equal(participanteDasCartinhas(row),true);assert.equal(candidataLivre(row),false);
});
test('homônimas não são unidas ou excluídas durante esta contenção',async()=>{
  const f=fixture({rows:[base(),base({id:'p2'})],liberado:false});const r=await f.call({action:'listar'});
  assert.deepEqual(r.body.inscricoes.map(p=>p.id),['p1','p2']);assert.equal(f.writes(),0);
});
test('voluntárias permanecem segregadas e fora da seleção aleatória',async()=>{
  const v=base({id:'v1',tipo:'voluntario',cartinha_vinculo_bloqueado:true});const f=fixture({rows:[base(),v],liberado:false});
  assert.deepEqual((await f.call({action:'listar'})).body.inscricoes.map(p=>p.id),['p1']);
  assert.deepEqual((await f.call({action:'listar_voluntarias'})).body.inscricoes.map(p=>p.id),['v1']);assert.equal(candidataLivre(v),false);
});
test('distribuição não confirma ou processa entrada com liberação false',async()=>{
  const f=fixture({liberado:false});
  for(const action of ['entrada_confirmar','entrada_processar']) await assert.rejects(handleEntrada({S:f.S,user,body:{action},salvar:()=>{throw Error('não enviar');}}),e=>e.status===422);
});
test('liberação futura não remove bloqueio individual; retry preserva idempotência',async()=>{
  const f=fixture({liberado:true});const p=await payload(f.db.get('p1'),{status:'pronta',lote_id:crypto.randomUUID()});
  assert.equal((await f.call(p)).status,200);assert.equal((await f.call(p)).status,200);assert.equal(f.writes(),1);
  f.db.get('p1').cartinha_vinculo_bloqueado=true;
  const r=await f.call({action:'listar'});assert.equal(cartinhaImprimivel(r.body.inscricoes[0]),false);
});
test('conclusão recusada por vínculo mantém autosave disponível para rascunho',async()=>{
  const f=fixture({rows:[base({cartinha_vinculo_bloqueado:true})],liberado:false});const row=f.db.get('p1');
  const c=createCartinhaAutosave({inscricao:{...row,titular_ref:await titularRef(row)},setTimer:()=>1,clearTimer:()=>{},save:async body=>{const r=await f.call({action:'salvar',...body});if(r.status!==200)throw Object.assign(new Error(r.body.error),{status:r.status});return r.body.inscricao;}});
  await c.ready;c.edit('Rascunho preservado após conferência.');
  await assert.rejects(c.save('pronta'),e=>e.status===422);assert.equal(c.getSnapshot().status,'em_elaboracao');
  await c.save();assert.equal(f.db.get('p1').cartinha_texto,'Rascunho preservado após conferência.');assert.equal(c.getSnapshot().dirty,false);c.dispose();
});
test('rota de impressão exige liberação antes de montar folhas imprimíveis',()=>{
  const text=readFileSync(new URL('../src/pages/M31CartinhasPrint.jsx',import.meta.url),'utf8');
  assert.ok(text.indexOf("data?.config?.cartinha_lote_liberado !== true")<text.indexOf('return <M31CartinhasPrint '));
  assert.ok(text.includes("fresh.data.config?.cartinha_lote_liberado !== true"));
});
