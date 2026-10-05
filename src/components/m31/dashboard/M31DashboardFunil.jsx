/**
 * M31DashboardFunil — Funil de inscrições com dados reais
 * Cada etapa é clicável e direciona para Participantes filtrado.
 */
import { ChevronRight } from 'lucide-react';

const STAGE_STYLES = {
  inscritas: { bar: 'bg-success', label: 'text-success', hover: 'group-hover:text-success' },
  pendentes: { bar: 'bg-amber-500', label: 'text-amber-600', hover: 'group-hover:text-amber-600' },
  checkin: { bar: 'bg-primary', label: 'text-primary', hover: 'group-hover:text-primary' },
};

function FunilStage({ label, value, color, pct, stageKey, onClick }) {
  const s = STAGE_STYLES[stageKey] || STAGE_STYLES.inscritas;
  return (
    <button
      onClick={onClick}
      className="group w-full text-left"
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-xs font-medium text-foreground transition-colors ${s.hover}`}>{label}</span>
        <span className="text-sm font-bold text-foreground">{value}</span>
      </div>
      <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
        <div
          className={`h-2.5 rounded-full transition-all duration-500 ${s.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </button>
  );
}

export default function M31DashboardFunil({ data = {}, onNavigate }) {
  const stages = [
    { stageKey: 'inscritas', label: 'Inscritas reconhecidas', value: data.inscritasReconhecidas ?? data.inscritas ?? 0, color: '#10B981', onClick: () => onNavigate?.('participantes', { aba: 'inscricoes' }) },
    { stageKey: 'pendentes', label: 'Cobranças pendentes', value: data.cobrancasPendentes ?? data.pagPendente ?? 0, color: '#F59E0B', onClick: () => onNavigate?.('participantes', { aba: 'inscricoes', status: 'pendente' }) },
    { stageKey: 'checkin', label: 'Check-in', value: data.checkins || 0, color: '#8B1A2B', onClick: () => onNavigate?.('participantes', { aba: 'checkin' }) },
  ];
  const maxValue = Math.max(...stages.map(s => s.value), 1);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-h2 text-foreground">Funil de Inscrições</h3>
        <button
          onClick={() => onNavigate?.('participantes', { aba: 'inscricoes' })}
          className="text-xs font-medium text-primary flex items-center gap-1 hover:underline"
        >
          Detalhes <ChevronRight size={12} />
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {stages.map((stage, idx) => (
          <FunilStage key={idx} {...stage} pct={(stage.value / maxValue) * 100} />
        ))}
      </div>
    </div>
  );
}