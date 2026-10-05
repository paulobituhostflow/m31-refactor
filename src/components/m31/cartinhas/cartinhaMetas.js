import { ehInscritaDaMeta } from '../../../../worker/functions/m31Cartinhas/cartinhaPadrao.js';
import { diaCartinha, resumoMacroCartinhas, ciclosConclusaoDaTitular, REGRA_CICLO_CARTINHAS } from '../../../../worker/functions/m31Cartinhas/cartinhaCiclo.js';
export { META_PLANEJADA_CARTINHAS, resumoMacroCartinhas, proximaViradaCartinhas } from '../../../../worker/functions/m31Cartinhas/cartinhaCiclo.js';
export const diaCartinhas = diaCartinha;

// A meta macro usa SEMPRE 1000. Quantidade de inscritas/voluntárias e a antiga
// meta manual não entram na fórmula. Não cria cadastros nem bloqueia a escrita.
export function metaDiariaCartinhas(config, feitas, hoje = diaCartinhas()) {
  return resumoMacroCartinhas({ concluidas: feitas, dataEvento: config?.cartinha_data_evento, dia: hoje }).metaDiaria;
}
export function normalizarBuscaCartinha(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
export function concluidasHoje(rows, dia = diaCartinhas()) {
  const ids = new Set();
  for (const row of rows || []) {
    if (!row?.id || !ehInscritaDaMeta(row) || row.duplicada_de_id || row.status_pagamento === 'cancelado') continue;
    const ciclos = row.cartinha_ciclo_regra === REGRA_CICLO_CARTINHAS
      ? row.cartinha_dias_concluidos || [] : ciclosConclusaoDaTitular(row, row.titular_ref || '');
    if (ciclos.includes(dia)) ids.add(row.id);
  }
  return ids.size;
}
export const podeCelebrar = ({ carregada, total, antes, agora, meta }) => carregada && total > 0 && Number.isFinite(meta) && meta > 0 && Number.isFinite(antes) && antes < meta && agora >= meta;
