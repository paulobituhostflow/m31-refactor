// M31 Event Builder — Gerenciamento de Landing Pages e Formulários
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, Save, Globe, EyeOff, Layout, FileText, CheckCircle, GitBranch } from 'lucide-react';
import BuilderLandingEditor from './builder/BuilderLandingEditor';
import BuilderFormEditor from './builder/BuilderFormEditor';
import BuilderPreview from './builder/BuilderPreview';
import BuilderFunil from './builder/BuilderFunil';
import { ensureV2, DEFAULT_BLOCKS_V2 } from './builder/blocksConfig';
import BuilderFormsReaisPreview, { FORMS_REAIS, FormRealCard } from './builder/BuilderFormsReais';
import BuilderPublicFormEditor from './builder/BuilderPublicFormEditor';
import CamisasTextosEditor from './builder/CamisasTextosEditor';
import { PUBLIC_FORMS } from './builder/publicFormsCatalog';
import { DEFAULT_CAMISAS_TEXTOS } from '@/components/m31/camisas/camisasLandingConfig';

const DEFAULT_LANDING_V2 = {
  version: 2,
  colors: { primary: '#8B1A2B', bg: '#F2D4BD', card: '#FFFFFF', text: '#1A1A1A', gold: '#C4A265' },
  blocks: DEFAULT_BLOCKS_V2,
};

const DEFAULT_FORM = {
  steps: [
    {
      title: 'Vamos conhecer você',
      subtitle: 'Preencha suas informações básicas',
      fields: [
        { name: 'nome', type: 'text', label: 'Nome completo', required: true, placeholder: 'Seu nome completo' },
        { name: 'email', type: 'email', label: 'E-mail', required: true, placeholder: 'seu@email.com' },
        { name: 'celular', type: 'phone', label: 'WhatsApp', required: true, helper: 'Usaremos para informações do evento.' },
        { name: 'cpf', type: 'cpf', label: 'CPF', required: true },
      ],
    },
    {
      title: 'Mais sobre você',
      subtitle: 'Conte-nos um pouco mais',
      fields: [
        { name: 'cidade', type: 'text', label: 'Cidade', required: true },
        { name: 'faz_parte_igreja', type: 'toggle', label: 'Faz parte de alguma igreja?', required: true },
        { name: 'como_conheceu', type: 'select', label: 'Como conheceu o M31?', required: false, options: ['Instagram', 'Indicação de amiga', 'Igreja', 'WhatsApp', 'Outro'] },
      ],
    },
  ],
};

const PRESET_EVENTS = [
  { key: 'm31_filhas_2026', name: 'M31 Filhas 2026' },
  { key: 'm31_servir', name: 'M31 Servir — Voluntários' },
  { key: 'm31_caravana', name: 'M31 Caravana' },
  { key: 'm31_kids', name: 'M31 Kids' },
];

function EventCard({ config, onSelect, onDuplicate, isActive }) {
  const statusColor = config.status === 'publicado' ? '#22C55E' : config.status === 'rascunho' ? '#F59E0B' : '#9CA3AF';
  const statusLabel = config.status === 'publicado' ? 'Publicado' : config.status === 'rascunho' ? 'Rascunho' : 'Arquivado';

  return (
    <div onClick={onSelect}
      style={{
        background: isActive ? '#FFF5F7' : '#fff',
        border: `1.5px solid ${isActive ? '#8B1A2B' : '#E5E7EB'}`,
        borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
        transition: 'all 0.15s', marginBottom: 8,
      }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1F2937', marginBottom: 4 }}>{config.event_name}</div>
          <div style={{ fontSize: 11, color: '#9CA3AF', fontFamily: 'monospace' }}>{config.event_key}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: statusColor }}>{statusLabel}</span>
        </div>
      </div>
      {config.updated_by_name && (
        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>Editado por {config.updated_by_name}</div>
      )}
    </div>
  );
}

