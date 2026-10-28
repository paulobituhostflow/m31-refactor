import { ehInscritaReconhecida } from './participacaoReconhecida.js';

export function inscritaDaLista(row) {
  if (!row || !['publico_geral','caravana'].includes(row.tipo) || row.duplicada_de_id || row.classificacao_registro === 'teste' || row.status_pagamento === 'cancelado' || row.estado_canonico === 'fora_do_universo') return false;
  return ehInscritaReconhecida(row) || (row.origem_inscricao === 'MANUAL' && row.status_pagamento === 'pendente') || row.conferida_manualmente === true;
}

export function participacaoStatus(row) {
  const state = row?.status_inscricao ?? row?.estado_canonico;
  const excluded = !row || ['fora_do_universo', 'cancelada', 'cancelado'].includes(state)
    || row.status_pagamento === 'cancelado' || Boolean(row.duplicada_de_id)
    || row.classificacao_registro === 'teste' || row.is_sample === true;
  if (excluded) return { confirmed: false, manual: false, tone: 'inactive', label: row?.status_pagamento === 'cancelado' ? 'Inscrição cancelada' : 'Participação indisponível' };
  const manual = (row.conferencia?.conferida ?? row.conferida_manualmente) === true;
  const confirmed = manual || ['confirmada', 'isenta'].includes(state);
  return { confirmed, manual, tone: confirmed ? 'confirmed' : 'pending', label: confirmed ? 'Participação confirmada' : 'Aguardando confirmação' };
}
