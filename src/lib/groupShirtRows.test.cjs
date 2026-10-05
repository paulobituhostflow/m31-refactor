const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'groupShirtRows.js'), 'utf8')
  .replace('export function', 'function')
  + '\nglobalThis.groupShirtRows = groupShirtRows;';
const context = vm.createContext({});
vm.runInContext(source, context);

test('agrupa todos os itens pelo identificador real do pedido', () => {
  const groups = context.groupShirtRows([
    { row_id: 'pedido:p1:0', registro_tipo: 'pedido_camisa', registro_id: 'p1', nome: 'Ana', modelo: 'milagres', tamanho: 'XGG' },
    { row_id: 'pedido:p1:1', registro_tipo: 'pedido_camisa', registro_id: 'p1', nome: 'Ana', modelo: 'filhas', tamanho: 'XGG' },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].quantidade, 2);
  assert.match(groups[0].resumo_itens, /milagres · XGG/);
  assert.match(groups[0].resumo_itens, /filhas · XGG/);
});

test('não mistura duas compras diferentes da mesma cliente', () => {
  const groups = context.groupShirtRows([
    { row_id: 'pedido:p1:0', registro_tipo: 'pedido_camisa', registro_id: 'p1', nome: 'Ana', modelo: 'milagres', tamanho: 'XGG' },
    { row_id: 'pedido:p2:0', registro_tipo: 'pedido_camisa', registro_id: 'p2', nome: 'Ana', modelo: 'filhas', tamanho: 'G' },
  ]);
  assert.equal(groups.length, 2);
});

test('soma quantidade maior que um sem duplicar o valor do item', () => {
  const groups = context.groupShirtRows([
    { row_id: 'pedido:p3:0', registro_tipo: 'pedido_camisa', registro_id: 'p3', nome: 'Maria', modelo: 'jesus', cor: 'cereja', tamanho: 'P', quantidade_item: 2 },
    { row_id: 'pedido:p3:1', registro_tipo: 'pedido_camisa', registro_id: 'p3', nome: 'Maria', modelo: 'filhas', tamanho: 'M', quantidade_item: 1 },
  ]);
  assert.equal(groups[0].quantidade, 3);
  assert.match(groups[0].resumo_itens, /Jesus|jesus/);
});
