import { useState, useMemo } from 'react';
import { ChevronDown, Plus, FolderInput, Pencil } from 'lucide-react';
import FrenteBottomSheet from './FrenteBottomSheet';
import TarefaCard from './TarefaCard';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { TOKENS as T } from '@/lib/m31DesignTokens';
import { LEGACY_AREA_TO_NEW_SLUG } from '@/lib/m31Areas';
import SectorBadge from './SectorBadge';
import ItemActionMenu from './ItemActionMenu';
import ItemManageDrawer from './ItemManageDrawer';
import DeleteConfirmDialog from './DeleteConfirmDialog';
import { calcProgresso } from './tarefaHelpers';

/**
 * MobileVisaoGeral — lista vertical com expansão inline.
 * Tocar em um card de Área expande seu conteúdo (frentes + tarefas)
 * empurrando os demais cards para baixo. Mesmo comportamento para Frentes.
 * Não abre nova página, não esconde outras áreas, mantém busca/filtros/scroll.
 */
export default function MobileVisaoGeral({ tarefas, onEditTask, onAddTarefa, onAddSubtarefa, onToggleStatus, onUpdate, canEdit, itemManager }) {
  const [expandedAreaId, setExpandedAreaId] = useState(null);
  const [expandedFrenteId, setExpandedFrenteId] = useState(null);
  const [frenteSheet, setFrenteSheet] = useState(null);
  const [manageDrawer, setManageDrawer] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState(null);

  const { data: areas = [] } = useQuery({
    queryKey: ['m31areas'],
    queryFn: () => base44.entities.M31Area.filter({ ativo: true }, 'ordem', 50),
  });
  const { data: frentes = [] } = useQuery({
    queryKey: ['m31frentes'],
    queryFn: () => base44.entities.M31Frente.filter({ ativo: true }, 'ordem', 50),
  });

  const areaBySlug = useMemo(() => {
    const m = new Map(); areas.forEach(a => m.set(a.slug, a)); return m;
  }, [areas]);

  const estrutura = useMemo(() => {
    const subtarefasByPai = new Map();
    tarefas.forEach(t => {
      if (t.tarefa_pai_id) {
        if (!subtarefasByPai.has(t.tarefa_pai_id)) subtarefasByPai.set(t.tarefa_pai_id, []);
        subtarefasByPai.get(t.tarefa_pai_id).push(t);
      }
    });

    const resolveAreaId = (t) => {
      if (t.area_id && areas.some(a => a.id === t.area_id)) return t.area_id;
      const slug = LEGACY_AREA_TO_NEW_SLUG[t.area];
      return slug ? areaBySlug.get(slug)?.id || null : null;
    };

    const mapaAreas = new Map();
    areas.forEach(a => mapaAreas.set(a.id, { area: a, frentesMap: new Map(), diretas: [], todas: [] }));
    const semArea = { area: { id: '_sem_area', nome: 'Sem área definida', icone: 'FolderInput', slug: '_sem_area', exige_frente: false }, frentesMap: new Map(), diretas: [], todas: [] };

    tarefas.forEach(t => {
      if (t.tarefa_pai_id) return;
      const areaId = resolveAreaId(t);
      const cont = (areaId && mapaAreas.get(areaId)) || semArea;
      const subs = subtarefasByPai.get(t.id) || [];
      cont.todas.push(t, ...subs);
      if (t.frente_id) {
        const frente = frentes.find(f => f.id === t.frente_id);
        if (frente) {
          if (!cont.frentesMap.has(frente.id)) cont.frentesMap.set(frente.id, { frente, tarefasMaes: [], todas: [] });
          const fc = cont.frentesMap.get(frente.id);
          fc.tarefasMaes.push(t); fc.todas.push(t, ...subs);
        } else { cont.diretas.push(t); }
      } else { cont.diretas.push(t); }
    });

    const resultado = areas.map(a => {
      const c = mapaAreas.get(a.id);
      return { area: c.area, frentes: Array.from(c.frentesMap.values()).sort((x, y) => (x.frente.ordem || 0) - (y.frente.ordem || 0)), diretas: c.diretas, todas: c.todas };
    }).sort((a, b) => (a.area.ordem || 0) - (b.area.ordem || 0));

    if (semArea.diretas.length > 0) resultado.push({ area: semArea.area, frentes: [], diretas: semArea.diretas, todas: semArea.diretas, isSemArea: true });

    return { resultado, subtarefasByPai };
  }, [tarefas, areas, areaBySlug, frentes]);

  function toggleArea(areaId) {
    setExpandedAreaId(prev => prev === areaId ? null : areaId);
    setExpandedFrenteId(null);
  }

  function toggleFrente(frenteId) {
    setExpandedFrenteId(prev => prev === frenteId ? null : frenteId);
  }

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

  // Contexto para o FAB — área/frente atualmente expandida
  const ctxAtual = useMemo(() => {
    if (expandedAreaId) {
      const grp = estrutura.resultado.find(g => g.area.id === expandedAreaId);
      if (grp) {
        const ctx = { areaId: grp.area.id, areaNome: grp.area.nome };
        if (expandedFrenteId) {
          const fc = grp.frentes.find(f => f.frente.id === expandedFrenteId);
          if (fc) { ctx.frenteId = fc.frente.id; ctx.frenteNome = fc.frente.nome; }
        }
        return ctx;
      }
    }
    return {};
  }, [expandedAreaId, expandedFrenteId, estrutura]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '80px' }}>
      <style>{`@keyframes m31-expand { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {estrutura.resultado.map(grp => {
        const isExpanded = expandedAreaId === grp.area.id;
        const prog = calcProgresso(grp.todas);
        const totalTarefas = grp.todas.filter(t => !t.tarefa_pai_id).length;

        return (
          <div key={grp.area.id} style={{
            background: T.surface, border: `1px solid ${isExpanded ? T.primary + '44' : T.border}`,
            borderRadius: T.radius.lg, overflow: 'hidden',
            transition: 'border-color 0.2s ease',
          }}>
            {/* Header do card de Área — tocável para expandir/recolher */}
            <div onClick={() => toggleArea(grp.area.id)} style={{
              display: 'flex', alignItems: 'center', gap: '12px', minHeight: '56px', width: '100%',
              padding: '14px 16px', cursor: 'pointer',
              textAlign: 'left', fontFamily: T.font.body,
            }}>
              <SectorBadge areaSlug={grp.area.slug} size={32} iconSize={16} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '15px', fontWeight: '600', color: T.text }}>{grp.area.nome}</div>
                <div style={{ fontSize: '12px', color: T.textMuted }}>
                  {totalTarefas} tarefa{totalTarefas !== 1 ? 's' : ''}
                  {grp.frentes.length > 0 ? ` · ${grp.frentes.length} frente${grp.frentes.length !== 1 ? 's' : ''}` : ''}
                </div>
              </div>
              {prog.total > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <div style={{ width: '40px', height: '5px', background: T.border, borderRadius: T.radius.pill, overflow: 'hidden' }}>
                    <div style={{ width: `${prog.pct}%`, height: '100%', background: T.success, transition: 'width 0.3s ease' }} />
                  </div>
                  <span style={{ fontSize: '12px', color: T.textMuted, fontWeight: '500' }}>{prog.pct}%</span>
                </div>
              )}
              {canEdit && !grp.isSemArea && (
                <ItemActionMenu
                  canEdit={true}
                  onEdit={() => handleItemAction('edit', 'area', grp.area)}
                  onMove={() => handleItemAction('move', 'area', grp.area)}
                  onArchive={() => handleItemAction('archive', 'area', grp.area)}
                  onDelete={() => handleItemAction('delete', 'area', grp.area)}
                />
              )}
              <ChevronDown size={18} color={T.textSubtle} style={{
                flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.25s cubic-bezier(0.16,1,0.3,1)',
              }} />
            </div>

            {/* Conteúdo expandido — frentes + tarefas avulsas */}
            {isExpanded && (
              <div style={{
                animation: 'm31-expand 0.2s ease-out',
                padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: '6px',
                borderTop: `1px solid ${T.borderSubtle}`,
              }}>
                {/* Frentes — cada uma expandível inline */}
                {grp.frentes.map(fc => {
                  const isFrenteExpanded = expandedFrenteId === fc.frente.id;
                  const fcProg = calcProgresso(fc.todas);
                  return (
                    <div key={fc.frente.id} style={{
                      background: T.surfaceSubtle, border: `1px solid ${isFrenteExpanded ? T.primary + '33' : T.border}`,
                      borderRadius: T.radius.md, overflow: 'hidden',
                    }}>
                      <div onClick={() => toggleFrente(fc.frente.id)} style={{
                        display: 'flex', alignItems: 'center', gap: '8px', minHeight: '46px', width: '100%',
                        padding: '10px 12px', cursor: 'pointer',
                        textAlign: 'left', fontFamily: T.font.body,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '14px', fontWeight: '600', color: T.text }}>{fc.frente.nome}</div>
                          <div style={{ fontSize: '12px', color: T.textMuted }}>{fc.tarefasMaes.length} tarefa{fc.tarefasMaes.length !== 1 ? 's' : ''}</div>
                        </div>
                        {fcProg.total > 0 && <span style={{ fontSize: '12px', color: T.textMuted, fontWeight: '500' }}>{fcProg.pct}%</span>}
                        {canEdit && (
                          <ItemActionMenu
                            canEdit={true}
                            onEdit={() => handleItemAction('edit', 'frente', fc.frente)}
                            onMove={() => handleItemAction('move', 'frente', fc.frente)}
                            onArchive={() => handleItemAction('archive', 'frente', fc.frente)}
                            onDelete={() => handleItemAction('delete', 'frente', fc.frente)}
                          />
                        )}
                        <ChevronDown size={16} color={T.textSubtle} style={{
                          flexShrink: 0, transform: isFrenteExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.25s cubic-bezier(0.16,1,0.3,1)',
                        }} />
                      </div>

                      {isFrenteExpanded && (
                        <div style={{
                          animation: 'm31-expand 0.2s ease-out',
                          padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: '4px',
                        }}>
                          {fc.tarefasMaes.map(t => (
                            <TarefaCard key={t.id} tarefa={t} subtarefas={estrutura.subtarefasByPai.get(t.id) || []} onEdit={onEditTask} onToggle={onToggleStatus} onUpdate={onUpdate} canEdit={canEdit} onItemAction={handleItemAction} />
                          ))}
                          {fc.tarefasMaes.length === 0 && (
                            <div style={{ padding: '16px', textAlign: 'center', color: T.textMuted, fontSize: '13px' }}>Nenhuma tarefa nesta frente</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Tarefas avulsas (sem frente) */}
                {grp.diretas.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {grp.frentes.length > 0 && (
                      <div style={{ fontSize: '12px', fontWeight: '600', color: T.textSubtle, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '8px 4px 2px' }}>
                        Tarefas avulsas
                      </div>
                    )}
                    {grp.diretas.map(t => (
                      <TarefaCard key={t.id} tarefa={t} subtarefas={estrutura.subtarefasByPai.get(t.id) || []} onEdit={onEditTask} onToggle={onToggleStatus} onUpdate={onUpdate} canEdit={canEdit} />
                    ))}
                  </div>
                )}

                {grp.frentes.length === 0 && grp.diretas.length === 0 && (
                  <div style={{ padding: '24px 16px', textAlign: 'center', color: T.textMuted, fontSize: '14px' }}>Nenhuma tarefa nesta área</div>
                )}

                {grp.isSemArea && canEdit && (
                  <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px', color: T.textSubtle, fontSize: '12px' }}>
                    <FolderInput size={14} /> Toque em uma tarefa para atribuir uma área
                  </div>
                )}

                {/* Nova frente */}
                {canEdit && !grp.isSemArea && (
                  <button onClick={() => setFrenteSheet({ area: grp.area })}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', minHeight: '40px', width: '100%', padding: '0 12px', background: 'none', border: `1px dashed ${T.borderStrong}`, borderRadius: T.radius.md, color: T.textMuted, fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: T.font.body }}>
                    <Plus size={14} /> Nova frente
                  </button>
                )}

                {/* Editar frente — se uma frente está expandida */}
                {expandedFrenteId && canEdit && (() => {
                  const fc = grp.frentes.find(f => f.frente.id === expandedFrenteId);
                  if (!fc) return null;
                  return (
                    <button onClick={() => setFrenteSheet({ area: grp.area, frente: fc.frente })}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', minHeight: '36px', padding: '0 10px', background: 'none', border: `1px solid ${T.border}`, borderRadius: T.radius.md, color: T.textMuted, fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: T.font.body, alignSelf: 'flex-start' }}>
                      <Pencil size={12} /> Editar frente
                    </button>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })}

      {estrutura.resultado.length === 0 && (
        <div style={{ padding: '48px 20px', textAlign: 'center', color: T.textMuted, fontSize: '14px' }}>Nenhuma tarefa encontrada</div>
      )}

      {/* FAB persistente */}
      {canEdit && (
        <button onClick={() => onAddTarefa(ctxAtual)} style={{
          position: 'fixed', bottom: 'max(20px, env(safe-area-inset-bottom))', right: '20px',
          minHeight: '52px', padding: '0 20px', background: T.primary, color: T.onPrimary,
          border: 'none', borderRadius: T.radius.pill, fontSize: '15px', fontWeight: '700',
          cursor: 'pointer', fontFamily: T.font.body, boxShadow: '0 4px 16px rgba(139,26,43,0.35)',
          display: 'flex', alignItems: 'center', gap: '8px', zIndex: 100,
        }}>
          <Plus size={20} /> Nova tarefa
        </button>
      )}

      {frenteSheet && (
        <FrenteBottomSheet open={!!frenteSheet} area={frenteSheet.area} frente={frenteSheet.frente} onClose={() => setFrenteSheet(null)} />
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
    </div>
  );
}