// Editor completo dos formulários públicos (Builder 360).
// Abre no lugar do antigo preview-only: banner, textos, campos (com essenciais
// travados), campos personalizados — e ao salvar publica imediatamente.
import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Save, CheckCircle, Lock, Plus, Trash2, ChevronUp, ChevronDown, RotateCcw, Globe, ExternalLink } from 'lucide-react';
import { PUBLIC_FORMS, mergeFormConfig, validateFormConfig, humanize, EXTRAS_TYPES } from './publicFormsCatalog';
import BuilderCoresEditor from './BuilderCoresEditor';

const inputStyle = { width: '100%', padding: '7px 9px', border: '1px solid #E5E7EB', borderRadius: 7, fontSize: 12, color: '#1F2937', outline: 'none', fontFamily: 'Inter, sans-serif', background: '#FAFAFA' };
const labelStyle = { fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 3, display: 'block' };

function Section({ title, children, desc }) {
  return (
    <div style={{ borderBottom: '1px solid #F3F4F6', padding: '16px 20px' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#8B1A2B', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>{title}</div>
      {desc && <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 10, lineHeight: 1.5 }}>{desc}</div>}
      {children}
    </div>
  );
}

export default function BuilderPublicFormEditor({ formId, user }) {
  const def = PUBLIC_FORMS[formId];
  const [draft, setDraft] = useState(null);
  const [recordId, setRecordId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [erro, setErro] = useState('');
  const [previewKey, setPreviewKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    base44.entities.EventPageConfig.filter({ event_key: def.key }, '-updated_date', 1)
      .then((list) => {
        if (cancelled) return;
        setRecordId(list?.[0]?.id || null);
        setDraft(mergeFormConfig(formId, list?.[0]?.form_json));
      })
      .catch(() => { if (!cancelled) setDraft(mergeFormConfig(formId, null)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [formId]);

  if (loading || !draft) {
    return <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: '#9CA3AF', fontSize: 13 }}>Carregando configuração...</div>;
  }

  const setTexto = (k) => (e) => setDraft({ ...draft, textos: { ...draft.textos, [k]: e.target.value } });
  const setCampo = (id, asp, val) => setDraft({ ...draft, campos: { ...draft.campos, [id]: { ...draft.campos[id], [asp]: val } } });
  const travado = (id, asp) => (def.travas?.[id] || []).includes(asp);
  const protegido = (id) => def.protegidos.includes(id);

  const addExtra = () => {
    const id = `extra_${Date.now()}`;
    setDraft({ ...draft, extras: [...(draft.extras || []), { id, name: id, type: 'text', label: 'Novo campo', placeholder: '', helper: '', required: false, options: [] }] });
  };
  const setExtra = (idx, patch) => {
    const extras = draft.extras.map((f, i) => (i === idx ? { ...f, ...patch } : f));
    setDraft({ ...draft, extras });
  };
  const removeExtra = (idx) => setDraft({ ...draft, extras: draft.extras.filter((_, i) => i !== idx) });
  const moveExtra = (idx, dir) => {
    const extras = [...draft.extras];
    const j = idx + dir;
    if (j < 0 || j >= extras.length) return;
    [extras[idx], extras[j]] = [extras[j], extras[idx]];
    setDraft({ ...draft, extras });
  };

  async function handleSave() {
    setErro('');
    const invalido = validateFormConfig(formId, draft);
    if (invalido) { setErro(invalido); return; }
    setSaving(true);
    try {
      const data = {
        form_json: draft,
        updated_by_name: user?.full_name || user?.email || 'Admin',
      };
      if (recordId) {
        await base44.entities.EventPageConfig.update(recordId, data);
      } else {
        const created = await base44.entities.EventPageConfig.create({
          event_name: `${def.nome} (formulário público)`,
          event_key: def.key,
          status: 'publicado',
          landing_json: { version: 2, blocks: [] },
          form_json: draft,
          updated_by_name: user?.full_name || user?.email || 'Admin',
        });
        setRecordId(created.id);
      }
      setSaved(true);
      setPreviewKey((k) => k + 1);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setErro(e?.response?.data?.error || e?.message || 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  const toggleStyle = (on) => ({
    display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600,
    padding: '3px 9px', borderRadius: 999, border: `1px solid ${on ? '#FECACA' : '#D1FAE5'}`,
    background: on ? '#FEF2F2' : '#F0FDF4', color: on ? '#B91C1C' : '#16A34A',
    cursor: 'pointer', userSelect: 'none',
  });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'Inter, sans-serif' }}>

      {/* Toolbar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E5E7EB', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1F2937' }}>{def.nome}</div>
          <div style={{ fontSize: 11, color: '#9CA3AF', fontFamily: 'monospace' }}>{def.rota}</div>
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', border: '1px solid #D1FAE5', background: '#F0FDF4', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#16A34A' }}>
          <Globe size={13} /> Salvar publica
        </span>
        <button onClick={() => { if (window.confirm('Restaurar todo o conteúdo padrão? Isso substitui as personalizações atuais.')) setDraft(mergeFormConfig(formId, null)); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'none', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#6B7280', cursor: 'pointer' }}>
          <RotateCcw size={13} /> Restaurar padrão
        </button>
        <button onClick={handleSave} disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: saved ? '#22C55E' : '#8B1A2B', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, transition: 'background 0.3s' }}>
          {saved ? <CheckCircle size={14} /> : <Save size={14} />}
          {saved ? 'Publicado!' : saving ? 'Publicando...' : 'Salvar e publicar'}
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Editor */}
        <div style={{ flex: 1, overflowY: 'auto', background: '#fff', borderRight: '1px solid #E5E7EB' }}>
          {erro && (
            <div style={{ margin: '12px 20px 0', padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#B91C1C' }}>
              {erro}
            </div>
          )}

          {/* Banner */}
          <Section title="Banner (imagem do topo)" desc="Cole aqui a URL pública da imagem. Deixe em branco para manter o cabeçalho atual da página.">
            <label style={labelStyle}>URL da imagem</label>
            <input style={inputStyle} value={draft.banner.url} onChange={(e) => setDraft({ ...draft, banner: { ...draft.banner, url: e.target.value } })} placeholder="https://..." />
            <div style={{ height: 8 }} />
            <label style={labelStyle}>Texto alternativo (acessibilidade)</label>
            <input style={inputStyle} value={draft.banner.alt} onChange={(e) => setDraft({ ...draft, banner: { ...draft.banner, alt: e.target.value } })} />
          </Section>

          {/* Cores */}
          <Section title="Cores" desc="Paleta do tema e ajuste fino por elemento — vale só para este formulário. A identidade bordô é o padrão.">
            <BuilderCoresEditor formId={formId} cores={draft.cores} onChange={(cores) => setDraft({ ...draft, cores })} />
          </Section>

          {/* Textos */}
          <Section title="Textos da página" desc="Títulos, subtítulos, seções, botões e mensagens de sucesso.">
            {Object.keys(def.defaults.textos).map((k) => (
              <div key={k} style={{ marginBottom: 10 }}>
                <label style={labelStyle}>{humanize(k)}</label>
                {String(def.defaults.textos[k]).length > 60 ? (
                  <textarea style={{ ...inputStyle, height: 64, resize: 'vertical' }} value={draft.textos[k]} onChange={setTexto(k)} />
                ) : (
                  <input style={inputStyle} value={draft.textos[k]} onChange={setTexto(k)} />
                )}
              </div>
            ))}
          </Section>

          {/* Campos */}
          {Object.keys(def.defaults.campos).length > 0 && (
            <Section title="Campos do formulário" desc="Campos essenciais (cadeado) são fixos: sempre visíveis e obrigatórios. Nos demais você pode editar rótulo, texto de apoio, visibilidade e obrigatoriedade.">
              {Object.entries(def.defaults.campos).map(([id, meta]) => {
                const cp = draft.campos[id] || meta;
                const prot = protegido(id);
                return (
                  <div key={id} style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      {(prot || travado(id, 'visivel')) && <Lock size={12} color="#8B1A2B" />}
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#1F2937' }}>{meta.label}</span>
                      {prot && <span style={{ fontSize: 10, background: '#F6E9EC', color: '#8B1A2B', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>essencial</span>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                      <div>
                        <label style={labelStyle}>Rótulo</label>
                        <input style={inputStyle} value={cp.label} onChange={(e) => setCampo(id, 'label', e.target.value)} />
                      </div>
                      <div>
                        <label style={labelStyle}>Texto de apoio (helper)</label>
                        <input style={inputStyle} value={cp.helper} onChange={(e) => setCampo(id, 'helper', e.target.value)} />
                      </div>
                    </div>
                    {meta.placeholder !== undefined && def.defaults.campos[id].placeholder !== '' && (
                      <div style={{ marginBottom: 8 }}>
                        <label style={labelStyle}>Placeholder</label>
                        <input style={inputStyle} value={cp.placeholder} onChange={(e) => setCampo(id, 'placeholder', e.target.value)} />
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <div onClick={() => !travado(id, 'visivel') && setCampo(id, 'visivel', !cp.visivel)}
                        style={{ ...toggleStyle(!cp.visivel), opacity: travado(id, 'visivel') ? 0.45 : 1, cursor: travado(id, 'visivel') ? 'not-allowed' : 'pointer' }}>
                        {cp.visivel ? '👁 Visível' : '🚫 Oculto'}
                      </div>
                      <div onClick={() => !travado(id, 'obrigatorio') && setCampo(id, 'obrigatorio', !cp.obrigatorio)}
                        style={{ ...toggleStyle(cp.obrigatorio), opacity: travado(id, 'obrigatorio') ? 0.45 : 1, cursor: travado(id, 'obrigatorio') ? 'not-allowed' : 'pointer' }}>
                        {cp.obrigatorio ? '* Obrigatório' : 'Opcional'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </Section>
          )}

          {/* Campos personalizados */}
          <Section title="Campos personalizados" desc="Perguntas extras criadas por você. As respostas são salvas nas observações do registro — a lógica de pagamento nunca muda.">
            {(draft.extras || []).filter(Boolean).map((f, idx) => (
              <div key={f.id} style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <button onClick={() => moveExtra(idx, -1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: 2 }}><ChevronUp size={13} /></button>
                  <button onClick={() => moveExtra(idx, 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: 2 }}><ChevronDown size={13} /></button>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1F2937', flex: 1 }}>{f.label}</span>
                  <button onClick={() => removeExtra(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 4 }}><Trash2 size={13} /></button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div>
                    <label style={labelStyle}>Rótulo</label>
                    <input style={inputStyle} value={f.label} onChange={(e) => setExtra(idx, { label: e.target.value })} />
                  </div>
                  <div>
                    <label style={labelStyle}>Tipo</label>
                    <select style={inputStyle} value={f.type} onChange={(e) => setExtra(idx, { type: e.target.value })}>
                      {EXTRAS_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                </div>
                {f.type === 'select' && (
                  <div style={{ marginBottom: 8 }}>
                    <label style={labelStyle}>Opções (uma por linha)</label>
                    <textarea style={{ ...inputStyle, height: 60, resize: 'vertical' }} value={(f.options || []).join('\n')}
                      onChange={(e) => setExtra(idx, { options: e.target.value.split('\n').filter(Boolean) })} />
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div onClick={() => setExtra(idx, { required: !f.required })} style={{ ...toggleStyle(f.required), cursor: 'pointer' }}>
                    {f.required ? '* Obrigatório' : 'Opcional'}
                  </div>
                </div>
              </div>
            ))}
            <button onClick={addExtra} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F6E9EC', border: '1.5px dashed #C4485E', borderRadius: 8, padding: '9px 14px', fontSize: 12, fontWeight: 700, color: '#8B1A2B', cursor: 'pointer', width: '100%', justifyContent: 'center' }}>
              <Plus size={13} /> Adicionar campo personalizado
            </button>
          </Section>
        </div>

        {/* Preview ao vivo */}
        <div style={{ width: 430, flexShrink: 0, overflowY: 'auto', background: '#F3F4F6', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', flex: 1 }}>Prévia ao vivo da página</span>
            <button onClick={() => setPreviewKey((k) => k + 1)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 7, fontSize: 11, fontWeight: 600, color: '#374151', cursor: 'pointer', padding: '5px 9px' }}>
              <RotateCcw size={11} /> Atualizar
            </button>
            <a href={def.rota} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#8B1A2B', borderRadius: 7, fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer', padding: '5px 10px', textDecoration: 'none' }}>
              <ExternalLink size={11} /> Abrir
            </a>
          </div>
          <iframe key={previewKey} src={def.rota} title={def.nome}
            style={{ width: '100%', height: '78vh', border: '1px solid #E5E7EB', borderRadius: 16, background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }} />
        </div>
      </div>
    </div>
  );
}