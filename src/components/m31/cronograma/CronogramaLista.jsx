import { DragDropContext, Droppable } from '@hello-pangea/dnd';
import DraggableCard from './DraggableCard';

/**
 * Lista Operacional — agrupada por turno (Manhã/Tarde/Noite).
 * Cada turno é uma Drop Zone. Arrastar reordena dentro/entre turnos.
 */
export default function CronogramaLista({ faixas, activeItemId, selectedId, onSelect, onQuickMessage, onDragEnd }) {
  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex flex-col gap-5">
        {faixas.map(faixa => (
          <div key={faixa.label}>
            <div className="flex items-center gap-2.5 mb-2.5">
              <div className="w-1 h-4 bg-primary rounded-full" />
              <faixa.icon size={14} className="text-primary" />
              <h2 className="text-caption text-primary">{faixa.label}</h2>
              <span className="text-xs text-muted-foreground">· {faixa.items.length} atividades</span>
            </div>
            <Droppable droppableId={`faixa-${faixa.label}`}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={[
                    'bg-card border rounded-lg p-2 flex flex-col gap-2 min-h-[60px] transition-colors shadow-m31-sm',
                    snapshot.isDraggingOver ? 'border-primary bg-accent/30' : 'border-border',
                  ].join(' ')}
                >
                  {faixa.items.map((item, i) => (
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
          </div>
        ))}
        {faixas.length === 0 && (
          <div className="p-12 text-center text-sm text-muted-foreground bg-card border border-border rounded-lg">
            Nenhuma atividade encontrada.
          </div>
        )}
      </div>
    </DragDropContext>
  );
}