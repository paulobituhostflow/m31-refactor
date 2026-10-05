import { useState } from 'react';
import { ChevronDown, Check, Calendar, GitBranch, Plus, User, ClipboardList } from 'lucide-react';
import { TOKENS as T } from '@/lib/m31DesignTokens';
import { STATUS_LABELS, STATUS_COLORS, formatPrazo, isAtrasada } from './tarefaHelpers';
import ChecklistInline from './ChecklistInline';
import ItemActionMenu from './ItemActionMenu';

/** Avatar circular com iniciais do responsável */
function Avatar({ nome, size = 22 }) {
  const initials = (nome || '')
    .trim()
    .split(/\s+/)
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  if (!initials) return null;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: T.palette.bordo.soft, color: T.primary,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size <= 18 ? '8px' : '9px', fontWeight: '700', flexShrink: 0, lineHeight: 1,
    }} title={nome}>{initials}</div>
  );
}

/** Status como pílula colorida (badge) */
function StatusPill({ status }) {
  const color = STATUS_COLORS[status] || T.textMuted;
  return (
    <span style={{
      fontSize: '9px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em',
      padding: '3px 8px', borderRadius: T.radius.pill, flexShrink: 0,
      background: `${color}15`, color, border: `1px solid ${color}30`,
      whiteSpace: 'nowrap',
    }}>{STATUS_LABELS[status]}</span>
  );
}

/** Indicador geométrico de prioridade — barras ascendentes, monocromático */
function PriorityIndicator({ prioridade }) {
  if (!prioridade) return null;
  const levels = { baixa: 1, media: 2, alta: 3, urgente: 3 };
  const count = levels[prioridade] || 0;
  const color = prioridade === 'urgente' ? T.danger : T.textMuted;
  return (
    <div style={{ display: 'inline-flex', gap: '2px', alignItems: 'flex-end', flexShrink: 0, height: '14px' }} title={`Prioridade: ${prioridade}`}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          width: '3px', height: `${5 + i * 3}px`, borderRadius: '1px',
          background: i <= count ? color : T.border,
        }} />
      ))}
    </div>
  );
}

/**
 * SubtarefaLinha — unidade de trabalho subordinada à Tarefa Mãe.
 * Tem responsável, prazo, status e checklist próprios.
 */
function SubtarefaLinha({ subtarefa, onEditTask, onToggleStatus, onToggleChecklistItem, onAddChecklistItem, onRemoveChecklistItem, onUpdateChecklistItem, canEdit, onItemAction }) {
  const concluido = subtarefa.status === 'concluido';
  const atrasada = isAtrasada(subtarefa);
  const checklist = subtarefa.checklist || [];
  const checkDone = checklist.filter(c => c.concluido).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '4px 0' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <button onClick={() => canEdit && onToggleStatus(subtarefa)} disabled={!canEdit}
          style={{ width: '18px', height: '18px', borderRadius: T.radius.sm, border: concluido ? 'none' : `1.5px solid ${T.borderStrong}`, background: concluido ? T.success : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: canEdit ? 'pointer' : 'default', marginTop: '1px', padding: 0 }}>
          {concluido && <Check size={11} color={T.onPrimary} strokeWidth={3} />}
        </button>
        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => onEditTask(subtarefa)}>
          <span style={{ fontSize: '13px', fontWeight: '500', color: concluido ? T.textMuted : T.text, textDecoration: concluido ? 'line-through' : 'none' }}>{subtarefa.titulo}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', flexWrap: 'wrap' }}>
            {subtarefa.responsavel_nome && <Avatar nome={subtarefa.responsavel_nome} size={18} />}
            {subtarefa.prazo && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: atrasada ? T.danger : T.textMuted, fontWeight: atrasada ? '600' : '400' }}>
                <Calendar size={10} /> {formatPrazo(subtarefa.prazo)}
              </span>
            )}
            {checklist.length > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: T.textSubtle }}>
                <ClipboardList size={11} /> {checkDone}/{checklist.length}
              </span>
            )}
          </div>
        </div>
        <PriorityIndicator prioridade={subtarefa.prioridade} />
        <StatusPill status={subtarefa.status} />
        {onItemAction && (
          <ItemActionMenu
            canEdit={canEdit}
            size={13}
            onEdit={() => onItemAction('edit', 'subtarefa', subtarefa)}
            onMove={() => onItemAction('move', 'subtarefa', subtarefa)}
            onArchive={() => onItemAction('archive', 'subtarefa', subtarefa)}
            onDelete={() => onItemAction('delete', 'subtarefa', subtarefa)}
          />
        )}
      </div>
      {checklist.length > 0 && (
        <div style={{ paddingLeft: '26px', marginTop: '4px' }}>
          <ChecklistInline itens={checklist} onToggleItem={onToggleChecklistItem} onAddItem={onAddChecklistItem} onRemoveItem={onRemoveChecklistItem} onUpdateItem={onUpdateChecklistItem} canEdit={canEdit} />
        </div>
      )}
    </div>
  );
}

