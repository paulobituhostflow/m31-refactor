/** Regras puras compartilhadas por backend e UI. Sem banco, IA ou fuso do aparelho. */
import { ehInscritaDaMeta } from './cartinhaPadrao.js';

export const FUSO_CARTINHAS = 'America/Recife';
export const HORA_VIRADA_CARTINHAS = 6;
export const REGRA_CICLO_CARTINHAS = 'recife_06h_v1';
export const META_PLANEJADA_CARTINHAS = 1000;
const DIA_MS = 86400000;
const RELOGIO = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_CARTINHAS, calendar: 'gregory', numberingSystem: 'latn',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function instante(value) {
  if (value === null || value === '' || value === undefined) return null;
  // Datas sem horário não provam quando uma cartinha foi concluída.
  if (typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  // Timestamps de servidor sem sufixo são UTC, nunca horário local do dispositivo.
  const normalized = typeof value === 'string' && !/(Z|[+-]\d{2}:?\d{2})$/i.test(value) ? `${value}Z` : value;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}
function partes(date) {
  return Object.fromEntries(RELOGIO.formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
}
export function diaCartinha(value = new Date()) {
  const date = instante(value);
  if (!date) return '';
  const p = partes(date);
  return new Date(Date.UTC(p.year, p.month - 1, p.day - (p.hour < HORA_VIRADA_CARTINHAS ? 1 : 0), 12)).toISOString().slice(0, 10);
}
export function proximaViradaCartinhas(value = new Date()) {
  const date = instante(value);
  if (!date) return null;
  const p = partes(date);
  const alvoLocal = Date.UTC(p.year, p.month - 1, p.day + (p.hour >= HORA_VIRADA_CARTINHAS ? 1 : 0), HORA_VIRADA_CARTINHAS);
  let utc = alvoLocal;
  // Converte o horário civil de Recife em instante, sem fixar um offset no código.
  for (let i = 0; i < 3; i++) {
    const a = partes(new Date(utc));
    const observado = Date.UTC(a.year, a.month - 1, a.day, a.hour, a.minute, a.second);
    const delta = alvoLocal - observado;
    utc += delta;
    if (delta === 0) break;
  }
  return utc;
}
export function dataCivilValida(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function diasRestantesCartinhas(dataEvento, dia = diaCartinha()) {
  if (!dataCivilValida(dataEvento) || !dataCivilValida(dia)) return null;
  return Math.max(0, Math.round((Date.parse(`${dataEvento}T12:00:00Z`) - Date.parse(`${dia}T12:00:00Z`)) / DIA_MS));
}
const quantidade = n => Number.isSafeInteger(n) && n >= 0 ? n : 0;
export function resumoMacroCartinhas({ concluidas = 0, dataEvento, dia = diaCartinha() } = {}) {
  const total = quantidade(concluidas);
  const restantes = Math.max(0, META_PLANEJADA_CARTINHAS - total);
  const dias = diasRestantesCartinhas(dataEvento, dia);
  return {
    planejadas: META_PLANEJADA_CARTINHAS, concluidas: total, restantes, diasRestantes: dias,
    progresso: Math.min(100, Math.round((total / META_PLANEJADA_CARTINHAS) * 1000) / 10),
    metaDiaria: dias === null ? null : Math.ceil(restantes / Math.max(1, dias)),
  };
}

const nome = v => String(v || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
const cpf = v => String(v || '').replace(/\D/g, '');
const transferencia = e => !!e.transferencia_id || ['titular_alterada', 'vinculo_anterior_requer_revisao'].includes(e.motivo);
const estadoFinal = status => status === 'pronta' || status === 'entregue';

/**
 * Reprojeta conclusões históricas pelo timestamp REAL, sem regravar cartas ou eventos.
 * Datas antigas YYYY-MM-DD, isoladas, não permitem corrigir uma virada às 06h.
 * Eventos da antiga titular e snapshots de edição/entrega não geram novas conclusões.
 */
export function ciclosConclusaoDaTitular(row, referenciaAtual = '') {
  if (!ehInscritaDaMeta(row) || row.duplicada_de_id || row.status_pagamento === 'cancelado' || row.classificacao_registro === 'teste') return [];
  const history = Array.isArray(row.cartinha_historico) ? row.cartinha_historico : [];
  const entries = history.filter(e => e && typeof e === 'object').map((e, index) => ({ e, index }))
    .sort((a, b) => (Number.isSafeInteger(a.e.versao) ? a.e.versao : a.index) - (Number.isSafeInteger(b.e.versao) ? b.e.versao : b.index) || a.index - b.index);
  const ultimaTransferencia = entries.reduce((last, item, index) => transferencia(item.e) ? index : last, -1);
  const dias = new Set(), operacoes = new Set();
  const anuladas = new Set(entries.map(({e}) => e?.motivo === 'redirecionamento_conhecida' ? e.anula_id_transacao : null).filter(Boolean));
  let anterior = null;
  for (const { e } of entries.slice(ultimaTransferencia + 1)) {
    if (e.id_transacao && anuladas.has(e.id_transacao)) continue;
    const id = e.id_transacao;
    if (id && operacoes.has(id)) continue;
    if (id) operacoes.add(id);
    if (e.tipo_destinataria && e.tipo_destinataria !== 'inscrita') continue;
    if (e.inscricao_id && e.inscricao_id !== row.id) continue;
    const titular = e.titular_anterior;
    const mesma = referenciaAtual && e.titular_ref
      ? e.titular_ref === referenciaAtual
      : !!titular && nome(titular.nome) === nome(row.nome) && cpf(titular.cpf) === cpf(row.cpf);
    if (!mesma) continue;
    // Registros novos só contam com confirmação explícita. O fallback abaixo existe
    // exclusivamente para histórico legado criado antes da flag conclusao_explicita.
    // Eventos técnicos/chat/importação não entram implicitamente na meta.
    const legadoAuditavel = e.conclusao_explicita === undefined && !!id && !e.origem && !e.lote_id &&
      ['salvamento', 'conclusao_fisica'].includes(e.motivo) && e.status === 'pronta' && !estadoFinal(anterior);
    const confirmou = e.conclusao_explicita === true || legadoAuditavel;
    if (confirmou && e.status === 'pronta') {
      const dia = diaCartinha(e.atualizada_em);
      if (dia) dias.add(dia);
    }
    // Um snapshot pode informar o estado anterior, mas nunca a hora de conclusão.
    if (typeof e.status === 'string') anterior = e.status;
  }
  return [...dias].sort();
}
