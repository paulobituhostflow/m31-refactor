import { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { TOKENS as T } from '@/lib/m31DesignTokens';
import { LEGACY_AREA_TO_NEW_SLUG } from '@/lib/m31Areas';
import AreaCard from './AreaCard';
import FrenteCard from './FrenteCard';
import TarefaMaeCard from './TarefaMaeCard';
import { useExpansionState } from '@/hooks/useExpansionState';
import { FolderInput } from 'lucide-react';
import SugestoesIAModal from './SugestoesIAModal';
import FrenteFormModal from './FrenteFormModal';
import ItemManageDrawer from './ItemManageDrawer';
import DeleteConfirmDialog from './DeleteConfirmDialog';
import { Plus } from 'lucide-react';

export default function VisaoGeralTab({ tarefas, search, filtroChip, setFiltroChip, onEditTask, onAddTarefa, onAddSubtarefa, onToggleStatus, onToggleChecklistItem, onAddChecklistItem, onRemoveChecklistItem, onUpdateChecklistItem, onAceitarSugestao, canEdit, isMobile, itemManager }) {
  const { state, toggleArea, toggleFrente, togglePacote } = useExpansionState();
  const now = new Date();
  const [sugestaoModal, setSugestaoModal] = useState(null); // { area, frentes, tarefas }
  const [frenteModal, setFrenteModal] = useState(null); // area object
  const [manageDrawer, setManageDrawer] = useState(null); // { type, item, mode }
  const [deleteDialog, setDeleteDialog] = useState(null); // { type, item, taskCount, frenteCount }

  const { data: areas = [] } = useQuery({
    queryKey: ['m31areas'],
    queryFn: () => base44.entities.M31Area.filter({ ativo: true }, 'ordem', 50),
  });

  const { data: frentes = [] } = useQuery({
    queryKey: ['m31frentes'],
    queryFn: () => base44.entities.M31Frente.filter({ ativo: true }, 'ordem', 50),
  });

  const areaBySlug = useMemo(() => {
    const m = new Map();
    areas.forEach(a => m.set(a.slug, a));
    return m;
  }, [areas]);

  const tarefasFiltradas = useMemo(() => {
    return tarefas.filter(t => {
      if (filtroChip === 'late') return t.prazo && t.status !== 'concluido' && new Date(t.prazo + 'T12:00:00') < now;
      if (filtroChip === 'soon') {
        if (!t.prazo || t.status === 'concluido') return false;
        const d = new Date(t.prazo + 'T12:00:00');
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && d >= now;
      }
      if (filtroChip === 'done') return t.status === 'concluido';
      return true;
    });
  }, [tarefas, filtroChip, now]);

  // Estrutura: Área → Frente → Tarefa Mãe → Subtarefa → Checklist
  const estrutura = useMemo(() => {
    const searchLower = search?.toLowerCase();
    const matchSearch = (t) => {
      if (!searchLower) return true;
      if (t.titulo?.toLowerCase().includes(searchLower)) return true;
      if (t.descricao?.toLowerCase().includes(searchLower)) return true;
      if ((t.checklist || []).some(c => c.texto?.toLowerCase().includes(searchLower))) return true;
      return false;
    };

    // 1. Subtarefas por pai
    const subtarefasByPai = new Map();
    tarefasFiltradas.forEach(t => {
      if (t.tarefa_pai_id) {
        if (!matchSearch(t)) return;
        if (!subtarefasByPai.has(t.tarefa_pai_id)) subtarefasByPai.set(t.tarefa_pai_id, []);
        subtarefasByPai.get(t.tarefa_pai_id).push(t);
      }
    });

    // 2. Resolver area_id efetivo
    const resolveAreaId = (t) => {
      if (t.area_id && areas.some(a => a.id === t.area_id)) return t.area_id;
      const newSlug = LEGACY_AREA_TO_NEW_SLUG[t.area];
      return newSlug ? areaBySlug.get(newSlug)?.id || null : null;
    };

    // 3. Estrutura por área
    // Pré-popula com TODAS as frentes da área (mesmo vazias) para exibir a hierarquia completa
    const mapaAreas = new Map();
    areas.forEach(a => {
      const fMap = new Map();
      frentes.filter(f => f.area_id === a.id).forEach(f => {
        fMap.set(f.id, { frente: f, tarefasMaes: [], todas: [] });
      });
      mapaAreas.set(a.id, { area: a, frentesMap: fMap, diretas: [] });
    });
    const semArea = { area: { id: '_sem_area', nome: 'Sem área definida', icone: 'FolderInput', exige_frente: false, slug: '_sem_area' }, diretas: [], frentesMap: new Map() };

    // Para cálculo de progresso consolidado da área: todas as tarefas (mãe + subtarefas)
    const todasPorArea = new Map(); // areaId → [todas as tarefas]

    tarefasFiltradas.forEach(t => {
      if (t.tarefa_pai_id) return; // subtarefa não aparece no topo
      if (!matchSearch(t)) return;

      const areaId = resolveAreaId(t);
      const container = (areaId && mapaAreas.get(areaId)) || semArea;

      // Acumula para progresso
      if (!todasPorArea.has(container.area.id)) todasPorArea.set(container.area.id, []);
      todasPorArea.get(container.area.id).push(t);
      // Inclui subtarefas no cálculo
      const subs = subtarefasByPai.get(t.id) || [];
      todasPorArea.get(container.area.id).push(...subs);

      if (t.frente_id) {
        const frente = frentes.find(f => f.id === t.frente_id);
        if (frente) {
          if (!container.frentesMap.has(frente.id)) {
            container.frentesMap.set(frente.id, { frente, tarefasMaes: [], todas: [] });
          }
          const fCont = container.frentesMap.get(frente.id);
          fCont.tarefasMaes.push(t);
          fCont.todas.push(t);
          fCont.todas.push(...subs);
        } else {
          container.diretas.push(t);
        }
      } else {
        container.diretas.push(t);
      }
    });

    // 4. Montar resultado: sempre todas as 7 áreas
    const resultado = areas
      .map(a => {
        const cont = mapaAreas.get(a.id);
        const todas = todasPorArea.get(a.id) || [];
        return {
          area: cont.area,
          frentes: Array.from(cont.frentesMap.values()).sort((x, y) => (x.frente.ordem || 0) - (y.frente.ordem || 0)),
          diretas: cont.diretas,
          todas,
        };
      })
      .sort((a, b) => (a.area.ordem || 0) - (b.area.ordem || 0));

    if (semArea.diretas.length > 0) {
      semArea.frentes = [];
      resultado.push({ area: semArea.area, frentes: [], diretas: semArea.diretas, todas: semArea.diretas, isSemArea: true });
    }

    return { resultado, subtarefasByPai };
  }, [tarefasFiltradas, areas, areaBySlug, frentes, search]);

  const handleItemAction = (action, type, item) => {
    if (action === 'edit') {
      setManageDrawer({ type, item, mode: 'edit' });
    } else if (action === 'move') {
      setManageDrawer({ type, item, mode: 'move' });
    } else if (action === 'archive') {
      itemManager.archiveItem(type, item);
    } else if (action === 'delete') {
      let taskCount = 0, frenteCount = 0;
      if (type === 'area') {
        const grp = estrutura.resultado.find(g => g.area.id === item.id);
        frenteCount = grp ? grp.frentes.length : 0;
        taskCount = grp ? grp.todas.filter(t => !t.tarefa_pai_id).length : 0;
      } else if (type === 'frente') {
        taskCount = tarefas.filter(t => t.frente_id === item.id).length;
      }
      setDeleteDialog({ type, item, taskCount, frenteCount });
    }
  };

  const handleManageSave = async (...args) => {
    const { type, item, mode } = manageDrawer;
    if (mode === 'edit') {
      await itemManager.editName(type, item, args[0]);
    } else if (mode === 'move') {
      await itemManager.moveItem(type, item, args[0], args[1]);
    }
  };

  const handleDeleteConfirm = async (options) => {
    await itemManager.deleteItem(deleteDialog.type, deleteDialog.item, options);
    setDeleteDialog(null);
  };

  const renderTarefaMae = (t, subtarefasByPai) => {
    const subs = subtarefasByPai.get(t.id) || [];
    const isOpen = state.pacotes[t.id] ?? false;
    return (
      <TarefaMaeCard
        key={t.id}
        tarefa={t}
        subtarefas={subs}
        isOpen={isOpen}
        onToggle={() => togglePacote(t.id)}
        onEditTask={onEditTask}
        onAddSubtarefa={() => onAddSubtarefa(t)}
        onToggleStatus={onToggleStatus}
        onToggleChecklistItem={onToggleChecklistItem}
        onAddChecklistItem={onAddChecklistItem}
        onRemoveChecklistItem={onRemoveChecklistItem}
        onUpdateChecklistItem={onUpdateChecklistItem}
        canEdit={canEdit}
        onItemAction={handleItemAction}
      />
    );
  };

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {estrutura.resultado.length === 0 && (
          <div style={{ padding: '60px 20px', textAlign: 'center', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.lg, color: T.textMuted, fontSize: '14px' }}>
            Nenhuma tarefa encontrada
          </div>
        )}
        {estrutura.resultado.map(grp => {
          const areaOpen = state.areas[grp.area.id] ?? true;
          return (
            <AreaCard
              key={grp.area.id}
              area={grp.area}
              tarefas={grp.todas}
              isOpen={areaOpen}
              onToggle={() => toggleArea(grp.area.id)}
              canEdit={canEdit && !grp.isSemArea}
              onSugestoesIA={() => setSugestaoModal({ area: grp.area, frentes: grp.frentes, tarefas: grp.todas })}
              onItemAction={handleItemAction}
            >
              {/* Frentes com suas tarefas mãe */}
              {grp.frentes.map(fCont => {
                const frenteKey = fCont.frente.id;
                const frenteOpen = (state.frentes || {})[frenteKey] ?? true;
                return (
                  <FrenteCard
                    key={frenteKey}
                    frente={fCont.frente}
                    tarefas={fCont.todas}
                    isOpen={frenteOpen}
                    onToggle={() => toggleFrente(frenteKey)}
                    onAddTarefa={() => onAddTarefa({ areaId: grp.area.id, frenteId: fCont.frente.id, areaNome: grp.area.nome, frenteNome: fCont.frente.nome })}
                    canEdit={canEdit}
                    onItemAction={handleItemAction}
                  >
                    {fCont.tarefasMaes.map(t => renderTarefaMae(t, estrutura.subtarefasByPai))}
                  </FrenteCard>
                );
              })}

              {/* Tarefas sem frente — wrap em "Frente não definida" */}
              {grp.diretas.length > 0 && (
                <FrenteCard
                  frente={{ id: '_sem_frente_' + grp.area.id, nome: 'Frente não definida', slug: '_sem_frente', status_definicao: null }}
                  tarefas={grp.diretas}
                  isOpen={(state.frentes || {})['_sem_frente_' + grp.area.id] ?? true}
                  onToggle={() => toggleFrente('_sem_frente_' + grp.area.id)}
                  canEdit={false}
                >
                  {grp.diretas.map(t => renderTarefaMae(t, estrutura.subtarefasByPai))}
                  {canEdit && !grp.isSemArea && (
                    <div style={{ padding: '6px 16px 6px 52px', display: 'flex', alignItems: 'center', gap: '6px', color: T.textSubtle, fontSize: '12px' }}>
                      <FolderInput size={14} /> Atribua uma frente a estas tarefas para organizá-las
                    </div>
                  )}
                </FrenteCard>
              )}

              {/* Ação "Escolher área" no bucket Sem área definida */}
              {grp.isSemArea && canEdit && (
                <div style={{ padding: '8px 16px 8px 52px', display: 'flex', alignItems: 'center', gap: '6px', color: T.textSubtle, fontSize: '12px' }}>
                  <FolderInput size={14} /> Clique na tarefa para atribuir uma área
                </div>
              )}

              {/* Botão + Nova frente — dentro da área, após as frentes existentes */}
              {areaOpen && canEdit && !grp.isSemArea && (
                <button
                  onClick={() => setFrenteModal(grp.area)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    width: '100%', padding: '8px 16px 8px 36px',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: T.textMuted, fontSize: '13px', fontWeight: '600',
                    fontFamily: T.font.body,
                  }}
                >
                  <Plus size={14} /> Nova frente
                </button>
              )}
            </AreaCard>
          );
        })}
      </div>

      {/* Modal central de sugestões da IA — um por área */}
      {sugestaoModal && (
        <SugestoesIAModal
          area={sugestaoModal.area}
          frentes={sugestaoModal.frentes}
          tarefasExistentes={sugestaoModal.tarefas}
          onAceitar={(s) => onAceitarSugestao(s, sugestaoModal.area.id, null)}
          canEdit={canEdit}
          onClose={() => setSugestaoModal(null)}
        />
      )}

      {/* Modal de criação de nova frente */}
      {frenteModal && (
        <FrenteFormModal
          area={frenteModal}
          onClose={() => setFrenteModal(null)}
        />
      )}

      {manageDrawer && (
        <ItemManageDrawer
          type={manageDrawer.type}
          item={manageDrawer.item}
          mode={manageDrawer.mode}
          onSave={handleManageSave}
          onClose={() => setManageDrawer(null)}
        />
      )}

      {deleteDialog && (
        <DeleteConfirmDialog
          type={deleteDialog.type}
          item={deleteDialog.item}
          taskCount={deleteDialog.taskCount}
          frenteCount={deleteDialog.frenteCount}
          onConfirm={handleDeleteConfirm}
          onClose={() => setDeleteDialog(null)}
        />
      )}
    </>
  );
}