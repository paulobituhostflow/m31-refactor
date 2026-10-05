import { useState, useEffect } from 'react';
import { TOKENS as T } from '@/lib/m31DesignTokens';
import { X, Check, FolderInput, Pencil } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

function useIsMobile() {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const h = () => setM(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return m;
}

/**
 * Drawer (desktop) / Bottom sheet (mobile) para editar nome E mover item.
 * mode: 'edit' | 'move'
 */
export default function ItemManageDrawer({ type, item, mode, onSave, onClose }) {
  const isMobile = useIsMobile();
  const nameField = type === 'tarefa' || type === 'subtarefa' ? 'titulo' : 'nome';
  const [name, setName] = useState(item[nameField] || '');
  const [targetId, setTargetId] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: areas = [] } = useQuery({
    queryKey: ['m31areas-manage'],
    queryFn: () => base44.entities.M31Area.filter({ ativo: true }, 'ordem', 50),
    enabled: mode === 'move' && type === 'frente',
  });

  const { data: frentes = [] } = useQuery({
    queryKey: ['m31frentes-manage'],
    queryFn: () => base44.entities.M31Frente.filter({ ativo: true }, 'ordem', 100),
    enabled: mode === 'move' && (type === 'tarefa' || type === 'subtarefa'),
  });

  const { data: parentTasks = [] } = useQuery({
    queryKey: ['m31parent-tasks-manage'],
    queryFn: () => base44.entities.EventoM31Tarefa.filter({ tarefa_pai_id: null }, '-created_date', 200),
    enabled: mode === 'move' && type === 'subtarefa',
  });

  useEffect(() => {
    if (isMobile) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isMobile]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (mode === 'edit') {
        await onSave(name);
      } else if (mode === 'move') {
        if (type === 'frente') {
          await onSave(targetId, 'area');
        } else if (type === 'tarefa') {
          await onSave(targetId || null, targetId ? 'frente' : 'none');
        } else if (type === 'subtarefa') {
          await onSave(targetId, 'tarefa');
        }
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const isEdit = mode === 'edit';
  const title = isEdit ? 'Editar nome' : 'Mover';

  const overlayStyle = isMobile
    ? { position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.50)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }
    : { position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.30)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'flex-end' };

  const panelStyle = isMobile
    ? { background: T.surface, borderTopLeftRadius: '20px', borderTopRightRadius: '20px', padding: '20px', maxHeight: '70vh', overflowY: 'auto', animation: 'm31-slide-up 0.28s cubic-bezier(0.16,1,0.3,1)' }
    : { width: '400px', maxWidth: '100vw', height: '100vh', background: T.surface, borderLeft: `1px solid ${T.border}`, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', animation: 'm31-drawer-slide 250ms cubic-bezier(0.16,1,0.3,1) both' };

  const inputStyle = {
    width: '100%', padding: '10px 12px', fontSize: '14px', fontFamily: T.font.body,
    border: `1px solid ${T.border}`, borderRadius: T.radius.md, background: T.surface,
    color: T.text, outline: 'none',
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <style>{`@keyframes m31-slide-up { from { transform: translateY(100%) } to { transform: translateY(0) } } @keyframes m31-drawer-slide { from { transform: translateX(100%) } to { transform: translateX(0) } }`}</style>
      <div style={panelStyle} onClick={e => e.stopPropagation()}>
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
            <div style={{ width: '36px', height: '4px', background: T.border, borderRadius: T.radius.pill }} />
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: T.text, margin: 0, fontFamily: T.font.body, display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isEdit ? <Pencil size={16} color={T.primary} /> : <FolderInput size={16} color={T.primary} />}
            {title}
          </h3>
          <button onClick={onClose} style={{ color: T.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
            <X size={20} />
          </button>
        </div>

        {isEdit && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: T.textMuted, marginBottom: '6px', fontFamily: T.font.body, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {type === 'tarefa' || type === 'subtarefa' ? 'Título' : 'Nome'}
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus={!isMobile}
              onKeyDown={e => { if (e.key === 'Enter' && name.trim()) handleSave(); }}
              style={inputStyle}
            />
          </div>
        )}

        {!isEdit && type === 'frente' && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: T.textMuted, marginBottom: '6px', fontFamily: T.font.body, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Mover para a área
            </label>
            <select value={targetId} onChange={e => setTargetId(e.target.value)} style={inputStyle}>
              <option value="">Selecione uma área…</option>
              {areas.filter(a => a.id !== item.area_id).map(a => (
                <option key={a.id} value={a.id}>{a.nome}</option>
              ))}
            </select>
          </div>
        )}

        {!isEdit && (type === 'tarefa') && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: T.textMuted, marginBottom: '6px', fontFamily: T.font.body, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Mover para a frente
            </label>
            <select value={targetId} onChange={e => setTargetId(e.target.value)} style={inputStyle}>
              <option value="">Deixar sem frente</option>
              {frentes.filter(f => f.id !== item.frente_id).map(f => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          </div>
        )}

        {!isEdit && type === 'subtarefa' && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: T.textMuted, marginBottom: '6px', fontFamily: T.font.body, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Mover para a tarefa mãe
            </label>
            <select value={targetId} onChange={e => setTargetId(e.target.value)} style={inputStyle}>
              <option value="">Selecione uma tarefa mãe…</option>
              {parentTasks.filter(t => t.id !== item.id && t.id !== item.tarefa_pai_id).map(t => (
                <option key={t.id} value={t.id}>{t.titulo}</option>
              ))}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', border: `1px solid ${T.border}`, background: 'none', borderRadius: T.radius.md, fontSize: '14px', fontWeight: '500', color: T.textMuted, cursor: 'pointer', fontFamily: T.font.body }}>
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || (isEdit && !name.trim()) || (!isEdit && type === 'frente' && !targetId) || (!isEdit && type === 'subtarefa' && !targetId)}
            style={{ flex: 1, padding: '10px', border: 'none', background: T.primary, color: T.onPrimary, borderRadius: T.radius.md, fontSize: '14px', fontWeight: '600', cursor: 'pointer', fontFamily: T.font.body, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', opacity: (saving || (isEdit && !name.trim())) ? 0.5 : 1 }}
          >
            <Check size={15} /> Salvar
          </button>
        </div>
      </div>
    </div>
  );
}