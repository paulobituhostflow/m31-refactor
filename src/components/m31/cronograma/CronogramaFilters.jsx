import { X } from 'lucide-react';

const TURNOS = [
  { id: 'manha', label: 'Manhã' },
  { id: 'tarde', label: 'Tarde' },
  { id: 'noite', label: 'Noite' },
];

const STATUSES = [
  { value: 'planejada',    label: 'Planejada' },
  { value: 'em_andamento', label: 'Em Andamento' },
  { value: 'concluida',    label: 'Concluída' },
  { value: 'atrasada',     label: 'Atrasada' },
  { value: 'cancelada',    label: 'Cancelada' },
];

const selectClass =
  'bg-card border border-border rounded-md text-xs text-foreground px-2.5 py-1.5 outline-none cursor-pointer flex-shrink-0 max-w-[140px] truncate focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Filtros rápidos: turno (chips) + responsável, área, telão, status (selects).
 * Scroll horizontal no mobile (scrollbar-none).
 */
export default function CronogramaFilters({
  turno, setTurno,
  responsavel, setResponsavel, responsaveis,
  area, setArea, areas,
  telao, setTelao,
  status, setStatus,
  onClear,
}) {
  const hasFilters = turno || responsavel || area || telao || status;

  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
      {/* Turno chips */}
      <div className="flex gap-1 bg-muted rounded-lg p-0.5 flex-shrink-0">
        <button
          onClick={() => setTurno('')}
          className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
            !turno ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
          }`}
        >
          Todos
        </button>
        {TURNOS.map(t => (
          <button
            key={t.id}
            onClick={() => setTurno(turno === t.id ? '' : t.id)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
              turno === t.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Responsável */}
      <select value={responsavel} onChange={e => setResponsavel(e.target.value)} className={selectClass}>
        <option value="">Responsável</option>
        {responsaveis.map(r => <option key={r} value={r}>{r}</option>)}
      </select>

      {/* Área */}
      <select value={area} onChange={e => setArea(e.target.value)} className={selectClass}>
        <option value="">Área</option>
        {areas.map(a => <option key={a} value={a}>{a}</option>)}
      </select>

      {/* Telão */}
      <select value={telao} onChange={e => setTelao(e.target.value)} className={selectClass}>
        <option value="">Telão</option>
        <option value="com">Com telão</option>
        <option value="sem">Sem telão</option>
      </select>

      {/* Status */}
      <select value={status} onChange={e => setStatus(e.target.value)} className={selectClass}>
        <option value="">Status</option>
        {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>

      {/* Clear */}
      {hasFilters && (
        <button
          onClick={onClear}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground flex-shrink-0 whitespace-nowrap"
        >
          <X size={12} /> Limpar
        </button>
      )}
    </div>
  );
}