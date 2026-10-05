import { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { TOKENS as T } from '@/lib/m31DesignTokens';
import { PRIORIDADE_LABELS, STATUS_LABELS } from './tarefaHelpers';

const inputStyle = {
  width: '100%', minHeight: '44px', padding: '0 12px', background: T.surface,
  border: `1px solid ${T.border}`, borderRadius: T.radius.md, fontSize: '15px',
  color: T.text, outline: 'none', fontFamily: T.font.body, boxSizing: 'border-box',
};

const labelStyle = {
  fontSize: '13px', fontWeight: '500', color: T.text, marginBottom: '4px', display: 'block',
};

/**
 * TarefaInlineEditor — mini painel sobreposto para editar
 * título, prazo, prioridade e status sem sair da lista.
 */
export default function TarefaInlineEditor({ tarefa, onSave, onClose }) {
  const [form, setForm] = useState({
    titulo: tarefa.titulo || '',
    prazo: tarefa.prazo || '',
    prioridade: tarefa.prioridade || 'media',
    status: tarefa.status || 'a_fazer',
  });

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200 }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201,
        background: T.surface, borderTopLeftRadius: T.radius.xl, borderTopRightRadius: T.radius.xl,
        maxHeight: '75vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
        animation: 'm31-slide-up 0.25s cubic-bezier(0.16,1,0.3,1)',
      }}>
        <style>{`@keyframes m31-slide-up { from { transform: translateY(100%) } to { transform: translateY(0) } }`}</style>

        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '8px' }}>
          <div style={{ width: '36px', height: '4px', background: T.border, borderRadius: T.radius.pill }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px 12px', flexShrink: 0 }}>
          <span style={{ fontSize: '16px', fontWeight: '700', color: T.text, fontFamily: T.font.body }}>Editar rápido</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, padding: '4px', display: 'flex' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', flex: 1 }}>
          <div>
            <label style={labelStyle}>Título</label>
            <input value={form.titulo} onChange={e => set('titulo', e.target.value)} autoFocus style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Prioridade</label>
              <select value={form.prioridade} onChange={e => set('prioridade', e.target.value)} style={inputStyle}>
                {Object.entries(PRIORIDADE_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Prazo</label>
              <input type="date" value={form.prazo} onChange={e => set('prazo', e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)} style={inputStyle}>
              {Object.entries(STATUS_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ padding: '8px 16px', paddingBottom: 'max(8px, env(safe-area-inset-bottom))', borderTop: `1px solid ${T.border}`, display: 'flex', gap: '10px', flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '0 16px', minHeight: '44px', background: 'none', border: 'none', color: T.textMuted, fontSize: '15px', fontWeight: '500', cursor: 'pointer', fontFamily: T.font.body }}>Cancelar</button>
          <button onClick={() => onSave(form)} disabled={!form.titulo.trim()} style={{
            flex: 1, minHeight: '44px', background: form.titulo.trim() ? 'linear-gradient(135deg, #8B1A2B 0%, #6B1422 100%)' : T.border,
            color: T.onPrimary, border: 'none', borderRadius: T.radius.md, fontSize: '15px', fontWeight: '700',
            cursor: form.titulo.trim() ? 'pointer' : 'not-allowed', fontFamily: T.font.body,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', opacity: form.titulo.trim() ? 1 : 0.6,
          }}>
            <Check size={16} /> Salvar
          </button>
        </div>
      </div>
    </>
  );
}