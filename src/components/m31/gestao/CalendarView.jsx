import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { TOKENS as T } from '@/lib/m31DesignTokens';
import { LEGACY_AREA_TO_NEW_SLUG } from '@/lib/m31Areas';
import { ChevronLeft, ChevronRight, List, Calendar, Filter, X, Flag } from 'lucide-react';
import { STATUS_LABELS, STATUS_COLORS, PRIORIDADE_LABELS, PRIORIDADE_COLORS, isAtrasada } from './tarefaHelpers';

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const WEEK_DAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

/**
 * CalendarView — visão de calendário mobile-first.
 * Mobile abre em Agenda; alterna entre Agenda e Mês.
 * Tarefas Mãe e Subtarefas aparecem pela data de prazo.
 * Tocar em um dia cria tarefa com prazo pré-preenchido.
 * Tocar em uma tarefa abre sua edição.
 * Filtros: Área, Frente, responsável, status.
 * Atrasadas em vermelho; concluídas com aparência discreta.
 */
export default function CalendarView({ tarefas, onOpenTask, onCreateTask, isMobile }) {
  const [view, setView] = useState(isMobile ? 'agenda' : 'month');
  const [month, setMonth] = useState(new Date());
  const [showFilters, setShowFilters] = useState(false);
  const [filtros, setFiltros] = useState({ areaId: '', frenteId: '', responsavel: '', status: '' });

  const { data: areas = [] } = useQuery({
    queryKey: ['m31areas'],
    queryFn: () => base44.entities.M31Area.filter({ ativo: true }, 'ordem', 50),
  });
  const { data: frentes = [] } = useQuery({
    queryKey: ['m31frentes'],
    queryFn: () => base44.entities.M31Frente.filter({ ativo: true }, 'ordem', 50),
  });

  const areaById = useMemo(() => { const m = new Map(); areas.forEach(a => m.set(a.id, a)); return m; }, [areas]);
  const areaIdToSlug = useMemo(() => { const m = new Map(); areas.forEach(a => m.set(a.id, a.slug)); return m; }, [areas]);

  const responsaveis = useMemo(() => {
    const set = new Set();
    tarefas.forEach(t => { if (t.responsavel_nome) set.add(t.responsavel_nome); });
    return Array.from(set).sort();
  }, [tarefas]);

  const frentesFiltradas = useMemo(() => {
    if (!filtros.areaId) return frentes;
    return frentes.filter(f => f.area_id === filtros.areaId);
  }, [frentes, filtros.areaId]);

  const tarefasFiltradas = useMemo(() => {
    return tarefas.filter(t => {
      if (filtros.areaId) {
        const taskSlug = t.area_id ? areaIdToSlug.get(t.area_id) : LEGACY_AREA_TO_NEW_SLUG[t.area];
        const filterSlug = areaById.get(filtros.areaId)?.slug;
        if (taskSlug !== filterSlug) return false;
      }
      if (filtros.frenteId && t.frente_id !== filtros.frenteId) return false;
      if (filtros.responsavel && t.responsavel_nome !== filtros.responsavel) return false;
      if (filtros.status && t.status !== filtros.status) return false;
      return true;
    });
  }, [tarefas, filtros, areaById, areaIdToSlug]);

  const byDay = useMemo(() => {
    const map = new Map();
    tarefasFiltradas.forEach(t => {
      if (!t.prazo) return;
      const key = t.prazo;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    });
    return map;
  }, [tarefasFiltradas]);

  const agendaGroups = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdue = [];
    const upcoming = [];
    byDay.forEach((tasks, dateStr) => {
      const d = new Date(dateStr + 'T12:00:00');
      d.setHours(0, 0, 0, 0);
      const hasIncomplete = tasks.some(t => t.status !== 'concluido');
      if (d < today && hasIncomplete) {
        overdue.push({ date: d, dateStr, tasks });
      } else if (d >= today) {
        upcoming.push({ date: d, dateStr, tasks });
      }
    });
    overdue.sort((a, b) => a.date - b.date);
    upcoming.sort((a, b) => a.date - b.date);
    return { overdue, upcoming };
  }, [byDay]);

  const year = month.getFullYear();
  const mon = month.getMonth();
  const firstDay = new Date(year, mon, 1).getDay();
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const today = new Date();

  const monthCells = [];
  for (let i = 0; i < firstDay; i++) monthCells.push(null);
  for (let i = 1; i <= daysInMonth; i++) monthCells.push(i);
  while (monthCells.length % 7 !== 0) monthCells.push(null);

  function formatDayHeader(d) {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const diff = Math.round((d - t) / 86400000);
    if (diff === 0) return 'Hoje';
    if (diff === 1) return 'Amanhã';
    if (diff === -1) return 'Ontem';
    return `${WEEK_DAYS[d.getDay()]}, ${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}`;
  }

  function dateStrFromDay(day) {
    return `${year}-${(mon+1).toString().padStart(2,'0')}-${day.toString().padStart(2,'0')}`;
  }

  const hasActiveFilters = !!(filtros.areaId || filtros.frenteId || filtros.responsavel || filtros.status);

  const selectStyle = {
    width: '100%', minHeight: '44px', padding: '0 10px', background: T.surface,
    border: `1px solid ${T.border}`, borderRadius: T.radius.md, fontSize: '14px',
    color: T.text, fontFamily: T.font.body, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Toggle Agenda/Mês + Filtros */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '2px', background: T.surfaceSubtle, borderRadius: T.radius.md, padding: '3px', flex: 1 }}>
          <button onClick={() => setView('agenda')} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', minHeight: '40px', background: view === 'agenda' ? T.surface : 'transparent', border: 'none', borderRadius: T.radius.sm, cursor: 'pointer', color: view === 'agenda' ? T.primary : T.textMuted, fontSize: '13px', fontWeight: view === 'agenda' ? '600' : '500', fontFamily: T.font.body }}>
            <List size={15} /> Agenda
          </button>
          <button onClick={() => setView('month')} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', minHeight: '40px', background: view === 'month' ? T.surface : 'transparent', border: 'none', borderRadius: T.radius.sm, cursor: 'pointer', color: view === 'month' ? T.primary : T.textMuted, fontSize: '13px', fontWeight: view === 'month' ? '600' : '500', fontFamily: T.font.body }}>
            <Calendar size={15} /> Mês
          </button>
        </div>
        <button onClick={() => setShowFilters(v => !v)} aria-label="Filtros" style={{ minWidth: '44px', minHeight: '44px', background: showFilters || hasActiveFilters ? T.primarySoft : T.surface, border: `1px solid ${showFilters || hasActiveFilters ? T.primary : T.border}`, borderRadius: T.radius.md, cursor: 'pointer', color: showFilters || hasActiveFilters ? T.primary : T.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Filter size={16} />
        </button>
      </div>

      {/* Barra de filtros */}
      {showFilters && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <select value={filtros.areaId} onChange={e => setFiltros(f => ({ ...f, areaId: e.target.value, frenteId: '' }))} style={selectStyle}>
              <option value="">Todas as áreas</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
            <select value={filtros.frenteId} onChange={e => setFiltros(f => ({ ...f, frenteId: e.target.value }))} style={selectStyle}>
              <option value="">Todas as frentes</option>
              {frentesFiltradas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <select value={filtros.responsavel} onChange={e => setFiltros(f => ({ ...f, responsavel: e.target.value }))} style={selectStyle}>
              <option value="">Todos os responsáveis</option>
              {responsaveis.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={filtros.status} onChange={e => setFiltros(f => ({ ...f, status: e.target.value }))} style={selectStyle}>
              <option value="">Todos os status</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {hasActiveFilters && (
            <button onClick={() => setFiltros({ areaId: '', frenteId: '', responsavel: '', status: '' })} style={{ alignSelf: 'flex-start', minHeight: '36px', padding: '0 12px', background: 'none', border: `1px solid ${T.border}`, borderRadius: T.radius.md, color: T.textMuted, fontSize: '12px', fontWeight: '500', cursor: 'pointer', fontFamily: T.font.body, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <X size={13} /> Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* === AGENDA === */}
      {view === 'agenda' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {agendaGroups.overdue.length > 0 && (
            <div>
              <div style={{ fontSize: '12px', fontWeight: '700', color: T.danger, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 0 8px' }}>Atrasadas</div>
              {agendaGroups.overdue.map(grp => (
                <AgendaDayGroup key={grp.dateStr} grp={grp} formatDayHeader={formatDayHeader} onOpenTask={onOpenTask} />
              ))}
            </div>
          )}
          {agendaGroups.upcoming.length > 0 && (
            <div>
              <div style={{ fontSize: '12px', fontWeight: '700', color: T.textSubtle, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 0 8px' }}>Próximos</div>
              {agendaGroups.upcoming.map(grp => (
                <AgendaDayGroup key={grp.dateStr} grp={grp} formatDayHeader={formatDayHeader} onOpenTask={onOpenTask} />
              ))}
            </div>
          )}
          {agendaGroups.overdue.length === 0 && agendaGroups.upcoming.length === 0 && (
            <div style={{ padding: '48px 20px', textAlign: 'center', color: T.textMuted, fontSize: '14px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.lg }}>
              Nenhuma tarefa com prazo definido
            </div>
          )}
        </div>
      )}

      {/* === MÊS === */}
      {view === 'month' && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.lg, overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={() => setMonth(new Date(year, mon - 1, 1))} aria-label="Mês anterior" style={{ minWidth: '44px', minHeight: '44px', background: 'none', border: `1px solid ${T.border}`, borderRadius: T.radius.md, color: T.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronLeft size={18} />
            </button>
            <span style={{ flex: 1, textAlign: 'center', fontSize: '15px', fontWeight: '600', color: T.text, fontFamily: T.font.body }}>{MONTH_NAMES[mon]} {year}</span>
            <button onClick={() => setMonth(new Date(year, mon + 1, 1))} aria-label="Próximo mês" style={{ minWidth: '44px', minHeight: '44px', background: 'none', border: `1px solid ${T.border}`, borderRadius: T.radius.md, color: T.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronRight size={18} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {WEEK_DAYS.map(d => (
              <div key={d} style={{ padding: '8px 2px', textAlign: 'center', fontSize: '11px', fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', color: T.textSubtle, background: T.surfaceSubtle, borderBottom: `1px solid ${T.border}` }}>{d}</div>
            ))}
            {monthCells.map((day, i) => {
              if (day === null) return <div key={i} style={{ minHeight: isMobile ? '60px' : '75px', borderRight: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`, background: T.surfaceSubtle }} />;
              const dateStr = dateStrFromDay(day);
              const tasks = byDay.get(dateStr) || [];
              const isToday = day === today.getDate() && mon === today.getMonth() && year === today.getFullYear();
              return (
                <div key={i} style={{ minHeight: isMobile ? '60px' : '75px', borderRight: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`, padding: '4px 2px', background: isToday ? T.primarySoft : 'transparent', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <button onClick={() => onCreateTask?.(dateStr)} style={{ width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '600', color: isToday ? T.onPrimary : T.textMuted, background: isToday ? T.primary : 'transparent', border: 'none', cursor: 'pointer', padding: 0, alignSelf: 'flex-start' }}>
                    {day}
                  </button>
                  {tasks.slice(0, isMobile ? 2 : 3).map(t => {
                    const concl = t.status === 'concluido';
                    const atr = isAtrasada(t);
                    return (
                      <button key={t.id} onClick={() => onOpenTask?.(t)} style={{ padding: '2px 4px', borderRadius: T.radius.sm, fontSize: '10px', fontWeight: '500', border: 'none', cursor: 'pointer', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: concl ? 'transparent' : atr ? T.dangerSoft : T.surfaceSubtle, color: concl ? T.textSubtle : atr ? T.danger : T.text, textDecoration: concl ? 'line-through' : 'none', lineHeight: '1.3' }}>
                        {t.titulo}
                      </button>
                    );
                  })}
                  {tasks.length > (isMobile ? 2 : 3) && <span style={{ fontSize: '10px', color: T.textMuted }}>+{tasks.length - (isMobile ? 2 : 3)}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function AgendaDayGroup({ grp, formatDayHeader, onOpenTask }) {
  return (
    <div style={{ marginBottom: '4px' }}>
      <div style={{ fontSize: '13px', fontWeight: '600', color: T.text, padding: '6px 0', fontFamily: T.font.body }}>{formatDayHeader(grp.date)}</div>
      {grp.tasks.map(t => {
        const concl = t.status === 'concluido';
        const atr = isAtrasada(t);
        const prioColor = PRIORIDADE_COLORS[t.prioridade] || T.textMuted;
        return (
          <button key={t.id} onClick={() => onOpenTask?.(t)} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%', minHeight: '48px', padding: '10px 12px', marginBottom: '4px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.md, cursor: 'pointer', textAlign: 'left', fontFamily: T.font.body, opacity: concl ? 0.6 : 1 }}>
            <div style={{ width: '4px', minHeight: '24px', borderRadius: T.radius.pill, background: atr ? T.danger : concl ? T.border : (STATUS_COLORS[t.status] || T.textMuted), flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: concl ? T.textMuted : T.text, textDecoration: concl ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.titulo}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', flexWrap: 'wrap' }}>
                {t.responsavel_nome && <span style={{ fontSize: '12px', color: T.textMuted }}>{t.responsavel_nome}</span>}
                {t.prioridade && t.prioridade !== 'media' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '11px', color: prioColor, fontWeight: '600' }}>
                    <Flag size={9} /> {PRIORIDADE_LABELS[t.prioridade]}
                  </span>
                )}
                <span style={{ fontSize: '11px', color: atr ? T.danger : T.textSubtle, fontWeight: atr ? '600' : '400' }}>{STATUS_LABELS[t.status]}</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}