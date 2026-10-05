import assert from 'node:assert/strict';
import test from 'node:test';
import { formatStockMovement } from './stockMovement.js';

test('formats an entry with product, quantity, supplier, operator and timestamp', () => {
  const movement = formatStockMovement({
    acao: 'Recebeu estoque de camisas', entidade_nome: 'Jesus preta M', user_nome: 'Dulce', created_date: '2026-09-30T17:32:00.000Z',
    dados_novos: JSON.stringify({ itens: [{ modelo: 'jesus', cor: 'preta', tamanho: 'M', quantidade: 20 }], fornecedor: 'Malharia X' }),
  });
  assert.deepEqual(movement, { tipo: 'Entrada', produto: 'jesus · preta · M', movimento: '+20 unidades', motivo: '', fornecedor: 'Malharia X', responsavel: 'Dulce', dataHora: '2026-09-30T17:32:00.000Z' });
});

test('formats an adjustment with before/after and reason', () => {
  const movement = formatStockMovement({
    acao: 'Ajustou estoque físico de camisa', entidade_nome: 'jesus · preta · M', user_email: 'dulce@example.com', created_date: '2026-09-30T19:10:00.000Z',
    dados_anteriores: JSON.stringify({ anterior: 18, novo: 17, motivo: 'Contagem física' }),
  });
  assert.deepEqual(movement, { tipo: 'Ajuste', produto: 'jesus · preta · M', movimento: '18 → 17', motivo: 'Contagem física', fornecedor: '', responsavel: 'dulce@example.com', dataHora: '2026-09-30T19:10:00.000Z' });
});
