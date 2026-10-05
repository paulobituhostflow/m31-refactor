import { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TOKENS as T } from '@/lib/m31DesignTokens';
import M31TarefaModal from './M31TarefaModal';
import M31SugestaoTarefasIA from './M31SugestaoTarefasIA';
import M31EnriquecerTarefas from './ia/M31EnriquecerTarefas';
import { useItemManager } from '@/hooks/useItemManager';
import UndoBar from './gestao/UndoBar';
import M31TarefasKanban from './M31TarefasKanban';
import M31TarefasTimeline from './M31TarefasTimeline';
import M31TarefasTabela from './M31TarefasTabela';
import CalendarView from './gestao/CalendarView';
import GestaoHeader from './gestao/GestaoHeader';
import GestaoTabs from './gestao/GestaoTabs';
import FilterChips from './gestao/FilterChips';
import VisaoGeralTab from './gestao/VisaoGeralTab';
import MobileVisaoGeral from './gestao/MobileVisaoGeral';
import { TAREFA_AREA_DEFAULT } from '@/lib/m31TarefaAreas';
import { LEGACY_AREA_TO_NEW_SLUG } from '@/lib/m31Areas';

function useIsMobile() {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const h = () => setM(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return m;
}

export default function M31GestaoTarefas({ pode, userEmail, userName, initialFiltroChip, lockedAreaSlug }) {
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const itemManager = useItemManager({ userEmail, userName });
  const [view, setView] = useState('overview');

  // Mobile: garantir que nunca caia em abas desktop-only (Lista, Plano-Mestre)
  useEffect(() => {
    if (isMobile && !['overview', 'kanban', 'calendar', 'timeline'].includes(view)) {
      setView('overview');
    }
  }, [isMobile, view]);
  const [filtroChip, setFiltroChip] = useState(initialFiltroChip || 'all');
  const [filtroArea, setFiltroArea] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroResponsavel, setFiltroResponsavel] = useState('');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalIAOpen, setModalIAOpen] = useState(false);
  const [enriquecerOpen, setEnriquecerOpen] = useState(false);
  const [editTarefa, setEditTarefa] = useState(null);
  const [defaultArea, setDefaultArea] = useState(TAREFA_AREA_DEFAULT);
  const [defaultFrente, setDefaultFrente] = useState('');
  const [areaNomeAtual, setAreaNomeAtual] = useState('');
  const [frenteNomeAtual, setFrenteNomeAtual] = useState('');
  const [tarefaPai, setTarefaPai] = useState(null);
  const [initialPrazo, setInitialPrazo] = useState('');

  const { data: tarefas = [], isLoading } = useQuery({
    queryKey: ['m31tarefas'],
    queryFn: () => base44.entities.EventoM31Tarefa.list('-created_date', 500),
    refetchInterval: 15000,
  });

  const { data: pacotes = [] } = useQuery({
    queryKey: ['m31pacotes'],
    queryFn: () => base44.entities.M31Pacote.list('-created_date', 200),
    refetchInterval: 30000,
  });

  const { data: edicoes = [] } = useQuery({
    queryKey: ['m31edicao-ativa'],
    queryFn: () => base44.entities.M31EdicaoEvento.filter({ status: 'ativa' }),
  });
  const edicaoAtiva = edicoes[0];

  // Fetch areas when area is locked (acesso simplificado)
  const { data: areasList = [] } = useQuery({
    queryKey: ['m31areas-lock'],
    queryFn: () => base44.entities.M31Area.list('ordem', 50),
    enabled: !!lockedAreaSlug,
  });

  const areaIdToSlug = useMemo(() => {
    const m = new Map();
    areasList.forEach(a => m.set(a.id, a.slug));
    return m;
  }, [areasList]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      // Validações de hierarquia: Tarefa Mãe ↔ Subtarefa (limite 2 níveis)
      if (data.tarefa_pai_id) {
        if (editTarefa?.id && data.tarefa_pai_id === editTarefa.id) {
          throw new Error('Uma tarefa não pode apontar para ela mesma.');
        }
        const pai = await base44.entities.EventoM31Tarefa.get(data.tarefa_pai_id);
        if (pai.tarefa_pai_id) {
          throw new Error('A Tarefa Mãe selecionada não pode ser outra Subtarefa. A hierarquia é limitada a 2 níveis.');
        }
      }
      if (data.status === 'concluido' && editTarefa?.id && !editTarefa.concluido_em) {
        data.concluido_em = new Date().toISOString();
        data.concluido_por_email = userEmail;
        data.concluido_por_nome = userName;
      }
      if (editTarefa?.id) return base44.entities.EventoM31Tarefa.update(editTarefa.id, data);
      return base44.entities.EventoM31Tarefa.create({ ...data, criado_por_email: userEmail, criado_por_nome: userName });
    },
    onSuccess: () => { qc.invalidateQueries(['m31tarefas']); setModalOpen(false); setEditTarefa(null); setTarefaPai(null); },
    onError: (err) => { alert(err.message || 'Erro ao salvar tarefa.'); },
  });

  const toggleMutation = useMutation({
    mutationFn: (t) => base44.entities.EventoM31Tarefa.update(t.id, {
      status: t.status === 'concluido' ? 'a_fazer' : 'concluido',
      ...(t.status !== 'concluido' ? {
        concluido_em: new Date().toISOString(),
        concluido_por_email: userEmail,
        concluido_por_nome: userName,
      } : {}),
    }),
    onSuccess: () => qc.invalidateQueries(['m31tarefas']),
  });

  const quickUpdateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.EventoM31Tarefa.update(id, data),
    onSuccess: () => qc.invalidateQueries(['m31tarefas']),
  });

  const toggleChecklistMutation = useMutation({
    mutationFn: async ({ tarefaId, checklist, itemId }) => {
      const updated = (checklist || []).map(it =>
        it.id === itemId ? { ...it, concluido: !it.concluido } : it
      );
      return base44.entities.EventoM31Tarefa.update(tarefaId, { checklist: updated });
    },
    onSuccess: () => qc.invalidateQueries(['m31tarefas']),
  });

  const addChecklistItemMutation = useMutation({
    mutationFn: async ({ tarefaId, texto }) => {
      const t = tarefas.find(x => x.id === tarefaId);
      const checklist = [...(t?.checklist || []), { id: Date.now().toString(), texto, concluido: false }];
      return base44.entities.EventoM31Tarefa.update(tarefaId, { checklist });
    },
    onSuccess: () => qc.invalidateQueries(['m31tarefas']),
  });

  const removeChecklistItemMutation = useMutation({
    mutationFn: async ({ tarefaId, itemId }) => {
      const t = tarefas.find(x => x.id === tarefaId);
      const checklist = (t?.checklist || []).filter(it => it.id !== itemId);
      return base44.entities.EventoM31Tarefa.update(tarefaId, { checklist });
    },
    onSuccess: () => qc.invalidateQueries(['m31tarefas']),
  });

  const updateChecklistItemMutation = useMutation({
    mutationFn: async ({ tarefaId, itemId, texto }) => {
      const t = tarefas.find(x => x.id === tarefaId);
      const checklist = (t?.checklist || []).map(it => it.id === itemId ? { ...it, texto } : it);
      return base44.entities.EventoM31Tarefa.update(tarefaId, { checklist });
    },
    onSuccess: () => qc.invalidateQueries(['m31tarefas']),
  });

  const now = new Date();

  // Lista única de responsáveis para o filtro dinâmico
  const responsaveisUnicos = useMemo(() => {
    const set = new Map();
    tarefas.forEach(t => {
      if (t.responsavel_nome) set.set(t.responsavel_nome, t.responsavel_email || '');
    });
    return Array.from(set.entries()).map(([nome, email]) => ({ nome, email })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [tarefas]);

  // Filtro de tarefas — aplica área + busca (título, tipo, responsável) + filtros + chip
  const TIPO_LABELS_BUSCA = {
    espiritual: 'espiritual', estrategica: 'estratégica', operacional: 'operacional',
    comercial: 'comercial', experiencia: 'experiência', producao: 'produção', voluntariado: 'voluntariado',
  };
  const tarefasFiltradas = useMemo(() => {
    return tarefas.filter(t => {
      if (!pode?.verTodasTarefas && t.responsavel_email && t.responsavel_email !== userEmail) return false;
      if (lockedAreaSlug) {
        const taskSlug = t.area_id ? areaIdToSlug.get(t.area_id) : LEGACY_AREA_TO_NEW_SLUG[t.area];
        if (taskSlug !== lockedAreaSlug) return false;
      } else if (filtroArea && t.area !== filtroArea) return false;
      if (filtroTipo && t.tipo !== filtroTipo) return false;
      if (filtroResponsavel && t.responsavel_nome !== filtroResponsavel) return false;
      if (search) {
        const q = search.toLowerCase();
        const tipoLabel = TIPO_LABELS_BUSCA[t.tipo] || '';
        const matchTitulo = t.titulo?.toLowerCase().includes(q);
        const matchTipo = tipoLabel.includes(q);
        const matchResp = (t.responsavel_nome || '').toLowerCase().includes(q) || (t.responsavel_email || '').toLowerCase().includes(q);
        if (!matchTitulo && !matchTipo && !matchResp) return false;
      }
      if (filtroChip === 'late') {
        if (!t.prazo || t.status === 'concluido') return false;
        return new Date(t.prazo + 'T12:00:00') < now;
      }
      if (filtroChip === 'soon') {
        if (!t.prazo || t.status === 'concluido') return false;
        const d = new Date(t.prazo + 'T12:00:00');
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && d >= now;
      }
      if (filtroChip === 'done') return t.status === 'concluido';
      return true;
    });
  }, [tarefas, filtroArea, filtroTipo, filtroResponsavel, search, filtroChip, userEmail, pode, now, lockedAreaSlug, areaIdToSlug]);

  const pacotesFiltrados = useMemo(() => {
    return pacotes.filter(p => {
      if (filtroArea && p.area !== filtroArea) return false;
      return true;
    });
  }, [pacotes, filtroArea]);

  function openAddTarefa({ areaId, frenteId, areaNome, frenteNome, prazo }) {
    setDefaultArea(areaId || TAREFA_AREA_DEFAULT);
    setDefaultFrente(frenteId || '');
    setAreaNomeAtual(areaNome || '');
    setFrenteNomeAtual(frenteNome || '');
    setInitialPrazo(prazo || '');
    setTarefaPai(null);
    setEditTarefa(null);
    setModalOpen(true);
  }

  function openAddSubtarefa(tarefaPaiObj) {
    setTarefaPai(tarefaPaiObj);
    setDefaultArea(tarefaPaiObj.area_id || TAREFA_AREA_DEFAULT);
    setDefaultFrente(tarefaPaiObj.frente_id || '');
    setEditTarefa(null);
    setModalOpen(true);
  }

  function handleToggle(t, action) {
    if (action === 'open') {
      setEditTarefa(t);
      setDefaultArea(t.area_id || TAREFA_AREA_DEFAULT);
      setDefaultFrente(t.frente_id || '');
      setTarefaPai(null);
      setModalOpen(true);
    } else {
      toggleMutation.mutate(t);
    }
  }

  const handleAceitarSugestao = async (sugestao, areaId, frenteId) => {
    const novaTarefa = {
      titulo: sugestao.titulo,
      descricao: sugestao.descricao || '',
      area_id: areaId || null,
      frente_id: frenteId || null,
      status: 'a_fazer',
      prioridade: 'media',
      tipo: 'operacional',
      impacto: 'medio',
      checklist: (sugestao.checklist || []).map((texto, i) => ({ id: `${Date.now()}-${i}`, texto, concluido: false })),
      criado_por_email: userEmail,
    };
    await base44.entities.EventoM31Tarefa.create({ ...novaTarefa, criado_por_email: userEmail, criado_por_nome: userName });
    qc.invalidateQueries(['m31tarefas']);
  };

  function exportarCSV() {
    const header = ['Título', 'Descrição', 'Área', 'Status', 'Prioridade', 'Impacto', 'Prazo', 'Responsável', 'Email Resp.', 'Membros', 'Concluído em', 'Criado em', 'Tags', 'Observações'];
    const rows = tarefasFiltradas.map(t => {
      return [
        t.titulo || '', t.descricao || '', t.area || '', t.status || '',
        t.prioridade || '', t.impacto || '', t.prazo || '',
        t.responsavel_nome || '', t.responsavel_email || '',
        (t.membros_emails || []).join('|'),
        t.concluido_em || '', t.created_date || '',
        (t.tags || []).join('|'), t.observacoes || '',
      ];
    });
    const csv = [header, ...rows]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tarefas-m31-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
        <div style={{ width: '28px', height: '28px', border: `3px solid ${T.border}`, borderTopColor: T.primary, borderRadius: '50%', animation: 'm31-spin 0.8s linear infinite' }} />
        <style>{`@keyframes m31-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <GestaoHeader
        edicaoNome={edicaoAtiva?.nome || 'M31 Filhas 2026'}
        search={search}
        setSearch={setSearch}
        filtroArea={filtroArea}
        setFiltroArea={setFiltroArea}
        filtroTipo={filtroTipo}
        setFiltroTipo={setFiltroTipo}
        filtroResponsavel={filtroResponsavel}
        setFiltroResponsavel={setFiltroResponsavel}
        responsaveis={responsaveisUnicos}
        onNovoPacote={() => openAddTarefa({})}
        onSugerirIA={() => setModalIAOpen(true)}
        onEnriquecerIA={() => setEnriquecerOpen(true)}
        onExportar={exportarCSV}
        podeCriar={!!pode?.criarTarefa}
        isMobile={isMobile}
        hideAreaFilter={!!lockedAreaSlug}
      />

      <GestaoTabs active={view} onChange={setView} isMobile={isMobile} />

      {/* Filtros rápidos — compartilhados entre todas as visualizações */}
      {view !== 'master' && (
        <FilterChips filtroChip={filtroChip} setFiltroChip={setFiltroChip} />
      )}

      {view === 'overview' && (
        isMobile ? (
          <MobileVisaoGeral
            tarefas={tarefasFiltradas}
            onEditTask={(t) => handleToggle(t, 'open')}
            onAddTarefa={openAddTarefa}
            onAddSubtarefa={openAddSubtarefa}
            onToggleStatus={toggleMutation.mutate}
            onUpdate={(id, data) => quickUpdateMutation.mutate({ id, data })}
            canEdit={!!pode?.criarTarefa}
            itemManager={itemManager}
          />
        ) : (
          <VisaoGeralTab
            tarefas={tarefasFiltradas}
            search={search}
            filtroChip={filtroChip}
            setFiltroChip={setFiltroChip}
            onEditTask={(t) => handleToggle(t, 'open')}
            onAddTarefa={openAddTarefa}
            onAddSubtarefa={openAddSubtarefa}
            onToggleStatus={toggleMutation.mutate}
            onToggleChecklistItem={(tarefaId, checklist, itemId) => toggleChecklistMutation.mutate({ tarefaId, checklist, itemId })}
            onAddChecklistItem={(tarefaId, texto) => addChecklistItemMutation.mutate({ tarefaId, texto })}
            onRemoveChecklistItem={(tarefaId, itemId) => removeChecklistItemMutation.mutate({ tarefaId, itemId })}
            onUpdateChecklistItem={(tarefaId, itemId, texto) => updateChecklistItemMutation.mutate({ tarefaId, itemId, texto })}
            onAceitarSugestao={handleAceitarSugestao}
            canEdit={!!pode?.criarTarefa}
            isMobile={isMobile}
            itemManager={itemManager}
          />
        )
      )}

      {/* FAB mobile — apenas em tabs que não são overview (overview tem FAB próprio no drill-down) */}
      {isMobile && pode?.criarTarefa && view !== 'overview' && (
        <button onClick={() => openAddTarefa({})} style={{
          position: 'fixed', bottom: 'max(20px, env(safe-area-inset-bottom))', right: '20px',
          minHeight: '52px', padding: '0 20px', background: T.primary, color: T.onPrimary,
          border: 'none', borderRadius: T.radius.pill, fontSize: '15px', fontWeight: '700',
          cursor: 'pointer', fontFamily: T.font.body, boxShadow: '0 4px 16px rgba(139,26,43,0.35)',
          display: 'flex', alignItems: 'center', gap: '8px', zIndex: 100,
        }}>
          + Nova tarefa
        </button>
      )}

      {view === 'list' && (
        <M31TarefasTabela tarefas={tarefasFiltradas} onToggle={handleToggle} onOpenTask={(t) => handleToggle(t, 'open')} />
      )}
      {view === 'kanban' && (
        <M31TarefasKanban tarefas={tarefasFiltradas} onOpenTask={(t) => handleToggle(t, 'open')} userEmail={userEmail} userName={userName} />
      )}
      {view === 'timeline' && (
        <M31TarefasTimeline tarefas={tarefasFiltradas} onOpenTask={(t) => handleToggle(t, 'open')} />
      )}
      {view === 'calendar' && (
        <CalendarView
          tarefas={tarefasFiltradas}
          onOpenTask={(t) => handleToggle(t, 'open')}
          onCreateTask={(prazo) => openAddTarefa({ prazo })}
          isMobile={isMobile}
        />
      )}
      {view === 'master' && (
        <div style={{ padding: '60px 20px', textAlign: 'center', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.lg, color: T.textMuted, fontSize: '14px', fontFamily: T.font.body }}>
          A visualização do Plano-Mestre será disponibilizada na próxima iteração.
          <br />Nesta rodada, o Plano-Mestre permanece acessível via migração e criação de edições.
        </div>
      )}

      {modalOpen && (
        <M31TarefaModal
          tarefa={editTarefa}
          tarefaPai={tarefaPai}
          defaultArea={defaultArea}
          defaultFrente={defaultFrente}
          initialPrazo={initialPrazo}
          onClose={() => { setModalOpen(false); setEditTarefa(null); setTarefaPai(null); setInitialPrazo(''); }}
          onSave={data => saveMutation.mutate(data)}
          canEdit={!!pode?.criarTarefa}
          userEmail={userEmail}
        />
      )}

      {modalIAOpen && (
        <M31SugestaoTarefasIA
          onClose={() => setModalIAOpen(false)}
          onImport={() => qc.invalidateQueries(['m31tarefas'])}
          userEmail={userEmail}
        />
      )}

      {enriquecerOpen && (
        <M31EnriquecerTarefas onClose={() => setEnriquecerOpen(false)} userEmail={userEmail} />
      )}

      <UndoBar state={itemManager.undoState} onDismiss={itemManager.dismissUndo} />

    </div>
  );
}