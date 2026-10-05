import { EQUIPES } from '@/hooks/useEquipeFiltro';

/**
 * Seletor global de equipes operacionais.
 * Posicionado entre o título e os StatCards.
 * Usa SOMENTE tokens do design system (bg-primary, text-muted-foreground, etc).
 * Zero hex cru, zero bg-zinc, zero estilo inline.
 */
export default function EquipeSelector({ equipeAtiva, setEquipeAtiva }) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap scrollbar-none bg-muted rounded-lg p-1.5">
      {EQUIPES.map(eq => {
        const active = equipeAtiva === eq.value;
        return (
          <button
            key={eq.value}
            onClick={() => setEquipeAtiva(eq.value)}
            className={[
              'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs whitespace-nowrap flex-shrink-0 transition-all duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              active
                ? 'bg-primary text-primary-foreground font-semibold'
                : 'bg-transparent text-muted-foreground font-medium hover:bg-accent hover:text-accent-foreground',
            ].join(' ')}
          >
            {eq.label}
          </button>
        );
      })}
    </div>
  );
}