import { useState } from 'react';
import { Zap } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export const QUICK_MESSAGES = [
  { id: 'chamar_palco',  label: 'Chamar ao Palco', emoji: '🎤', message: 'Você é solicitada para ir ao palco agora.' },
  { id: 'avisar_atraso', label: 'Avisar Atraso',   emoji: '⚠️', message: 'A atividade está atrasada. Por favor, acelere o fluxo.' },
  { id: 'standby',       label: 'Standby',          emoji: '⏳', message: 'Aguarde o sinal para iniciar. Não comece ainda.' },
  { id: 'iniciar',       label: 'Iniciar Agora',    emoji: '✅', message: 'Pode iniciar a atividade agora.' },
];

/**
 * Popover de disparo rápido — mensagens pré-configuradas via WhatsApp.
 * variant="icon" → botão ⚡ compacto (linha da lista)
 * variant="button" → botão "Disparar" (painel lateral)
 */
export default function QuickMessagePopover({ onSend, variant = 'icon', responsavel }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === 'icon' ? (
          <button
            onClick={e => e.stopPropagation()}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-semibold text-primary bg-accent hover:bg-primary/10 transition-colors"
            title="Disparo rápido"
          >
            <Zap size={11} /> Disparar
          </button>
        ) : (
          <button
            onClick={e => e.stopPropagation()}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-primary bg-accent hover:bg-primary/10 transition-colors"
          >
            <Zap size={11} /> Disparar
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="end" onClick={e => e.stopPropagation()}>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2">
          {responsavel ? `Alertar: ${responsavel}` : 'Disparo Rápido'}
        </div>
        {QUICK_MESSAGES.map(qm => (
          <button
            key={qm.id}
            onClick={(e) => { e.stopPropagation(); onSend(qm); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-accent rounded-md transition-colors text-left"
          >
            <span>{qm.emoji}</span> {qm.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}