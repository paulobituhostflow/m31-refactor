import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diaCartinha, proximaViradaCartinhas, resumoMacroCartinhas, ciclosConclusaoDaTitular, dataCivilValida, REGRA_CICLO_CARTINHAS } from '../worker/functions/m31Cartinhas/cartinhaCiclo.js';
import { diaCartinhas, concluidasHoje, metaDiariaCartinhas, podeCelebrar } from '../src/components/m31/cartinhas/cartinhaMetas.js';
import { prepararVersao } from '../worker/functions/m31Cartinhas/cartinhaConfiabilidade.js';
import { titularRef } from '../worker/functions/m31Cartinhas/cartinhaIdentidade.js';

const base = extra => ({ id:'p1', nome:'Amanda Sintética', cpf:'', tipo:'publico_geral', status_pagamento:'aprovado', estado_canonico:'confirmada', cartinha_status:'pendente', cartinha_versao:0, cartinha_historico:[], ...extra });
const evento = extra => ({ id_transacao:'evento1', motivo:'salvamento', versao:1, status:'pronta', titular_anterior:{nome:'Amanda Sintética',cpf:''}, atualizada_em:'2026-09-23T04:00:00Z', ...extra });

for (const [iso, esperado] of [
  ['2026-09-23T02:59:59Z','2026-09-22'],
  ['2026-09-23T03:00:00Z','2026-09-22'],
  ['2026-09-23T08:59:59.999Z','2026-09-22'],
  ['2026-09-23T09:00:00Z','2026-09-23'],
  ['2026-09-23T06:00:00-03:00','2026-09-23'],
  ['2026-10-01T07:00:00Z','2026-09-30'],
  ['2027-01-01T05:00:00Z','2026-12-31'],
  ['2028-03-01T07:00:00Z','2028-02-29'],
]) test(`ciclo Recife 06h: ${iso}`, () => { assert.equal(diaCartinha(iso),esperado); assert.equal(diaCartinhas(iso),esperado); });

