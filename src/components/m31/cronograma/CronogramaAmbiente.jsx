import { useMemo } from 'react';
import { DragDropContext, Droppable } from '@hello-pangea/dnd';
import DraggableCard from './DraggableCard';

const AREA_LABELS = {
  palco: 'Palco',
  recepcao: 'Recepção',
  credenciamento: 'Credenciamento',
  alimentacao: 'Alimentação',
  intercessao: 'Intercessão',
  producao: 'Produção',
  geral: 'Geral',
};

/**
 * Visualização por Ambiente/Área — colunas Kanban.
 * Cada coluna é uma Drop Zone. Arrastar entre colunas atualiza o campo `area`.
 */
export default function CronogramaAmbiente({ items, activeItemId, selectedId, onSelect, onQuickMessage, onDragEnd }) {
  const areas = useMemo(() => {
    const set = new Set(items.map(i => i.area || 'geral'));
    return [...set].sort();
  }, [items]);

  const itemsByArea = useMemo(() => {
    const map = {};
    areas.forEach(a => { map[a] = []; });
    items.forEach(item => {
      const area = item.area || 'geral';
      if (!map[area]) map[area] = [];
      map[area].push(item);
    });
    return map;
  }, [items, areas]);

  if (items.length === 0) {
    return (
      <div className="p-12 text-center text-sm text-muted-foreground bg-card border border-border rounded-lg">
        Nenhuma atividade encontrada.
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {areas.map(area => (
          <Droppable key={area} droppableId={`area-${area}`}>
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={[
                  'bg-card border rounded-lg p-3 min-h-[200px] flex flex-col gap-2',
                  snapshot.isDraggingOver ? 'border-primary bg-accent/30' : 'border-border',
                ].join(' ')}
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {AREA_LABELS[area] || area}
                  </h3>
                  <span className="text-[10px] text-muted-foreground/70">
                    {(itemsByArea[area] || []).length}
                  </span>
                </div>
                {(itemsByArea[area] || []).map((item, i) => (
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
        ))}
      </div>
    </DragDropContext>
  );
}