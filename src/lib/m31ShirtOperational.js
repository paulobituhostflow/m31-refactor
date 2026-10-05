function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\D/g, (character) => (/[a-z]/.test(character) ? character : ''));
}

export function filterOperationalShirts(rows = [], { filter = 'precisa_acao', search = '' } = {}) {
  const term = normalize(search);
  return rows.filter((row) => {
    const matchesSearch = !term || normalize(`${row.nome} ${row.whatsapp} ${row.modelo} ${row.cor} ${row.tamanho} ${row.numero_pedido != null ? `#M31${String(row.numero_pedido).padStart(3, '0')} ${String(row.numero_pedido).padStart(3, '0')} ${row.numero_pedido}` : ''}`).includes(term);
    if (!matchesSearch) return false;
    if (filter === 'todas') return true;
    if (filter === 'pagas') return row.pagamento_status === 'pago';
    if (filter === 'a_entregar') return row.situacao === 'a_entregar';
    if (filter === 'entregues') return row.situacao === 'entregue';
    if (filter === 'sem_tamanho') return row.situacao === 'sem_tamanho';
    return row.situacao !== 'entregue' && !['substituido', 'cancelado', 'estornado', 'vencido'].includes(row.pagamento_status);
  });
}
