/**
 * Avatar — avatar global com fallback de iniciais + tooltip.
 * size: xs(20) | sm(28) | md(34) | lg(44). Tons vinho sobre fundo claro.
 */
import { TOKENS } from '@/lib/m31DesignTokens';

const SIZES = { xs: 20, sm: 28, md: 34, lg: 44 };

export default function Avatar({ name = '', src, size = 'md', title, style }) {
  const px = SIZES[size] || SIZES.md;
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?';
  const fs = Math.round(px * 0.38);
  return (
    <div
      title={title || name}
      style={{
        width: px, height: px, borderRadius: '50%', flexShrink: 0,
        background: src ? undefined : 'rgba(139, 26, 43,0.10)',
        border: `1px solid ${src ? TOKENS.border : 'rgba(139, 26, 43,0.18)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: fs, fontWeight: '600', color: TOKENS.primary,
        fontFamily: TOKENS.font.body, overflow: 'hidden',
        backgroundImage: src ? `url(${src})` : undefined,
        backgroundSize: 'cover', backgroundPosition: 'center',
        ...style,
      }}
    >
      {!src && initials}
    </div>
  );
}