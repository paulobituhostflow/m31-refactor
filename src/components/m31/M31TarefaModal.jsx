import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { X, Plus, Trash2, Check, Download, Link2, File, Mail, Bell, Sparkles, Mic, ChevronDown, ChevronUp, Share2 } from 'lucide-react';
import M31TarefaComentarios from './M31TarefaComentarios';
import SubtarefasSection from './SubtarefasSection';
import CompartilharTarefaModal from './CompartilharTarefaModal';
import { AREA_DEFAULT_SLUG } from '@/lib/m31Areas';
import { TOKENS as T } from '@/lib/m31DesignTokens';

const PRIORIDADES = [
  { value: 'baixa', label: 'Baixa' },
  { value: 'media', label: 'Média' },
  { value: 'alta', label: 'Alta' },
  { value: 'urgente', label: 'Urgente' },
];

const DRAFT_KEY = 'm31_tarefa_draft';

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

const inputStyle = { background: T.surface, borderColor: T.border, color: T.text, height: '44px', fontFamily: T.font.body };

export default function M31TarefaModal({ tarefa, tarefaPai, onClose, onSave, canEdit, userEmail, defaultArea, defaultFrente, initialPrazo }) {
  const isMobile = useIsMobile();
  const [form, setForm] = useState({
    titulo: '', descricao: '', area_id: defaultArea || '', area: '', frente_id: defaultFrente || '', tarefa_pai_id: tarefaPai?.id || '', prioridade: 'media',
    status: 'a_fazer', tipo: 'operacional', impacto: 'medio',
    responsavel_email: '', responsavel_nome: '',
    prazo: initialPrazo || '', checklist: [], observacoes: '', criado_por_email: userEmail || ''
  });
  const [novoItem, setNovoItem] = useState('');
  const [statusAnterior, setStatusAnterior] = useState('');
  const [responsavelAnterior, setResponsavelAnterior] = useState('');
  const [novoAnexoUrl, setNovoAnexoUrl] = useState('');
  const [novoAnexoNome, setNovoAnexoNome] = useState('');
  const [enviandoNotificacao, setEnviandoNotificacao] = useState(false);
  const [maisDetalhes, setMaisDetalhes] = useState(false);
  const [compartilharOpen, setCompartilharOpen] = useState(false);
  const [iaMode, setIaMode] = useState(false);
  const [iaInput, setIaInput] = useState('');
  const [iaLoading, setIaLoading] = useState(false);
  const fileInputRef = useRef(null);
  const audioInputRef = useRef(null);

  const { data: membros = [] } = useQuery({
    queryKey: ['m31membros'],
    queryFn: () => base44.entities.EventoM31Membro.list('-created_date', 200),
    enabled: canEdit
  });

  const { data: areas = [] } = useQuery({
    queryKey: ['m31areas'],
    queryFn: () => base44.entities.M31Area.filter({ ativo: true }, 'ordem', 50),
  });

  const { data: frentes = [] } = useQuery({
    queryKey: ['m31frentes'],
    queryFn: () => base44.entities.M31Frente.filter({ ativo: true }, 'ordem', 50),
  });

  // Primeira área ativa como default se nenhuma vier do contexto (não aplica em subtarefa)
  useEffect(() => {
    if (!form.area_id && areas.length > 0 && !tarefa && !tarefaPai) {
      const defaultAreaObj = areas.find(a => a.slug === AREA_DEFAULT_SLUG) || areas[0];
      setForm(p => ({ ...p, area_id: defaultAreaObj.id }));
    }
  }, [areas, form.area_id, tarefa, tarefaPai]);

  const areaSelecionada = areas.find(a => a.id === form.area_id);
  const frentesDaArea = frentes.filter(f => f.area_id === form.area_id);

  // Editar tarefa existente
  useEffect(() => {
    if (tarefa) {
      setForm(prev => ({ ...prev, ...tarefa }));
      setStatusAnterior(tarefa.status || '');
      setResponsavelAnterior(tarefa.responsavel_email || '');
    }
  }, [tarefa]);

  // Preservar rascunho se fechar acidentalmente (somente nova tarefa)
  useEffect(() => {
    if (!tarefa) {
      const saved = sessionStorage.getItem(DRAFT_KEY);
      if (saved) {
        try { setForm(prev => ({ ...prev, ...JSON.parse(saved) })); } catch {}
      }
    }
  }, [tarefa]);

  useEffect(() => {
    if (!tarefa) {
      try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form)); } catch {}
    }
  }, [form, tarefa]);

  const addChecklistItem = () => {
    if (!novoItem.trim()) return;
    setForm(p => ({
      ...p,
      checklist: [...(p.checklist || []), { id: Date.now().toString(), texto: novoItem.trim(), concluido: false }]
    }));
    setNovoItem('');
  };

  const toggleChecklistItem = (id) => {
    setForm(p => ({ ...p, checklist: p.checklist.map(i => i.id === id ? { ...i, concluido: !i.concluido } : i) }));
  };

  const removeChecklistItem = (id) => {
    setForm(p => ({ ...p, checklist: p.checklist.filter(i => i.id !== id) }));
  };

  const addAnexo = async (file) => {
    if (!file) return;
    const res = await base44.integrations.Core.UploadFile({ file });
    const anexo = {
      id: Date.now().toString(), nome: file.name, url: res.file_url,
      tipo: file.type.startsWith('image/') ? 'imagem' : 'documento',
      criado_em: new Date().toISOString(), criado_por: userEmail,
    };
    setForm(p => ({ ...p, anexos: [...(p.anexos || []), anexo] }));
  };

  const addAnexoLink = () => {
    if (!novoAnexoUrl || !novoAnexoNome) return;
    const anexo = {
      id: Date.now().toString(), nome: novoAnexoNome, url: novoAnexoUrl, tipo: 'link',
      criado_em: new Date().toISOString(), criado_por: userEmail,
    };
    setForm(p => ({ ...p, anexos: [...(p.anexos || []), anexo] }));
    setNovoAnexoUrl(''); setNovoAnexoNome('');
  };

  const removeAnexo = (id) => {
    setForm(p => ({ ...p, anexos: (p.anexos || []).filter(a => a.id !== id) }));
  };

  const handleResponsavelChange = (email) => {
    const m = membros.find(x => x.user_email === email);
    setForm(p => ({ ...p, responsavel_email: email, responsavel_nome: m?.nome || '' }));
  };

  const notificarResponsavel = async () => {
    if (!form.responsavel_email) return;
    setEnviandoNotificacao(true);
    try {
      await base44.functions.invoke('m31NotificarAtribuicaoTarefa', {
        tarefa_id: tarefa?.id, titulo_tarefa: form.titulo,
        responsavel_email: form.responsavel_email, responsavel_nome: form.responsavel_nome,
        descricao_tarefa: form.descricao, prazo: form.prazo, atribuido_por: userEmail
      });
      alert('✓ Notificação enviada para ' + form.responsavel_nome);
    } catch (e) {
      alert('Erro ao enviar notificação: ' + e.message);
    } finally {
      setEnviandoNotificacao(false);
    }
  };

  // IA: apenas preenche rascunho (não salva)
  const gerarComIA = async (textoBase) => {
    if (!textoBase.trim()) return;
    setIaLoading(true);
    try {
      const areaSlugs = areas.map(a => a.slug).join(', ');
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Você é um assistente de gestão do evento M31. A partir do texto abaixo, gere um rascunho de tarefa/pacote operacional. Retorne JSON com: titulo (curto), descricao (contexto e instruções), area_slug (uma destas: ${areaSlugs}), prioridade (baixa|media|alta|urgente), tipo (espiritual|estrategica|operacional|comercial|experiencia|producao|voluntariado), impacto (alto|medio|baixo), checklist (array de strings com microações de conferência). Texto: """${textoBase}"""`,
        response_json_schema: {
          type: 'object',
          properties: {
            titulo: { type: 'string' }, descricao: { type: 'string' },
            area: { type: 'string' }, prioridade: { type: 'string' },
            tipo: { type: 'string' }, impacto: { type: 'string' },
            checklist: { type: 'array', items: { type: 'string' } },
          }
        }
      });
      const d = res || {};
      const areaMatch = d.area_slug ? areas.find(a => a.slug === d.area_slug) : null;
      const frenteMatch = areaMatch ? frentes.find(f => f.area_id === areaMatch.id) : null;
      setForm(p => ({
        ...p,
        titulo: d.titulo || p.titulo,
        descricao: d.descricao || p.descricao,
        area_id: areaMatch ? areaMatch.id : p.area_id,
        frente_id: frenteMatch ? frenteMatch.id : p.frente_id,
        prioridade: d.prioridade || p.prioridade,
        tipo: d.tipo || p.tipo,
        impacto: d.impacto || p.impacto,
        checklist: (d.checklist || []).map((texto, i) => ({ id: Date.now().toString() + i, texto, concluido: false })),
      }));
      setIaMode(false);
      setIaInput('');
    } catch (e) {
      alert('Erro ao gerar rascunho: ' + e.message);
    } finally {
      setIaLoading(false);
    }
  };

  const transcreverVoz = async (file) => {
    if (!file) return;
    setIaLoading(true);
    try {
      const up = await base44.integrations.Core.UploadFile({ file });
      const res = await base44.integrations.Core.TranscribeAudio({ audio_url: up.file_url });
      const texto = typeof res === 'string' ? res : (res?.text || res?.transcript || '');
      if (texto) { setIaInput(texto); setIaMode(true); }
    } catch (e) {
      alert('Erro na transcrição: ' + e.message);
    } finally {
      setIaLoading(false);
    }
  };

  const checklistDone = form.checklist?.filter(i => i.concluido).length || 0;
  const checklistTotal = form.checklist?.length || 0;

  const limparDraft = () => { try { sessionStorage.removeItem(DRAFT_KEY); } catch {} };

  const handleSalvar = async () => {
    if (tarefa && statusAnterior && statusAnterior !== form.status && form.responsavel_email) {
      try {
        await base44.functions.invoke('m31NotificarStatusTarefa', {
          tarefa_id: tarefa.id, titulo_tarefa: form.titulo,
          status_novo: form.status, status_antigo: statusAnterior,
          responsavel_email: form.responsavel_email, responsavel_nome: form.responsavel_nome
        });
      } catch (e) { console.error('Erro ao notificar status:', e); }
    }
    if (tarefa && responsavelAnterior !== form.responsavel_email && form.responsavel_email) {
      try {
        await base44.functions.invoke('m31NotificarAtribuicaoTarefa', {
          tarefa_id: tarefa.id, titulo_tarefa: form.titulo,
          responsavel_email: form.responsavel_email, responsavel_nome: form.responsavel_nome,
          descricao_tarefa: form.descricao, prazo: form.prazo, atribuido_por: userEmail
        });
      } catch (e) { console.error('Erro ao notificar atribuição:', e); }
    }
    limparDraft();
    onSave(form);
  };

  const podeSalvar = form.titulo.trim().length > 0;

  // Body scroll lock no mobile para preservar o fundo
  useEffect(() => {
    if (isMobile) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isMobile]);

  // Container styles: mobile = bottom sheet 90vh; desktop = drawer lateral direito
  const overlayStyle = isMobile
    ? { position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.50)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }
    : { position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.30)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'flex-end' };

  const panelStyle = isMobile
    ? { height: '90vh', display: 'flex', flexDirection: 'column', width: '100%', background: T.surface, borderTopLeftRadius: '20px', borderTopRightRadius: '20px', boxShadow: '0 -4px 24px rgba(0,0,0,0.15)', animation: 'm31-slide-up 0.28s cubic-bezier(0.16,1,0.3,1)' }
    : { width: '480px', maxWidth: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: T.surface, borderLeft: `1px solid ${T.border}`, boxShadow: '-8px 0 30px rgba(0,0,0,0.10)', animation: 'm31-drawer-slide 250ms cubic-bezier(0.16,1,0.3,1) both' };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <style>{`@keyframes m31-slide-up { from { transform: translateY(100%) } to { transform: translateY(0) } }`}</style>
      <div style={panelStyle} onClick={e => e.stopPropagation()}>
        {/* Drag handle — só no mobile */}
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '8px', flexShrink: 0 }}>
            <div style={{ width: '36px', height: '4px', background: T.border, borderRadius: T.radius.pill }} />
          </div>
        )}
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: T.text, fontFamily: T.font.body, margin: 0 }}>
            {tarefaPai ? (tarefa ? 'Editar Subtarefa' : 'Nova Subtarefa') : (tarefa ? 'Editar Tarefa' : 'Nova Tarefa')}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {tarefa && tarefa.id && (
              <button
                onClick={() => setCompartilharOpen(true)}
                title="Compartilhar tarefa"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  color: T.primary, background: 'transparent',
                  border: `1px solid ${T.border}`, borderRadius: T.radius.md,
                  padding: '6px 12px', fontSize: '13px', fontWeight: '600',
                  cursor: 'pointer', fontFamily: T.font.body,
                }}
              >
                <Share2 size={15} /> Compartilhar
              </button>
            )}
            <button onClick={onClose} style={{ color: T.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', fontFamily: T.font.body }}>
          {/* Título */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: '600', color: T.textMuted, marginBottom: '6px', display: 'block' }}>Título *</label>
            <Input value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))}
              placeholder="Título da tarefa" style={inputStyle} disabled={!canEdit} />
          </div>

          {/* Área (contexto) + Frente */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: T.textMuted, marginBottom: '6px', display: 'block' }}>Área</label>
              <select value={form.area_id} onChange={e => setForm(p => ({ ...p, area_id: e.target.value, frente_id: '' }))}
                style={{ ...inputStyle, width: '100%' }} disabled={!canEdit || !!tarefaPai}>
                <option value="">Selecione a área</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: T.textMuted, marginBottom: '6px', display: 'block' }}>
                Frente{areaSelecionada?.exige_frente ? ' *' : ''}
              </label>
              <select value={form.frente_id} onChange={e => setForm(p => ({ ...p, frente_id: e.target.value }))}
                style={{ ...inputStyle, width: '100%' }} disabled={!canEdit || !!tarefaPai || frentesDaArea.length === 0}>
                <option value="">{frentesDaArea.length === 0 ? 'Sem frentes' : 'Selecione a frente'}</option>
                {frentesDaArea.map(f => <option key={f.id} value={f.id}>{f.nome}{f.status_definicao === 'em_refinamento' ? ' (em refinamento)' : ''}</option>)}
              </select>
            </div>
          </div>

          {/* Responsável + Prazo (linha) */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: T.textMuted, marginBottom: '6px', display: 'block' }}>Responsável</label>
              {canEdit ? (
                <select value={form.responsavel_email} onChange={e => handleResponsavelChange(e.target.value)}
                  style={{ ...inputStyle, width: '100%' }}>
                  <option value="">Sem responsável</option>
                  {membros.map(m => <option key={m.id} value={m.user_email}>{m.nome}</option>)}
                </select>
              ) : (
                <Input value={form.responsavel_nome || form.responsavel_email || '—'} style={inputStyle} disabled />
              )}
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: T.textMuted, marginBottom: '6px', display: 'block' }}>Prazo</label>
              <Input type="date" value={form.prazo} onChange={e => setForm(p => ({ ...p, prazo: e.target.value }))}
                style={inputStyle} disabled={!canEdit} />
            </div>
          </div>

          {form.responsavel_email && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: T.textMuted }}>
              <Mail size={13} /> {form.responsavel_email}
              <button onClick={notificarResponsavel} disabled={enviandoNotificacao}
                style={{ marginLeft: 'auto', background: T.primary, color: T.onPrimary, border: 'none', borderRadius: T.radius.md, padding: '4px 10px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Bell size={13} /> Notificar
              </button>
            </div>
          )}

          {/* IA — rascunho */}
          {iaMode && (
            <div style={{ background: T.surfaceSubtle, border: `1px solid ${T.border}`, borderRadius: T.radius.lg, padding: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <Sparkles size={14} color={T.primary} />
                <span style={{ fontSize: '13px', fontWeight: '600', color: T.text }}>Criar rascunho com IA</span>
              </div>
              <textarea value={iaInput} onChange={e => setIaInput(e.target.value)}
                placeholder="Descreva a tarefa em texto livre..." disabled={iaLoading}
                style={{ width: '100%', minHeight: '80px', border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: '10px', fontSize: '14px', fontFamily: T.font.body, background: T.surface, color: T.text, resize: 'vertical', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
                <button onClick={() => gerarComIA(iaInput)} disabled={iaLoading || !iaInput.trim()}
                  style={{ background: T.primary, color: T.onPrimary, border: 'none', borderRadius: T.radius.md, padding: '8px 14px', fontSize: '13px', fontWeight: '600', cursor: iaLoading ? 'wait' : 'pointer', opacity: (iaLoading || !iaInput.trim()) ? 0.5 : 1 }}>
                  {iaLoading ? 'Gerando...' : 'Gerar rascunho'}
                </button>
                <input type="file" accept="audio/*" ref={audioInputRef} onChange={e => e.target.files?.[0] && transcreverVoz(e.target.files[0])} style={{ display: 'none' }} />
                <button onClick={() => audioInputRef.current?.click()} disabled={iaLoading}
                  style={{ background: 'transparent', color: T.textMuted, border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: '8px 12px', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Mic size={14} /> Voz
                </button>
                <button onClick={() => { setIaMode(false); setIaInput(''); }}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer', fontSize: '13px' }}>Cancelar</button>
              </div>
              <p style={{ fontSize: '11px', color: T.textSubtle, margin: '8px 0 0' }}>A IA apenas preenche o formulário. Nada é salvo sem sua confirmação.</p>
            </div>
          )}

          {/* Mais detalhes */}
          <button onClick={() => setMaisDetalhes(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: T.primary, fontSize: '13px', fontWeight: '600', cursor: 'pointer', padding: '4px 0', fontFamily: T.font.body }}>
            {maisDetalhes ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            {maisDetalhes ? 'Menos detalhes' : 'Mais detalhes'}
          </button>

          {maisDetalhes && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: `1px solid ${T.borderSubtle}`, marginTop: '-4px', paddingTop: '16px' }}>
              {/* Descrição */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: T.textMuted, marginBottom: '6px', display: 'block' }}>Descrição</label>
                <textarea value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
                  placeholder="Detalhes da tarefa..." disabled={!canEdit}
                  style={{ width: '100%', minHeight: '80px', border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: '10px 12px', fontSize: '14px', fontFamily: T.font.body, background: T.surface, color: T.text, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>

              {/* Grid: tipo, impacto, prioridade, status */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: T.textMuted, marginBottom: '6px', display: 'block' }}>Tipo</label>
                  <select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))} style={{ ...inputStyle, width: '100%' }} disabled={!canEdit}>
                    <option value="espiritual">Espiritual</option>
                    <option value="estrategica">Estratégica</option>
                    <option value="operacional">Operacional</option>
                    <option value="comercial">Comercial</option>
                    <option value="experiencia">Experiência</option>
                    <option value="producao">Produção</option>
                    <option value="voluntariado">Voluntariado</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: T.textMuted, marginBottom: '6px', display: 'block' }}>Impacto</label>
                  <select value={form.impacto} onChange={e => setForm(p => ({ ...p, impacto: e.target.value }))} style={{ ...inputStyle, width: '100%' }} disabled={!canEdit}>
                    <option value="alto">Alto</option>
                    <option value="medio">Médio</option>
                    <option value="baixo">Baixo</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: T.textMuted, marginBottom: '6px', display: 'block' }}>Prioridade</label>
                  <select value={form.prioridade} onChange={e => setForm(p => ({ ...p, prioridade: e.target.value }))} style={{ ...inputStyle, width: '100%' }} disabled={!canEdit}>
                    {PRIORIDADES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: T.textMuted, marginBottom: '6px', display: 'block' }}>Status</label>
                  <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} style={{ ...inputStyle, width: '100%' }}>
                    <option value="a_fazer">A Fazer</option>
                    <option value="em_andamento">Em andamento</option>
                    <option value="em_execucao">Em execução</option>
                    <option value="atencao">Atenção</option>
                    <option value="atrasado">Atrasado</option>
                    <option value="critico">Crítico</option>
                    <option value="bloqueado">Bloqueado</option>
                    <option value="concluido">Concluído</option>
                  </select>
                </div>
              </div>

              {/* Observações */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: T.textMuted, marginBottom: '6px', display: 'block' }}>Observações</label>
                <textarea value={form.observacoes || ''} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))}
                  placeholder="Observações internas..."
                  style={{ width: '100%', minHeight: '64px', border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: '10px 12px', fontSize: '14px', fontFamily: T.font.body, background: T.surface, color: T.text, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>

              {/* Anexos */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: T.textMuted, marginBottom: '8px', display: 'block' }}>Anexos</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
                  {(form.anexos || []).map(anexo => (
                    <div key={anexo.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: T.surfaceSubtle, borderRadius: T.radius.md }}>
                      <a href={anexo.url} target="_blank" rel="noreferrer" style={{ fontSize: '13px', color: T.primary, display: 'flex', alignItems: 'center', gap: '6px', flex: 1, textDecoration: 'none' }}>
                        {anexo.tipo === 'link' ? <Link2 size={14} /> : <File size={14} />}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{anexo.nome}</span>
                      </a>
                      {canEdit && (
                        <button onClick={() => removeAnexo(anexo.id)} style={{ color: T.textSubtle, background: 'none', border: 'none', cursor: 'pointer' }}>
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {canEdit && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <input type="file" ref={fileInputRef} onChange={e => e.target.files?.[0] && addAnexo(e.target.files[0])} style={{ display: 'none' }} multiple />
                    <button onClick={() => fileInputRef.current?.click()}
                      style={{ background: T.surfaceSubtle, border: `1px solid ${T.border}`, color: T.textMuted, borderRadius: T.radius.md, padding: '8px 12px', fontSize: '13px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', alignSelf: 'flex-start' }}>
                      <Download size={14} /> Fazer upload
                    </button>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Input value={novoAnexoNome} onChange={e => setNovoAnexoNome(e.target.value)} placeholder="Nome do link" style={{ ...inputStyle, height: '36px', flex: 1 }} />
                      <Input value={novoAnexoUrl} onChange={e => setNovoAnexoUrl(e.target.value)} placeholder="https://..." style={{ ...inputStyle, height: '36px', flex: 1 }} />
                      <button onClick={addAnexoLink} style={{ background: T.primary, color: T.onPrimary, border: 'none', borderRadius: T.radius.md, width: '36px', height: '36px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Checklist */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: T.textMuted, marginBottom: '8px', display: 'block' }}>
                  Checklist {checklistTotal > 0 && `(${checklistDone}/${checklistTotal})`}
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {(form.checklist || []).map(item => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button onClick={() => toggleChecklistItem(item.id)}
                        style={{ width: '20px', height: '20px', borderRadius: '5px', border: item.concluido ? 'none' : `1.5px solid ${T.borderStrong}`, background: item.concluido ? T.success : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}>
                        {item.concluido && <Check size={12} color={T.onPrimary} strokeWidth={3} />}
                      </button>
                      <span style={{ fontSize: '14px', flex: 1, textDecoration: item.concluido ? 'line-through' : 'none', color: item.concluido ? T.textMuted : T.text }}>{item.texto}</span>
                      {canEdit && (
                        <button onClick={() => removeChecklistItem(item.id)} style={{ color: T.textSubtle, background: 'none', border: 'none', cursor: 'pointer' }}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  {canEdit && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Input value={novoItem} onChange={e => setNovoItem(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addChecklistItem()}
                        placeholder="Adicionar item..." style={{ ...inputStyle, height: '36px', flex: 1 }} />
                      <button onClick={addChecklistItem} style={{ background: T.primary, color: T.onPrimary, border: 'none', borderRadius: T.radius.md, width: '36px', height: '36px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Plus size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Subtarefas — só em Tarefas Mãe existentes (não em subtarefas) */}
          {tarefa && tarefa.id && !tarefaPai && (
            <SubtarefasSection
              tarefaId={tarefa.id}
              canEdit={canEdit}
              userEmail={userEmail}
            />
          )}

          {/* Comentários - só em tarefas existentes */}
          {tarefa && tarefa.id && (
            <M31TarefaComentarios tarefaId={tarefa.id} responsavelEmail={form.responsavel_email} responsavelNome={form.responsavel_nome} />
          )}
        </div>

        {/* Modal de compartilhamento */}
        {compartilharOpen && (
          <CompartilharTarefaModal tarefa={tarefa} onClose={() => setCompartilharOpen(false)} />
        )}

        {/* Footer fixo */}
        <div style={{ display: 'flex', gap: '10px', padding: '14px 20px', borderTop: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
          <button onClick={() => setIaMode(v => !v)}
            style={{ flex: 1, background: 'transparent', color: T.primary, border: `1px solid ${T.primary}`, borderRadius: T.radius.md, height: '44px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontFamily: T.font.body }}>
            <Sparkles size={15} /> Criar com IA
          </button>
          <button onClick={handleSalvar} disabled={!podeSalvar || !canEdit}
            style={{ flex: 1, background: T.primary, color: T.onPrimary, border: 'none', borderRadius: T.radius.md, height: '44px', fontSize: '14px', fontWeight: '600', cursor: podeSalvar && canEdit ? 'pointer' : 'not-allowed', opacity: podeSalvar && canEdit ? 1 : 0.5, fontFamily: T.font.body }}>
            {tarefa ? 'Salvar' : (tarefaPai ? 'Criar subtarefa' : 'Criar tarefa')}
          </button>
        </div>
      </div>
    </div>
  );
}