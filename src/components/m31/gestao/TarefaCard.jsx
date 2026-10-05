import { useState } from 'react';
import { Check, Calendar, Flag, Pencil, ChevronRight, User } from 'lucide-react';
import { TOKENS as T } from '@/lib/m31DesignTokens';
import { PRIORIDADE_LABELS, PRIORIDADE_COLORS, formatPrazo, isAtrasada } from './tarefaHelpers';
import TarefaInlineEditor from './TarefaInlineEditor';
import ResponsavelPicker from './ResponsavelPicker';
import ItemActionMenu from './ItemActionMenu';

function getInitials(nome) {
  if (!nome) return '?';
  const parts = nome.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarColor(nome) {
  const colors = ['#8B1A2B', '#16A34A', '#D97706', '#2563EB', '#7C3AED', '#0D9488', '#EA580C', '#9D174D'];
  const hash = (nome || '?').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

/**
 * TarefaCard — card de tarefa/subtarefa com ações rápidas.
 * Checkbox, avatar de responsável, caneta (edit inline), seta (ver subtarefas).
 * Subtarefas expandíveis no próprio card.
 */
export default function TarefaCard({ tarefa, subtarefas = [], onEdit, onToggle, onUpdate, canEdit, depth = 0, onItemAction }) {
  const concluido = tarefa.status === 'concluido';
  const atrasada = isAtrasada(tarefa);
  const prioColor = PRIORIDADE_COLORS[tarefa.prioridade] || T.textMuted;
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pickingResp, setPickingResp] = useState(false);
  const hasSubs = subtarefas.length > 0 && !tarefa.tarefa_pai_id;
  const subDone = subtarefas.filter(s => s.status === 'concluido').length;
  const checklist = tarefa.checklist || [];

  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.lg,
      overflow: 'visible', marginLeft: depth > 0 ? `${depth * 12}px` : 0,
      borderLeft: depth > 0 ? `3px solid ${T.primary}40` : undefined,
    }}>
      {/* Linha principal */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', minHeight: '50px' }}>
        {/* Checkbox */}
        <button onClick={() => canEdit && onToggle(tarefa)} disabled={!canEdit}
          style={{ width: '22px', height: '22px', borderRadius: T.radius.sm, border: concluido ? 'none' : `1.5px solid ${T.borderStrong}`, background: concluido ? T.success : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: canEdit ? 'pointer' : 'default', padding: 0 }}>
          {concluido && <Check size={13} color={T.onPrimary} strokeWidth={3} />}
        </button>

        {/* Title + metadata — click abre detalhes */}
        <div onClick={() => onEdit(tarefa)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: concluido ? T.textMuted : T.text, textDecoration: concluido ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tarefa.titulo}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', flexWrap: 'wrap' }}>
            {tarefa.prazo && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '12px', color: atrasada ? T.danger : T.textMuted, fontWeight: atrasada ? '600' : '400' }}>
                <Calendar size={11} /> {formatPrazo(tarefa.prazo)}
              </span>
            )}
            {tarefa.prioridade && tarefa.prioridade !== 'media' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '11px', color: prioColor, fontWeight: '600' }}>
                <Flag size={9} /> {PRIORIDADE_LABELS[tarefa.prioridade]}
              </span>
            )}
            {hasSubs && <span style={{ fontSize: '11px', color: T.textSubtle }}>{subDone}/{subtarefas.length} subs</span>}
            {checklist.length > 0 && <span style={{ fontSize: '11px', color: T.textSubtle }}>{checklist.filter(c => c.concluido).length}/{checklist.length} chk</span>}
          </div>
        </div>

        {/* Quick actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
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
          {/* Avatar / Responsável */}
          <button onClick={() => canEdit && setPickingResp(true)} title="Atribuir responsável"
            style={{
              width: '28px', height: '28px', borderRadius: T.radius.pill, border: `1.5px solid ${tarefa.responsavel_nome ? 'transparent' : T.borderStrong}`,
              background: tarefa.responsavel_nome ? avatarColor(tarefa.responsavel_nome) : T.surface,
              color: tarefa.responsavel_nome ? T.onPrimary : T.textSubtle,
              fontSize: '10px', fontWeight: '700', cursor: canEdit ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            }}>
            {tarefa.responsavel_nome ? getInitials(tarefa.responsavel_nome) : <User size={13} />}
          </button>
          {/* Caneta — editar inline */}
          {canEdit && (
            <button onClick={() => setEditing(true)} title="Editar inline"
              style={{ width: '32px', height: '32px', borderRadius: T.radius.sm, border: 'none', background: 'none', color: T.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
              <Pencil size={15} />
            </button>
          )}
          {/* Seta — ver subtarefas (expandir/recolher) */}
          {hasSubs && (
            <button onClick={() => setExpanded(!expanded)} title="Ver subtarefas"
              style={{ width: '32px', height: '32px', borderRadius: T.radius.sm, border: 'none', background: 'none', color: T.textSubtle, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
              <ChevronRight size={18} style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.25s ease' }} />
            </button>
          )}
        </div>
      </div>

      {/* Subtarefas expandidas */}
      {expanded && hasSubs && (
        <div style={{ padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {subtarefas.map(sub => (
            <TarefaCard key={sub.id} tarefa={sub} subtarefas={[]} onEdit={onEdit} onToggle={onToggle} onUpdate={onUpdate} canEdit={canEdit} depth={1} />
          ))}
        </div>
      )}

      {/* Editor inline — painel sobreposto */}
      {editing && (
        <TarefaInlineEditor
          tarefa={tarefa}
          onSave={(data) => { onUpdate(tarefa.id, data); setEditing(false); }}
          onClose={() => setEditing(false)}
        />
      )}

      {/* Seletor de responsável — painel sobreposto */}
      {pickingResp && (
        <ResponsavelPicker
          current={tarefa.responsavel_nome}
          onSave={(nome) => { onUpdate(tarefa.id, { responsavel_nome: nome }); setPickingResp(false); }}
          onClose={() => setPickingResp(false)}
        />
      )}
    </div>
  );
}