import { useMemo } from 'react';
import { DragDropContext, Droppable } from '@hello-pangea/dnd';
import DraggableCard from './DraggableCard';

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const match = String(timeStr).match(/(\d{1,2}):?(\d{2})?/);
  if (!match) return null;
  const h = parseInt(match[1]);
  const m = match[2] ? parseInt(match[2]) : 0;
  if (isNaN(h)) return null;
  return h * 60 + m;
}

function minutesToLabel(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Linha do Tempo — drop zones em intervalos de 15 minutos.
 * - Slots gerados do primeiro ao último horário das atividades
 * - Múltiplas atividades por slot (simultâneas)
 * - Destaque do slot de destino durante o arraste
 * - Atualiza só após soltar (onDragEnd)
 */
export default function CronogramaTimeline({ items, activeItemId, selectedId, onSelect, onQuickMessage, onDragEnd }) {
  // Gera slots de 15min do primeiro ao último horário
  const slots = useMemo(() => {
    const times = items
      .map(i => parseTimeToMinutes(i.hora_inicio_normalizada || i.hora_inicio_original))
      .filter(t => t !== null);
    if (times.length === 0) return [];
    const minTime = Math.floor(Math.min(...times) / 15) * 15;
    const maxTime = Math.ceil(Math.max(...times) / 15) * 15 + 15;
    const result = [];
    for (let t = minTime; t <= maxTime; t += 15) {
      result.push({ id: `slot-${t}`, minutes: t, label: minutesToLabel(t) });
    }
    return result;
  }, [items]);

  // Agrupa itens por slot
  const itemsBySlot = useMemo(() => {
    const map = {};
    items.forEach(item => {
      if (item.e_continuacao) return;
      const min = parseTimeToMinutes(item.hora_inicio_normalizada || item.hora_inicio_original);
      if (min !== null) {
        const slotId = `slot-${min}`;
        if (!map[slotId]) map[slotId] = [];
        map[slotId].push(item);
      }
    });
    return map;
  }, [items]);

  // Itens sem horário parseável
  const unslotted = useMemo(() =>
    items.filter(i => {
      if (i.e_continuacao) return false;
      const min = parseTimeToMinutes(i.hora_inicio_normalizada || i.hora_inicio_original);
      return min === null;
    }),
  [items]);

  if (slots.length === 0) {
    return (
      <div className="p-12 text-center text-sm text-muted-foreground bg-card border border-border rounded-lg">
        Nenhuma atividade com horário válido para a timeline.
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="bg-card border border-border rounded-lg overflow-hidden max-h-[calc(100vh-320px)] overflow-y-auto">
        {slots.map(slot => {
          const slotItems = itemsBySlot[slot.id] || [];
          const hasItems = slotItems.length > 0;
          return (
            <Droppable key={slot.id} droppableId={slot.id}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={[
                    'flex border-b border-border transition-colors',
                    snapshot.isDraggingOver ? 'bg-accent/60 ring-1 ring-inset ring-primary/30' : '',
                    hasItems ? 'py-2' : 'py-0.5 min-h-[28px]',
                  ].join(' ')}
                >
                  {/* Time label */}
                  <div className={[
                    'w-[64px] flex-shrink-0 px-2.5 text-xs font-semibold tabular-nums flex items-start pt-1',
                    snapshot.isDraggingOver ? 'text-primary' : 'text-muted-foreground',
                  ].join(' ')}>
                    {slot.label}
                  </div>
                  {/* Cards */}
                  <div className="flex-1 px-2 flex flex-col gap-1.5">
                    {slotItems.map((item, i) => (
                      <DraggableCard
                        key={item.id}
                        item={item}
                        index={i}
                        isActive={item.id === activeItemId}
                        isSelected={item.id === selectedId}
                        onSelect={onSelect}
                        onQuickMessage={onQuickMessage}
                      />
                    ))}
                    {provided.placeholder}
                  </div>
                </div>
              )}
            </Droppable>
          );
        })}
      </div>

      {/* Itens sem horário */}
      {unslotted.length > 0 && (
        <Droppable droppableId="slot-unslotted">
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={[
                'mt-3 bg-card border rounded-lg p-3 flex flex-col gap-1.5',
                snapshot.isDraggingOver ? 'border-primary bg-accent/30' : 'border-border border-dashed',
              ].join(' ')}
            >
              <span className="text-xs text-muted-foreground mb-1">Sem horário definido</span>
              {unslotted.map((item, i) => (
                <DraggableCard
                  key={item.id}
                  item={item}
                  index={i}
                  isActive={item.id === activeItemId}
                  isSelected={item.id === selectedId}
                  onSelect={onSelect}
                  onQuickMessage={onQuickMessage}
                />
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      )}
    </DragDropContext>
  );
}