import { useState } from 'react';
import { C } from './CaravanasUtils';
import { IcoX } from './CaravanasIcons';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';

export default function CaravanaNovaForm({ onClose }) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ nome: '', lider_nome: '', lider_email: '', lider_whatsapp: '', cidade_origem: '' });

  const inp = {
    width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: '6px',
    padding: '9px 12px', color: C.text, fontSize: '13px', fontFamily: 'Inter,sans-serif',
    outline: 'none', boxSizing: 'border-box',
  };

  const salvar = async () => {
    if (!form.nome || !form.lider_nome) return alert('Preencha nome e líder');
    setSaving(true);
    await base44.entities.EventoM31Caravana.create({ ...form, total_membros: 0, ativa: true });
    qc.invalidateQueries({ queryKey: ['m31caravanas'] });
    setSaving(false);
    onClose();
  };

  const campos = [
    { key: 'nome',           placeholder: 'Nome da caravana *' },
    { key: 'lider_nome',     placeholder: 'Nome do líder *' },
    { key: 'lider_whatsapp', placeholder: 'WhatsApp do líder' },
    { key: 'lider_email',    placeholder: 'Email do líder' },
    { key: 'cidade_origem',  placeholder: 'Cidade de origem' },
  ];

  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.borderSt}`, borderRadius: '10px', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <span style={{ fontSize: '14px', fontWeight: '600', color: C.text }}>Nova Caravana</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.textSec, cursor: 'pointer', padding: '4px' }}><IcoX /></button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {campos.map(f => (
          <input key={f.key} placeholder={f.placeholder} value={form[f.key]}
            onChange={e => setForm({ ...form, [f.key]: e.target.value })}
            style={inp} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
        <button onClick={onClose} style={{ flex: 1, padding: '9px', background: 'none', border: `1px solid ${C.border}`, borderRadius: '6px', color: C.textSec, fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>Cancelar</button>
        <button onClick={salvar} disabled={saving} style={{ flex: 1, padding: '9px', background: C.brand, border: 'none', borderRadius: '6px', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .7 : 1, fontFamily: 'Inter,sans-serif' }}>
          {saving ? 'Criando...' : 'Criar Caravana'}
        </button>
      </div>
    </div>
  );
}