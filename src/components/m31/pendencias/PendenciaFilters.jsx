/**
 * PendenciaFilters — Chips de filtro agrupados. Mobile-first com scroll horizontal.
 */
import { TOKENS } from '@/lib/m31DesignTokens';
import { FILTER_GROUPS } from '@/hooks/useM31PendenciasConciliacao';
import { X } from 'lucide-react';

export default function PendenciaFilters({ selected, onToggle, onClear, resultCount }) {
  return (
    <div style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: TOKENS.radius.lg, padding: '12px 14px', marginBottom: '12px', boxShadow: TOKENS.shadowSm }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '11px', fontWeight: '700', color: TOKENS.textSubtle, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Filtros avançados {resultCount != null && `· ${resultCount} resultado(s)`}
        </span>
        {selected.length > 0 && (
          <button onClick={onClear} style={{ display: 'flex', alignItems: 'center', gap: '3px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: TOKENS.textMuted, fontWeight: '600' }}>
            <X size={11} /> Limpar
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {FILTER_GROUPS.map(group => (
          <div key={group.label} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
            <span style={{ fontSize: '9px', fontWeight: '700', color: TOKENS.textSubtle, textTransform: 'uppercase', letterSpacing: '0.04em', minWidth: '80px', paddingTop: '3px', flexShrink: 0 }}>{group.label}</span>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {group.filters.map(f => {
                const active = selected.includes(f.id);
                return (
                  <button
                    key={f.id}
                    onClick={() => onToggle(f.id)}
                    style={{
                      padding: '3px 9px', borderRadius: TOKENS.radius.pill, fontSize: '11px', fontWeight: '600', cursor: 'pointer',
                      border: `1px solid ${active ? TOKENS.primary : TOKENS.border}`,
                      background: active ? TOKENS.primary : TOKENS.surfaceSubtle,
                      color: active ? '#FFFFFF' : TOKENS.textMuted,
                      transition: `all ${TOKENS.transition.atomic}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}