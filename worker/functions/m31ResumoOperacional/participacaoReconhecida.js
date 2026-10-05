/**
 * Predicado puro extraído de src/lib/m31Metrics.js sem mudar seu critério.
 * Compartilhado pelo painel e pelas Cartinhas: reconhecer participação não
 * confirma pagamento nem altera estado_canonico. Sem SDK ou dependência externa.
 */
export function estadoReconhecimento(inscricao) {
  if (inscricao.estado_canonico) return inscricao.estado_canonico;
  if (['aprovado', 'gratuito'].includes(inscricao.status_pagamento)) return 'revisar';
  if (inscricao.status_pagamento === 'cancelado') return 'fora_do_universo';
  return 'pendente';
}

export function ehInscritaReconhecida(i) {
  if (i.duplicada_de_id || i.classificacao_registro === 'teste') return false;
  if (!['publico_geral', 'caravana'].includes(i.tipo) || estadoReconhecimento(i) === 'fora_do_universo' || i.status_pagamento === 'cancelado') return false;
  if (['confirmada', 'isenta'].includes(estadoReconhecimento(i))) return true;
  if (['aprovado', 'gratuito'].includes(i.status_pagamento)) return true;
  const noGrupo = i.entrou_no_grupo === true || !!i.data_entrada_grupo || !!i.entrou_no_grupo_em;
  const origemReconhecida = ['IMPORTACAO_MANUAL', 'IMPORTACAO', 'ASAAS', 'MERCADO_PAGO'].includes(String(i.origem_inscricao || '').toUpperCase()) || ['importacao', 'gratuidade', 'asaas', 'mercado_pago'].includes(i.origem_pagamento);
  return noGrupo && origemReconhecida;
}
