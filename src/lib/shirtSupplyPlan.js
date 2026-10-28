const SIZES = ['PP', 'P', 'M', 'G', 'GG', 'XGG'];
const COMBOS = [
  { modelo: 'jesus', cor: 'cereja', nome: 'Jesus Cereja' },
  { modelo: 'filhas', cor: '', nome: 'Filhas — branca com bordô' },
  { modelo: 'milagres', cor: '', nome: 'Milagres — carmim' },
  { modelo: 'jesus', cor: 'preta', nome: 'Jesus Preta' },
];
const quantity = value => Math.max(0, Math.floor(Number(value) || 0));
const key = item => `${item.modelo}:${item.cor || ''}:${item.tamanho}`;

export function buildShirtSupplyPlan(inventory = [], encomendas = []) {
  const outstanding = new Map();
  for (const order of encomendas) {
    if (!['encomendado', 'parcial'].includes(order.status)) continue;
    const received = new Map();
    for (const item of order.quantidades_recebidas || []) received.set(key(item), (received.get(key(item)) || 0) + quantity(item.quantidade));
    const ordered = new Map();
    for (const item of order.quantidades || []) ordered.set(key(item), (ordered.get(key(item)) || 0) + quantity(item.quantidade));
    for (const [id, count] of ordered) outstanding.set(id, (outstanding.get(id) || 0) + Math.max(0, count - (received.get(id) || 0)));
  }
  const rows = COMBOS.map(combo => {
    const stock = inventory.find(item => item.modelo === combo.modelo && (item.cor || '') === combo.cor);
    const tamanhos = Object.fromEntries(SIZES.map(tamanho => {
      const info = stock?.tamanhos?.[tamanho] || {};
      const aReceber = outstanding.get(key({ ...combo, tamanho })) || 0;
      const recebido = quantity(info.recebido);
      const demanda = quantity(info.demanda);
      return [tamanho, { aReceber, recebido, demanda, reservado: quantity(info.reservadas), entregue: quantity(info.entregues), complementar: Math.max(0, demanda - recebido - aReceber) }];
    }));
    return { ...combo, id: `${combo.modelo}:${combo.cor}`, tamanhos };
  });
  const faltas = rows.flatMap(row => SIZES.filter(size => row.tamanhos[size].complementar > 0).map(tamanho => ({ nome: row.nome, tamanho, quantidade: row.tamanhos[tamanho].complementar })));
  const sum = field => rows.reduce((total, row) => total + SIZES.reduce((subtotal, size) => subtotal + row.tamanhos[size][field], 0), 0);
  return { rows, tamanhos: SIZES, faltas, aReceber: sum('aReceber'), recebido: sum('recebido'), demanda: sum('demanda'), complementar: sum('complementar') };
}

export function formatShirtReplenishment(faltas = []) {
  return ['*M31 FILHAS — COMPLEMENTO DO PEDIDO*', ...faltas.map(item => `${item.nome} — ${item.tamanho}: ${item.quantidade}`), 'Quantidades adicionais necessárias para cobrir as vendas confirmadas.'].join('\n');
}
