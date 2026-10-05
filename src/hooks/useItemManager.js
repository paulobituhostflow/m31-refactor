import { useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const ENTITY_MAP = {
  area: 'M31Area',
  frente: 'M31Frente',
  tarefa: 'EventoM31Tarefa',
  subtarefa: 'EventoM31Tarefa',
};

const NAME_FIELD = { area: 'nome', frente: 'nome', tarefa: 'titulo', subtarefa: 'titulo' };

function getItemLabel(type, item) {
  return item[NAME_FIELD[type]] || item.nome || item.titulo || 'Item';
}

/**
 * Hook central para gerenciar Áreas, Frentes, Tarefas e Subtarefas.
 * Operações: editName, moveItem, archiveItem, deleteItem.
 * Undo automático de 5 segundos para arquivar e excluir.
 * Registra alterador em alterado_por / alterado_em.
 */
export function useItemManager({ userEmail, userName }) {
  const qc = useQueryClient();
  const [undoState, setUndoState] = useState(null);
  const undoTimerRef = useRef(null);

  const invalidateAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['m31tarefas'] });
    qc.invalidateQueries({ queryKey: ['m31areas'] });
    qc.invalidateQueries({ queryKey: ['m31frentes'] });
    qc.invalidateQueries({ queryKey: ['m31tarefas-enriquecer'] });
    qc.invalidateQueries({ queryKey: ['m31areas-enriquecer'] });
    qc.invalidateQueries({ queryKey: ['m31frentes-enriquecer'] });
  }, [qc]);

  const showUndo = useCallback((label, onUndo) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoState({ label, onUndo });
    undoTimerRef.current = setTimeout(() => {
      setUndoState(null);
      undoTimerRef.current = null;
    }, 5000);
  }, []);

  const dismissUndo = useCallback(() => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoState(null);
    undoTimerRef.current = null;
  }, []);

  const editName = useCallback(async (type, item, newName) => {
    const entity = ENTITY_MAP[type];
    const field = NAME_FIELD[type];
    const audit = { alterado_por: userEmail, alterado_em: new Date().toISOString() };
    if (type === 'tarefa' || type === 'subtarefa') audit.alterado_por_email = userEmail;
    await base44.entities[entity].update(item.id, { [field]: newName, ...audit });
    invalidateAll();
  }, [userEmail, invalidateAll]);

  const moveItem = useCallback(async (type, item, targetId, targetType) => {
    const entity = ENTITY_MAP[type];
    const audit = { alterado_por: userEmail, alterado_em: new Date().toISOString() };
    const updateData = { ...audit };

    if (type === 'frente') {
      updateData.area_id = targetId;
      const area = await base44.entities.M31Area.get(targetId);
      if (area) updateData.area_slug = area.slug;
    } else if (type === 'tarefa' || type === 'subtarefa') {
      if (targetType === 'frente') {
        updateData.frente_id = targetId;
        updateData.tarefa_pai_id = null;
      } else if (targetType === 'tarefa') {
        updateData.tarefa_pai_id = targetId;
      } else if (targetType === 'none') {
        updateData.frente_id = null;
        updateData.tarefa_pai_id = null;
      }
      audit.alterado_por_email = userEmail;
    }

    await base44.entities[entity].update(item.id, updateData);
    invalidateAll();
  }, [userEmail, invalidateAll]);

  const archiveItem = useCallback(async (type, item) => {
    const entity = ENTITY_MAP[type];
    const audit = { alterado_por: userEmail, alterado_em: new Date().toISOString() };
    const updateData = { ...audit };

    if (type === 'area' || type === 'frente') {
      updateData.ativo = false;
    } else {
      updateData.status = 'bloqueado';
      audit.alterado_por_email = userEmail;
    }

    await base44.entities[entity].update(item.id, updateData);
    invalidateAll();

    const label = getItemLabel(type, item);
    showUndo(`"${label}" arquivado`, async () => {
      const restore = { alterado_por: userEmail, alterado_em: new Date().toISOString() };
      if (type === 'area' || type === 'frente') restore.ativo = true;
      else { restore.status = item.status || 'a_fazer'; restore.alterado_por_email = userEmail; }
      await base44.entities[entity].update(item.id, restore);
      invalidateAll();
    });
  }, [userEmail, invalidateAll, showUndo]);

  const deleteItem = useCallback(async (type, item, options = {}) => {
    const entity = ENTITY_MAP[type];

    // Frente com tarefas: mover ou órfãar antes de excluir
    if (type === 'frente' && options.frenteAction) {
      const tasks = await base44.entities.EventoM31Tarefa.filter({ frente_id: item.id });
      if (tasks.length > 0) {
        if (options.frenteAction === 'move' && options.targetFrenteId) {
          await base44.entities.EventoM31Tarefa.bulkUpdate(
            tasks.map(t => ({ id: t.id, frente_id: options.targetFrenteId, alterado_por_email: userEmail, alterado_por: userEmail, alterado_em: new Date().toISOString() }))
          );
        } else if (options.frenteAction === 'orphan') {
          await base44.entities.EventoM31Tarefa.bulkUpdate(
            tasks.map(t => ({ id: t.id, frente_id: null, alterado_por_email: userEmail, alterado_por: userEmail, alterado_em: new Date().toISOString() }))
          );
        }
      }
    }

    const itemCopy = { ...item };
    const label = getItemLabel(type, item);

    await base44.entities[entity].delete(item.id);
    invalidateAll();

    showUndo(`"${label}" excluído`, async () => {
      const restore = { ...itemCopy };
      delete restore.id;
      delete restore.created_date;
      delete restore.updated_date;
      delete restore.created_by_id;
      restore.alterado_por = userEmail;
      restore.alterado_em = new Date().toISOString();
      await base44.entities[entity].create(restore);
      invalidateAll();
    });
  }, [userEmail, invalidateAll, showUndo]);

  return { editName, moveItem, archiveItem, deleteItem, undoState, dismissUndo };
}