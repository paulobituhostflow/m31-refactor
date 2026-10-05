/**
 * M31 Design System — tokens centralizados
 * Usado pelos formulários públicos e pelo painel admin.
 */
import React from 'react';

// ── Paleta base ────────────────────────────────────────────────────────────────
export const COLORS = {
  bgPage:    '#08080A',
  bgCard:    '#111114',
  bgSurface: '#18181C',
  bgInput:   '#1C1C21',
  brand:        '#8B1A2B',
  brandBright:  '#B8364A',
  brandSoft:    'rgba(139,26,43,0.10)',
  brandGlow:    'rgba(139,26,43,0.22)',
  brandBorder:  'rgba(139,26,43,0.30)',
  gold:      '#C4A265',
  goldLight: '#D4B87A',
  text1: 'rgba(255,255,255,0.95)',
  text2: 'rgba(255,255,255,0.60)',
  text3: 'rgba(255,255,255,0.35)',
  text4: 'rgba(255,255,255,0.18)',
  border:       'rgba(255,255,255,0.07)',
  borderMed:    'rgba(255,255,255,0.12)',
  borderStrong: 'rgba(255,255,255,0.20)',
  success:       '#22C55E',
  successSoft:   'rgba(34,197,94,0.10)',
  successBorder: 'rgba(34,197,94,0.30)',
  danger:        '#EF4444',
  dangerSoft:    'rgba(239,68,68,0.10)',
  dangerBorder:  'rgba(239,68,68,0.25)',
  warning:       '#F59E0B',
  warningSoft:   'rgba(245,158,11,0.10)',
};

