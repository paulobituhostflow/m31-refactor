import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { X, CheckSquare, Square } from 'lucide-react';

const T = {
  surface1: '#FFFFFF',
  surface2: '#FFFFFF',
  border: '#E5E7EB',
  borderMd: '#D1D5DB',
  text: '#1A1A1A',
  textSec: '#6B7280',
  textMut: '#9CA3AF',
  accent: '#7A1F2B',
  accentBright: '#9A2838',
  green: '#10B981',
  fontHead: "'Inter', sans-serif",
  fontBody: "'Inter', sans-serif",
};

// Modal para atribuir/remover voluntário de grupos
export default function GroupAssignmentModal({ vol, grupos, onClose, onSaved }) {
  const [selecionados, setSelecionados] = useState(new Set(vol.grupo_ids || []));
  const [salvando, setSalvando] = useState(false);

  function toggle(id) {
    setSelecionados(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function salvar() {
    setSalvando(true);
    try {
      await base44.entities.EventoM31Voluntario.update(vol.id, { grupo_ids: [...selecionados] });
      onSaved();
      onClose();
    } catch (e) {
      alert('Erro: ' + e.message);
    }
    setSalvando(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 105, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ backgroundColor: T.surface2, border: `1px solid ${T.borderMd}`, borderRadius: '14px', width: '100%', maxWidth: '420px', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: T.text, fontFamily: T.fontHead }}>Gerenciar Grupos</div>
            <div style={{ fontSize: '12px', color: T.textSec, marginTop: '2px' }}>{vol.nome}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.textMut, cursor: 'pointer' }}><X size={17} /></button>
        </div>

        {grupos.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: T.textMut, fontFamily: T.fontBody }}>
            Nenhum grupo criado. Crie grupos na aba "Grupos & Disparos".
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '300px', overflowY: 'auto' }}>
            {grupos.map(g => {
              const sel = selecionados.has(g.id);
              return (
                <button key={g.id} onClick={() => toggle(g.id)} style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                  borderRadius: '8px', border: `1px solid ${sel ? T.accentBright : T.border}`,
                  backgroundColor: sel ? `${T.accentBright}08` : T.surface1,
                  cursor: 'pointer', textAlign: 'left',
                }}>
                  {sel
                    ? <CheckSquare size={15} color={T.accentBright} style={{ flexShrink: 0 }} />
                    : <Square size={15} color={T.textMut} style={{ flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: sel ? '600' : '400', color: T.text, fontFamily: T.fontBody }}>{g.nome}</div>
                    <div style={{ fontSize: '10px', color: T.textMut }}>{g.codigo}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', borderRadius: '8px', fontFamily: T.fontBody, fontWeight: '600',
            fontSize: '13px', cursor: 'pointer', backgroundColor: '#F8F8F9', color: T.textSec, border: `1px solid ${T.border}`,
          }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando} style={{
            padding: '8px 16px', borderRadius: '8px', fontFamily: T.fontBody, fontWeight: '600',
            fontSize: '13px', cursor: salvando ? 'not-allowed' : 'pointer', backgroundColor: T.accent, color: '#fff', border: 'none',
            opacity: salvando ? 0.6 : 1,
          }}>{salvando ? 'Salvando...' : 'Salvar Grupos'}</button>
        </div>
      </div>
    </div>
  );
}