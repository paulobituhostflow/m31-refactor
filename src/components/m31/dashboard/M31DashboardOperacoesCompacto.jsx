/**
 * M31DashboardOperacoesCompacto — Resumo do Centro de Operações
 */

import { Zap, AlertCircle, Pause, ChevronRight } from 'lucide-react';

export default function M31DashboardOperacoesCompacto({ onNavigateToOperacoes, onNavigate }) {
  const stats = [
    { label: 'Automações Ativas', value: 6, icon: Zap, color: 'text-success' },
    { label: 'Pausadas', value: 2, icon: Pause, color: 'text-amber-600' },
    { label: 'Com Erro', value: 1, icon: AlertCircle, color: 'text-danger' },
    { label: 'Filas Pendentes', value: 4, icon: AlertCircle, color: 'text-amber-600' },
  ];
  const goOps = () => onNavigate ? onNavigate('operacoes') : onNavigateToOperacoes?.();

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-h2 text-foreground">Centro de Operações</h3>
        <button
          onClick={onNavigateToOperacoes}
          className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
        >
          Abrir
          <ChevronRight size={12} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <button
              key={idx}
              onClick={goOps}
              className="p-3 rounded-lg bg-muted/50 hover:bg-accent border border-transparent hover:border-primary/20 transition-all text-left cursor-pointer"
            >
              <div className="flex items-center justify-between mb-1">
                <Icon size={14} className={stat.color} />
                <span className="font-bold text-foreground text-sm">{stat.value}</span>
              </div>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-3 pt-3 border-t border-border">
        <button
          onClick={goOps}
          className="text-xs font-medium text-primary hover:text-primary-dark w-full py-1.5 rounded-md hover:bg-accent transition-colors cursor-pointer"
        >
          Ver detalhes →
        </button>
      </div>
    </div>
  );
}