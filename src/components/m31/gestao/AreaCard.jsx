import { ChevronDown } from 'lucide-react';
import { TOKENS as T } from '@/lib/m31DesignTokens';
import SectorBadge from './SectorBadge';
import ItemActionMenu from './ItemActionMenu';
import { calcProgresso } from './tarefaHelpers';

/**
 * AreaCard — pasta recolhível (macro-organização).
 * Não possui checkbox, prazo ou status. Mostra progresso consolidado.
 * Visual unificado: sem bordas coloridas, sem botão IA por área.
 */
export default function AreaCard({ area, tarefas, isOpen, onToggle, children, onSugestoesIA, canEdit, onItemAction }) {
  const prog = calcProgresso(tarefas);

  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: T.radius.lg,
      overflow: 'hidden',
    }}>
      <div
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '52px', padding: '12px 20px', cursor: 'pointer', transition: `background ${T.transition.atomic}` }}
        onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = T.surfaceHover; }}
        onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = 'transparent'; }}
      >
        <SectorBadge areaSlug={area.slug || area.key} size={28} iconSize={15} />
        <span style={{ fontSize: '15px', fontWeight: '700', color: T.text, flex: 1, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{area.nome || area.label}</span>
        {prog.total > 0 && (
          <>
            <div style={{ width: '60px', height: '6px', background: T.border, borderRadius: T.radius.pill, overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ width: `${prog.pct}%`, height: '100%', background: T.primary, transition: 'width 0.3s ease' }} />
            </div>
            <span style={{ fontSize: '12px', color: T.textMuted, fontWeight: '500', flexShrink: 0 }}>{prog.pct}%</span>
          </>
        )}
        {onItemAction && (
          <ItemActionMenu
            canEdit={canEdit}
            onEdit={() => onItemAction('edit', 'area', area)}
            onMove={() => onItemAction('move', 'area', area)}
            onArchive={() => onItemAction('archive', 'area', area)}
            onDelete={() => onItemAction('delete', 'area', area)}
          />
        )}
        <ChevronDown size={18} color={T.textMuted} style={{ flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.25s cubic-bezier(0.16,1,0.3,1)' }} />
      </div>
      {isOpen && <div>{children}</div>}
    </div>
  );
}