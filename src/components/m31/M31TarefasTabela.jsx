import { useState, useMemo } from 'react';
import { Check, Clock, ChevronUp, ChevronDown } from 'lucide-react';

// ── Design tokens ────────────────────────────────────────────────────────────
const D = {
  bg: '#FFFFFF',
  card: '#FFFFFF',
  border: 'rgba(0,0,0,0.06)',
  text: '#111827',
  sec: '#6B7280',
  muted: '#9CA3AF',
  primary: '#8B1A2B',
  hover: 'rgba(139,26,43,0.03)',
  selected: 'rgba(139,26,43,0.06)',
};

// ── Tipo ─────────────────────────────────────────────────────────────────────
const TIPO_CFG = {
  espiritual:    { label: 'Espiritual',    bg: 'rgba(37,99,235,0.08)',   text: '#1D4ED8', dot: '#3B82F6' },
  estrategica:   { label: 'Estratégica',   bg: 'rgba(13,148,136,0.08)',  text: '#0F766E', dot: '#14B8A6' },
  operacional:   { label: 'Operacional',   bg: 'rgba(234,88,12,0.08)',   text: '#C2410C', dot: '#F97316' },
  comercial:     { label: 'Comercial',     bg: 'rgba(217,119,6,0.08)',   text: '#B45309', dot: '#F59E0B' },
  experiencia:   { label: 'Experiência',   bg: 'rgba(168,85,247,0.08)',  text: '#7C3AED', dot: '#A855F7' },
  producao:      { label: 'Produção',      bg: 'rgba(34,197,94,0.08)',   text: '#15803D', dot: '#22C55E' },
  voluntariado:  { label: 'Voluntariado',  bg: 'rgba(236,72,153,0.08)',  text: '#BE185D', dot: '#EC4899' },
};

// ── Prioridade ───────────────────────────────────────────────────────────────
const PRI_CFG = {
  baixa:  { label: 'Desejável',  bg: 'rgba(245,158,11,0.12)', text: '#B45309', solid: '#F59E0B' },
  media:  { label: 'Normal',     bg: 'rgba(107,114,128,0.08)', text: '#6B7280', solid: '#9CA3AF' },
  alta:   { label: 'Importante', bg: 'rgba(239,68,68,0.10)',  text: '#DC2626', solid: '#EF4444' },
  urgente:{ label: 'Obrigatório', bg: 'rgba(220,38,38,0.12)', text: '#B91C1C', solid: '#DC2626' },
};

// ── Status ───────────────────────────────────────────────────────────────────
const STATUS_CFG = {
  a_fazer:      { label: 'A Fazer',      bg: '#F3F4F6', text: '#374151' },
  em_andamento: { label: 'Em Andamento', bg: '#DBEAFE', text: '#1E40AF' },
  em_execucao:  { label: 'Em Andamento', bg: '#DBEAFE', text: '#1E40AF' },
  atencao:      { label: 'Em Andamento', bg: '#DBEAFE', text: '#1E40AF' },
  atrasado:     { label: 'Atrasado',     bg: '#FEE2E2', text: '#991B1B' },
  critico:      { label: 'Atrasado',     bg: '#FEE2E2', text: '#991B1B' },
  bloqueado:    { label: 'Atrasado',     bg: '#FEE2E2', text: '#991B1B' },
  concluido:    { label: 'Concluído',    bg: '#DCFCE7', text: '#166534' },
};

// ── Semana (fase) helper ─────────────────────────────────────────────────────
const FASES = [
  { key: 'preparacao', label: 'Preparação', range: [new Date('2026-01-01'), new Date('2026-05-31')] },
  { key: 'captacao', label: 'Captação', range: [new Date('2026-06-01'), new Date('2026-08-31')] },
  { key: 'execucao', label: 'Execução', range: [new Date('2026-09-01'), new Date('2026-11-15')] },
  { key: 'evento', label: 'Evento', range: [new Date('2026-11-16'), new Date('2026-11-22')] },
];

function getFase(prazo) {
  if (!prazo) return null;
  const d = new Date(prazo + 'T12:00:00');
  return FASES.find(f => d >= f.range[0] && d <= f.range[1]) || null;
}