/**
 * TarefaMaeCard — entrega principal dentro de uma Frente (ou direta na Área).
 * Expandível. Contém subtarefas e/ou checklist próprio.
 * Status em pílula colorida, avatar do responsável, tree lines, hover actions.
 */
export default function TarefaMaeCard({ tarefa, subtarefas = [], isOpen, onToggle, onEditTask, onAddSubtarefa, onToggleStatus, onToggleChecklistItem, onAddChecklistItem, onRemoveChecklistItem, onUpdateChecklistItem, canEdit, onItemAction }) {
  const concluido = tarefa.status === 'concluido';
  const atrasada = isAtrasada(tarefa);
  const checklist = tarefa.checklist || [];
  const [hovered, setHovered] = useState(false);

  // Bind handlers to the Tarefa Mãe itself
  const toggleOwnChecklistItem = (itemId) => onToggleChecklistItem(tarefa.id, tarefa.checklist, itemId);
  const addOwnChecklistItem = (texto) => onAddChecklistItem(tarefa.id, texto);
  const removeOwnChecklistItem = (itemId) => onRemoveChecklistItem(tarefa.id, itemId);
  const updateOwnChecklistItem = (itemId, texto) => onUpdateChecklistItem(tarefa.id, itemId, texto);

  const subDone = subtarefas.filter(s => s.status === 'concluido').length;
  const checkDone = checklist.filter(c => c.concluido).length;
  const hasContent = subtarefas.length > 0 || checklist.length > 0;

  return (
    <div>
      {/* Linha da Tarefa Mãe */}
      <div
        style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 16px 10px 52px', position: 'relative', transition: `background ${T.transition.atomic}` }}
        onMouseEnter={e => { setHovered(true); e.currentTarget.style.background = T.surfaceHover; }}
        onMouseLeave={e => { setHovered(false); e.currentTarget.style.background = 'transparent'; }}
      >
        <button onClick={() => canEdit && onToggleStatus(tarefa)} disabled={!canEdit}
          style={{ width: '20px', height: '20px', borderRadius: T.radius.sm, border: concluido ? 'none' : `1.5px solid ${T.borderStrong}`, background: concluido ? T.success : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: canEdit ? 'pointer' : 'default', marginTop: '1px', padding: 0 }}>
          {concluido && <Check size={12} color={T.onPrimary} strokeWidth={3} />}
        </button>
        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => onEditTask(tarefa)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: concluido ? T.textMuted : T.text, textDecoration: concluido ? 'line-through' : 'none' }}>{tarefa.titulo}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px', flexWrap: 'wrap' }}>
            {tarefa.responsavel_nome && <Avatar nome={tarefa.responsavel_nome} size={20} />}
            {tarefa.prazo && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '12px', color: atrasada ? T.danger : T.textMuted, fontWeight: atrasada ? '600' : '400' }}>
                <Calendar size={11} /> {formatPrazo(tarefa.prazo)}
              </span>
            )}
            {subtarefas.length > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '12px', color: T.textSubtle }}>
                <ClipboardList size={12} /> {subDone}/{subtarefas.length}
              </span>
            )}
            {checklist.length > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '12px', color: T.textSubtle }}>
                <ClipboardList size={12} /> {checkDone}/{checklist.length}
              </span>
            )}
          </div>
        </div>

        {/* Ações rápidas no hover */}
        {hovered && canEdit && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
            <button onClick={(e) => { e.stopPropagation(); onEditTask(tarefa); }} title="Definir prazo" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: T.textMuted, display: 'flex', borderRadius: T.radius.sm, transition: `all ${T.transition.atomic}` }} onMouseEnter={e => { e.currentTarget.style.background = T.border; e.currentTarget.style.color = T.text; }} onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = T.textMuted; }}>
              <Calendar size={14} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onEditTask(tarefa); }} title="Atribuir responsável" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: T.textMuted, display: 'flex', borderRadius: T.radius.sm, transition: `all ${T.transition.atomic}` }} onMouseEnter={e => { e.currentTarget.style.background = T.border; e.currentTarget.style.color = T.text; }} onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = T.textMuted; }}>
              <User size={14} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onAddSubtarefa(); }} title="Criar subtarefa" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: T.textMuted, display: 'flex', borderRadius: T.radius.sm, transition: `all ${T.transition.atomic}` }} onMouseEnter={e => { e.currentTarget.style.background = T.border; e.currentTarget.style.color = T.text; }} onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = T.textMuted; }}>
              <Plus size={14} />
            </button>
            {onItemAction && (
              <ItemActionMenu
                canEdit={canEdit}
                size={14}
                onEdit={() => onItemAction('edit', 'tarefa', tarefa)}
                onMove={() => onItemAction('move', 'tarefa', tarefa)}
                onArchive={() => onItemAction('archive', 'tarefa', tarefa)}
                onDelete={() => onItemAction('delete', 'tarefa', tarefa)}
              />
            )}
          </div>
        )}

        <PriorityIndicator prioridade={tarefa.prioridade} />
        <StatusPill status={tarefa.status} />
        {hasContent && (
          <button onClick={onToggle} style={{ color: T.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: '2px', flexShrink: 0 }}>
            <ChevronDown size={16} style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.25s ease' }} />
          </button>
        )}
      </div>

      {/* Conteúdo expandido — tree line vertical pontilhada */}
      {isOpen && hasContent && (
        <div style={{ paddingLeft: '52px', paddingRight: '16px', paddingBottom: '10px' }}>
          <div style={{ borderLeft: `1.5px dashed ${T.borderStrong}`, paddingLeft: '14px', marginLeft: '10px' }}>
            {subtarefas.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '8px' }}>
                {subtarefas.map(sub => (
                  <SubtarefaLinha
                    key={sub.id}
                    subtarefa={sub}
                    onEditTask={onEditTask}
                    onToggleStatus={onToggleStatus}
                    onToggleChecklistItem={(itemId) => onToggleChecklistItem(sub.id, sub.checklist, itemId)}
                    onAddChecklistItem={(texto) => onAddChecklistItem(sub.id, texto)}
                    onRemoveChecklistItem={(itemId) => onRemoveChecklistItem(sub.id, itemId)}
                    onUpdateChecklistItem={(itemId, texto) => onUpdateChecklistItem(sub.id, itemId, texto)}
                    canEdit={canEdit}
                    onItemAction={onItemAction}
                  />
                ))}
              </div>
            )}

            {checklist.length > 0 && (
              <div style={{ marginBottom: '8px', padding: '8px 0' }}>
                <ChecklistInline itens={checklist} onToggleItem={toggleOwnChecklistItem} onAddItem={addOwnChecklistItem} onRemoveItem={removeOwnChecklistItem} onUpdateItem={updateOwnChecklistItem} canEdit={canEdit} />
              </div>
            )}

            {canEdit && (
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button onClick={onAddSubtarefa} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'transparent', border: 'none', color: T.primary, fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: T.font.body, padding: '4px 0' }}>
                  <GitBranch size={13} /> Adicionar subtarefa
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}