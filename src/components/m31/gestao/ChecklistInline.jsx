import { useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { TOKENS as T } from '@/lib/m31DesignTokens';

/**
 * Checklist inline — microações de conferência dentro de Tarefa Mãe ou Subtarefa.
 * Props:
 *   tarefaId, itens, onToggleItem(id), onAddItem(texto), onRemoveItem(id), canEdit
 */
export default function ChecklistInline({ itens = [], onToggleItem, onAddItem, onRemoveItem, onUpdateItem, canEdit }) {
  const [novoItem, setNovoItem] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const done = itens.filter(i => i.concluido).length;

  const saveEdit = (id) => {
    if (editText.trim() && onUpdateItem) onUpdateItem(id, editText.trim());
    setEditingId(null);
  };

  const add = () => {
    if (!novoItem.trim()) return;
    onAddItem(novoItem.trim());
    setNovoItem('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {itens.map(item => (
        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '36px' }}>
          <button onClick={() => onToggleItem(item.id)} disabled={!canEdit}
            style={{ width: '20px', height: '20px', borderRadius: T.radius.sm, border: item.concluido ? 'none' : `1.5px solid ${T.borderStrong}`, background: item.concluido ? T.success : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: canEdit ? 'pointer' : 'default', padding: 0 }}>
            {item.concluido && <Check size={12} color={T.onPrimary} strokeWidth={3} />}
          </button>
          {editingId === item.id ? (
            <input
              value={editText}
              onChange={e => setEditText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveEdit(item.id); else if (e.key === 'Escape') setEditingId(null); }}
              onBlur={() => saveEdit(item.id)}
              autoFocus
              style={{ flex: 1, minHeight: '32px', padding: '0 8px', border: `1px solid ${T.primary}`, borderRadius: T.radius.md, fontSize: '13px', fontFamily: T.font.body, color: T.text, outline: 'none' }}
            />
          ) : (
            <span
              onClick={() => { if (canEdit) { setEditingId(item.id); setEditText(item.texto); } }}
              style={{ fontSize: '13px', flex: 1, textDecoration: item.concluido ? 'line-through' : 'none', color: item.concluido ? T.textMuted : T.text, cursor: canEdit ? 'pointer' : 'default' }}
            >{item.texto}</span>
          )}
          {canEdit && (
            <button onClick={() => { if (window.confirm('Excluir este item do checklist?')) onRemoveItem(item.id); }} style={{ color: T.textSubtle, background: 'none', border: 'none', cursor: 'pointer', padding: '4px', minWidth: '32px', minHeight: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ))}
      {canEdit && (
        <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
          <input value={novoItem} onChange={e => setNovoItem(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
            placeholder="Adicionar item..."
            style={{ flex: 1, minHeight: '36px', border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: '0 10px', fontSize: '13px', fontFamily: T.font.body, background: T.surface, color: T.text, outline: 'none' }} />
          <button onClick={add} disabled={!novoItem.trim()}
            style={{ background: T.primary, color: T.onPrimary, border: 'none', borderRadius: T.radius.md, width: '36px', minHeight: '36px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: novoItem.trim() ? 1 : 0.4 }}>
            <Plus size={14} />
          </button>
        </div>
      )}
      {itens.length > 0 && (
        <span style={{ fontSize: '11px', color: T.textSubtle, marginTop: '2px' }}>{done}/{itens.length} conferidos</span>
      )}
    </div>
  );
}