test('virada independe do fuso configurado no dispositivo/servidor',()=>{
  const old=process.env.TZ;
  try { for(const tz of ['UTC','Asia/Tokyo','America/Los_Angeles']) { process.env.TZ=tz; assert.equal(diaCartinha('2026-09-23T08:59:00Z'),'2026-09-22'); } }
  finally { if(old===undefined)delete process.env.TZ;else process.env.TZ=old; }
});
test('próxima virada é 06h em Recife, não meia-noite',()=>{
  assert.equal(proximaViradaCartinhas('2026-09-23T08:59:59Z'),Date.parse('2026-09-23T09:00:00Z'));
  assert.equal(proximaViradaCartinhas('2026-09-23T09:00:00Z'),Date.parse('2026-09-24T09:00:00Z'));
});
test('datas sem horário e horários inválidos não inventam conclusão diária',()=>{
  for(const v of [null,'','inválido','2026-09-23'])assert.equal(diaCartinha(v),'');
  assert.equal(dataCivilValida('2026-02-30'),false);
  assert.equal(dataCivilValida('2028-02-29'),true);
});
test('29 cartas concluídas e 60 dias produzem meta 17 e progresso 2,9%',()=>{
  const r=resumoMacroCartinhas({concluidas:29,dataEvento:'2026-11-21',dia:'2026-09-22'});
  assert.deepEqual(r,{planejadas:1000,concluidas:29,restantes:971,diasRestantes:60,progresso:2.9,metaDiaria:17});
});
test('número atual de inscritas ou voluntárias não substitui as mil planejadas',()=>{
  for(const n of [0,10,464,484,1000])assert.equal(metaDiariaCartinhas({cartinha_data_evento:'2026-11-21'},29,'2026-09-22',n),17);
  assert.equal(metaDiariaCartinhas({cartinha_meta_diaria:8,cartinha_data_evento:'2026-11-21'},29,'2026-09-22'),17);
});
test('prazo ausente/inválido não apresenta meta fictícia',()=>{
  for(const d of [null,'','2026-02-30'])assert.equal(resumoMacroCartinhas({concluidas:29,dataEvento:d}).metaDiaria,null);
});
test('meta não fica negativa nem divide por zero; nunca limita novas cartas',()=>{
  assert.equal(resumoMacroCartinhas({concluidas:999,dataEvento:'2026-09-23',dia:'2026-09-23'}).metaDiaria,1);
  assert.equal(resumoMacroCartinhas({concluidas:999,dataEvento:'2026-09-22',dia:'2026-09-23'}).progresso,99.9);
  const r=resumoMacroCartinhas({concluidas:1001,dataEvento:'2026-09-23',dia:'2026-09-23'});
  assert.equal(r.metaDiaria,0);assert.equal(r.concluidas,1001);assert.equal(r.progresso,100);
});
test('histórico de madrugada é reprojetado sem mutar a data legada',()=>{
  const row=base({cartinha_dias_concluidos:['2026-09-23'],cartinha_historico:[evento()]});const antes=structuredClone(row);
  assert.deepEqual(ciclosConclusaoDaTitular(row),['2026-09-22']);
  assert.equal(concluidasHoje([row],'2026-09-23'),0);assert.equal(concluidasHoje([row],'2026-09-22'),1);assert.deepEqual(row,antes);
});
test('sem timestamp histórico não deduz horário de uma edição ou de uma data simples',()=>{
  const row=base({cartinha_status:'pronta',cartinha_atualizada_em:'2026-09-23T12:00:00Z',cartinha_dias_concluidos:['2026-09-23']});
  assert.deepEqual(ciclosConclusaoDaTitular(row),[]);
});
test('replay, entrega e edição de carta pronta não incrementam a meta',()=>{
  const row=base({cartinha_historico:[evento(),evento(),evento({id_transacao:'e2',versao:2,status:'entregue',atualizada_em:'2026-09-23T12:00:00Z'})]});
  assert.deepEqual(ciclosConclusaoDaTitular(row),['2026-09-22']);
});
test('mais de uma conclusão no mesmo ciclo conta a participante uma vez',()=>{
  const row=base({cartinha_historico:[evento(),evento({id_transacao:'e2',versao:2,status:'revisar_cartinha'}),evento({id_transacao:'e3',versao:3,atualizada_em:'2026-09-23T07:00:00Z'})]});
  assert.equal(concluidasHoje([row,row],'2026-09-22'),1);
});
test('uma nova conclusão após revisão em outro ciclo usa o novo ciclo',()=>{
  const row=base({cartinha_historico:[evento(),evento({id_transacao:'e2',versao:2,status:'revisar_cartinha'}),evento({id_transacao:'e3',versao:3,atualizada_em:'2026-09-23T10:00:00Z'})]});
  assert.deepEqual(ciclosConclusaoDaTitular(row),['2026-09-22','2026-09-23']);
});
test('voluntárias e registros descartados nunca entram na contagem diária',()=>{
  for(const extra of [{tipo:'voluntario'},{duplicada_de_id:'canonica'},{status_pagamento:'cancelado'},{classificacao_registro:'teste'}]) {
    const row=base({...extra,cartinha_historico:[evento()]});assert.deepEqual(ciclosConclusaoDaTitular(row),[]);assert.equal(concluidasHoje([row],'2026-09-22'),0);
  }
});
test('transferência e referência de outra titular não herdam conclusões anteriores',()=>{
  const row=base({cartinha_historico:[evento(),{transferencia_id:'troca',versao:1},evento({id_transacao:'e2',versao:3,titular_ref:'antiga'})]});
  assert.deepEqual(ciclosConclusaoDaTitular(row,'atual'),[]);
});
test('novas versões registram a regra de ciclo no evento durável',async()=>{
  const row=base();const ref=await titularRef(row);
  const p=prepararVersao(row,{texto:'Palavras para esta carta.',status:'pronta',suporte:'digital',titular_ref:ref},{id:'op',hash:'h'},{id:'autora',full_name:'Autora'},'2026-09-23T08:00:00Z');
  assert.equal(p.cartinha_historico.at(-1).ciclo_conclusao,'2026-09-22');assert.equal(p.cartinha_historico.at(-1).regra_ciclo,REGRA_CICLO_CARTINHAS);
  assert.deepEqual(ciclosConclusaoDaTitular({...row,...p},ref),['2026-09-22']);
});
test('celebração não ocorre em carregamento, lista vazia ou sem meta válida',()=>{
  for(const p of [{carregada:false,total:10,antes:0,agora:20,meta:17},{carregada:true,total:0,antes:0,agora:20,meta:17},{carregada:true,total:10,antes:null,agora:20,meta:17}])assert.equal(podeCelebrar(p),false);
});
test('UI usa um resumo com inteligência visual de inscritas e mantém editor estável',()=>{
  const page=readFileSync(new URL('../src/pages/M31Cartinhas.jsx',import.meta.url),'utf8');
  const hero=readFileSync(new URL('../src/components/m31/cartinhas/CartinhaHero.jsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/components/m31/cartinhas/cartinhaPainel.css',import.meta.url),'utf8');
  assert.ok(page.includes('const hoje = useCartinhaCiclo()'));assert.ok(!page.includes('<CartinhaKpis'));
  assert.ok(hero.includes('inscritas'));assert.ok(hero.includes('dias para o M31'));assert.ok(hero.includes('cartinhas feitas'));assert.ok(page.includes('setVoluntariasAberto(true)'));
  assert.ok(page.includes('inscricao={focoInscricao}'));assert.ok(css.includes('min-height: 64px'));
  assert.ok(!/#[0-9a-f]*(?:10b981|059669|16754a)/i.test(css));
});
