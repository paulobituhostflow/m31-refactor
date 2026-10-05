import { LayoutGrid, List, Columns, GanttChart, Calendar, BookOpen } from 'lucide-react';
import { TOKENS as T } from '@/lib/m31DesignTokens';

const TABS = [
  { k: 'overview', label: 'Visão geral', icon: LayoutGrid },
  { k: 'list', label: 'Lista', icon: List },
  { k: 'kanban', label: 'Quadro', icon: Columns },
  { k: 'timeline', label: 'Cronograma', icon: GanttChart },
  { k: 'calendar', label: 'Calendário', icon: Calendar },
  { k: 'master', label: 'Plano-Mestre', icon: BookOpen },
];

// Mobile: 4 abas (Demandas, Quadro, Calendário, Roteiro)
const MOBILE_TABS = [
  { k: 'overview', label: 'Demandas', icon: LayoutGrid },
  { k: 'kanban', label: 'Quadro', icon: Columns },
  { k: 'calendar', label: 'Calendário', icon: Calendar },
  { k: 'timeline', label: 'Roteiro', icon: GanttChart },
];

export default function GestaoTabs({ active, onChange, isMobile }) {
  if (isMobile) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', background: T.surfaceSubtle, borderRadius: T.radius.md, padding: '3px' }}>
        {MOBILE_TABS.map(t => {
          const Icon = t.icon;
          const isActive = active === t.k;
          return (
            <button key={t.k} onClick={() => onChange(t.k)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
              padding: '8px 2px', minHeight: '48px', background: isActive ? T.surface : 'transparent',
              border: 'none', borderRadius: T.radius.sm, cursor: 'pointer',
              color: isActive ? T.primary : T.textMuted,
              fontSize: '10px', fontWeight: isActive ? '600' : '500',
              fontFamily: T.font.body, transition: `all ${T.transition.atomic}`,
              WebkitTapHighlightColor: 'transparent',
            }}>
              <Icon size={16} /> {t.label}
            </button>
          );
        })}
      </div>
    );
  }

  // Desktop: tabs horizontais (mantém padrão existente)
  return (
    <div style={{ display: 'flex', gap: '2px', borderBottom: `1px solid ${T.border}`, overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
      <style>{`div::-webkit-scrollbar{display:none}`}</style>
      {TABS.map(t => {
        const Icon = t.icon;
        const isActive = active === t.k;
        return (
          <button key={t.k} onClick={() => onChange(t.k)} style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '9px 14px', background: 'none', border: 'none',
            borderBottom: isActive ? `2px solid ${T.primary}` : '2px solid transparent',
            color: isActive ? T.primary : T.textMuted,
            fontSize: '13px', fontWeight: isActive ? '600' : '500',
            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            fontFamily: T.font.body, transition: `color ${T.transition.atomic}`,
            WebkitTapHighlightColor: 'transparent',
          }}>
            <Icon size={14} /> {t.label}
          </button>
        );
      })}
    </div>
  );
}