export default function M31EventBuilder({ user }) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [activeTab, setActiveTab] = useState('landing');
  const [landingDraft, setLandingDraft] = useState(null);
  const [formDraft, setFormDraft] = useState(null);
  const [saved, setSaved] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedRealId, setSelectedRealId] = useState('inscricao');
  const [newEventName, setNewEventName] = useState('');
  const [newEventKey, setNewEventKey] = useState('');

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['event_page_configs'],
    queryFn: () => base44.entities.EventPageConfig.list('-updated_date'),
  });

  const selected = configs.find(c => c.id === selectedId);

  useEffect(() => {
    if (selected) {
      setLandingDraft(ensureV2(selected.landing_json || DEFAULT_LANDING_V2));
      if (selected.event_key === 'm31_camisas') {
        // Formulário da Lojinha: form_json guarda os textos editáveis do fluxo.
        const textos = selected.form_json?.textos || { ...DEFAULT_CAMISAS_TEXTOS };
        setFormDraft({ version: 2, textos });
      } else {
        setFormDraft(selected.form_json || DEFAULT_FORM);
      }
    }
  }, [selectedId, configs]);

  const saveMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.EventPageConfig.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['event_page_configs']);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.EventPageConfig.create(data),
    onSuccess: (created) => {
      queryClient.invalidateQueries(['event_page_configs']);
      setSelectedId(created.id);
      setShowNewModal(false);
      setNewEventName('');
      setNewEventKey('');
    },
  });

  const toggleStatus = () => {
    if (!selected) return;
    const newStatus = selected.status === 'publicado' ? 'rascunho' : 'publicado';
    saveMutation.mutate({ id: selected.id, data: { status: newStatus } });
  };

  const handleSave = () => {
    if (!selected) return;
    saveMutation.mutate({
      id: selected.id,
      data: {
        landing_json: landingDraft,
        form_json: formDraft,
        updated_by_name: user?.full_name || user?.email || 'Admin',
      },
    });
  };

  const handleCreate = () => {
    if (!newEventName.trim() || !newEventKey.trim()) return;
    createMutation.mutate({
      event_name: newEventName.trim(),
      event_key: newEventKey.trim().toLowerCase().replace(/\s+/g, '_'),
      status: 'rascunho',
      landing_json: DEFAULT_LANDING_V2,
      form_json: DEFAULT_FORM,
    });
  };

  const handleDuplicate = (config) => {
    createMutation.mutate({
      event_name: `${config.event_name} (cópia)`,
      event_key: `${config.event_key}_copia_${Date.now()}`,
      status: 'rascunho',
      landing_json: config.landing_json,
      form_json: config.form_json,
    });
  };

  const tabBtn = (id, label, Icon) => (
    <button onClick={() => setActiveTab(id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
        borderRadius: 8, border: 'none', cursor: 'pointer',
        background: activeTab === id ? '#8B1A2B' : 'transparent',
        color: activeTab === id ? '#fff' : '#6B7280',
        fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600,
        transition: 'all 0.15s',
      }}>
      <Icon size={14} /> {label}
    </button>
  );

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 60px)', fontFamily: 'Inter, sans-serif', background: '#F9FAFB', overflow: 'hidden' }}>

      {/* ── Sidebar: Lista de Eventos ── */}
      <div style={{ width: 260, background: '#fff', borderRight: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#1F2937', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Eventos</div>
          <button onClick={() => setShowNewModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', background: '#8B1A2B', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', justifyContent: 'center' }}>
            <Plus size={14} /> Novo Evento
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {/* ── Formulários reais no ar ── */}
          <div style={{ fontSize: 11, fontWeight: 800, color: '#9CA3AF', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Formulários no ar</div>
          {FORMS_REAIS.map(f => (
            <FormRealCard
              key={f.id}
              form={f}
              isActive={!selectedId && selectedRealId === f.id}
              onSelect={() => { setSelectedRealId(f.id); setSelectedId(null); }}
            />
          ))}

          <div style={{ fontSize: 11, fontWeight: 800, color: '#9CA3AF', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '16px 0 8px' }}>Rascunhos do builder</div>
          {isLoading && <div style={{ textAlign: 'center', color: '#9CA3AF', padding: 20, fontSize: 13 }}>Carregando...</div>}
          {configs.filter(c => !c.event_key.startsWith('form_')).map(c => (
            <EventCard
              key={c.id}
              config={c}
              isActive={c.id === selectedId}
              onSelect={() => setSelectedId(c.id)}
              onDuplicate={() => handleDuplicate(c)}
            />
          ))}
          {!isLoading && configs.length === 0 && (
            <div style={{ textAlign: 'center', color: '#9CA3AF', padding: '24px 0', fontSize: 13 }}>
              <p>Nenhum evento ainda.</p>
              <p style={{ marginTop: 4 }}>Clique em "Novo Evento" para começar.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Main: Editor + Preview ── */}
      {!selected ? (
        FORMS_REAIS.find(f => f.id === selectedRealId) ? (
          PUBLIC_FORMS[selectedRealId] ? (
            <BuilderPublicFormEditor formId={selectedRealId} user={user} />
          ) : (
            <BuilderFormsReaisPreview form={FORMS_REAIS.find(f => f.id === selectedRealId)} />
          )
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: '#9CA3AF' }}>
            <Layout size={40} color="#D1D5DB" />
            <p style={{ fontSize: 14, fontWeight: 500 }}>Selecione um formulário ou evento</p>
            <p style={{ fontSize: 12 }}>na barra lateral</p>
          </div>
        )
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Toolbar */}
          <div style={{ background: '#fff', borderBottom: '1px solid #E5E7EB', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1F2937' }}>{selected.event_name}</div>
              <div style={{ fontSize: 11, color: '#9CA3AF', fontFamily: 'monospace' }}>{selected.event_key}</div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: 10, padding: 3, gap: 2 }}>
              {tabBtn('landing', 'Landing', Layout)}
              {tabBtn('form', 'Formulário', FileText)}
              {tabBtn('funil', 'Funil', GitBranch)}
            </div>

            {/* Status toggle */}
            <button onClick={toggleStatus}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
                border: `1px solid ${selected.status === 'publicado' ? '#D1FAE5' : '#FEF3C7'}`,
                background: selected.status === 'publicado' ? '#F0FDF4' : '#FFFBEB',
                borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                color: selected.status === 'publicado' ? '#16A34A' : '#D97706',
              }}>
              {selected.status === 'publicado' ? <Globe size={13} /> : <EyeOff size={13} />}
              {selected.status === 'publicado' ? 'Publicado' : 'Rascunho'}
            </button>

            {/* Save */}
            <button onClick={handleSave} disabled={saveMutation.isPending}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                background: saved ? '#22C55E' : '#8B1A2B', color: '#fff', border: 'none',
                borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                transition: 'background 0.3s',
              }}>
              {saved ? <CheckCircle size={14} /> : <Save size={14} />}
              {saved ? 'Salvo!' : saveMutation.isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>

          {/* Editor + Preview */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Left: Editor */}
            <div style={{ flex: 1, overflowY: 'auto', borderRight: '1px solid #E5E7EB', background: '#fff' }}>
              {activeTab === 'landing' && landingDraft && (
                <BuilderLandingEditor config={landingDraft} onChange={setLandingDraft} />
              )}
              {activeTab === 'form' && formDraft && selected.event_key === 'm31_camisas' && (
                <CamisasTextosEditor textos={formDraft.textos} onChange={(textos) => setFormDraft({ version: 2, textos })} />
              )}
              {activeTab === 'form' && formDraft && selected.event_key !== 'm31_camisas' && (
                <BuilderFormEditor config={formDraft} onChange={setFormDraft} />
              )}
              {activeTab === 'funil' && (
                <BuilderFunil config={ensureV2(selected.landing_json || DEFAULT_LANDING_V2)} formConfig={ensureV2(selected.form_json || DEFAULT_FORM)} eventName={selected.event_name} />
              )}
            </div>

            {/* Right: Preview */}
            <div style={{ width: 430, flexShrink: 0, overflowY: 'auto', background: '#F3F4F6' }}>
              <BuilderPreview
                activeTab={activeTab}
                landingConfig={landingDraft}
                formConfig={formDraft}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Novo Evento ── */}
      {showNewModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 420, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <h3 style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 700, color: '#1F2937', marginBottom: 6 }}>Novo Evento</h3>
            <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 20 }}>Crie uma landing page e formulário para um novo evento.</p>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Sugestão rápida</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {PRESET_EVENTS.map(p => (
                  <button key={p.key} onClick={() => { setNewEventName(p.name); setNewEventKey(p.key); }}
                    style={{ padding: '5px 10px', background: '#F6E9EC', border: '1px solid #E5D6D6', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#8B1A2B', cursor: 'pointer' }}>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Nome do evento <span style={{ color: '#EF4444' }}>*</span></label>
              <input
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 14, color: '#1F2937', outline: 'none' }}
                value={newEventName}
                onChange={e => {
                  setNewEventName(e.target.value);
                  if (!newEventKey || newEventKey === newEventName.toLowerCase().replace(/\s+/g, '_')) {
                    setNewEventKey(e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
                  }
                }}
                placeholder="M31 Filhas 2026"
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Chave única (key) <span style={{ color: '#EF4444' }}>*</span></label>
              <input
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 14, color: '#1F2937', outline: 'none', fontFamily: 'monospace' }}
                value={newEventKey}
                onChange={e => setNewEventKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="m31_filhas_2026"
              />
              <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>Use apenas letras minúsculas, números e underscores.</p>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowNewModal(false)}
                style={{ padding: '9px 18px', background: 'none', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#6B7280', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleCreate} disabled={!newEventName.trim() || !newEventKey.trim() || createMutation.isPending}
                style={{ padding: '9px 18px', background: '#8B1A2B', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: (!newEventName.trim() || !newEventKey.trim()) ? 0.6 : 1 }}>
                {createMutation.isPending ? 'Criando...' : 'Criar Evento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}