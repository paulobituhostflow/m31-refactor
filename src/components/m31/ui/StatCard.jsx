/**
 * StatCard — ÚNICO card de KPI do M31. Substitui as 4 variações.
 * Props: label, value, sub, delta {value, direction:'up'|'down'}, state, hero,
 *        icon (lucide), tone ('urgent'), suffix (string após valor), dot (cor), onClick.
 * state (semântico) pinta número + faixa superior; hero aplica gradiente vinho-bordô.
 * tone='urgent' aplica fundo soft de alerta (preserva o modo urgent do KpiCard antigo).
 */
import { TOKENS } from '@/lib/m31DesignTokens';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

const STATE_COLOR = {
  success: TOKENS.success, warning: TOKENS.warning,
  danger: TOKENS.danger, info: TOKENS.info, neutral: TOKENS.text, brand: TOKENS.primary,
};

const TONE_STYLE = {
  urgent: { bg: TOKENS.dangerSoft, border: 'rgba(239,68,68,0.30)', hoverShadow: '0 6px 20px -3px rgba(239,68,68,0.18)' },
};

export default function StatCard({ label, value, sub, delta, state = 'neutral', hero = false, icon: Icon, tone, suffix, dot, onClick, style }) {
  const numColor = hero ? '#FFFFFF' : (STATE_COLOR[state] || TOKENS.text);
  const accent = state !== 'neutral' ? STATE_COLOR[state] : null;
  const toneStyle = tone ? TONE_STYLE[tone] : null;

  const bg = hero
    ? 'var(--grad-brand)'
    : toneStyle ? toneStyle.bg : TOKENS.surface;
  const border = hero ? 'none' : `1px solid ${toneStyle ? toneStyle.border : TOKENS.border}`;
  const shadow = hero
    ? '0 2px 8px rgba(0,0,0,0.06)'
    : TOKENS.shadowSm;
  const hoverShadow = hero
    ? '0 2px 8px rgba(0,0,0,0.06)'
    : toneStyle ? toneStyle.hoverShadow : TOKENS.shadowSm;

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative', padding: '18px 20px', borderRadius: TOKENS.radius.lg,
        background: bg, border, boxShadow: shadow,
        cursor: onClick ? 'pointer' : 'default', overflow: 'hidden',
        transition: `transform 200ms ${TOKENS.transition.easeStructure}, box-shadow 200ms ease`,
        ...style,
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = hoverShadow; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = shadow; }}
    >
      {/* Faixa de severidade (banda superior colorida) */}
      {!hero && accent && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: accent }} />}
      {/* Glow decorativo no card hero */}


      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Label + ícone */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {dot && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: dot, flexShrink: 0 }} />}
            <span style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '.08em', textTransform: 'uppercase', color: hero ? 'rgba(255,255,255,0.8)' : TOKENS.textSubtle }}>{label}</span>
          </div>
          {Icon && !hero && <Icon size={18} strokeWidth={2.5} color={accent || TOKENS.textSubtle} style={{ opacity: 0.65 }} />}
        </div>

        {/* Valor + sufixo */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
          <span style={{ fontSize: '24px', fontWeight: '700', color: numColor, letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</span>
          {suffix && <span style={{ fontSize: '12px', color: hero ? 'rgba(255,255,255,0.75)' : TOKENS.textMuted, fontWeight: '500' }}>{suffix}</span>}
        </div>

        {/* Delta + sub */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
          {delta && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '11px', fontWeight: '700', color: delta.direction === 'up' ? TOKENS.success : TOKENS.danger }}>
              {delta.direction === 'up' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{delta.value}
            </span>
          )}
          {sub && <span style={{ fontSize: '11px', color: hero ? 'rgba(255,255,255,0.75)' : TOKENS.textMuted }}>{sub}</span>}
        </div>
      </div>
    </div>
  );
}