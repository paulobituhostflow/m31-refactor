/**
 * Utilitário centralizado de datas — Fuso: America/Recife (UTC-3)
 * Nunca use new Date().toLocaleString() sem timezone explícito.
 */

const TZ = 'America/Recife';
const LOCALE = 'pt-BR';

/**
 * Formata data: 07/05/2026
 */
export function formatDateBR(date) {
  if (!date) return '—';
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date));
}

/**
 * Formata data + hora: 07/05/2026 19:05
 */
export function formatDateTimeBR(date) {
  if (!date) return '—';
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

/**
 * Formata só hora: 19:05
 */
export function formatTimeBR(date) {
  if (!date) return '—';
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

/**
 * Formata data abreviada: 07/05
 */
export function formatDateShortBR(date) {
  if (!date) return '—';
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(date));
}

/**
 * Tempo relativo em português: "há 3h", "há 2 dias"
 * Baseado no fuso America/Recife para cálculo correto do "hoje"
 */
export function relativeTimeBR(date) {
  if (!date) return '—';
  const diff = Date.now() - new Date(date).getTime();
  if (diff < 0) return 'agora';
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d > 1 ? 's' : ''}`;
}

/**
 * Retorna hora atual em America/Recife (0–23)
 */
export function getCurrentHourBR() {
  const now = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    hour: 'numeric',
    hour12: false,
  }).format(new Date());
  return parseInt(now, 10);
}

/**
 * Retorna "hoje" em string no fuso Recife (para comparar datas)
 * Formato: "2026-05-07"
 */
export function getTodayStringBR() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ,
  }).format(new Date());
}

/**
 * Retorna próximo disparo baseado no horário atual em Recife
 */
export function getProximoDisparoBR() {
  const h = getCurrentHourBR();
  if (h < 9) return '09:00 de hoje';
  if (h < 18) return '18:00 de hoje';
  return '09:00 de amanhã';
}

/**
 * Badge discreto de timezone para exibir no rodapé/cabeçalho
 */
export const TIMEZONE_BADGE = 'Horário local • UTC-3';