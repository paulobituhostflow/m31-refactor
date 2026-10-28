// Only merge the server's successful save response. Never invent a confirmation.
export function mergeGestaoSavedList(data, inscricao, filtro) {
  if (!data?.items?.some(row => row.id === inscricao.id)) return data;
  const old = data.items.find(row => row.id === inscricao.id);
  const next = { ...old, ...inscricao };
  // O vínculo explícito do presente não é alterado pelas ações cadastrais da ficha.
  if (old.presente && !inscricao.presente && old.presenteado_por_id === inscricao.presenteado_por_id) {
    next.presente = old.presente;
    next.tipo_ingresso = 'presenteada';
  }
  const selected = data.filtros_aplicados || {};
  const confirmed = inscricao.participacao?.confirmed === true;
  const remove = (filtro === 'confirmadas' && !confirmed)
    || (filtro === 'aguardando_confirmacao' && confirmed)
    || (selected.caravana_id && (selected.caravana_id === 'sem_caravana' ? Boolean(next.caravana_id) : next.caravana_id !== selected.caravana_id))
    || (selected.tipo_ingresso && next.tipo_ingresso !== selected.tipo_ingresso);
  return {
    ...data,
    items: remove ? data.items.filter(row => row.id !== inscricao.id)
      : data.items.map(row => row.id === inscricao.id ? next : row),
    ...(remove ? {
      total: Math.max(0, data.total - 1),
      next_cursor: data.next_cursor == null ? null : Math.max(0, data.next_cursor - 1),
    } : {}),
  };
}
