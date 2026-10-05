/**
 * AbaInformacoesGerais — Título, Data, Preletores do evento.
 */
import { useState, useEffect } from 'react';
import { TOKENS } from '@/lib/m31DesignTokens';
import { feedback } from '@/components/m31/ui';
import { Plus, Trash2, Save } from 'lucide-react';

export default function AbaInformacoesGerais({ config, onSave }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config) {
      setForm({
        titulo: config.titulo || '',
        descricao: config.descricao || '',
        data_inicio: config.data_inicio ? config.data_inicio.slice(0, 16) : '',
        data_fim: config.data_fim ? config.data_fim.slice(0, 16) : '',
        local: config.local || '',
        cidade: config.cidade || '',
        estado: config.estado || '',
        preletores: config.preletores || [],
      });
    }
  }, [config]);

  const inputStyle = { width: '100%', padding: '9px 12px', background: TOKENS.surface, border: `1.5px solid ${TOKENS.borderStrong}`, borderRadius: TOKENS.radius.md, fontSize: '13px', color: TOKENS.text, outline: 'none', fontFamily: TOKENS.font.body, boxSizing: 'border-box' };
  const labelStyle = { fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', color: TOKENS.textSubtle, display: 'block', marginBottom: '5px' };
  const btnPrimary = { padding: '9px 16px', borderRadius: TOKENS.radius.md, fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: TOKENS.font.body, display: 'inline-flex', alignItems: 'center', gap: '6px', border: 'none', background: TOKENS.primary, color: '#FFFFFF' };

  const handleSave = async () => {
    if (!form.titulo?.trim()) { feedback.warning('Informe o título do evento.'); return; }
    setSaving(true);
    try { await onSave(form); feedback.success('Informações gerais salvas.'); } catch (e) { feedback.error('Erro ao salvar.'); } finally { setSaving(false); }
  };

  const addPreletor = () => setForm(f => ({ ...f, preletores: [...(f.preletores || []), { nome: '', descricao: '', foto_url: '' }] }));
  const removePreletor = (i) => setForm(f => ({ ...f, preletores: f.preletores.filter((_, idx) => idx !== i) }));
  const updatePreletor = (i, field, val) => setForm(f => ({ ...f, preletores: f.preletores.map((p, idx) => idx === i ? { ...p, [field]: val } : p) }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <label style={labelStyle}>Título do evento *</label>
        <input style={inputStyle} value={form.titulo || ''} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Ex: M31 Filhas 2026" />
      </div>
      <div>
        <label style={labelStyle}>Descrição</label>
        <textarea style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' }} value={form.descricao || ''} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Descrição do evento..." />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={labelStyle}>Data/hora de início</label>
          <input style={inputStyle} type="datetime-local" value={form.data_inicio || ''} onChange={e => setForm({ ...form, data_inicio: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>Data/hora de fim</label>
          <input style={inputStyle} type="datetime-local" value={form.data_fim || ''} onChange={e => setForm({ ...form, data_fim: e.target.value })} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px' }}>
        <div>
          <label style={labelStyle}>Local</label>
          <input style={inputStyle} value={form.local || ''} onChange={e => setForm({ ...form, local: e.target.value })} placeholder="Ex: Centro de Convenções" />
        </div>
        <div>
          <label style={labelStyle}>Cidade</label>
          <input style={inputStyle} value={form.cidade || ''} onChange={e => setForm({ ...form, cidade: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>Estado</label>
          <input style={inputStyle} value={form.estado || ''} onChange={e => setForm({ ...form, estado: e.target.value })} placeholder="UF" />
        </div>
      </div>

      {/* Preletores */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>Preletores</label>
          <button onClick={addPreletor} style={{ padding: '4px 10px', borderRadius: TOKENS.radius.md, fontSize: '12px', fontWeight: '600', cursor: 'pointer', border: `1px solid ${TOKENS.borderStrong}`, background: TOKENS.surfaceSubtle, color: TOKENS.text, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Plus size={12} /> Adicionar
          </button>
        </div>
        {(form.preletores || []).map((p, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '8px', marginBottom: '8px', alignItems: 'end' }}>
            <input style={inputStyle} value={p.nome} onChange={e => updatePreletor(i, 'nome', e.target.value)} placeholder="Nome do preletor" />
            <input style={inputStyle} value={p.descricao} onChange={e => updatePreletor(i, 'descricao', e.target.value)} placeholder="Breve descrição" />
            <button onClick={() => removePreletor(i)} style={{ padding: '9px', borderRadius: TOKENS.radius.md, border: `1px solid ${TOKENS.dangerSoft}`, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Trash2 size={14} color={TOKENS.danger} />
            </button>
          </div>
        ))}
        {(!form.preletores || form.preletores.length === 0) && (
          <div style={{ fontSize: '12px', color: TOKENS.textMuted, padding: '12px', textAlign: 'center', background: TOKENS.surfaceSubtle, borderRadius: TOKENS.radius.md }}>
            Nenhum preletor adicionado.
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={handleSave} disabled={saving} style={btnPrimary}>
          <Save size={14} /> {saving ? 'Salvando...' : 'Salvar Informações'}
        </button>
      </div>
    </div>
  );
}