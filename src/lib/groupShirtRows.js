function canonicalOrderKey(row) {
  const candidates = [
    ['pedido', row.pedido_id],
    ['pedido', row.order_id],
    ['compra', row.compra_id],
    ['pagamento', row.payment_reference],
    ['asaas', row.asaas_payment_id],
    ['referencia', row.external_reference],
  ];
  if (row.numero_pedido != null) return `pedido-numero:${row.numero_pedido}`;
  if (row.registro_tipo === 'pedido_camisa' && row.registro_id) return `pedido-id:${row.registro_id}`;
  const [prefix, value] = candidates.find(([, candidate]) => candidate != null && String(candidate).trim()) || [];
  return value != null ? `${prefix}:${String(value).trim()}` : `linha:${row.row_id}`;
}

function formatItem(item) {
  const modelo = [item.modelo, item.cor, item.tamanho || 'sem tamanho'].filter(Boolean).join(' · ');
  const quantidade = Number(item.quantidade_item || item.quantidade || 1);
  return quantidade > 1 ? `${modelo} × ${quantidade}` : modelo;
}

export function groupShirtRows(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const key = canonicalOrderKey(row);
    const current = groups.get(key);
    if (current) {
      current.itens.push(row);
      continue;
    }
    groups.set(key, { ...row, row_id: `grupo:${key}`, itens: [row], chave_pedido: key });
  }
  return [...groups.values()].map((group) => {
    const quantidade = group.itens.reduce((total, item) => total + Number(item.quantidade_item || item.quantidade || 1), 0);
    return {
      ...group,
      quantidade,
      resumo_itens: group.itens.map(formatItem).join(' / '),
      telefones: [...new Set(group.itens.map((item) => item.whatsapp).filter(Boolean))],
      todos_entregues: group.itens.every((item) => item.entregue),
      agrupado_por_cliente: false,
    };
  });
}
