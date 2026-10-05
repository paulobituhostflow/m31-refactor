/**
 * SegmentedControl — toggle de abas canônico.
 * Aba ativa em bordô, inativas em neutro. Contador opcional por aba.
 */
import { TOKENS } from '@/lib/m31DesignTokens';

export default function SegmentedControl({ tabs = [], active, onChange, style }) {
  return (
    <div style={{
      display: 'inline-flex', gap: '4px', padding: '4px',
      background: TOKENS.surfaceSubtle, borderRadius: TOKENS.radius.md,
      border: `1px solid ${TOKENS.border}`, ...style,
    }}>
      {tabs.map(t => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              padding: '8px 16px', borderRadius: TOKENS.radius.sm,
              background: isActive ? TOKENS.primary : 'transparent',
              color: isActive ? TOKENS.onPrimary : TOKENS.textMuted,
              fontSize: '13px', fontWeight: '600', border: 'none', cursor: 'pointer',
              fontFamily: TOKENS.font.body,
              transition: `background ${TOKENS.transition.atomic}, color ${TOKENS.transition.atomic}`,
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
            {t.count != null && (
              <span style={{
                fontSize: '11px', fontWeight: '700',
                padding: '1px 7px', borderRadius: TOKENS.radius.pill,
                background: isActive ? 'rgba(255,255,255,0.25)' : TOKENS.borderStrong,
                color: isActive ? TOKENS.onPrimary : TOKENS.textMuted,
                lineHeight: '1.4',
              }}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}