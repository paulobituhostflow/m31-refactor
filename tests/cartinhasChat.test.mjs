import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { candidataChat } from '../worker/functions/m31Cartinhas/cartinhaChat.js';

const base={id:'p1',tipo:'publico_geral',nome:'Maria Teste',estado_canonico:'confirmada',status_pagamento:'aprovado',cartinha_status:'pendente',cartinha_texto:'',cartinha_versao:0};
test('chat nunca sorteia voluntária, conhecida, duplicada ou participante com carta',()=>{
  assert.equal(candidataChat({...base,tipo:'voluntario'}),false);
  assert.equal(candidataChat({...base,cartinha_conhecida_da_ju:true}),false);
  assert.equal(candidataChat({...base,duplicada_de_id:'x'}),false);
  assert.equal(candidataChat({...base,cartinha_texto:'já existe'}),false);
});
test('filtros do chat excluem comunidade e caravanas no backend',()=>{
  assert.equal(candidataChat({...base,como_conheceu:'Comunidade Mulheres de Fé'},{excluir_comunidade:true}),false);
  assert.equal(candidataChat({...base,tipo:'caravana',caravana_nome:'Caravana A'},{excluir_caravanas:true}),false);
  assert.equal(candidataChat(base,{excluir_comunidade:true,excluir_caravanas:true}),true);
});
test('interface é React web e mantém UI otimista sem afirmar entrega antes do servidor',()=>{
  const ui=readFileSync(new URL('../src/components/m31/cartinhas/CartinhaChat.jsx',import.meta.url),'utf8');
  assert.ok(ui.includes("status:'enviando'"));
  assert.ok(ui.includes('Não enviado'));
  assert.ok(ui.includes('Conheço ela'));
  assert.ok(ui.includes('SpeechRecognition'));
  assert.equal(/react-native|MotiView|TouchableOpacity|ScrollView/.test(ui),false);
});
test('chat preserva trava administrativa de distribuição',()=>{
  const backend=readFileSync(new URL('../worker/functions/m31Cartinhas/cartinhaChat.js',import.meta.url),'utf8');
  assert.ok(backend.includes("cartinha_lote_liberado !== true"));
  assert.ok(backend.includes('id_transacao'));
  assert.ok(backend.includes('CINCO_MIN'));
});
