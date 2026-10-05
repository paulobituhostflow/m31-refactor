const safeJson = (value) => {
  try { return value ? JSON.parse(value) : {}; } catch { return {}; }
};

const label = (value) => String(value || '').trim();

export function formatStockMovement(record = {}) {
  const before = safeJson(record.dados_anteriores);
  const after = safeJson(record.dados_novos);
  const isEntry = String(record.acao || '').toLowerCase().includes('recebeu estoque');
  const isAdjustment = String(record.acao || '').toLowerCase().includes('ajustou estoque');
  const firstItem = Array.isArray(after.itens) ? after.itens[0] : null;
  const entity = label(record.entidade_nome);
  const product = firstItem
    ? [firstItem.modelo, firstItem.cor, firstItem.tamanho].filter(Boolean).join(' · ')
    : entity;
  const movement = firstItem
    ? `+${firstItem.quantidade} unidade${Number(firstItem.quantidade) === 1 ? '' : 's'}`
    : isAdjustment && before.anterior != null && before.novo != null
      ? `${before.anterior} → ${before.novo}`
      : label(record.acao) || 'Movimentação';
  return {
    tipo: isEntry ? 'Entrada' : isAdjustment ? 'Ajuste' : /entreg/i.test(record.acao || '') ? 'Entrega' : /sa[ií]d/i.test(record.acao || '') ? 'Saída' : label(record.acao) || 'Movimentação',
    produto: product || 'Estoque',
    movimento: movement,
    motivo: label(before.motivo) || label(after.motivo),
    fornecedor: label(after.fornecedor) || label(record.fornecedor),
    responsavel: label(record.user_nome) || label(record.user_email) || 'Operador',
    dataHora: record.created_date || record.updated_date || null,
  };
}
