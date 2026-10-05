import { useState, useRef, useEffect } from 'react';
import { MoreVertical, Pencil, FolderInput, Archive, Trash2 } from 'lucide-react';
import { TOKENS as T } from '@/lib/m31DesignTokens';

/**
 * Menu de ações dropdown para Áreas, Frentes, Tarefas e Subtarefas.
 * Ações: Editar nome, Mover, Arquivar, Excluir.
 */
export default function ItemActionMenu({ onEdit, onMove, onArchive, onDelete, canEdit, size = 16 }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!canEdit) return null;

  const actions = [
    { icon: Pencil, label: 'Editar nome', onClick: onEdit, color: T.text },
    { icon: FolderInput, label: 'Mover', onClick: onMove, color: T.text },
    { icon: Archive, label: 'Arquivar', onClick: onArchive, color: T.text },
    { icon: Trash2, label: 'Excluir', onClick: onDelete, color: T.danger },
  ];

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        title="Mais ações"
        style={{
          width: '28px', height: '28px', borderRadius: T.radius.sm, border: 'none',
          background: 'none', color: T.textMuted, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
        }}
      >
        <MoreVertical size={size} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 4px)',
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.md,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 50, minWidth: '160px', overflow: 'hidden',
        }}>
          {actions.map((a, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setOpen(false); a.onClick(); }}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none',
                border: 'none', cursor: 'pointer', fontSize: '13px', color: a.color,
                fontFamily: T.font.body, display: 'flex', alignItems: 'center', gap: '8px',
                borderTop: i > 0 ? `1px solid ${T.border}` : 'none',
              }}
            >
              <a.icon size={14} /> {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}