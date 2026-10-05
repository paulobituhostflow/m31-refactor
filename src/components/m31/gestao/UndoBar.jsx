import { TOKENS as T } from '@/lib/m31DesignTokens';
import { Undo2, X } from 'lucide-react';

/**
 * Barra flutuante de undo — aparece por 5 segundos após arquivar/excluir.
 */
export default function UndoBar({ state, onDismiss }) {
  if (!state) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 'max(24px, env(safe-area-inset-bottom))', left: '50%',
      transform: 'translateX(-50%)', zIndex: 80,
      background: T.text, color: T.surface, borderRadius: T.radius.md,
      padding: '10px 12px 10px 16px', display: 'flex', alignItems: 'center', gap: '12px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.20)', maxWidth: '90vw',
      fontFamily: T.font.body, fontSize: '13px', fontWeight: '500',
      animation: 'm31-undo-in 0.2s ease-out',
    }}>
      <style>{`@keyframes m31-undo-in { from { opacity: 0; transform: translateX(-50%) translateY(12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }`}</style>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{state.label}</span>
      <button
        onClick={() => { state.onUndo(); onDismiss(); }}
        style={{
          background: T.primary, color: T.onPrimary, border: 'none', borderRadius: T.radius.sm,
          padding: '6px 12px', fontSize: '12px', fontWeight: '700', cursor: 'pointer',
          fontFamily: T.font.body, display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0,
        }}
      >
        <Undo2 size={13} /> Desfazer
      </button>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: T.surface, cursor: 'pointer', padding: '2px', opacity: 0.6, flexShrink: 0 }}>
        <X size={14} />
      </button>
    </div>
  );
}