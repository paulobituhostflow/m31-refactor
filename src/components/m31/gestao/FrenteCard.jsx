import { ChevronDown, Plus } from 'lucide-react';
import { TOKENS as T } from '@/lib/m31DesignTokens';
import ItemActionMenu from './ItemActionMenu';
import { calcProgresso } from './tarefaHelpers';

/**
 * FrenteCard — contêiner categoria dentro da Área.
 * Não possui checkbox, prazo ou status. Mostra progresso consolidado.
 * Ação: + Nova tarefa (cria Tarefa Mãe nesta frente).
 */
export default function FrenteCard({ frente, tarefas, isOpen, onToggle, onAddTarefa, canEdit, children, onItemAction }) {
  const prog = calcProgresso(tarefas);

  return (
    <div>
      <div onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '10px 16px 10px 36px', cursor: 'pointer', fontFamily: T.font.body }}>
        <ChevronDown size={15} color={T.textMuted} style={{ flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.25s ease' }} />
        <span style={{ fontSize: '13px', fontWeight: '500', color: T.text, flex: 1, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{frente.nome}</span>
        {frente.status_definicao === 'em_refinamento' && (
          <span style={{ fontSize: '11px', color: T.textSubtle }}>em refinamento</span>
        )}
        <span style={{ fontSize: '12px', color: T.textMuted, fontWeight: '500' }}>{prog.pct}%</span>
        {onItemAction && (
          <ItemActionMenu
            canEdit={canEdit}
            onEdit={() => onItemAction('edit', 'frente', frente)}
            onMove={() => onItemAction('move', 'frente', frente)}
            onArchive={() => onItemAction('archive', 'frente', frente)}
            onDelete={() => onItemAction('delete', 'frente', frente)}
          />
        )}
      </div>
      {isOpen && (
        <div style={{ paddingBottom: '4px' }}>
          {children}
          {canEdit && (
            <button onClick={onAddTarefa}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%', padding: '8px 16px 8px 52px', background: 'transparent', border: 'none', cursor: 'pointer', color: T.primary, fontSize: '13px', fontWeight: '600', fontFamily: T.font.body }}>
              <Plus size={14} /> Nova tarefa
            </button>
          )}
        </div>
      )}
    </div>
  );
}