/**
 * Badge — única badge semântica canônica do M31.
 * Variantes fixas: success | warning | danger | neutral | info.
 * Fundo pastel + texto saturado + dot indicador.
 */
import { TOKENS } from '@/lib/m31DesignTokens';

const VARIANTS = {
  success: { color: TOKENS.success, soft: TOKENS.successSoft },
  warning: { color: TOKENS.warning, soft: TOKENS.warningSoft },
  danger:  { color: TOKENS.danger,  soft: TOKENS.dangerSoft  },
  info:    { color: TOKENS.info,    soft: TOKENS.infoSoft    },
  neutral: { color: TOKENS.textMuted, soft: 'rgba(107,114,128,0.12)' },
};

export default function Badge({ label, variant = 'neutral', dot = true, size = 'md', style, ...rest }) {
  const v = VARIANTS[variant] || VARIANTS.neutral;
  const pad = size === 'sm' ? '2px 7px' : size === 'lg' ? '5px 11px' : '3px 9px';
  const fs = size === 'sm' ? '10px' : size === 'lg' ? '13px' : '11px';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: pad, fontSize: fs, fontWeight: '600', letterSpacing: '.03em',
      borderRadius: TOKENS.radius.pill, background: v.soft, color: v.color,
      whiteSpace: 'nowrap', lineHeight: '1.4', ...style,
    }} {...rest}>
      {dot && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: v.color, flexShrink: 0 }} />}
      {label}
    </span>
  );
}