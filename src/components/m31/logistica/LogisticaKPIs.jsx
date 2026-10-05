import { useMemo } from 'react';
import { StatCard } from '@/components/m31/ui';
import { AlertTriangle, Clock, UserX, PackageX, RefreshCw, ArrowRight } from 'lucide-react';
import { isCritica, calcProximaAcao } from '@/lib/m31OperacaoCalculos';

/**
 * KPI strip do topo — calculado sobre dados reais de EventoM31Tarefa.
 * Usa a biblioteca compartilhada m31OperacaoCalculos (fonte única).
 */
export default function LogisticaKPIs({ tarefas = [], checklist = [] }) {
  const stats = useMemo(() => {
    const now = new Date();
    const criticas = tarefas.filter(t => isCritica(t, now)).length;
    const concluidas = tarefas.filter(t => t.status === 'concluido').length;
    const semResponsavel = tarefas.filter(t => !t.responsavel_email && !t.responsavel_nome).length;
    const fornecedoresPendentes = checklist.filter(c => c.status === 'previsto' && c.fornecedor_nome).length;

    const proxima = calcProximaAcao(tarefas, now);

    const datas = tarefas.map(t => t.updated_date || t.created_date).filter(Boolean).sort().reverse();
    const ultima = datas[0]
      ? new Date(datas[0]).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : '—';

    const progressoPct = tarefas.length > 0 ? Math.round((concluidas / tarefas.length) * 100) : 0;

    return { criticas, concluidas, semResponsavel, fornecedoresPendentes, ultima, proxima, progressoPct };
  }, [tarefas, checklist]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      <StatCard label="Tarefas Críticas" value={stats.criticas} state="danger" icon={AlertTriangle} />
      <StatCard label="Concluídas" value={`${stats.concluidas} (${stats.progressoPct}%)`} state="success" icon={Clock} />
      <StatCard label="Sem Responsável" value={stats.semResponsavel} state="danger" icon={UserX} />
      <StatCard label="Fornecedores Pend." value={stats.fornecedoresPendentes} state="warning" icon={PackageX} />
      <div className="bg-card border border-border rounded-lg p-4 flex flex-col justify-between">
        <div className="flex items-center gap-2 mb-2">
          <ArrowRight size={16} className="text-primary" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Próxima Ação</span>
        </div>
        {stats.proxima ? (
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground truncate">{stats.proxima.titulo}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {stats.proxima.responsavel_nome || 'Sem responsável'}
              {stats.proxima.prazo && ` · ${new Date(stats.proxima.prazo + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`}
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">Nenhuma ação pendente</div>
        )}
        <div className="text-[10px] text-muted-foreground/60 mt-2 flex items-center gap-1">
          <RefreshCw size={9} /> {stats.ultima}
        </div>
      </div>
    </div>
  );
}