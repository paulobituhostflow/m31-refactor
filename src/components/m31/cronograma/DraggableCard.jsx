import { Draggable } from '@hello-pangea/dnd';
import {
  GripVertical, Clock, User, Monitor, Film, MapPin, Building2,
  CheckCircle2, AlertTriangle,
} from 'lucide-react';
import QuickMessagePopover from './QuickMessagePopover';

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const match = String(timeStr).match(/(\d{1,2}):?(\d{2})?/);
  if (!match) return null;
  const h = parseInt(match[1]);
  const m = match[2] ? parseInt(match[2]) : 0;
  if (isNaN(h)) return null;
  return h * 60 + m;
}

function computeDuracao(item) {
  const start = parseTimeToMinutes(item.hora_inicio_normalizada || item.hora_inicio_original);
  const end = parseTimeToMinutes(item.hora_fim_original);
  if (start === null || end === null || end <= start) return null;
  const diff = end - start;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return h > 0 ? `${h}h${m > 0 ? m : ''}` : `${m}min`;
}

const AREA_LABELS = {
  palco: 'Palco', recepcao: 'Recepção', credenciamento: 'Credenciamento',
  alimentacao: 'Alimentação', intercessao: 'Intercessão', producao: 'Produção', geral: 'Geral',
};

const STATUS_STYLES = {
  planejada:    'bg-muted text-muted-foreground',
  em_andamento: 'bg-m31-warning/10 text-m31-warning',
  concluida:    'bg-m31-success/10 text-m31-success',
  atrasada:     'bg-m31-danger/10 text-m31-danger',
  cancelada:    'bg-muted text-muted-foreground line-through',
};
const STATUS_LABELS = {
  planejada: 'Planejada', em_andamento: 'Em Andamento', concluida: 'Concluída',
  atrasada: 'Atrasada', cancelada: 'Cancelada',
};

/**
 * Card movível moderno com Drag Handle exclusivo.
 * Hierarquia: horário + título (primário) → metadados (secundário) → status chips.
 * Estados visuais: atual (border-l-4 primary), sem responsável (border warning),
 *                  concluído (opacity), atrasado (badge red).
 */
export default function DraggableCard({ item, index, isActive, isSelected, onSelect, onQuickMessage }) {
  const duracao = computeDuracao(item);
  const semResponsavel = !item.responsavel;
  const isConcluida = item.status === 'concluida';
  const isAtrasada = item.status === 'atrasada';

  return (
    <Draggable draggableId={item.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          onClick={() => onSelect(item)}
          className={[
            'bg-card border rounded-lg p-3.5 transition-all cursor-pointer shadow-m31-sm hover:shadow-m31-md',
            isActive
              ? 'border-l-4 border-l-primary bg-accent ring-1 ring-primary/20 shadow-m31-md'
              : 'border-border',
            semResponsavel && !isActive ? 'border-l-4 border-l-m31-warning/60' : '',
            isSelected && !isActive ? 'ring-1 ring-primary/15' : '',
            isConcluida ? 'opacity-50' : '',
            snapshot.isDragging ? 'shadow-m31-lg ring-2 ring-primary/20 opacity-95' : '',
          ].join(' ')}
        >
          <div className="flex items-start gap-2.5">
            {/* Drag Handle — única área que inicia o arraste */}
            <div
              {...provided.dragHandleProps}
              onClick={e => e.stopPropagation()}
              className="cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground pt-1.5 flex-shrink-0"
            >
              <GripVertical size={14} />
            </div>

            {/* Grid interno: [Hora] | [Título/Responsável] | [Ações] */}
            <div className="flex-1 min-w-0 flex items-start gap-3">
              {/* Coluna 1: Hora */}
              <div className="flex-shrink-0 min-w-[60px]">
                <div className="flex items-center gap-1">
                  <Clock size={12} className="text-primary" />
                  <span className="font-mono text-sm font-bold text-primary tabular-nums">
                    {item.hora_inicio_normalizada || item.hora_inicio_original || '—'}
                  </span>
                </div>
                {duracao && (
                  <span className="text-micro text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full tabular-nums mt-1 inline-block">
                    {duracao}
                  </span>
                )}
              </div>

              {/* Coluna 2: Título + metadados */}
              <div className="flex-1 min-w-0">
                <div className={`text-h2 text-foreground mb-1 ${isConcluida ? 'line-through' : ''}`}>
                  {item.programacao}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-muted-foreground">
                  {item.responsavel && (
                    <span className="inline-flex items-center gap-1">
                      <User size={10} /> {item.responsavel}
                    </span>
                  )}
                  {item.area && item.area !== 'geral' && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={10} /> {AREA_LABELS[item.area] || item.area}
                    </span>
                  )}
                  {item.ambiente && (
                    <span className="inline-flex items-center gap-1">
                      <Building2 size={10} /> {item.ambiente}
                    </span>
                  )}
                  {item.telao && (
                    <span className="inline-flex items-center gap-1">
                      <Monitor size={10} /> {item.telao}
                    </span>
                  )}
                  {item.cena && (
                    <span className="inline-flex items-center gap-1">
                      <Film size={10} /> {item.cena}
                    </span>
                  )}
                </div>
                {item.observacao && (
                  <div className="text-micro text-muted-foreground mt-1.5 italic border-l-2 border-border pl-2 truncate">
                    {item.observacao}
                  </div>
                )}
              </div>

              {/* Coluna 3: Status chips + Ações (pills) */}
              <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
                <div className="flex flex-wrap items-center justify-end gap-1">
                  {item.status && STATUS_STYLES[item.status] && (
                    <span className={`text-micro font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[item.status]}`}>
                      {STATUS_LABELS[item.status]}
                    </span>
                  )}
                  {semResponsavel && (
                    <span className="text-micro font-semibold px-2 py-0.5 rounded-full bg-m31-warning/10 text-m31-warning inline-flex items-center gap-0.5">
                      <AlertTriangle size={9} /> Sem resp.
                    </span>
                  )}
                  {item.media_vinculada && (
                    <span className="text-micro font-semibold px-1.5 py-0.5 rounded-full bg-m31-success/10 text-m31-success inline-flex items-center gap-0.5">
                      <CheckCircle2 size={9} /> Mídia
                    </span>
                  )}
                </div>
                {item.responsavel && (
                  <QuickMessagePopover
                    variant="icon"
                    responsavel={item.responsavel}
                    onSend={(qm) => onQuickMessage(item, qm)}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Draggable>
  );
}