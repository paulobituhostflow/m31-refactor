/**
 * AbaFormularioPersonalizado — Liga/desliga campos do formulário de inscrição.
 */
import { useState, useEffect } from 'react';
import { TOKENS } from '@/lib/m31DesignTokens';
import { feedback } from '@/components/m31/ui';
import { Save, Plus, Trash2 } from 'lucide-react';

const CAMPOS_PADRAO = [
  { key: 'perguntar_faz_parte_igreja', label: 'Faz parte de alguma igreja?', desc: 'Pergunta se a participante faz parte de uma congregação' },
  { key: 'perguntar_nome_igreja', label: 'Nome da igreja', desc: 'Qual o nome da igreja que frequenta' },
  { key: 'perguntar_cidade_origem', label: 'Cidade de origem', desc: 'Cidade de onde a participante vem' },
  { key: 'perguntar_estado', label: 'Estado', desc: 'UF de origem' },
  { key: 'perguntar_como_conheceu', label: 'Como conheceu o M31', desc: 'Canal de aquisição (Instagram, amiga, igreja...)' },
  { key: 'perguntar_ja_participou', label: 'Já participou do M31', desc: 'Se já esteve em edições anteriores' },
  { key: 'perguntar_tamanho_camiseta', label: 'Tamanho da camiseta', desc: 'Tamanho para camiseta/kit do evento' },
];

export default function AbaFormularioPersonalizado({ config, onSave }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config) {
      setForm({
        perguntar_faz_parte_igreja: config.perguntar_faz_parte_igreja ?? true,
        perguntar_nome_igreja: config.perguntar_nome_igreja ?? true,
        perguntar_cidade_origem: config.perguntar_cidade_origem ?? true,
        perguntar_estado: config.perguntar_estado ?? true,
        perguntar_como_conheceu: config.perguntar_como_conheceu ?? true,
        perguntar_ja_participou: config.perguntar_ja_participou ?? true,
        perguntar_tamanho_camiseta: config.perguntar_tamanho_camiseta ?? false,
        campos_extras: config.campos_extras || [],
      });
    }
  }, [config]);

  const toggle = (key) => setForm(f => ({ ...f, [key]: !f[key] }));

  const addExtra = () => setForm(f => ({ ...f, campos_extras: [...(f.campos_extras || []), { label: '', tipo: 'texto', obrigatorio: false, opcoes: [] }] }));
  const removeExtra = (i) => setForm(f => ({ ...f, campos_extras: f.campos_extras.filter((_, idx) => idx !== i) }));
  const updateExtra = (i, field, val) => setForm(f => ({ ...f, campos_extras: f.campos_extras.map((c, idx) => idx === i ? { ...c, [field]: val } : c) }));

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(form); feedback.success('Configuração do formulário salva.'); } catch (e) { feedback.error('Erro ao salvar.'); } finally { setSaving(false); }
  };

  const inputStyle = { width: '100%', padding: '7px 10px', background: TOKENS.surface, border: `1.5px solid ${TOKENS.borderStrong}`, borderRadius: TOKENS.radius.md, fontSize: '13px', color: TOKENS.text, outline: 'none', fontFamily: TOKENS.font.body, boxSizing: 'border-box' };
  const labelStyle = { fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', color: TOKENS.textSubtle, display: 'block', marginBottom: '3px' };
  const btnPrimary = { padding: '9px 16px', borderRadius: TOKENS.radius.md, fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: TOKENS.font.body, display: 'inline-flex', alignItems: 'center', gap: '6px', border: 'none', background: TOKENS.primary, color: '#FFFFFF' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Campos padrão */}
      <div>
        <label style={{ ...labelStyle, fontSize: '11px', marginBottom: '8px' }}>Campos do formulário</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {CAMPOS_PADRAO.map(c => (
            <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: TOKENS.radius.md }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: TOKENS.text }}>{c.label}</div>
                <div style={{ fontSize: '11px', color: TOKENS.textMuted, marginTop: '1px' }}>{c.desc}</div>
              </div>
              <button onClick={() => toggle(c.key)} style={{ padding: '5px 14px', borderRadius: TOKENS.radius.pill, fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: `1px solid ${form[c.key] ? TOKENS.success : TOKENS.borderStrong}`, background: form[c.key] ? TOKENS.success : TOKENS.surfaceSubtle, color: form[c.key] ? '#FFFFFF' : TOKENS.textMuted, flexShrink: 0 }}>
                {form[c.key] ? 'Ativo' : 'Inativo'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Campos extras */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <label style={{ ...labelStyle, fontSize: '11px', marginBottom: 0 }}>Campos personalizados extras</label>
          <button onClick={addExtra} style={{ padding: '5px 10px', borderRadius: TOKENS.radius.md, fontSize: '12px', fontWeight: '600', cursor: 'pointer', border: `1px solid ${TOKENS.borderStrong}`, background: TOKENS.surfaceSubtle, color: TOKENS.text, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Plus size={12} /> Adicionar campo
          </button>
        </div>
        {(form.campos_extras || []).map((c, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto 1fr auto', gap: '8px', marginBottom: '8px', alignItems: 'end', padding: '10px', background: TOKENS.surfaceSubtle, borderRadius: TOKENS.radius.md }}>
            <div>
              <label style={labelStyle}>Rótulo</label>
              <input style={inputStyle} value={c.label} onChange={e => updateExtra(i, 'label', e.target.value)} placeholder="Ex: Restrição alimentar" />
            </div>
            <div>
              <label style={labelStyle}>Tipo</label>
              <select style={inputStyle} value={c.tipo} onChange={e => updateExtra(i, 'tipo', e.target.value)}>
                <option value="texto">Texto</option>
                <option value="numero">Número</option>
                <option value="data">Data</option>
                <option value="selecao">Seleção</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button onClick={() => updateExtra(i, 'obrigatorio', !c.obrigatorio)} style={{ padding: '7px 10px', borderRadius: TOKENS.radius.pill, fontSize: '10px', fontWeight: '700', cursor: 'pointer', border: `1px solid ${c.obrigatorio ? TOKENS.danger : TOKENS.borderStrong}`, background: c.obrigatorio ? TOKENS.dangerSoft : TOKENS.surface, color: c.obrigatorio ? TOKENS.danger : TOKENS.textMuted }}>
                Obrig.
              </button>
            </div>
            <div>
              {c.tipo === 'selecao' ? (
                <>
                  <label style={labelStyle}>Opções (vírgula)</label>
                  <input style={inputStyle} value={(c.opcoes || []).join(', ')} onChange={e => updateExtra(i, 'opcoes', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="PP, P, M, G, GG" />
                </>
              ) : null}
            </div>
            <button onClick={() => removeExtra(i)} style={{ padding: '7px', borderRadius: TOKENS.radius.md, border: `1px solid ${TOKENS.dangerSoft}`, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '34px' }}>
              <Trash2 size={14} color={TOKENS.danger} />
            </button>
          </div>
        ))}
        {(!form.campos_extras || form.campos_extras.length === 0) && (
          <div style={{ fontSize: '12px', color: TOKENS.textMuted, padding: '12px', textAlign: 'center', background: TOKENS.surfaceSubtle, borderRadius: TOKENS.radius.md }}>
            Nenhum campo extra adicionado.
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={handleSave} disabled={saving} style={btnPrimary}>
          <Save size={14} /> {saving ? 'Salvando...' : 'Salvar Formulário'}
        </button>
      </div>
    </div>
  );
}