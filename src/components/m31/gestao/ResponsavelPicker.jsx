import { useState, useEffect } from 'react';
import { X, Check, Trash2 } from 'lucide-react';
import { TOKENS as T } from '@/lib/m31DesignTokens';

const inputStyle = {
  width: '100%', minHeight: '44px', padding: '0 12px', background: T.surface,
  border: `1px solid ${T.border}`, borderRadius: T.radius.md, fontSize: '15px',
  color: T.text, outline: 'none', fontFamily: T.font.body, boxSizing: 'border-box',
};

/**
 * ResponsavelPicker — mini painel sobreposto para atribuir,
 * trocar ou remover o responsável de uma tarefa.
 */
export default function ResponsavelPicker({ current, onSave, onClose }) {
  const [nome, setNome] = useState(current || '');

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200 }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201,
        background: T.surface, borderTopLeftRadius: T.radius.xl, borderTopRightRadius: T.radius.xl,
        display: 'flex', flexDirection: 'column', boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
        animation: 'm31-slide-up 0.25s cubic-bezier(0.16,1,0.3,1)',
      }}>
        <style>{`@keyframes m31-slide-up { from { transform: translateY(100%) } to { transform: translateY(0) } }`}</style>

        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '8px' }}>
          <div style={{ width: '36px', height: '4px', background: T.border, borderRadius: T.radius.pill }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px 12px' }}>
          <span style={{ fontSize: '16px', fontWeight: '700', color: T.text, fontFamily: T.font.body }}>Responsável</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, padding: '4px', display: 'flex' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input
            value={nome}
            onChange={e => setNome(e.target.value)}
            autoFocus
            placeholder="Nome do responsável"
            style={inputStyle}
            onKeyDown={e => { if (e.key === 'Enter' && nome.trim()) onSave(nome.trim()); }}
          />
          {current && (
            <button onClick={() => onSave('')} style={{
              minHeight: '40px', background: 'none', border: `1px solid ${T.border}`, borderRadius: T.radius.md,
              color: T.danger, fontSize: '14px', fontWeight: '500', cursor: 'pointer', fontFamily: T.font.body,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            }}>
              <Trash2 size={14} /> Remover responsável
            </button>
          )}
        </div>

        <div style={{ padding: '8px 16px', paddingBottom: 'max(8px, env(safe-area-inset-bottom))', borderTop: `1px solid ${T.border}`, display: 'flex', gap: '10px' }}>
          <button onClick={onClose} style={{ padding: '0 16px', minHeight: '44px', background: 'none', border: 'none', color: T.textMuted, fontSize: '15px', fontWeight: '500', cursor: 'pointer', fontFamily: T.font.body }}>Cancelar</button>
          <button onClick={() => onSave(nome.trim())} disabled={!nome.trim()} style={{
            flex: 1, minHeight: '44px', background: nome.trim() ? 'linear-gradient(135deg, #8B1A2B 0%, #6B1422 100%)' : T.border,
            color: T.onPrimary, border: 'none', borderRadius: T.radius.md, fontSize: '15px', fontWeight: '700',
            cursor: nome.trim() ? 'pointer' : 'not-allowed', fontFamily: T.font.body,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', opacity: nome.trim() ? 1 : 0.6,
          }}>
            <Check size={16} /> Atribuir
          </button>
        </div>
      </div>
    </>
  );
}