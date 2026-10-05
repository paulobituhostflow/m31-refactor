/**
 * m31DesignTokens — Design System M31
 *
 * UM sistema: light + bordô #8B1A2B.
 * Inter única na UI. JetBrains Mono só para código/ID técnico.
 * Pesos: 400/500/600/700. Tamanhos: 11–40 sem meio-pixel.
 * Sem dark mode. Sem arco-íris (só bordô + 3 semânticos).
 */

export const TOKENS = {
  // ── Fundos ──────────────────────────────────────────────
  background:      '#EAEDF1',   // cinza profundo e frio — contraste real com cards brancos
  surface:         '#FFFFFF',   // cards, painéis, tabelas (branco puro)
  surfaceElevated: '#FFFFFF',   // modais, dropdowns
  surfaceHover:    '#F4F4F5',   // hover sutil (zinc-100)
  surfaceSubtle:   '#F9FAFB',   // áreas secundárias, cabeçalhos de tabela (zinc-50)

  // ── Bordas ──────────────────────────────────────────────
  border:       '#E4E7EB',   // zinc-200 — borda milimétrica de card
  borderStrong: '#D1D5DB',   // zinc-300 — borda de input/hover
  borderSubtle: '#F0F0F1',   // divisórias internas sutis

  // ── Texto ───────────────────────────────────────────────
  text:       '#2A1F1F',   // ink — texto primário
  textMuted:  '#6B5E5E',   // texto secundário (neutro quente)
  textSubtle: '#9A8C8C',   // texto terciário / labels uppercase

  // ── Marca — Bordô oficial #8B1A2B ──────────────────────
  primary:      '#8B1A2B',
  primaryHover: '#6B1422',
  primarySoft:  'rgba(139,26,43,0.08)',
  onPrimary:    '#FFFFFF',

  // ── Status (3 semânticos sólidos) ───────────────────────
  success:     '#16A34A',
  successSoft: 'rgba(22,163,74,0.10)',
  warning:     '#D97706',
  warningSoft: 'rgba(217,119,6,0.10)',
  danger:      '#DC2626',
  dangerSoft:  'rgba(220,38,38,0.10)',

  // ── Paleta Categórica (para distinção visual de dados) ──
  // Solids para dots/badges/charts — NÃO para gradientes decorativos.
  palette: {
    gray:   { solid: '#6B5E5E', soft: '#EDE7E0', text: '#4A3F3F' },
    bordo:  { solid: '#8B1A2B', soft: '#F6E9EC', text: '#6B1422' },
    green:  { solid: '#16A34A', soft: '#DCFCE7', text: '#15803D' },
    amber:  { solid: '#D97706', soft: '#FEF3C7', text: '#B45309' },
    red:    { solid: '#DC2626', soft: '#FEE2E2', text: '#B91C1C' },
    blue:   { solid: '#2563EB', soft: '#DBEAFE', text: '#1D4ED8' },
    purple: { solid: '#7C3AED', soft: '#EDE9FE', text: '#6D28D9' },
    teal:   { solid: '#0D9488', soft: '#CCFBF1', text: '#0F766E' },
    orange: { solid: '#EA580C', soft: '#FED7AA', text: '#C2410C' },
    pink:   { solid: '#9D174D', soft: '#FCE7F3', text: '#9D174D' },
  },

  // ── Sombras (mínimas — contraste vem da borda, não da sombra) ──
  shadow:   '0 1px 2px rgba(0,0,0,0.03)',
  shadowSm: '0 1px 2px rgba(0,0,0,0.03)',
  shadowMd: '0 1px 3px rgba(0,0,0,0.04)',
  shadowLg: '0 2px 8px rgba(0,0,0,0.06)',

  // ── Raios (escala fixa) ─────────────────────────────────
  radius: {
    sm:   '6px',       // checkboxes, switches, tags compactas
    md:   '8px',       // inputs, botões (control)
    lg:   '12px',      // cards, painéis, drawers (card)
    pill: '9999px',    // badges de status, avatars
  },

  // ── Tipografia ──────────────────────────────────────────
  font: {
    body: "'Inter', system-ui, sans-serif",
    mono: "'JetBrains Mono', monospace",
  },

  // ── Escala Tipográfica (11–40, sem meio-pixel) ─────────
  typography: {
    display: { fontSize: '40px', fontWeight: '700', lineHeight: '48px' },
    h1:      { fontSize: '24px', fontWeight: '600', lineHeight: '30px' },
    h2:      { fontSize: '18px', fontWeight: '600', lineHeight: '24px' },
    title:   { fontSize: '15px', fontWeight: '600', lineHeight: '22px' },
    body:    { fontSize: '14px', fontWeight: '400', lineHeight: '20px' },
    sm:      { fontSize: '13px', fontWeight: '400', lineHeight: '18px' },
    caption: { fontSize: '12px', fontWeight: '500', lineHeight: '16px', textTransform: 'uppercase', letterSpacing: '0.12em' },
    micro:   { fontSize: '11px', fontWeight: '600', lineHeight: '14px' },
  },

  // ── Alturas ─────────────────────────────────────────────
  buttonHeight: {
    sm: '32px',
    md: '40px',
    lg: '48px',
  },
  inputHeight: '40px',

  // ── Espaçamento (escala 4px) ───────────────────────────
  spacing: {
    xs:    '4px',
    sm:    '8px',
    md:    '12px',
    lg:    '16px',
    xl:    '20px',
    '2xl': '24px',
    '3xl': '32px',
  },

  // ── Transições ─────────────────────────────────────────
  transition: {
    atomic:        '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    structure:     '250ms cubic-bezier(0.16, 1, 0.3, 1)',
    ease:          'cubic-bezier(0.4, 0, 0.2, 1)',
    easeStructure: 'cubic-bezier(0.16, 1, 0.3, 1)',
  },
};

