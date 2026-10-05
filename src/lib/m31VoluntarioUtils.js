/**
 * Helpers para o fluxo de voluntárias (M31 Servir).
 */

/**
 * Verifica se uma inscrição está confirmada (status_pagamento aprovado ou gratuito).
 * Inclui casos aprovados manualmente sem evidência financeira — para o formulário,
 * tratamos todos como confirmadas (não se cobra delas).
 */
export function isConfirmada(inscricao) {
  if (!inscricao) return false;
  return inscricao.status_pagamento === 'aprovado' || inscricao.status_pagamento === 'gratuito';
}

/**
 * Verifica se uma inscrição está confirmada COM evidência financeira real.
 * Exclui casos aprovados manualmente sem origem_pagamento nem pagamento_confirmado_em.
 */
export function isConfirmadaComEvidencia(inscricao) {
  if (!isConfirmada(inscricao)) return false;
  if (inscricao.status_pagamento === 'gratuito' || inscricao.origem_inscricao === 'CORTESIA') return true;
  const temOrigem = inscricao.origem_pagamento && inscricao.origem_pagamento !== 'desconhecida';
  const temDataConfirmacao = !!inscricao.pagamento_confirmado_em;
  return temOrigem || temDataConfirmacao;
}

/**
 * Verifica se a inscrição confirmada está sem evidência financeira
 * (caso das 23 voluntárias aprovadas manualmente sem origem rastreável).
 */
export function isConfirmadaSemEvidencia(inscricao) {
  return isConfirmada(inscricao) && !isConfirmadaComEvidencia(inscricao);
}

/**
 * Extrai dados do perfil de voluntária a partir do campo observacoes (JSON serializado).
 */
export function parseVoluntarioData(voluntario) {
  if (!voluntario) return {};
  try {
    return JSON.parse(voluntario.observacoes || '{}');
  } catch {
    return {};
  }
}