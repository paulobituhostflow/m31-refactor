import { TOKENS } from '@/lib/m31DesignTokens';

// ── TOKENS (Light Executive) ────────────────────────────────────
export const C = {
  bg0: TOKENS.background, bg1: TOKENS.surface, bg2: TOKENS.surfaceSubtle, bg3: TOKENS.surfaceHover, bg4: TOKENS.surfaceSubtle,
  text: TOKENS.text, textSec: TOKENS.textMuted, textTer: TOKENS.textSubtle,
  border: TOKENS.border, borderSt: TOKENS.borderStrong,
  brand: TOKENS.primary, brandHov: TOKENS.primaryHover,
  success: TOKENS.success, successSoft: TOKENS.successSoft,
  warning: TOKENS.warning, warningSoft: TOKENS.warningSoft,
  danger:  TOKENS.danger, dangerSoft:  TOKENS.dangerSoft,
  info:    TOKENS.info, infoSoft:    TOKENS.infoSoft,
  onPrimary: TOKENS.onPrimary,
};

export const STATUS_CFG = {
  aprovado:            { label: 'Confirmado',      color: C.success },
  gratuito:            { label: 'Gratuito',        color: C.success },
  pendente:            { label: 'Pendente',        color: C.warning },
  checkout_pendente:   { label: 'Checkout',        color: C.info    },
  checkout_abandonado: { label: 'Abandonado',      color: C.danger  },
  cancelado:           { label: 'Cancelado',       color: C.textTer },
};

export const fmtBRL = n => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const normalizeName = (s = '') => {
  if (!s) return s;
  return s.trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/(^\w|\s\w)/g, m => m.toUpperCase());
};

// Remove prefixo "Caravana " e normaliza para comparação
const stripCaravana = (s = '') =>
  s.toLowerCase().trim()
   .replace(/^caravana\s+/i, '')  // remove prefixo
   .replace(/[^a-z0-9\u00c0-\u024f]/gi, ' ') // normaliza acentos/símbolos
   .replace(/\s+/g, ' ')
   .trim();

// Levenshtein similarity score 0-1 — compara nomes sem prefixo
export function stringSimilarity(a, b) {
  a = stripCaravana(a);
  b = stripCaravana(b);
  if (a === b) return 1;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1;
  const editDistance = levenshtein(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i - 1] === a[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
    }
  }
  return matrix[b.length][a.length];
}

export const isConfirmado = m => ['aprovado', 'gratuito'].includes(m.status_pagamento);
export const isPendente   = m => ['pendente', 'checkout_pendente'].includes(m.status_pagamento);