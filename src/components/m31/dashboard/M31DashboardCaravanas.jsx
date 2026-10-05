/**
 * M31DashboardCaravanas — Ranking de caravanas com dados reais
 * Clicar numa caravana abre Participantes filtrado por ela.
 */
import { ChevronRight } from 'lucide-react';

function CaravanaRow({ caravana, rank, maxMembros, onNavigate }) {
  return (
    <button
      onClick={() => onNavigate?.('participantes', { aba: 'inscricoes', caravana_id: caravana.id })}
      className="group flex items-center gap-2 p-2.5 rounded-lg cursor-pointer text-left
                 hover:bg-accent transition-colors border-none w-full"
    >
      <div className={`text-sm font-bold w-5 flex-shrink-0 ${rank === 0 ? 'text-primary' : 'text-muted-foreground'}`}>
        #{rank + 1}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{caravana.nome}</p>
        <div className="w-full bg-muted rounded-full h-1.5 mt-1">
          <div
            className={`h-1.5 rounded-full ${rank === 0 ? 'bg-primary' : 'bg-primary/40'}`}
            style={{ width: `${(caravana.membros / maxMembros) * 100}%` }}
          />
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold text-foreground">{caravana.membros}</p>
        <p className="text-[10px] text-muted-foreground">membros</p>
      </div>
    </button>
  );
}

export default function M31DashboardCaravanas({ data = [], onNavigate }) {
  const caravanas = (data && data.length > 0) ? data.slice(0, 6) : [];
  const maxMembros = caravanas.length > 0 ? Math.max(...caravanas.map(c => c.membros)) : 1;

  if (caravanas.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        Nenhuma caravana com inscritos ainda.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-h2 text-foreground">Ranking Caravanas</h3>
        <button
          onClick={() => onNavigate?.('participantes', { aba: 'caravanas' })}
          className="text-xs font-medium text-primary flex items-center gap-1 hover:underline"
        >
          Todas <ChevronRight size={12} />
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {caravanas.map((caravana, idx) => (
          <CaravanaRow key={caravana.id || idx} caravana={caravana} rank={idx} maxMembros={maxMembros} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}