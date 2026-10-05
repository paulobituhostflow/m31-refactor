/**
 * M31ExecutiveAttention — "O que precisa da sua atenção"
 * Dados reais + cards clicáveis que direcionam para a tela filtrada.
 */
import { AlertCircle, Clock, Layers, MessageSquare, ChevronRight } from 'lucide-react';

function AttentionCard({ icon: Icon, iconColor, iconBg, title, metric, desc, action, onClick, critical }) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-start justify-between gap-3 p-4 rounded-lg
        bg-card border transition-all duration-150 cursor-pointer text-left
        ${critical
          ? 'border-l-4 border-l-primary border-y-border border-r-border hover:shadow-m31-md'
          : 'border-border hover:border-primary/30 hover:shadow-m31-sm'
        }
      `}
    >
      <div className="flex gap-3 flex-1 min-w-0">
        <div className={`mt-0.5 p-2 rounded-md ${iconBg} flex-shrink-0`}>
          <Icon size={16} className={iconColor} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h4 className="text-sm font-semibold text-foreground">{title}</h4>
            <span className="text-lg font-bold text-foreground">{metric}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
        </div>
      </div>
      <span className="text-xs font-medium text-primary whitespace-nowrap flex-shrink-0 flex items-center gap-0.5">
        {action} <ChevronRight size={12} />
      </span>
    </button>
  );
}

export default function M31ExecutiveAttention({ data = {}, onNavigate }) {
  const alerts = [
    {
      icon: AlertCircle,
      iconColor: 'text-red-600',
      iconBg: 'bg-red-50',
      title: 'Checkouts Abandonados',
      metric: data.abandonaram || 0,
      desc: 'Aguardando recuperação',
      action: 'Acompanhar',
      critical: (data.abandonaram || 0) > 0,
      onClick: () => onNavigate?.('participantes', { aba: 'leads' }),
    },
    {
      icon: Clock,
      iconColor: 'text-red-600',
      iconBg: 'bg-red-50',
      title: 'Tarefas Atrasadas',
      metric: data.tarefasAtrasadas || 0,
      desc: 'Prazo vencido',
      action: 'Resolver',
      critical: (data.tarefasAtrasadas || 0) > 0,
      onClick: () => onNavigate?.('tarefas', { filtroChip: 'late' }),
    },
    data.loteCritico ? {
      icon: Layers,
      iconColor: 'text-amber-600',
      iconBg: 'bg-amber-50',
      title: 'Lote Crítico',
      metric: data.loteCritico.nome,
      desc: `${data.loteCritico.pct}% das vagas ocupadas`,
      action: 'Ver lotes',
      critical: true,
      onClick: () => onNavigate?.('lotes'),
    } : null,
    {
      icon: MessageSquare,
      iconColor: 'text-primary',
      iconBg: 'bg-accent',
      title: 'Templates WhatsApp',
      metric: 'Configurar',
      desc: 'Mensagens e réguas automáticas',
      action: 'Abrir',
      critical: false,
      onClick: () => onNavigate?.('config_bot'),
    },
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-2.5">
      {alerts.map((alert, i) => <AttentionCard key={i} {...alert} />)}
    </div>
  );
}