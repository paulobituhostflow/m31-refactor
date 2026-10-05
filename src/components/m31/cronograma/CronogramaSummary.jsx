import { Calendar, Sunrise, Sun, Moon, UserX, AlertTriangle } from 'lucide-react';

/**
 * Cards de resumo do cronograma — KPIs operacionais.
 */
export default function CronogramaSummary({ total, manha, tarde, noite, semResponsavel, criticas }) {
  const cards = [
    { label: 'Total',     value: total,           icon: Calendar,      tone: 'default' },
    { label: 'Manhã',     value: manha,           icon: Sunrise,       tone: 'primary' },
    { label: 'Tarde',     value: tarde,           icon: Sun,           tone: 'primary' },
    { label: 'Noite',     value: noite,           icon: Moon,          tone: 'primary' },
    { label: 'S/ Resp.',  value: semResponsavel,  icon: UserX,         tone: semResponsavel > 0 ? 'warning' : 'default' },
    { label: 'Críticas',  value: criticas,        icon: AlertTriangle, tone: criticas > 0 ? 'danger' : 'default' },
  ];

  const tones = {
    default: 'text-foreground',
    primary: 'text-primary',
    warning: 'text-m31-warning',
    danger:  'text-m31-danger',
  };

  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
      {cards.map((c, i) => (
        <div
          key={i}
          className="bg-card border border-border rounded-lg p-2.5 flex flex-col gap-0.5 shadow-m31-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide truncate">
              {c.label}
            </span>
            <c.icon size={11} className="text-muted-foreground/50 flex-shrink-0" />
          </div>
          <span className={`text-lg font-bold tabular-nums leading-tight ${tones[c.tone]}`}>
            {c.value}
          </span>
        </div>
      ))}
    </div>
  );
}