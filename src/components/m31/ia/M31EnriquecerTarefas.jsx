import { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TOKENS as T } from '@/lib/m31DesignTokens';
import { X, Wand2, Check, AlertCircle, Loader2, Sparkles, ListChecks } from 'lucide-react';
import EnriquecerSuggestionRow from './EnriquecerSuggestionCard';
import { buildEnriquecerPrompt, buildOtimizarFrentesPrompt } from './enriquecerPrompt';

function useIsMobile() {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const h = () => setM(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return m;
}

function slugify(text) {
  return (text || '').toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export default function M31EnriquecerTarefas({ onClose, userEmail }) {
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const [step, setStep] = useState('idle');
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [appliedCount, setAppliedCount] = useState(0);
  const [newFrentesCount, setNewFrentesCount] = useState(0);
  const [error, setError] = useState('');
  const [otimizacoes, setOtimizacoes] = useState([]);
  const [doneLabel, setDoneLabel] = useState('tarefas classificadas');

  const { data: tarefas = [], isLoading: loadingTarefas } = useQuery({
    queryKey: ['m31tarefas-enriquecer'],
    queryFn: () => base44.entities.EventoM31Tarefa.list('-created_date', 500),
  });
  const { data: areas = [] } = useQuery({
    queryKey: ['m31areas-enriquecer'],
    queryFn: () => base44.entities.M31Area.filter({ ativo: true }, 'ordem', 50),
  });
  const { data: frentes = [] } = useQuery({
    queryKey: ['m31frentes-enriquecer'],
    queryFn: () => base44.entities.M31Frente.filter({ ativo: true }, 'ordem', 100),
  });

  // Tasks without frente_id AND without subtarefas connected (no children)
  const tasksToClassify = useMemo(() => {
    const taskIdsWithChildren = new Set(
      tarefas.filter(t => t.tarefa_pai_id).map(t => t.tarefa_pai_id)
    );
    return tarefas.filter(t =>
      t.area_id &&
      !t.frente_id &&
      !taskIdsWithChildren.has(t.id)
    );
  }, [tarefas]);

  // Group frentes by area_id
  const frentesByArea = useMemo(() => {
    const map = {};
    frentes.forEach(f => {
      if (!map[f.area_id]) map[f.area_id] = [];
      map[f.area_id].push(f);
    });
    return map;
  }, [frentes]);

  // Group tasks to classify by area_id
  const tasksByArea = useMemo(() => {
    const map = {};
    tasksToClassify.forEach(t => {
      if (!map[t.area_id]) map[t.area_id] = [];
      map[t.area_id].push(t);
    });
    return map;
  }, [tasksToClassify]);

  const areaMap = useMemo(() => {
    const m = new Map();
    areas.forEach(a => m.set(a.id, a));
    return m;
  }, [areas]);

  const frenteMap = useMemo(() => {
    const m = new Map();
    frentes.forEach(f => m.set(f.id, f));
    return m;
  }, [frentes]);

  const analyze = async () => {
    setStep('analyzing');
    setError('');
    try {
      const allSuggestions = [];
      const areaIds = Object.keys(tasksByArea);

      for (const areaId of areaIds) {
        const areaTasks = tasksByArea[areaId];
        const singleAreaMap = { [areaId]: areaTasks };
        const prompt = buildEnriquecerPrompt(singleAreaMap, areas, frentesByArea);

        const res = await base44.integrations.Core.InvokeLLM({
          prompt,
          response_json_schema: {
            type: 'object',
            properties: {
              suggestions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    task_id: { type: 'string' },
                    frente_id: { type: 'string' },
                    frente_nova_nome: { type: 'string' },
                    motivo: { type: 'string' },
                    confianca: { type: 'string' },
                  },
                },
              },
            },
          },
        });
        if (res?.suggestions) allSuggestions.push(...res.suggestions);
      }

      const valid = allSuggestions.filter(s => {
        const task = tasksToClassify.find(t => t.id === s.task_id);
        if (!task) return false;
        const hasExisting = s.frente_id && frenteMap.has(s.frente_id);
        const hasNew = !s.frente_id && s.frente_nova_nome;
        return hasExisting || hasNew;
      });

      setSuggestions(valid);
      setSelected(new Set(valid.filter(s => s.confianca !== 'baixo').map(s => s.task_id)));
      if (valid.length === 0) {
        setError('A IA não encontrou Frentes compatíveis para classificar.');
        setStep('idle');
      } else {
        setStep('preview');
      }
    } catch (e) {
      setError(e.message || 'Erro ao analisar tarefas.');
      setStep('idle');
    }
  };

  const apply = async () => {
    setStep('applying');
    setError('');
    try {
      const toApply = suggestions.filter(s => selected.has(s.task_id));

      const existingUpdates = [];
      const newFrenteGroups = {};

      toApply.forEach(s => {
        const task = tasksToClassify.find(t => t.id === s.task_id);
        if (!task) return;
        if (s.frente_id) {
          existingUpdates.push({ id: s.task_id, frente_id: s.frente_id });
        } else if (s.frente_nova_nome) {
          const key = `${task.area_id}::${s.frente_nova_nome.trim().toLowerCase()}`;
          if (!newFrenteGroups[key]) {
            newFrenteGroups[key] = { area_id: task.area_id, nome: s.frente_nova_nome.trim(), task_ids: [] };
          }
          newFrenteGroups[key].task_ids.push(s.task_id);
        }
      });

      const updates = [...existingUpdates];
      let createdCount = 0;

      for (const group of Object.values(newFrenteGroups)) {
        const area = areaMap.get(group.area_id);
        const slug = slugify(group.nome);

        const existing = frentes.find(f =>
          f.area_id === group.area_id &&
          (f.slug === slug || f.nome.trim().toLowerCase() === group.nome.toLowerCase())
        );

        let frenteId;
        if (existing) {
          frenteId = existing.id;
        } else {
          const created = await base44.entities.M31Frente.create({
            area_id: group.area_id,
            area_slug: area?.slug || '',
            slug,
            nome: group.nome,
            descricao: '',
            status_definicao: 'confirmada',
            ordem: 0,
            ativo: true,
          });
          frenteId = created.id;
          createdCount++;
        }

        group.task_ids.forEach(taskId => {
          updates.push({ id: taskId, frente_id: frenteId });
        });
      }

      if (updates.length > 0) {
        await base44.entities.EventoM31Tarefa.bulkUpdate(updates);
        qc.invalidateQueries(['m31tarefas']);
        qc.invalidateQueries(['m31tarefas-enriquecer']);
        qc.invalidateQueries(['m31frentes-enriquecer']);
      }
      setAppliedCount(updates.length);
      setNewFrentesCount(createdCount);
      setDoneLabel('tarefas classificadas');
      setStep('done');
    } catch (e) {
      setError(e.message || 'Erro ao aplicar sugestões.');
      setStep('preview');
    }
  };

  const analyzeOtimizacoes = async () => {
    setStep('analyzing');
    setError('');
    try {
      const tasksByFrente = {};
      tarefas.forEach(t => {
        if (t.frente_id) {
          if (!tasksByFrente[t.frente_id]) tasksByFrente[t.frente_id] = [];
          tasksByFrente[t.frente_id].push(t);
        }
      });
      const prompt = buildOtimizarFrentesPrompt(areas, frentes, tasksByFrente);
      const res = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            otimizacoes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  tipo: { type: 'string' },
                  frente_id: { type: 'string' },
                  frente_id_destino: { type: 'string' },
                  task_id: { type: 'string' },
                  novo_nome: { type: 'string' },
                  motivo: { type: 'string' },
                  confianca: { type: 'string' },
                },
              },
            },
          },
        },
      });
      const valid = (res?.otimizacoes || []).filter(o => o.tipo && o.frente_id);
      setOtimizacoes(valid);
      setSelected(new Set(valid.map((_, i) => `opt-${i}`)));
      if (valid.length === 0) {
        setError('A IA não encontrou otimizações necessárias — a estrutura de Frentes parece boa.');
        setStep('idle');
      } else {
        setStep('otimizar-preview');
      }
    } catch (e) {
      setError(e.message || 'Erro ao analisar Frentes.');
      setStep('idle');
    }
  };

  const applyOtimizacoes = async () => {
    setStep('applying');
    setError('');
    try {
      const selectedOpts = otimizacoes.filter((_, i) => selected.has(`opt-${i}`));
      let count = 0;
      for (const opt of selectedOpts) {
        if (opt.tipo === 'renomear' && opt.novo_nome) {
          await base44.entities.M31Frente.update(opt.frente_id, { nome: opt.novo_nome, alterado_por: userEmail, alterado_em: new Date().toISOString() });
          count++;
        } else if (opt.tipo === 'excluir_vazia') {
          await base44.entities.M31Frente.delete(opt.frente_id);
          count++;
        } else if (opt.tipo === 'mover_tarefa' && opt.task_id && opt.frente_id_destino) {
          await base44.entities.EventoM31Tarefa.update(opt.task_id, { frente_id: opt.frente_id_destino, alterado_por_email: userEmail });
          count++;
        } else if (opt.tipo === 'unir' && opt.frente_id && opt.frente_id_destino) {
          const tasks = await base44.entities.EventoM31Tarefa.filter({ frente_id: opt.frente_id });
          if (tasks.length > 0) {
            await base44.entities.EventoM31Tarefa.bulkUpdate(tasks.map(t => ({ id: t.id, frente_id: opt.frente_id_destino, alterado_por_email: userEmail })));
          }
          await base44.entities.M31Frente.delete(opt.frente_id);
          count++;
        }
      }
      qc.invalidateQueries({ queryKey: ['m31tarefas'] });
      qc.invalidateQueries({ queryKey: ['m31frentes'] });
      qc.invalidateQueries({ queryKey: ['m31areas'] });
      setAppliedCount(count);
      setNewFrentesCount(0);
      setDoneLabel('otimizações aplicadas');
      setStep('done');
    } catch (e) {
      setError(e.message || 'Erro ao aplicar otimizações.');
      setStep('otimizar-preview');
    }
  };

  const toggleSelect = (taskId) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  useEffect(() => {
    if (isMobile) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isMobile]);

  const overlayStyle = isMobile
    ? { position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.50)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }
    : { position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.30)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'flex-end' };

  const panelStyle = isMobile
    ? { height: '90vh', display: 'flex', flexDirection: 'column', width: '100%', background: T.surface, borderTopLeftRadius: '20px', borderTopRightRadius: '20px', boxShadow: '0 -4px 24px rgba(0,0,0,0.15)', animation: 'm31-slide-up 0.28s cubic-bezier(0.16,1,0.3,1)' }
    : { width: '900px', maxWidth: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: T.surface, borderLeft: `1px solid ${T.border}`, boxShadow: '-8px 0 30px rgba(0,0,0,0.10)', animation: 'm31-drawer-slide 250ms cubic-bezier(0.16,1,0.3,1) both' };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } } @keyframes m31-slide-up { from { transform: translateY(100%) } to { transform: translateY(0) } }`}</style>
      <div style={panelStyle} onClick={e => e.stopPropagation()}>
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '8px', flexShrink: 0 }}>
            <div style={{ width: '36px', height: '4px', background: T.border, borderRadius: T.radius.pill }} />
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ListChecks size={18} color={T.primary} />
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: T.text, fontFamily: T.font.body, margin: 0 }}>
              Classificar Frentes com IA
            </h2>
          </div>
          <button onClick={onClose} style={{ color: T.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', fontFamily: T.font.body }}>
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'rgba(220,38,38,0.08)', borderRadius: T.radius.md, color: T.danger, fontSize: '13px' }}>
              <AlertCircle size={15} /> {error}
            </div>
          )}

          {step === 'idle' && !error && (
            <IdleView loading={loadingTarefas} count={tasksToClassify.length} onAnalyze={analyze} onOtimizar={analyzeOtimizacoes} />
          )}

          {step === 'analyzing' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: '16px' }}>
              <Loader2 size={32} color={T.primary} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: '14px', color: T.textMuted }}>Consultando Frentes existentes e classificando tarefas…</span>
            </div>
          )}

          {step === 'preview' && (
            <PreviewTable
              suggestions={suggestions}
              tasksToClassify={tasksToClassify}
              areaMap={areaMap}
              selected={selected}
              onToggle={toggleSelect}
              isMobile={isMobile}
            />
          )}

          {step === 'otimizar-preview' && (
            <OtimizarPreviewTable
              otimizacoes={otimizacoes}
              frentes={frentes}
              areas={areas}
              selected={selected}
              onToggle={(idx) => toggleSelect(`opt-${idx}`)}
              isMobile={isMobile}
            />
          )}

          {step === 'applying' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: '16px' }}>
              <Loader2 size={32} color={T.primary} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: '14px', color: T.textMuted }}>Aplicando {selected.size} classificações…</span>
            </div>
          )}

          {step === 'done' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: '16px' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(22,163,74,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Check size={28} color={T.success} strokeWidth={3} />
              </div>
              <span style={{ fontSize: '16px', fontWeight: '600', color: T.text }}>
                {appliedCount} {appliedCount === 1 ? doneLabel.replace(/s$/, '') : doneLabel}
              </span>
              {newFrentesCount > 0 && (
                <span style={{ fontSize: '13px', color: T.textMuted }}>
                  {newFrentesCount} {newFrentesCount === 1 ? 'nova Frente criada' : 'novas Frentes criadas'}
                </span>
              )}
              <button onClick={onClose} style={{ background: T.primary, color: T.onPrimary, border: 'none', borderRadius: T.radius.md, padding: '10px 20px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', fontFamily: T.font.body }}>
                Concluir
              </button>
            </div>
          )}
        </div>

        {(step === 'preview' || step === 'otimizar-preview') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 20px', borderTop: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
            <span style={{ fontSize: '13px', color: T.textMuted, flex: 1 }}>
              {selected.size} selecionada{selected.size !== 1 ? 's' : ''} de {step === 'otimizar-preview' ? otimizacoes.length : suggestions.length}
            </span>
            <button
              onClick={() => setSelected(step === 'otimizar-preview'
                ? new Set(otimizacoes.map((_, i) => `opt-${i}`))
                : new Set(suggestions.map(s => s.task_id))
              )}
              style={{ background: 'none', border: `1px solid ${T.border}`, color: T.textMuted, borderRadius: T.radius.md, padding: '8px 12px', fontSize: '13px', fontWeight: '500', cursor: 'pointer', fontFamily: T.font.body }}
            >
              Selecionar todas
            </button>
            <button
              onClick={step === 'otimizar-preview' ? applyOtimizacoes : apply}
              disabled={selected.size === 0}
              style={{ background: T.primary, color: T.onPrimary, border: 'none', borderRadius: T.radius.md, padding: '8px 16px', fontSize: '14px', fontWeight: '600', cursor: selected.size === 0 ? 'not-allowed' : 'pointer', opacity: selected.size === 0 ? 0.5 : 1, fontFamily: T.font.body, display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Check size={15} /> Confirmar e aplicar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function IdleView({ loading, count, onAnalyze, onOtimizar }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px', gap: '20px', textAlign: 'center' }}>
      <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(139,26,43,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Sparkles size={28} color={T.primary} />
      </div>
      <div>
        <h3 style={{ fontSize: '16px', fontWeight: '600', color: T.text, margin: '0 0 6px', fontFamily: T.font.body }}>
          Classificar tarefas em Frentes
        </h3>
        <p style={{ fontSize: '13px', color: T.textMuted, margin: 0, lineHeight: '20px', maxWidth: '400px' }}>
          A IA consulta as Frentes já existentes em cada Área e escolhe a mais específica e compatível para cada tarefa. Só cria Frentes novas quando há várias tarefas com o mesmo tema.
        </p>
      </div>
      {loading ? (
        <Loader2 size={24} color={T.primary} style={{ animation: 'spin 1s linear infinite' }} />
      ) : count === 0 ? (
        <span style={{ fontSize: '14px', color: T.success, fontWeight: '600' }}>✓ Todas as tarefas elegíveis já têm Frente definida</span>
      ) : (
        <>
          <span style={{ fontSize: '14px', color: T.textMuted }}>
            {count} {count === 1 ? 'tarefa sem Frente' : 'tarefas sem Frente'} (e sem subtarefas conectadas)
          </span>
          <button onClick={onAnalyze} style={{ background: T.primary, color: T.onPrimary, border: 'none', borderRadius: T.radius.md, padding: '12px 24px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', fontFamily: T.font.body, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Wand2 size={16} /> Analisar com IA
          </button>
          {onOtimizar && (
            <button onClick={onOtimizar} style={{ background: 'none', color: T.primary, border: `1px solid ${T.primary}40`, borderRadius: T.radius.md, padding: '12px 24px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', fontFamily: T.font.body, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={16} /> Otimizar Frentes existentes
            </button>
          )}
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

function PreviewTable({ suggestions, tasksToClassify, areaMap, selected, onToggle, isMobile }) {
  const thStyle = {
    fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.08em',
    color: '#9B8E8E', padding: '8px', textAlign: 'left', borderBottom: '2px solid #E5DDD5',
    whiteSpace: 'nowrap', background: '#F9F6F2',
  };

  return (
    <div style={{ border: `1px solid #E5DDD5`, borderRadius: '12px', overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? '700px' : '100%' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: '36px', textAlign: 'center' }}></th>
            <th style={thStyle}>Tarefa</th>
            <th style={thStyle}>Área</th>
            <th style={thStyle}>Frente atual</th>
            <th style={thStyle}>Frente sugerida</th>
            <th style={thStyle}>Motivo</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>Confiança</th>
          </tr>
        </thead>
        <tbody>
          {suggestions.map(s => {
            const task = tasksToClassify.find(t => t.id === s.task_id);
            if (!task) return null;
            const area = areaMap.get(task.area_id);
            return (
              <EnriquecerSuggestionRow
                key={s.task_id}
                task={task}
                suggestion={s}
                areaNome={area?.nome || ''}
                frenteAtualNome={''}
                checked={selected.has(s.task_id)}
                onToggle={() => onToggle(s.task_id)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OtimizarPreviewTable({ otimizacoes, frentes, areas, selected, onToggle, isMobile }) {
  const thStyle = {
    fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.08em',
    color: '#9B8E8E', padding: '8px', textAlign: 'left', borderBottom: '2px solid #E5DDD5',
    whiteSpace: 'nowrap', background: '#F9F6F2',
  };
  const TIPO_LABEL = {
    renomear: 'Renomear',
    unir: 'Unir',
    mover_tarefa: 'Mover tarefa',
    excluir_vazia: 'Excluir vazia',
  };
  const TIPO_COLOR = {
    renomear: '#8B1A2B',
    unir: '#7C3AED',
    mover_tarefa: '#2563EB',
    excluir_vazia: '#DC2626',
  };
  const frenteMap = new Map(frentes.map(f => [f.id, f]));
  const areaMap = new Map(areas.map(a => [a.id, a]));

  return (
    <div style={{ border: `1px solid #E5DDD5`, borderRadius: '12px', overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? '600px' : '100%' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: '36px', textAlign: 'center' }}></th>
            <th style={thStyle}>Ação</th>
            <th style={thStyle}>Frente</th>
            <th style={thStyle}>Detalhe</th>
            <th style={thStyle}>Motivo</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>Confiança</th>
          </tr>
        </thead>
        <tbody>
          {otimizacoes.map((opt, i) => {
            const frente = frenteMap.get(opt.frente_id);
            const area = frente ? areaMap.get(frente.area_id) : null;
            const frenteDestino = opt.frente_id_destino ? frenteMap.get(opt.frente_id_destino) : null;
            let detalhe = '';
            if (opt.tipo === 'renomear') detalhe = `→ "${opt.novo_nome}"`;
            else if (opt.tipo === 'unir') detalhe = `com "${frenteDestino?.nome || '?'}"`;
            else if (opt.tipo === 'mover_tarefa') detalhe = `tarefa → "${frenteDestino?.nome || '?'}"`;
            else if (opt.tipo === 'excluir_vazia') detalhe = '(sem tarefas)';
            const confColor = opt.confianca === 'alto' ? '#16A34A' : opt.confianca === 'medio' ? '#D97706' : '#DC2626';
            return (
              <tr key={i} style={{ borderBottom: '1px solid #E5DDD5' }}>
                <td style={{ padding: '10px 8px', width: '36px', textAlign: 'center', verticalAlign: 'middle' }}>
                  <button onClick={() => onToggle(i)} style={{
                    width: '20px', height: '20px', borderRadius: '4px',
                    border: selected.has(`opt-${i}`) ? 'none' : '1.5px solid #D0C8C0',
                    background: selected.has(`opt-${i}`) ? '#8B1A2B' : 'transparent',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', padding: 0,
                  }}>
                    {selected.has(`opt-${i}`) && <Check size={12} color="#fff" strokeWidth={3} />}
                  </button>
                </td>
                <td style={{ padding: '10px 8px', fontSize: '12px', fontWeight: '700', color: TIPO_COLOR[opt.tipo] || '#6B5E5E', whiteSpace: 'nowrap' }}>
                  {TIPO_LABEL[opt.tipo] || opt.tipo}
                </td>
                <td style={{ padding: '10px 8px', fontSize: '13px', color: '#2A1F1F', fontWeight: '500', whiteSpace: 'nowrap' }}>
                  {frente?.nome || opt.frente_id}
                  {area && <span style={{ fontSize: '11px', color: '#9B8E8E', display: 'block' }}>{area.nome}</span>}
                </td>
                <td style={{ padding: '10px 8px', fontSize: '12px', color: '#8B1A2B', fontWeight: '600', whiteSpace: 'nowrap' }}>
                  {detalhe}
                </td>
                <td style={{ padding: '10px 8px', fontSize: '12px', color: '#6B5E5E', maxWidth: '220px', lineHeight: '16px' }}>
                  {opt.motivo}
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-flex', background: `${confColor}15`, color: confColor,
                    borderRadius: '4px', padding: '2px 7px', fontSize: '10px', fontWeight: '700',
                  }}>
                    {opt.confianca === 'alto' ? 'Alta' : opt.confianca === 'medio' ? 'Média' : 'Baixa'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}