// ── Atalhos semânticos para componentes ─────────────────────
// Use: import { input, card, badge } from '@/lib/m31DesignTokens';

export const input = {
  background:   TOKENS.surface,
  border:       TOKENS.border,
  text:         TOKENS.text,
  placeholder:  TOKENS.textSubtle,
  borderRadius: TOKENS.radius.md,
  padding:      '0 12px',
  height:       TOKENS.inputHeight,
  fontSize:     '14px',
  fontFamily:   TOKENS.font.body,
  outline:      'none',
  boxSizing:    'border-box',
};

export const badge = {
  fontSize:     '12px',
  fontWeight:   '600',
  padding:      '3px 8px',
  borderRadius: TOKENS.radius.sm,
  display:      'inline-flex',
  alignItems:   'center',
  gap:          '5px',
  whiteSpace:   'nowrap',
};

export const table = {
  headerBg:      TOKENS.surfaceSubtle,
  headerText:    TOKENS.textSubtle,
  border:        TOKENS.border,
  rowHover:      TOKENS.surfaceHover,
  rowZebra:      TOKENS.surfaceSubtle,
  cellPadding:   '12px 16px',
  fontSize:      '14px',
  headerFontSize:'12px',
};

export const card = {
  background:   TOKENS.surface,
  border:       TOKENS.border,
  borderRadius: TOKENS.radius.lg,
  shadow:       TOKENS.shadowSm,
  padding:      '16px 18px',
};

export const button = {
  primary: {
    background:   TOKENS.primary,
    color:        TOKENS.onPrimary,
    hover:        TOKENS.primaryHover,
    height:       TOKENS.buttonHeight.md,
    fontSize:     '14px',
    fontWeight:   '600',
    padding:      '0 16px',
    borderRadius: TOKENS.radius.md,
    fontFamily:   TOKENS.font.body,
    border:       'none',
    cursor:       'pointer',
  },
  ghost: {
    background:   'transparent',
    color:        TOKENS.textMuted,
    border:       TOKENS.borderStrong,
    height:       TOKENS.buttonHeight.md,
    fontSize:     '14px',
    fontWeight:   '500',
    padding:      '0 16px',
    borderRadius: TOKENS.radius.md,
    fontFamily:   TOKENS.font.body,
    cursor:       'pointer',
  },
  success: {
    background:   TOKENS.success,
    color:        TOKENS.onPrimary,
    height:       TOKENS.buttonHeight.md,
    fontSize:     '14px',
    fontWeight:   '600',
    padding:      '0 16px',
    borderRadius: TOKENS.radius.md,
    fontFamily:   TOKENS.font.body,
    border:       'none',
    cursor:       'pointer',
  },
};

export default TOKENS;