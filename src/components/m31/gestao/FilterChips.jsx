import { TOKENS as T } from '@/lib/m31DesignTokens';

const CHIPS = [
  { k: 'all', label: 'Todas' },
  { k: 'late', label: 'Atrasadas' },
  { k: 'soon', label: 'Este mês' },
  { k: 'done', label: 'Concluídas' },
];

/**
 * FilterChips — barra de filtros rápidos por status/prazo.
 * Compartilhada entre todas as visualizações (Visão geral, Lista, Quadro, etc.).
 */
export default function FilterChips({ filtroChip, setFiltroChip }) {
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {CHIPS.map(c => {
        const isActive = filtroChip === c.k;
        return (
          <button
            key={c.k}
            onClick={() => setFiltroChip(c.k)}
            style={{
              padding: '7px 16px',
              borderRadius: T.radius.pill,
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              fontFamily: T.font.body,
              border: isActive ? `1px solid ${T.primary}` : `1px solid ${T.border}`,
              background: isActive ? T.primary : 'transparent',
              color: isActive ? T.onPrimary : T.textMuted,
              transition: `all ${T.transition.atomic}`,
            }}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}