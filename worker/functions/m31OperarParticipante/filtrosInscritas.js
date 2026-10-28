export const TIPOS_INGRESSO = Object.freeze({ individual: 'Individual', presenteada: 'Presenteada', caravana: 'Caravana', cortesia: 'Cortesia', voluntaria: 'Voluntária', doacao: 'Doação' });

export function tipoIngresso(row, giftIds = new Set()) {
  if (row.presente || row.presenteado_por_id || row.cadastro_pendente || String(row.codigo_inscricao || '').startsWith('M31-PRESENTE-') || giftIds.has(row.id)) return 'presenteada';
  if (String(row.origem_inscricao || '').toUpperCase() === 'CORTESIA') return 'cortesia';
  if (row.tipo === 'voluntario') return 'voluntaria';
  if (row.caravana_id || row.tipo === 'caravana') return 'caravana';
  return row.tipo === 'doacao' ? 'doacao' : 'individual';
}

export function filtrarInscritas(rows, { caravana_id = '', tipo_ingresso = '' } = {}) {
  return rows.filter(row => (!caravana_id || (caravana_id === 'sem_caravana' ? !row.caravana_id : row.caravana_id === caravana_id))
    && (!tipo_ingresso || row.tipo_ingresso === tipo_ingresso));
}

export function opcoesInscritas(rows, caravanas = []) {
  const names = new Map(caravanas.map(row => [row.id, row.nome]));
  const selected = new Map();
  for (const row of rows) if (row.caravana_id && !selected.has(row.caravana_id)) selected.set(row.caravana_id,
    { id: row.caravana_id, nome: names.get(row.caravana_id) || row.caravana_nome || 'Caravana sem nome' });
  return { caravanas: [...selected.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base', numeric: true })),
    tipos: Object.entries(TIPOS_INGRESSO).filter(([key]) => rows.some(row => row.tipo_ingresso === key)).map(([id, nome]) => ({ id, nome })) };
}
