import { useMemo } from 'react';
import { DragDropContext, Droppable } from '@hello-pangea/dnd';
import { UserX } from 'lucide-react';
import DraggableCard from './DraggableCard';

/**
 * Visualização por Responsável — colunas Kanban agrupadas por responsável.
 * Arrastar entre colunas atualiza o campo `responsavel`.
 */
export default function CronogramaResponsavel({ items, activeItemId, selectedId, onSelect, onQuickMessage, onDragEnd }) {
  const responsaveis = useMemo(() => {
    const set = new Set(items.map(i => i.responsavel).filter(Boolean));
    return [...set].sort();
  }, [items]);

  const itemsByResp = useMemo(() => {
    const map = {};
    responsaveis.forEach(r => { map[r] = []; });
    items.forEach(item => {
      if (item.responsavel && map[item.responsavel]) {
        map[item.responsavel].push(item);
      }
    });
    return map;
  }, [items, responsaveis]);

  const semResponsavel = useMemo(() => items.filter(i => !i.responsavel), [items]);

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
        {responsaveis.map(resp => (
          <Droppable key={resp} droppableId={`resp-${resp}`}>
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
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">
                    {resp}
                  </h3>
                  <span className="text-[10px] text-muted-foreground/70 flex-shrink-0">
                    {(itemsByResp[resp] || []).length}
                  </span>
                </div>
                {(itemsByResp[resp] || []).map((item, i) => (
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

        {/* Coluna sem responsável */}
        {semResponsavel.length > 0 && (
          <Droppable droppableId="resp-__sem__">
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={[
                  'bg-card border border-dashed rounded-lg p-3 min-h-[200px] flex flex-col gap-2',
                  snapshot.isDraggingOver ? 'border-primary bg-accent/30' : 'border-m31-warning/40',
                ].join(' ')}
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-xs font-semibold text-m31-warning uppercase tracking-wide flex items-center gap-1">
                    <UserX size={12} /> Sem responsável
                  </h3>
                  <span className="text-[10px] text-muted-foreground/70">{semResponsavel.length}</span>
                </div>
                {semResponsavel.map((item, i) => (
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
      </div>
    </DragDropContext>
  );
}