function prazoLabel(prazo) {
  if (!prazo) return null;
  return new Date(prazo + 'T12:00:00').toLocaleDateString('pt-BR');
}

// ── Sort ─────────────────────────────────────────────────────────────────────
function useSort(data, defaultKey = 'prazo') {
  const [sortKey, setSortKey] = useState(defaultKey);
  const [sortDir, setSortDir] = useState('asc');

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey];
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  function toggle(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  return { sorted, sortKey, sortDir, toggle };
}

// ── SortHeader ───────────────────────────────────────────────────────────────
function SortHeader({ label, sortKey, currentKey, dir, onToggle, style }) {
  return (
    <div
      onClick={() => onToggle(sortKey)}
      style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer', userSelect: 'none', ...style }}
    >
      <span>{label}</span>
      {currentKey === sortKey ? (
        dir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />
      ) : (
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 0.5 }}>
          <ChevronUp size={8} opacity={0.25} />
          <ChevronDown size={8} opacity={0.25} />
        </span>
      )}
    </div>
  );
}

// ── Pill ─────────────────────────────────────────────────────────────────────
function Pill({ label, bg, color }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      background: bg, color: color, borderRadius: '4px',
      padding: '2px 8px', fontSize: '11px', fontWeight: '600',
      whiteSpace: 'nowrap', lineHeight: '18px',
    }}>{label}</span>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function M31TarefasTabela({ tarefas, onToggle, onOpenTask }) {
  const [selecionados, setSelecionados] = useState(new Set());

  const { sorted, sortKey, sortDir, toggle } = useSort(tarefas, 'prazo');

  function toggleSelect(id) {
    setSelecionados(s => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const thStyle = {
    fontSize: '11px', fontWeight: '700', letterSpacing: '0.04em', textTransform: 'uppercase',
    color: D.muted, padding: '10px 12px', borderBottom: `1.5px solid ${D.border}`,
    background: 'rgba(0,0,0,0.01)',
  };

  const tdStyle = base => ({
    padding: '10px 12px', fontSize: '13px', color: D.text,
    borderBottom: `1px solid ${D.border}`,
    ...base,
  });

  return (
    <div style={{
      background: D.card, border: `1px solid ${D.border}`, borderRadius: '10px',
      overflow: 'hidden', fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: '38px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  onChange={e => {
                    if (e.target.checked) setSelecionados(new Set(sorted.map(t => t.id)));
                    else setSelecionados(new Set());
                  }}
                  checked={selecionados.size === sorted.length && sorted.length > 0}
                  style={{ cursor: 'pointer', accentColor: D.primary }}
                />
              </th>
              <th style={{ ...thStyle, width: '110px' }}>
                <SortHeader label="Semana" sortKey="prazo" currentKey={sortKey} dir={sortDir} onToggle={toggle} />
              </th>
              <th style={{ ...thStyle, width: '110px' }}>
                <SortHeader label="Tipo" sortKey="tipo" currentKey={sortKey} dir={sortDir} onToggle={toggle} />
              </th>
              <th style={{ ...thStyle, width: '40px', textAlign: 'center' }}>#</th>
              <th style={{ ...thStyle, minWidth: '200px' }}>
                <SortHeader label="Tarefa" sortKey="titulo" currentKey={sortKey} dir={sortDir} onToggle={toggle} />
              </th>
              <th style={{ ...thStyle, width: '110px' }}>
                <SortHeader label="Prioridade" sortKey="prioridade" currentKey={sortKey} dir={sortDir} onToggle={toggle} />
              </th>
              <th style={{ ...thStyle, width: '120px' }}>
                <SortHeader label="Status" sortKey="status" currentKey={sortKey} dir={sortDir} onToggle={toggle} />
              </th>
              <th style={{ ...thStyle, width: '115px' }}>
                <SortHeader label="Prazo" sortKey="prazo" currentKey={sortKey} dir={sortDir} onToggle={toggle} />
              </th>
              <th style={{ ...thStyle, minWidth: '180px' }}>Observação</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t, idx) => {
              const concluida = t.status === 'concluido';
              const tipoCfg = TIPO_CFG[t.tipo] || TIPO_CFG.operacional;
              const priCfg = PRI_CFG[t.prioridade] || PRI_CFG.media;
              const statusCfg = STATUS_CFG[t.status] || STATUS_CFG.a_fazer;
              const fase = getFase(t.prazo);
              const vencido = t.prazo && !concluida && new Date(t.prazo + 'T12:00:00') < new Date();

              return (
                <tr
                  key={t.id}
                  onClick={() => onOpenTask(t)}
                  style={{
                    cursor: 'pointer',
                    background: selecionados.has(t.id) ? D.selected : 'transparent',
                    opacity: concluida ? 0.6 : 1,
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => {
                    if (!selecionados.has(t.id)) e.currentTarget.style.background = D.hover;
                  }}
                  onMouseLeave={e => {
                    if (!selecionados.has(t.id)) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {/* Checkbox */}
                  <td style={{ ...tdStyle({}), textAlign: 'center' }}>
                    <div
                      onClick={e => { e.stopPropagation(); onToggle(t); }}
                      style={{
                        width: '18px', height: '18px', borderRadius: '4px', cursor: 'pointer', margin: '0 auto',
                        border: concluida ? 'none' : `1.5px solid #D1D5DB`,
                        background: concluida ? '#22C55E' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {concluida && <Check size={11} color="#fff" strokeWidth={3} />}
                    </div>
                  </td>

                  {/* Semana */}
                  <td style={tdStyle({})}>
                    {fase ? (
                      <span style={{ fontSize: '12px', color: D.sec, fontWeight: '500' }}>{fase.label}</span>
                    ) : (
                      <span style={{ color: D.muted, fontSize: '12px' }}>—</span>
                    )}
                  </td>

                  {/* Tipo */}
                  <td style={tdStyle({})}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: D.sec }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: tipoCfg.dot }} />
                      {tipoCfg.label}
                    </span>
                  </td>

                  {/* # */}
                  <td style={{ ...tdStyle({}), textAlign: 'center', color: D.muted, fontSize: '12px' }}>
                    {idx + 1}
                  </td>

                  {/* Tarefa */}
                  <td style={tdStyle({})}>
                    <div style={{
                      fontWeight: '600', color: concluida ? D.muted : D.text,
                      textDecoration: concluida ? 'line-through' : 'none',
                      marginBottom: '2px',
                    }}>
                      {t.titulo}
                    </div>
                    {t.responsavel_nome && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: D.sec }} title={t.responsavel_nome}>
                        <span style={{
                          width: '18px', height: '18px', borderRadius: '50%',
                          background: '#F3F4F6', color: '#6B7280', fontSize: '9px', fontWeight: '700',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          {t.responsavel_nome.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()}
                        </span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
                          {t.responsavel_nome}
                        </span>
                      </div>
                    )}
                  </td>

                  {/* Prioridade */}
                  <td style={tdStyle({})}>
                    <span style={{
                      display: 'inline-block', padding: '3px 10px', borderRadius: '20px',
                      fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap',
                      background: concluida ? '#F3F4F6' : priCfg.solid, color: concluida ? '#9CA3AF' : '#FFFFFF',
                    }}>
                      {priCfg.label}
                    </span>
                  </td>

                  {/* Status */}
                  <td style={tdStyle({})}>
                    <span style={{
                      display: 'inline-block', padding: '3px 10px', borderRadius: '20px',
                      fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap',
                      background: statusCfg.bg, color: statusCfg.text,
                    }}>
                      {statusCfg.label}
                    </span>
                  </td>

                  {/* Prazo */}
                  <td style={{ ...tdStyle({}), color: vencido ? '#DC2626' : D.text, fontWeight: vencido ? '600' : '400' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      {vencido && <Clock size={11} color="#DC2626" />}
                      {prazoLabel(t.prazo) || <span style={{ color: D.muted }}>dd/mm/aaaa</span>}
                    </div>
                  </td>

                  {/* Observação */}
                  <td style={{ ...tdStyle({}), color: D.sec, fontSize: '12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.descricao || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sorted.length === 0 && (
        <div style={{ padding: '40px', textAlign: 'center', color: D.muted, fontSize: '14px' }}>
          Nenhuma tarefa encontrada
        </div>
      )}
    </div>
  );
}