import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { Search, X, List, Clock, LayoutGrid, Users, Sunrise, Sun, Moon } from 'lucide-react';
import CronogramaSummary from '@/components/m31/cronograma/CronogramaSummary';
import CronogramaFilters from '@/components/m31/cronograma/CronogramaFilters';
import CronogramaLista from '@/components/m31/cronograma/CronogramaLista';
import CronogramaTimeline from '@/components/m31/cronograma/CronogramaTimeline';
import CronogramaAmbiente from '@/components/m31/cronograma/CronogramaAmbiente';
import CronogramaResponsavel from '@/components/m31/cronograma/CronogramaResponsavel';
import CronogramaSidebar from '@/components/m31/cronograma/CronogramaSidebar';

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const match = String(timeStr).match(/(\d{1,2}):?(\d{2})?/);
  if (!match) return null;
  const h = parseInt(match[1]);
  const m = match[2] ? parseInt(match[2]) : 0;
  if (isNaN(h)) return null;
  return h * 60 + m;
}

function minutesToLabel(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const VIEW_MODES = [
  { id: 'turno',       label: 'Turno',       icon: List },
  { id: 'timeline',    label: 'Timeline',    icon: Clock },
  { id: 'area',        label: 'Área',        icon: LayoutGrid },
  { id: 'responsavel', label: 'Responsável', icon: Users },
];

export default function M31Cronograma() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busca, setBusca] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [viewMode, setViewMode] = useState('turno');
  const [now, setNow] = useState(() => new Date());

  // Filters
  const [filtroTurno, setFiltroTurno] = useState('');
  const [filtroResponsavel, setFiltroResponsavel] = useState('');
  const [filtroArea, setFiltroArea] = useState('');
  const [filtroTelao, setFiltroTelao] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['m31cronograma'],
    queryFn: () => base44.entities.EventoM31Cronograma.list('ordem', 200),
  });

  const { data: membros = [] } = useQuery({
    queryKey: ['m31cronograma_membros'],
    queryFn: () => base44.entities.EventoM31Membro.filter({ ativo: true }),
  });

  // Unique values for filters
  const uniqueResponsaveis = useMemo(() => {
    const set = new Set(items.map(i => i.responsavel).filter(Boolean));
    return [...set].sort();
  }, [items]);

  const uniqueAreas = useMemo(() => {
    const set = new Set(items.map(i => i.area || 'geral').filter(Boolean));
    return [...set].sort();
  }, [items]);

  // Filtered items (search + filters)
  const filtered = useMemo(() => {
    let list = items;
    if (busca) {
      const b = busca.toLowerCase();
      list = list.filter(i =>
        i.programacao?.toLowerCase().includes(b) ||
        i.responsavel?.toLowerCase().includes(b) ||
        i.telao?.toLowerCase().includes(b) ||
        i.cena?.toLowerCase().includes(b) ||
        i.ambiente?.toLowerCase().includes(b)
      );
    }
    if (filtroTurno) {
      list = list.filter(i => {
        const h = parseTimeToMinutes(i.hora_inicio_normalizada || i.hora_inicio_original);
        if (filtroTurno === 'manha') return h !== null && h < 720;
        if (filtroTurno === 'tarde') return h !== null && h >= 720 && h < 1080;
        if (filtroTurno === 'noite') return h !== null && h >= 1080;
        return true;
      });
    }
    if (filtroResponsavel) list = list.filter(i => i.responsavel === filtroResponsavel);
    if (filtroArea) list = list.filter(i => (i.area || 'geral') === filtroArea);
    if (filtroTelao === 'com') list = list.filter(i => !!i.telao);
    else if (filtroTelao === 'sem') list = list.filter(i => !i.telao);
    if (filtroStatus) list = list.filter(i => i.status === filtroStatus);
    return list;
  }, [items, busca, filtroTurno, filtroResponsavel, filtroArea, filtroTelao, filtroStatus]);

  // Summary stats
  const summary = useMemo(() => {
    const count = (pred) => items.filter(pred).length;
    return {
      total: items.length,
      manha: count(i => { const h = parseTimeToMinutes(i.hora_inicio_normalizada || i.hora_inicio_original); return h !== null && h < 720; }),
      tarde: count(i => { const h = parseTimeToMinutes(i.hora_inicio_normalizada || i.hora_inicio_original); return h !== null && h >= 720 && h < 1080; }),
      noite: count(i => { const h = parseTimeToMinutes(i.hora_inicio_normalizada || i.hora_inicio_original); return h !== null && h >= 1080; }),
      semResponsavel: count(i => !i.responsavel),
      criticas: count(i => i.status === 'atrasada'),
    };
  }, [items]);

  // Faixas (turno groups)
  const faixas = useMemo(() => {
    const manha = filtered.filter(i => { const h = parseTimeToMinutes(i.hora_inicio_normalizada || i.hora_inicio_original); return h !== null && h < 720; });
    const tarde = filtered.filter(i => { const h = parseTimeToMinutes(i.hora_inicio_normalizada || i.hora_inicio_original); return h !== null && h >= 720 && h < 1080; });
    const noite = filtered.filter(i => { const h = parseTimeToMinutes(i.hora_inicio_normalizada || i.hora_inicio_original); return h !== null && h >= 1080; });
    return [
      { label: 'Manhã', icon: Sunrise, items: manha },
      { label: 'Tarde', icon: Sun, items: tarde },
      { label: 'Noite', icon: Moon, items: noite },
    ].filter(f => f.items.length > 0);
  }, [filtered]);

  // Active item (agora)
  const activeItemId = useMemo(() => {
    if (items.length === 0) return null;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    let active = null;
    for (const item of items) {
      if (item.e_continuacao) continue;
      const startMin = parseTimeToMinutes(item.hora_inicio_normalizada || item.hora_inicio_original);
      if (startMin === null) continue;
      if (startMin <= nowMin) active = item;
      else break;
    }
    return active?.id || null;
  }, [items, now]);

  const selectedItem = useMemo(() => items.find(i => i.id === selectedId) || null, [items, selectedId]);

  // ── Handlers ──────────────────────────────────────
  const handleSelect = (item) => setSelectedId(item.id);

  const handleQuickMessage = async (item, quickMsg) => {
    const nomeBusca = item.responsavel?.toLowerCase().trim();
    if (!nomeBusca) {
      toast({ title: '⚠️ Sem responsável', description: 'Esta atividade não tem responsável definido.' });
      return;
    }
    const membro = membros.find(m =>
      m.nome?.toLowerCase().includes(nomeBusca) || nomeBusca.includes(m.nome?.toLowerCase())
    );
    if (!membro?.whatsapp) {
      toast({ title: '⚠️ Responsável não encontrado', description: `${item.responsavel} não está na equipe ou não tem WhatsApp.` });
      return;
    }
    try {
      await base44.functions.invoke('m31SendWhatsApp', { phone: membro.whatsapp, message: `[${item.programacao}] ${quickMsg.message}` });
      toast({ title: '✅ Alerta enviado', description: `${quickMsg.label} → ${item.responsavel}` });
    } catch (e) {
      toast({ title: '❌ Erro ao enviar', description: e.message, variant: 'destructive' });
    }
  };

  const handleMediaUpload = async (item, file) => {
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.EventoM31Cronograma.update(item.id, { media_url: file_url, media_tipo: 'upload', media_vinculada: true });
      toast({ title: '📎 Mídia vinculada', description: file.name });
      qc.invalidateQueries(['m31cronograma']);
    } catch (e) {
      toast({ title: '❌ Erro no upload', description: e.message, variant: 'destructive' });
    }
  };

  const handleMediaLink = async (item, url) => {
    try {
      await base44.entities.EventoM31Cronograma.update(item.id, { media_url: url, media_tipo: 'link', media_vinculada: true });
      toast({ title: '🔗 Link vinculado', description: url });
      qc.invalidateQueries(['m31cronograma']);
    } catch (e) {
      toast({ title: '❌ Erro ao vincular', description: e.message, variant: 'destructive' });
    }
  };

  const handleUpdate = async (item, data) => {
    try {
      await base44.entities.EventoM31Cronograma.update(item.id, data);
      qc.invalidateQueries(['m31cronograma']);
      toast({ title: '✅ Atualizado', description: item.programacao });
    } catch (e) {
      toast({ title: '❌ Erro', description: e.message, variant: 'destructive' });
    }
  };

  const handleDuplicate = async (item) => {
    try {
      const maxOrdem = items.length > 0 ? Math.max(...items.map(i => i.ordem || 0)) : 0;
      const { id, created_date, updated_date, created_by_id, ...rest } = item;
      await base44.entities.EventoM31Cronograma.create({
        ...rest,
        ordem: maxOrdem + 1,
        programacao: `${item.programacao} (cópia)`,
        status: 'planejada',
      });
      qc.invalidateQueries(['m31cronograma']);
      toast({ title: '✅ Duplicado', description: `${item.programacao} (cópia)` });
    } catch (e) {
      toast({ title: '❌ Erro ao duplicar', description: e.message, variant: 'destructive' });
    }
  };

  const handleMove = (item) => {
    setViewMode('timeline');
    setSelectedId(item.id);
    toast({ title: '↔ Modo Timeline', description: 'Arraste o card para o novo horário' });
  };

  const clearFilters = () => {
    setFiltroTurno(''); setFiltroResponsavel(''); setFiltroArea(''); setFiltroTelao(''); setFiltroStatus('');
  };

  // ── Drag End Handlers ─────────────────────────────
  const handleDragEndTimeline = async (result) => {
    if (!result.destination) return;
    const slotId = result.destination.droppableId;
    if (!slotId.startsWith('slot-')) return;
    const minutes = parseInt(slotId.replace('slot-', ''));
    if (isNaN(minutes)) return;
    const newTime = minutesToLabel(minutes);
    try {
      await base44.entities.EventoM31Cronograma.update(result.draggableId, { hora_inicio_normalizada: newTime });
      qc.invalidateQueries(['m31cronograma']);
      toast({ title: '✅ Atividade movida', description: `Novo horário: ${newTime}` });
    } catch (e) {
      toast({ title: '❌ Erro ao mover', description: e.message, variant: 'destructive' });
    }
  };

  const handleDragEndLista = async (result) => {
    if (!result.destination) return;
    if (result.source.droppableId === result.destination.droppableId && result.source.index === result.destination.index) return;
    const destFaixaLabel = result.destination.droppableId.replace('faixa-', '');
    const destFaixa = faixas.find(f => f.label === destFaixaLabel);
    if (!destFaixa) return;
    const destItems = destFaixa.items;
    let newOrdem;
    if (destItems.length === 0) newOrdem = Date.now();
    else if (result.destination.index === 0) newOrdem = (destItems[0].ordem || 0) - 0.5;
    else if (result.destination.index >= destItems.length) newOrdem = (destItems[destItems.length - 1].ordem || 0) + 1;
    else { const before = destItems[result.destination.index - 1]; const after = destItems[result.destination.index]; newOrdem = ((before.ordem || 0) + (after.ordem || 0)) / 2; }
    try {
      await base44.entities.EventoM31Cronograma.update(result.draggableId, { ordem: newOrdem });
      qc.invalidateQueries(['m31cronograma']);
    } catch (e) {
      toast({ title: '❌ Erro ao reordenar', description: e.message, variant: 'destructive' });
    }
  };

  const handleDragEndAmbiente = async (result) => {
    if (!result.destination) return;
    const areaCol = result.destination.droppableId.replace('area-', '');
    try {
      await base44.entities.EventoM31Cronograma.update(result.draggableId, { area: areaCol });
      qc.invalidateQueries(['m31cronograma']);
      toast({ title: '✅ Área atualizada', description: areaCol });
    } catch (e) {
      toast({ title: '❌ Erro ao mover', description: e.message, variant: 'destructive' });
    }
  };

  const handleDragEndResponsavel = async (result) => {
    if (!result.destination) return;
    const respCol = result.destination.droppableId.replace('resp-', '');
    const newResp = respCol === '__sem__' ? '' : respCol;
    try {
      await base44.entities.EventoM31Cronograma.update(result.draggableId, { responsavel: newResp });
      qc.invalidateQueries(['m31cronograma']);
      toast({ title: '✅ Responsável atualizado', description: newResp || 'Sem responsável' });
    } catch (e) {
      toast({ title: '❌ Erro', description: e.message, variant: 'destructive' });
    }
  };

  if (isLoading) return (
    <div className="flex justify-center py-16">
      <div className="w-7 h-7 border-2 border-border border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h1 className="text-h1 text-foreground mb-0.5">Cronograma do Evento</h1>
        <div className="text-sm text-muted-foreground">{items.length} atividades programadas</div>
      </div>

      {/* Summary cards */}
      <CronogramaSummary {...summary} />

      {/* View toggle + Search */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-0.5 bg-muted rounded-lg p-0.5 flex-shrink-0 overflow-x-auto scrollbar-none">
          {VIEW_MODES.map(vm => {
            const Icon = vm.icon;
            const active = viewMode === vm.id;
            return (
              <button
                key={vm.id}
                onClick={() => setViewMode(vm.id)}
                className={[
                  'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap',
                  active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                ].join(' ')}
              >
                <Icon size={13} /> {vm.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 bg-card border border-border rounded-md px-3 py-2 flex-1 min-w-[160px] shadow-sm">
          <Search size={14} className="text-muted-foreground flex-shrink-0" />
          <input
            className="border-none bg-transparent flex-1 text-sm text-foreground outline-none min-w-0"
            placeholder="Buscar atividade, responsável, telão..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
          {busca && (
            <button onClick={() => setBusca('')} className="text-muted-foreground hover:text-foreground flex-shrink-0">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <CronogramaFilters
        turno={filtroTurno} setTurno={setFiltroTurno}
        responsavel={filtroResponsavel} setResponsavel={setFiltroResponsavel} responsaveis={uniqueResponsaveis}
        area={filtroArea} setArea={setFiltroArea} areas={uniqueAreas}
        telao={filtroTelao} setTelao={setFiltroTelao}
        status={filtroStatus} setStatus={setFiltroStatus}
        onClear={clearFilters}
      />

      {/* Split layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 items-start">
        {/* Esquerda: view ativa */}
        <div className="min-w-0">
          {viewMode === 'turno' && (
            <CronogramaLista faixas={faixas} activeItemId={activeItemId} selectedId={selectedId} onSelect={handleSelect} onQuickMessage={handleQuickMessage} onDragEnd={handleDragEndLista} />
          )}
          {viewMode === 'timeline' && (
            <CronogramaTimeline items={filtered} activeItemId={activeItemId} selectedId={selectedId} onSelect={handleSelect} onQuickMessage={handleQuickMessage} onDragEnd={handleDragEndTimeline} />
          )}
          {viewMode === 'area' && (
            <CronogramaAmbiente items={filtered} activeItemId={activeItemId} selectedId={selectedId} onSelect={handleSelect} onQuickMessage={handleQuickMessage} onDragEnd={handleDragEndAmbiente} />
          )}
          {viewMode === 'responsavel' && (
            <CronogramaResponsavel items={filtered} activeItemId={activeItemId} selectedId={selectedId} onSelect={handleSelect} onQuickMessage={handleQuickMessage} onDragEnd={handleDragEndResponsavel} />
          )}
        </div>

        {/* Direita: sidebar fixa (desktop) */}
        <div className="hidden lg:block lg:sticky lg:top-4">
          <CronogramaSidebar
            item={selectedItem}
            onQuickMessage={handleQuickMessage}
            onMediaUpload={handleMediaUpload}
            onMediaLink={handleMediaLink}
            onClose={() => setSelectedId(null)}
            onUpdate={handleUpdate}
            onDuplicate={handleDuplicate}
            onMove={handleMove}
          />
        </div>
      </div>

      {/* Mobile/Tablet drawer */}
      {selectedItem && (
        <div className="lg:hidden fixed inset-0 z-50 flex" onClick={() => setSelectedId(null)}>
          <div className="absolute inset-0 bg-black/50 animate-in fade-in duration-200" />
          <div
            className="ml-auto w-full max-w-sm bg-card h-full overflow-y-auto shadow-2xl animate-in slide-in-from-right duration-300"
            onClick={e => e.stopPropagation()}
          >
            <CronogramaSidebar
              item={selectedItem}
              onQuickMessage={handleQuickMessage}
              onMediaUpload={handleMediaUpload}
              onMediaLink={handleMediaLink}
              onClose={() => setSelectedId(null)}
              onUpdate={handleUpdate}
              onDuplicate={handleDuplicate}
              onMove={handleMove}
            />
          </div>
        </div>
      )}
    </div>
  );
}