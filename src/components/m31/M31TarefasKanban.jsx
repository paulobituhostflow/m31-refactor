import React, { useState } from 'react';
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Clock, CheckCircle2, AlertTriangle, Circle, Loader2 } from 'lucide-react';

// ── Design tokens locais (SaaS clean, cool gray) ─────────────────────────────
const K = {
  bg:      '#F5F7FA',   // fundo geral cinza muito claro
  colBg:   '#EEF1F6',   // colunas levemente azulado/acinzentado
  card:    '#FFFFFF',   // cards brancos
  title:   '#1F2937',   // títulos escuros
  sub:     '#6B7280',   // informações secundárias em cinza
  muted:   '#9CA3AF',   // texto terciário
  border:  '#E5E7EB',
  shadow:  '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)',
  shadowH: '0 4px 12px rgba(0,0,0,0.08)',
};

// ── Colunas — cores fortes APENAS no cabeçalho ────────────────────────────────
const COLUNAS = [
  {
    id: 'pendente',
    titulo: 'Pendentes',
    cor: '#F39C12',          // laranja forte
    statuses: ['a_fazer'],
    vazia: 'Nenhuma tarefa pendente',
    Icon: Circle,
  },
  {
    id: 'em_andamento',
    titulo: 'Em andamento',
    cor: '#3B82F6',          // azul forte
    statuses: ['em_andamento', 'em_execucao', 'atencao'],
    vazia: 'Nenhuma tarefa ativa',
    Icon: Loader2,
  },
  {
    id: 'atrasado',
    titulo: 'Atrasado',
    cor: '#EF4444',          // vermelho forte
    statuses: ['atrasado', 'critico', 'bloqueado'],
    vazia: 'Nenhuma pendência',
    Icon: AlertTriangle,
  },
  {
    id: 'concluido',
    titulo: 'Concluído',
    cor: '#22C55E',          // verde forte
    statuses: ['concluido'],
    vazia: 'Nenhuma tarefa concluída',
    Icon: CheckCircle2,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function prazoLabel(prazo) {
  if (!prazo) return null;
  const d = new Date(prazo + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function prazoVencido(prazo, status) {
  if (!prazo || status === 'concluido') return false;
  return new Date(prazo + 'T12:00:00') < new Date();
}

function getAreaLabel(tarefa) {
  // Categoria label: usa area legada se não tiver area_id
  if (tarefa.area_id) return null; // será resolvido via props
  return null;
}

// ── Card minimalista ──────────────────────────────────────────────────────────
function Kart({ tarefa, onClick, areaLabel }) {
  const vencido = prazoVencido(tarefa.prazo, tarefa.status);
  const concluida = tarefa.status === 'concluido';
  const responsavel = tarefa.responsavel_nome || tarefa.responsavel_email;
  const iniciais = responsavel
    ? responsavel.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
    : null;

  return (
    <div
      onClick={() => onClick(tarefa)}
      style={{
        background: K.card,
        borderRadius: '14px',
        padding: '14px',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s ease, transform 0.15s ease',
        boxShadow: K.shadow,
        opacity: concluida ? 0.6 : 1,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = K.shadowH;
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = K.shadow;
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Título */}
      <div style={{
        fontSize: '13.5px', fontWeight: '600', color: K.title,
        marginBottom: '4px', lineHeight: 1.4,
        textDecoration: concluida ? 'line-through' : 'none',
      }}>
        {tarefa.titulo}
      </div>

      {/* Categoria — texto cinza discreto */}
      {areaLabel && (
        <div style={{ fontSize: '11.5px', color: K.muted, marginBottom: '10px', fontWeight: '500' }}>
          {areaLabel}
        </div>
      )}
      {!areaLabel && <div style={{ height: '6px' }} />}

      {/* Footer: avatar + data */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        {iniciais ? (
          <div style={{
            width: '22px', height: '22px', borderRadius: '50%',
            background: '#E5E7EB', color: K.sub, fontSize: '9px', fontWeight: '700',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }} title={responsavel}>
            {iniciais}
          </div>
        ) : (
          <div style={{ width: '22px', height: '22px' }} />
        )}
        {tarefa.prazo && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            fontSize: '11px', color: vencido ? '#EF4444' : K.muted,
            fontWeight: vencido ? '600' : '400',
          }}>
            <Clock size={11} />
            <span>{prazoLabel(tarefa.prazo)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Coluna ────────────────────────────────────────────────────────────────────
function Coluna({ coluna, tarefas, onClickTarefa, onDropTarefa, areaResolver }) {
  const [dragOver, setDragOver] = useState(false);
  const Icon = coluna.Icon;

  return (
    <div
      style={{
        flex: '1 1 280px',
        minWidth: '270px',
        maxWidth: '360px',
        background: K.colBg,
        borderRadius: '14px',
        display: 'flex',
        flexDirection: 'column',
        transition: 'box-shadow 0.2s ease',
        boxShadow: dragOver ? `0 0 0 2px ${coluna.cor}50` : 'none',
        height: 'fit-content',
        maxHeight: 'calc(100vh - 220px)',
      }}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault();
        setDragOver(false);
        const taskId = e.dataTransfer.getData('text/plain');
        if (taskId) onDropTarefa(taskId, coluna);
      }}
    >
      {/* Cabeçalho — cor forte + texto branco */}
      <div style={{
        padding: '11px 14px',
        borderRadius: '14px 14px 0 0',
        background: coluna.cor,
        display: 'flex',
        alignItems: 'center',
        gap: '7px',
      }}>
        <Icon size={14} color="#FFFFFF" strokeWidth={2.5} style={{ flexShrink: 0 }} />
        <span style={{
          fontSize: '12.5px', fontWeight: '700', color: '#FFFFFF',
          textTransform: 'uppercase', letterSpacing: '0.03em', flex: 1,
        }}>
          {coluna.titulo}
        </span>
        <span style={{
          background: 'rgba(255,255,255,0.25)',
          color: '#FFFFFF', borderRadius: '9999px',
          padding: '1px 9px', fontSize: '11.5px', fontWeight: '700',
          minWidth: '22px', textAlign: 'center',
        }}>
          {tarefas.length}
        </span>
      </div>

      {/* Cards — scroll interno */}
      <div style={{
        padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px',
        flex: 1, overflowY: 'auto', minHeight: '60px',
      }}>
        {tarefas.length === 0 ? (
          <div style={{
            padding: '24px 12px', textAlign: 'center',
            fontSize: '12px', color: K.muted,
          }}>
            {coluna.vazia}
          </div>
        ) : (
          tarefas.map(t => (
            <div
              key={t.id}
              draggable
              onDragStart={e => {
                e.dataTransfer.setData('text/plain', t.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
            >
              <Kart tarefa={t} onClick={onClickTarefa} areaLabel={areaResolver ? areaResolver(t) : null} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function M31TarefasKanban({ tarefas, onOpenTask, userEmail, userName }) {
  const qc = useQueryClient();

  // Busca áreas e frentes para resolver label de categoria no card
  const { data: areas = [] } = useQuery({
    queryKey: ['m31areas-kanban'],
    queryFn: () => base44.entities.M31Area.filter({ ativo: true }, 'ordem', 50),
  });
  const { data: frentes = [] } = useQuery({
    queryKey: ['m31frentes-kanban'],
    queryFn: () => base44.entities.M31Frente.filter({ ativo: true }, 'ordem', 50),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.EventoM31Tarefa.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['m31tarefas'] }),
  });

  // Resolver label de área/frente para exibir como categoria no card
  const areaResolver = React.useCallback((t) => {
    if (t.frente_id) {
      const f = frentes.find(x => x.id === t.frente_id);
      if (f) return f.nome;
    }
    if (t.area_id) {
      const a = areas.find(x => x.id === t.area_id);
      if (a) return a.nome;
    }
    // Fallback: área legada (usar label amigável se disponível)
    if (t.area) {
      return t.area.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
    return null;
  }, [areas, frentes]);

  const handleDropTarefa = (taskId, coluna) => {
    const novoStatus = coluna.statuses[0] || 'a_fazer';
    const data = { status: novoStatus };
    if (novoStatus === 'concluido') {
      data.concluido_em = new Date().toISOString();
      data.concluido_por_email = userEmail || '';
      data.concluido_por_nome = userName || '';
    }
    updateMutation.mutate({ id: taskId, data });
  };

  return (
    <div style={{
      background: K.bg,
      borderRadius: '14px',
      padding: '14px',
      margin: '-4px',
    }}>
      <div style={{
        display: 'flex', gap: '12px',
        overflowX: 'auto', paddingBottom: '8px',
      }}>
        {COLUNAS.map(coluna => {
          const tarefasColuna = tarefas.filter(t => coluna.statuses.includes(t.status));
          return (
            <Coluna
              key={coluna.id}
              coluna={coluna}
              tarefas={tarefasColuna}
              onClickTarefa={onOpenTask}
              onDropTarefa={handleDropTarefa}
              areaResolver={areaResolver}
            />
          );
        })}
      </div>
    </div>
  );
}