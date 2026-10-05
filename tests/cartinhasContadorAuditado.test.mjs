import test from 'node:test';
import assert from 'node:assert/strict';
import { ciclosConclusaoDaTitular } from '../worker/functions/m31Cartinhas/cartinhaCiclo.js';

const base={id:'i1',tipo:'publico_geral',nome:'Maria Silva',cpf:'12345678901',status_pagamento:'aprovado'};
const ref='titular-1';
const ev=(extra={})=>({id_transacao:crypto.randomUUID(),inscricao_id:'i1',titular_ref:ref,titular_anterior:{nome:'Maria Silva',cpf:'12345678901'},motivo:'salvamento',status:'pronta',atualizada_em:'2026-09-23T12:00:00Z',...extra});

test('status pronta isolado nunca cria contagem sem histórico',()=>assert.deepEqual(ciclosConclusaoDaTitular({...base,cartinha_status:'pronta',cartinha_historico:[]},ref),[]));
test('evento novo sem confirmação explícita vindo de chat/lote não entra na meta',()=>{
 assert.deepEqual(ciclosConclusaoDaTitular({...base,cartinha_historico:[ev({origem:'chat',conclusao_explicita:undefined})]},ref),[]);
 assert.deepEqual(ciclosConclusaoDaTitular({...base,cartinha_historico:[ev({lote_id:'l1',conclusao_explicita:undefined})]},ref),[]);
});
test('conclusão explícita conta uma única vez por participante/dia',()=>{
 const a=ev({conclusao_explicita:true}), b=ev({conclusao_explicita:true,atualizada_em:'2026-09-23T13:00:00Z'});
 assert.deepEqual(ciclosConclusaoDaTitular({...base,cartinha_historico:[a,b]},ref),['2026-09-23']);
});
test('legado manual auditável permanece compatível',()=>assert.deepEqual(ciclosConclusaoDaTitular({...base,cartinha_historico:[ev({conclusao_explicita:undefined})]},ref),['2026-09-23']));