export const BASE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Inter:wght@300;400;500;600;700&display=swap');

  :root {
    /* Escala de cinzas (slate) */
    --m31-ink:           #111827;
    --m31-ink-2:         #1F2937;
    --m31-slate-700:     #374151;
    --m31-slate-500:     #6B7280;
    --m31-slate-400:     #9CA3AF;
    --m31-slate-300:     #D1D5DB;
    --m31-slate-200:     #E5E7EB;
    --m31-slate-100:     #F3F4F6;
    --m31-slate-50:      #F9FAFB;

    /* Única cor de destaque: vinho da marca */
    --m31-brand:         #8B1A2B;
    --m31-brand-dark:    #5A0F1C;

    /* Tokens compat (mapeados para a nova paleta) */
    --m31-bg:            #F9FAFB;
    --m31-card:          #FFFFFF;
    --m31-surface:       #F9FAFB;
    --m31-input:         #FFFFFF;
    --m31-brand-bright:  #8B1A2B;
    --m31-brand-soft:    rgba(139,26,43,0.06);
    --m31-brand-glow:    rgba(139,26,43,0.10);
    --m31-brand-border:  rgba(139,26,43,0.20);
    --m31-gold:          #6B7280;
    --m31-gold-light:    #9CA3AF;
    --m31-t1:            #111827;
    --m31-t2:            #374151;
    --m31-t3:            #6B7280;
    --m31-t4:            #9CA3AF;
    --m31-border:        #E5E7EB;
    --m31-border-med:    #D1D5DB;
    --m31-border-strong: #9CA3AF;
    --m31-success:       #6B7280;
    --m31-success-soft:  #F3F4F6;
    --m31-success-border:#D1D5DB;
    --m31-danger:        #374151;
    --m31-danger-soft:   #F9FAFB;
    --m31-danger-border: #9CA3AF;
    --m31-warning:       #6B7280;
    --m31-warning-soft:  #F3F4F6;
  }

  *, *::before, *::after { box-sizing: border-box; }

  .m31-ds-page {
    min-height: 100vh;
    background: var(--pgt-fundo, #FFFFFF);
    font-family: 'Inter', sans-serif;
    color: var(--pgt-texto, var(--m31-ink));
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden;
  }

  /* ── Split view (desktop) ─────────────────────────────────────────────── */
  .m31-ds-split { display: flex; min-height: 100vh; }

  .m31-ds-aside {
    flex: 0 0 42%; max-width: 520px;
    background: var(--m31-ink);
    color: #fff;
    padding: 56px 48px;
    display: flex; flex-direction: column;
    position: sticky; top: 0; height: 100vh;
  }
  .m31-ds-aside-logo { width: 128px; margin-bottom: 56px; }
  .m31-ds-aside-badge {
    display: inline-flex; align-items: center; gap: 7px; align-self: flex-start;
    border: 1px solid rgba(255,255,255,0.16); border-radius: 100px;
    padding: 5px 13px; font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
    text-transform: uppercase; color: rgba(255,255,255,0.72); margin-bottom: 22px;
  }
  .m31-ds-aside-title {
    font-family: 'Playfair Display', serif; font-size: 40px; font-weight: 700;
    line-height: 1.15; margin-bottom: 16px; color: #fff;
  }
  .m31-ds-aside-title em { font-style: italic; }
  .m31-ds-aside-sub { font-size: 15px; line-height: 1.7; color: rgba(255,255,255,0.62); max-width: 38ch; }

  .m31-ds-aside-meta { margin-top: 40px; display: flex; flex-direction: column; gap: 14px; }
  .m31-ds-aside-meta-row {
    display: flex; align-items: center; gap: 12px;
    font-size: 14px; color: rgba(255,255,255,0.78);
  }
  .m31-ds-aside-meta-row svg { width: 17px; height: 17px; stroke: rgba(255,255,255,0.42); stroke-width: 1.75; fill: none; flex-shrink: 0; }

  .m31-ds-invest {
    margin-top: auto; padding-top: 32px; border-top: 1px solid rgba(255,255,255,0.10);
  }
  .m31-ds-invest-label { font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.45); margin-bottom: 8px; }
  .m31-ds-invest-row { display: flex; align-items: baseline; gap: 10px; }
  .m31-ds-invest-value { font-family: 'Inter', sans-serif; font-size: 30px; font-weight: 700; color: #fff; letter-spacing: -0.02em; }
  .m31-ds-invest-value .currency { font-size: 16px; font-weight: 500; margin-right: 3px; color: rgba(255,255,255,0.6); }
  .m31-ds-invest-sub { font-size: 13px; color: rgba(255,255,255,0.55); }

  .m31-ds-main {
    flex: 1; display: flex; justify-content: center;
    padding: 56px 40px 80px; background: #FFFFFF;
  }
  .m31-ds-main-inner { width: 100%; max-width: 460px; }

  /* ── Mobile header (colapsa a coluna escura) ──────────────────────────── */
  .m31-ds-mobile-header { display: none; }

  /* Header antigo centralizado — desativado no novo layout */
  .m31-ds-header { display: none; }
  .m31-ds-wrapper { max-width: 460px; margin: 0 auto; }

  .m31-ds-badge {
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--m31-slate-100); border: 1px solid var(--m31-slate-200);
    border-radius: 100px; padding: 5px 14px;
    font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
    color: var(--m31-slate-500); margin-bottom: 14px;
  }
  .m31-ds-title {
    font-family: 'Playfair Display', serif;
    font-size: 30px; font-weight: 700; color: var(--pgt-titulo, var(--m31-ink));
    line-height: 1.2; margin-bottom: 8px;
  }
  .m31-ds-title em { color: var(--m31-ink); font-style: italic; }
  .m31-ds-subtitle { font-size: 14px; color: var(--m31-slate-500); line-height: 1.6; margin-top: 6px; margin-bottom: 8px; }

  .m31-ds-form-head { margin-bottom: 24px; }

  /* Meta strip antiga — não usada no novo layout */
  .m31-ds-meta { display: none; }
  .m31-ds-meta-cell { display: none; }

  /* Card vira container plano (sem header vinho gigante) */
  .m31-ds-card { background: transparent; border: none; box-shadow: none; overflow: visible; margin: 0; }
  .m31-ds-card-header { display: none; }
  .m31-ds-card-icon { display: none; }
  .m31-ds-card-header-text { display: none; }
  .m31-ds-price { display: none; }
  .m31-ds-price-value { display: none; }
  .m31-ds-price-sub { display: none; }
  .m31-ds-body { padding: 0; }

  .m31-ds-section {
    font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--m31-slate-400); margin: 32px 0 16px;
    display: flex; align-items: center; gap: 10px;
    background: transparent; padding: 0; border: none;
  }
  .m31-ds-section:first-child { margin-top: 0; }
  .m31-ds-section::after { content: ''; flex: 1; height: 1px; background: var(--m31-slate-200); }

  .m31-ds-field { position: relative; margin-bottom: 16px; flex: 1; display: flex; flex-direction: column; }
  .m31-ds-field::before { display: none; }

  .m31-ds-label {
    position: static; transform: none; font-size: 13px; font-weight: 500;
    color: var(--m31-slate-700); margin-bottom: 6px; line-height: 1.2;
    padding: 0; background: transparent; letter-spacing: 0;
  }
  .m31-ds-label .req { color: var(--m31-slate-400); margin-left: 3px; font-weight: 600; }
  .m31-ds-field.active .m31-ds-label,
  .m31-ds-field.filled .m31-ds-label {
    color: var(--m31-ink); font-weight: 600; text-transform: none;
  }

  /* Wrapper para o check discreto dentro do campo */
  .m31-ds-input-wrap { position: relative; width: 100%; }
  .m31-ds-input-check {
    position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
    width: 16px; height: 16px; stroke: var(--m31-slate-400); stroke-width: 2.25;
    fill: none; pointer-events: none; z-index: 2;
  }

  .m31-ds-input, .m31-ds-select {
    position: relative; z-index: 1; background: #FFFFFF;
    border: 1px solid var(--m31-slate-300); border-radius: 8px;
    height: 46px; padding: 0 14px; font-family: 'Inter', sans-serif;
    font-size: 15px; font-weight: 400; color: var(--m31-ink);
    width: 100%; outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
    appearance: none; -webkit-appearance: none;
  }
  .m31-ds-input::placeholder { color: var(--m31-slate-400); }
  .m31-ds-input.is-valid, .m31-ds-select.is-valid { border-color: var(--m31-slate-300); box-shadow: none; padding-right: 38px; }
  .m31-ds-input.is-error, .m31-ds-select.is-error { border-color: var(--m31-slate-700); background: #FFFFFF; }
  .m31-ds-input:focus, .m31-ds-select:focus { border-color: var(--m31-ink); box-shadow: 0 0 0 3px rgba(17,24,39,0.08); }
  .m31-ds-input:disabled, .m31-ds-select:disabled { opacity: 0.6; cursor: not-allowed; background: var(--m31-slate-100); }

  .m31-ds-select-wrap { position: relative; width: 100%; }
  .m31-ds-select-wrap::after {
    content: ''; position: absolute; right: 14px; top: 50%; transform: translateY(-50%);
    border: 4px solid transparent; border-top: 5px solid var(--m31-slate-400);
    pointer-events: none; z-index: 2;
  }

  .m31-ds-field-hint { display: flex; justify-content: space-between; font-size: 11px; color: var(--m31-slate-400); padding: 0 2px; margin-top: 4px; position: relative; z-index: 1; }
  .m31-ds-field-feedback { display: flex; align-items: center; gap: 5px; font-size: 11px; margin-top: 5px; padding: 0 2px; position: relative; z-index: 1; }
  .m31-ds-field-feedback.err { color: var(--m31-slate-500); }
  .m31-ds-field-feedback.ok  { color: var(--m31-slate-400); }
  .m31-ds-field-feedback.err svg, .m31-ds-field-feedback.ok svg { stroke: currentColor; }
  .m31-ds-field-row { display: flex; gap: 10px; align-items: flex-start; }

  /* ── Segmented control (Sim/Não) ──────────────────────────────────────── */
  .m31-ds-toggle-card {
    background: transparent; border: none;
    border-radius: 0; padding: 0; margin-bottom: 20px;
  }
  .m31-ds-toggle-card.is-error .m31-ds-toggle-opts { box-shadow: 0 0 0 1px var(--m31-slate-700); border-radius: 9px; }
  .m31-ds-toggle-q { font-size: 13px; font-weight: 500; color: var(--m31-slate-700); margin-bottom: 8px; text-align: left; }
  .m31-ds-toggle-q span { color: var(--m31-slate-400) !important; }
  .m31-ds-toggle-opts {
    display: flex; gap: 4px; flex-wrap: wrap;
    background: var(--m31-slate-100); border: 1px solid var(--m31-slate-200);
    border-radius: 9px; padding: 4px;
  }
  .m31-ds-toggle-btn {
    flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
    padding: 9px 10px; background: transparent; border: none;
    border-radius: 6px; font-family: 'Inter', sans-serif;
    font-size: 13px; font-weight: 500; color: var(--m31-slate-500);
    cursor: pointer; transition: all 0.15s;
    -webkit-tap-highlight-color: transparent; white-space: nowrap;
  }
  .m31-ds-toggle-btn svg { width: 13px; height: 13px; stroke: var(--m31-slate-400); stroke-width: 2.5; fill: none; }
  .m31-ds-toggle-btn:active { transform: scale(0.98); }
  .m31-ds-toggle-btn.active {
    background: #FFFFFF; color: var(--m31-ink); font-weight: 600;
    box-shadow: 0 1px 2px rgba(17,24,39,0.10), 0 1px 3px rgba(17,24,39,0.06);
  }
  .m31-ds-toggle-btn.active svg { stroke: var(--m31-ink); }

  /* ── Chips "como conheceu" (borda cinza → ativo preto) ─────────────────── */
  .m31-ds-toggle-card.chips .m31-ds-toggle-opts { background: transparent; border: none; padding: 0; gap: 8px; }
  .m31-ds-toggle-card.chips .m31-ds-toggle-btn {
    flex: 0 0 auto; background: #FFFFFF; border: 1px solid var(--m31-slate-300);
    border-radius: 100px; padding: 8px 14px; color: var(--m31-slate-700); box-shadow: none;
  }
  .m31-ds-toggle-card.chips .m31-ds-toggle-btn.active {
    background: var(--pgt-realce, var(--m31-ink)); border-color: var(--pgt-realce, var(--m31-ink)); color: #fff; box-shadow: none;
  }
  .m31-ds-toggle-card.chips .m31-ds-toggle-btn.active svg { stroke: #fff; }

  .m31-ds-conditional { overflow: hidden; max-height: 0; opacity: 0; transition: max-height 0.32s ease, opacity 0.32s ease, margin-top 0.32s ease; }
  .m31-ds-conditional.open { max-height: 90px; opacity: 1; margin-top: 10px; }

  /* Linha discreta "seus dados salvos" */
  .m31-ds-info-box {
    background: transparent; border: none; border-radius: 0;
    padding: 0; margin-bottom: 16px;
    font-size: 13px; color: var(--m31-slate-500); line-height: 1.5; display: flex; gap: 8px; align-items: center;
  }
  .m31-ds-info-box svg { width: 15px; height: 15px; stroke: var(--m31-slate-400); stroke-width: 2; fill: none; flex-shrink: 0; }

  .m31-ds-price-summary {
    background: var(--m31-slate-50); border: 1px solid var(--m31-slate-200);
    border-radius: 10px; padding: 14px 16px; margin: 16px 0;
    display: flex; align-items: center; justify-content: space-between;
  }
  .m31-ds-price-summary-label { font-size: 13px; color: var(--m31-slate-500); font-weight: 500; }
  .m31-ds-price-summary-label small { display: block; font-size: 11px; color: var(--m31-slate-400); margin-top: 2px; }
  .m31-ds-price-summary-amount { font-family: 'Inter', sans-serif; font-size: 22px; font-weight: 700; color: var(--m31-ink); }

  @keyframes m31-dot { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }

  /* ── Botão de pagamento (vinho sólido) ─────────────────────────────────── */
  .m31-ds-btn-primary {
    width: 100%;
    background: var(--pgt-botao, var(--m31-brand));
    color: #fff; border: none; border-radius: 8px; padding: 15px 24px;
    font-family: 'Inter', sans-serif; font-size: 15px; font-weight: 600; letter-spacing: 0.01em;
    cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 9px;
    box-shadow: none;
    transition: background 0.15s ease, transform 0.08s ease;
    position: relative; overflow: hidden; margin-top: 24px;
    -webkit-tap-highlight-color: transparent;
  }
  .m31-ds-btn-primary:not(:disabled):hover { filter: brightness(0.92); }
  .m31-ds-btn-primary:not(:disabled):active { transform: scale(0.99); }
  .m31-ds-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

  .m31-ds-btn-secondary {
    width: 100%; background: transparent; border: 1px solid var(--m31-slate-300); border-radius: 8px;
    padding: 13px 24px; font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 600;
    color: var(--m31-slate-700); cursor: pointer; margin-top: 10px; transition: all 0.15s;
  }
  .m31-ds-btn-secondary:hover { border-color: var(--m31-ink); color: var(--m31-ink); }

  .m31-ds-dots { display: inline-flex; gap: 4px; align-items: center; }
  .m31-ds-dots span { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,0.85); display: inline-block; animation: m31-dot 1.2s ease-in-out infinite; }
  .m31-ds-dots span:nth-child(2) { animation-delay: 0.2s; }
  .m31-ds-dots span:nth-child(3) { animation-delay: 0.4s; }

  /* Erro discreto: borda cinza-escura fina + texto sóbrio */
  .m31-ds-error {
    background: var(--m31-slate-50); border: 1px solid var(--m31-slate-300);
    border-radius: 8px; padding: 10px 13px; font-size: 13px; color: var(--m31-slate-700);
    margin-top: 12px; display: flex; align-items: center; gap: 8px;
  }
  .m31-ds-error svg { width: 14px; height: 14px; stroke: var(--m31-slate-500); stroke-width: 2; fill: none; flex-shrink: 0; }

  .m31-ds-footer { margin-top: 16px; text-align: center; }
  .m31-ds-security { display: flex; align-items: center; justify-content: center; gap: 5px; font-size: 12px; color: var(--m31-slate-400); margin-bottom: 8px; }
  .m31-ds-security svg { display: none; }
  .m31-ds-footer a { font-size: 13px; color: var(--m31-slate-500); text-decoration: underline; text-underline-offset: 2px; }

  .m31-ds-success { text-align: center; padding: 24px 0 12px; }
  .m31-ds-check-ring {
    width: 64px; height: 64px; border-radius: 50%;
    background: var(--m31-slate-100); border: 1px solid var(--m31-slate-200);
    display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;
    box-shadow: none;
  }
  .m31-ds-check-ring svg { width: 28px; height: 28px; stroke: var(--m31-ink); stroke-width: 2.5; fill: none; }
  .m31-ds-success h3 { font-family: 'Playfair Display', serif; font-size: 26px; font-weight: 700; color: var(--pgt-titulo, var(--m31-ink)); margin-bottom: 12px; }
  .m31-ds-success p { font-size: 14px; color: var(--m31-slate-500); line-height: 1.65; margin-bottom: 22px; }
  .m31-ds-btn-pay {
    display: inline-flex; align-items: center; gap: 8px;
    background: var(--pgt-botao, var(--m31-brand));
    color: #fff; padding: 14px 32px; border-radius: 8px;
    font-family: 'Inter', sans-serif; font-size: 15px; font-weight: 600;
    text-decoration: none; box-shadow: none;
    transition: background 0.15s; margin-bottom: 14px;
  }
  .m31-ds-btn-pay:hover { filter: brightness(0.92); }

  .m31-ds-powered { text-align: center; font-size: 11px; color: var(--pgt-rodape, var(--m31-slate-400)); letter-spacing: 0.04em; padding: 32px 0 24px; }

  /* ── Banner de imagem (cabeçalho) ──────────────────────────────────────── */
  .m31-ds-banner { display: none; }
  .m31-ds-banner img {
    display: block; width: 100%; height: auto; aspect-ratio: 1024 / 439;
    object-fit: cover; object-position: center;
  }

  /* ── Mobile: coluna escura vira cabeçalho compacto ─────────────────────── */
  @media (max-width: 900px) {
    .m31-ds-split { flex-direction: column; }
    .m31-ds-aside { display: none; }
    .m31-ds-banner { display: block; }
    .m31-ds-mobile-header {
      display: none; background: var(--m31-ink); color: #fff;
      padding: 22px 20px;
    }
    .m31-ds-mh-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .m31-ds-mh-logo { width: 96px; }
    .m31-ds-mh-price { text-align: right; }
    .m31-ds-mh-price-value { font-size: 20px; font-weight: 700; letter-spacing: -0.01em; }
    .m31-ds-mh-price-value .currency { font-size: 13px; font-weight: 500; margin-right: 2px; color: rgba(255,255,255,0.6); }
    .m31-ds-mh-price-sub { font-size: 11px; color: rgba(255,255,255,0.55); margin-top: 1px; }
    .m31-ds-mh-meta {
      display: flex; gap: 16px; margin-top: 14px; padding-top: 14px;
      border-top: 1px solid rgba(255,255,255,0.10);
    }
    .m31-ds-mh-meta-cell { display: flex; align-items: center; gap: 6px; font-size: 12px; color: rgba(255,255,255,0.72); }
    .m31-ds-mh-meta-cell svg { width: 14px; height: 14px; stroke: rgba(255,255,255,0.42); stroke-width: 1.75; fill: none; }
    .m31-ds-main { padding: 28px 20px 64px; }
    .m31-ds-main-inner { max-width: 100%; }
    .m31-ds-title { font-size: 24px; }
  }

  @media (max-width: 480px) {
    .m31-ds-title { font-size: 22px; }
    .m31-ds-toggle-card.chips .m31-ds-toggle-btn { padding: 8px 12px; }
  }
`;

export function M31GlobalStyles() {
  return <style>{BASE_CSS}</style>;
}