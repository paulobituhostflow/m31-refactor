import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { TOKENS as T } from '@/lib/m31DesignTokens';
import { X, Sparkles, Check, Loader2, Plus, Trash2, AlertCircle } from 'lucide-react';

const TIPOS = [
  { value: 'operacional', label: 'Operacional' },
  { value: 'estrategica', label: 'Estratégica' },
  { value: 'espiritual', label: 'Espiritual' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'experiencia', label: 'Experiência' },
  { value: 'producao', label: 'Produção' },
  { value: 'voluntariado', label: 'Voluntariado' },
];

const PRIORIDADES = [
  { value: 'baixa', label: 'Baixa' },
  { value: 'media', label: 'Média' },
  { value: 'alta', label: 'Alta' },
  { value: 'urgente', label: 'Urgente' },
];

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

function calculatePrazo(dias, dataEvento) {
  if (!dias || !dataEvento) return null;
  const d = new Date(dataEvento + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

const inputStyle = {
  background: T.background,
  border: `1px solid ${T.border}`,
  borderRadius: T.radius.md,
  padding: '8px 10px',
  fontSize: '13px',
  color: T.text,
  fontFamily: T.font.body,
  outline: 'none',
  width: '100%',
};

const labelStyle = {
  fontSize: '11px',
  fontWeight: '600',
  color: T.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  marginBottom: '4px',
  display: 'block',
};

/**
 * M31IAPanel — painel de importação de tarefas com IA.
 * Desktop: drawer lateral direito. Mobile: bottom sheet 90dvh.
 * Fluxo: textarea → análise LLM → prévia editável → confirmação.
 */
export default function M31IAPanel({ onClose, userEmail, userName, lockedAreaSlug }) {
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const sheetRef = useRef(null);
  const startYRef = useRef(0);
  const dragYRef = useRef(0);
  const draggingRef = useRef(false);

  const [step, setStep] = useState('input');
  const [texto, setTexto] = useState('');
  const [loading, setLoading] = useState(false);
  const [sugestoes, setSugestoes] = useState([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const { data: areas = [] } = useQuery({
    queryKey: ['m31areas-ia'],
    queryFn: () => base44.entities.M31Area.list('ordem', 50),
  });

  const { data: frentes = [] } = useQuery({
    queryKey: ['m31frentes-ia'],
    queryFn: () => base44.entities.M31Frente.list('ordem', 100),
  });

  const { data: edicoes = [] } = useQuery({
    queryKey: ['m31edicao-ativa-ia'],
    queryFn: () => base44.entities.M31EdicaoEvento.filter({ status: 'ativa' }),
  });
  const edicaoAtiva = edicoes[0];

  const analisar = async () => {
    if (!texto.trim()) return;
    setLoading(true);
    setError('');
    try {
      const areasFormatted = areas.map(a => `- ${a.slug}: ${a.nome}`).join('\n');
      const frentesFormatted = frentes.map(f => {
        const area = areas.find(a => a.id === f.area_id);
        return `- ${f.nome} (área: ${area?.slug || f.area_slug || 'sem área'})`;
      }).join('\n');

      const prompt = `Você é o Agente de IA da Gestão de Tarefas do M31 Filhas.

Sua função é ajudar o usuário a criar, importar, organizar, revisar e atualizar tarefas com clareza, sem alterar dados importantes sem confirmação.

## Estrutura obrigatória
Classifique tudo nesta hierarquia: Área → Frente → Tarefa → Subtarefa
- Área: macroárea responsável pela demanda.
- Frente: agrupamento de tarefas relacionadas dentro de uma Área.
- Tarefa: ação executável, com início e fim claros.
- Subtarefa: etapa menor necessária para concluir uma Tarefa.
Nunca confunda Área com Frente, equipe, categoria ou responsável.

## Regras de classificação
Para cada tarefa, apresente: título, área sugerida, frente sugerida, ação (usar existente ou criar nova), justificativa curta, responsável, prazo, prioridade, status inicial e subtarefas.
- Nunca crie uma nova Área automaticamente.
- Só sugira nova Frente quando nenhuma existente fizer sentido.
- Quando houver dúvida entre duas Áreas ou Frentes, escolha a mais provável e indique na justificativa.

## Importação em lote
1. Separe cada ação em uma tarefa individual.
2. Remova repetições e duplicidades.
3. Melhore títulos vagos — transforme em ações claras que começam com verbo, indicam a ação e evitam termos genéricos.
   Exemplo ruim: "Slides". Exemplo melhor: "Cobrar os slides das preletoras junto à equipe de Mídia".
4. Classifique cada tarefa em Área e Frente.
5. Identifique tarefas que deveriam ser subtarefas (não complique uma tarefa simples com muitas subtarefas).
6. Sugira responsável, prazo e prioridade com base no contexto.
7. Não invente prazos ou responsáveis — se não houver menção, deixe vazio.

## Priorização
Use: baixa, media, alta, urgente.
Considere crítica uma tarefa: atrasada, bloqueada, com prazo em até 48 horas, marcada como urgente, ou dependente de outra ação essencial.

## Responsáveis
Sugira responsáveis com base em: área de atuação, frente, menções no texto. Nunca invente nomes que não estão no texto ou contexto.

## Prazos
Quando houver datas no texto, associe-as corretamente como prazo_relativo_dias (negativo = antes do evento, 0 = no dia, positivo = depois).
Quando não houver data, deixe prazo_relativo_dias null — não invente.

## Segurança
- Nunca crie Áreas automaticamente.
- Nunca crie Frentes automaticamente sem indicar criar_nova_frente=true.
- Não duplique tarefas existentes.

Para cada tarefa, retorne:
- titulo: título claro começando com verbo
- area_slug: slug da área (obrigatório, das disponíveis abaixo)
- frente_nome: nome da frente (existente ou nova)
- criar_nova_frente: true se a frente não existe na lista, false se existe
- subtarefas: lista de subtarefas (strings), vazio se não houver
- responsavel_nome: nome do responsável se mencionado, string vazia se não
- prazo_relativo_dias: número (negativo=antes, 0=no dia, positivo=depois), null se sem data
- tipo: um de: espiritual, estrategica, operacional, comercial, experiencia, producao, voluntariado
- prioridade: um de: baixa, media, alta, urgente
- justificativa: justificativa curta da classificação

ÁREAS DISPONÍVEIS (use o slug exato, nunca crie novas):
${areasFormatted || 'Nenhuma área cadastrada.'}

FRENTES EXISTENTES:
${frentesFormatted || 'Nenhuma frente cadastrada ainda.'}

${lockedAreaSlug ? `\nCONTEXTO: O usuário está atuando dentro da Área "${lockedAreaSlug}". Prefira esta área quando aplicável.\n` : ''}
TEXTO PARA ANÁLISE:
${texto}`;

      const res = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            tarefas: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  titulo: { type: 'string' },
                  area_slug: { type: 'string' },
                  frente_nome: { type: 'string' },
                  criar_nova_frente: { type: 'boolean' },
                  subtarefas: { type: 'array', items: { type: 'string' } },
                  responsavel_nome: { type: 'string' },
                  prazo_relativo_dias: { type: 'number' },
                  tipo: { type: 'string' },
                  prioridade: { type: 'string' },
                  justificativa: { type: 'string' },
                },
              },
            },
          },
        },
      });

      const lista = res?.tarefas || [];
      if (lista.length === 0) {
        setError('Não foi possível identificar tarefas no texto. Tente reformular.');
        return;
      }
      setSugestoes(lista);
      setStep('preview');
    } catch (err) {
      setError(err?.message || 'Erro ao analisar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const updateItem = (idx, field, value) => {
    setSugestoes(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));
  };

  const updateSubtarefa = (taskIdx, subIdx, value) => {
    setSugestoes(prev => prev.map((t, i) => {
      if (i !== taskIdx) return t;
      const subs = [...(t.subtarefas || [])];
      subs[subIdx] = value;
      return { ...t, subtarefas: subs };
    }));
  };

  const addSubtarefa = (taskIdx) => {
    setSugestoes(prev => prev.map((t, i) => {
      if (i !== taskIdx) return t;
      return { ...t, subtarefas: [...(t.subtarefas || []), ''] };
    }));
  };

  const removeSubtarefa = (taskIdx, subIdx) => {
    setSugestoes(prev => prev.map((t, i) => {
      if (i !== taskIdx) return t;
      const subs = (t.subtarefas || []).filter((_, j) => j !== subIdx);
      return { ...t, subtarefas: subs };
    }));
  };

  const removeTask = (idx) => {
    setSugestoes(prev => prev.filter((_, i) => i !== idx));
  };

  const confirmar = async () => {
    setCreating(true);
    setError('');
    try {
      // 1. Mapear frentes existentes e criar novas
      const frenteCache = {};
      const newFrentes = [];

      for (const t of sugestoes) {
        const key = `${t.area_slug}|${(t.frente_nome || '').toLowerCase()}`;
        if (frenteCache[key]) continue;

        const existing = frentes.find(f => {
          const area = areas.find(a => a.id === f.area_id);
          return area?.slug === t.area_slug && f.nome.toLowerCase() === (t.frente_nome || '').toLowerCase();
        });

        if (existing) {
          frenteCache[key] = existing.id;
        } else {
          const area = areas.find(a => a.slug === t.area_slug);
          newFrentes.push({
            area_id: area?.id,
            area_slug: t.area_slug,
            slug: (t.frente_nome || '').toLowerCase().replace(/\s+/g, '_').slice(0, 40),
            nome: t.frente_nome,
            status_definicao: 'confirmada',
          });
        }
      }

      let createdFrentes = [];
      if (newFrentes.length > 0) {
        createdFrentes = await base44.entities.M31Frente.bulkCreate(newFrentes);
        newFrentes.forEach((f, i) => {
          const key = `${f.area_slug}|${f.nome.toLowerCase()}`;
          frenteCache[key] = createdFrentes[i]?.id;
        });
      }

      // 2. Criar tarefas pai
      const parentTasks = sugestoes.map(t => {
        const key = `${t.area_slug}|${(t.frente_nome || '').toLowerCase()}`;
        const area = areas.find(a => a.slug === t.area_slug);
        return {
          titulo: t.titulo,
          area_id: area?.id || null,
          area: t.area_slug,
          frente_id: frenteCache[key] || null,
          tipo: t.tipo || 'operacional',
          prioridade: t.prioridade || 'media',
          responsavel_nome: t.responsavel_nome || '',
          prazo_relativo_dias: t.prazo_relativo_dias ?? null,
          prazo: calculatePrazo(t.prazo_relativo_dias, edicaoAtiva?.data_evento),
          status: 'a_fazer',
          edicao_id: edicaoAtiva?.id || null,
          criado_por_email: userEmail,
          criado_por_nome: userName,
          checklist: [],
        };
      });

      const createdParents = await base44.entities.EventoM31Tarefa.bulkCreate(parentTasks);

      // 3. Criar subtarefas
      const allSubs = [];
      sugestoes.forEach((t, i) => {
        const key = `${t.area_slug}|${(t.frente_nome || '').toLowerCase()}`;
        const area = areas.find(a => a.slug === t.area_slug);
        (t.subtarefas || []).forEach(subTitulo => {
          if (!subTitulo?.trim()) return;
          allSubs.push({
            titulo: subTitulo,
            tarefa_pai_id: createdParents[i]?.id,
            area_id: area?.id || null,
            area: t.area_slug,
            frente_id: frenteCache[key] || null,
            tipo: t.tipo || 'operacional',
            prioridade: 'media',
            status: 'a_fazer',
            edicao_id: edicaoAtiva?.id || null,
            criado_por_email: userEmail,
            criado_por_nome: userName,
            checklist: [],
          });
        });
      });

      if (allSubs.length > 0) {
        await base44.entities.EventoM31Tarefa.bulkCreate(allSubs);
      }

      qc.invalidateQueries(['m31tarefas']);
      qc.invalidateQueries(['m31frentes']);
      qc.invalidateQueries(['m31areas']);

      setStep('done');
    } catch (err) {
      setError(err?.message || 'Erro ao criar tarefas. Tente novamente.');
    } finally {
      setCreating(false);
    }
  };

  // Gesto de arraste (mobile) — apenas no puxador
  const onHandleTouchStart = (e) => {
    draggingRef.current = true;
    startYRef.current = e.touches[0].clientY;
    dragYRef.current = 0;
    if (sheetRef.current) sheetRef.current.style.transition = 'none';
  };
  const onHandleTouchMove = (e) => {
    if (!draggingRef.current) return;
    const dy = e.touches[0].clientY - startYRef.current;
    if (dy > 0) {
      dragYRef.current = dy;
      if (sheetRef.current) sheetRef.current.style.transform = `translateY(${dy}px)`;
    }
  };
  const onHandleTouchEnd = () => {
    draggingRef.current = false;
    if (dragYRef.current > 120) {
      onClose();
      return;
    }
    if (sheetRef.current) {
      sheetRef.current.style.transition = 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)';
      sheetRef.current.style.transform = 'translateY(0)';
    }
    dragYRef.current = 0;
  };

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', flexShrink: 0, borderBottom: `1px solid ${T.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Sparkles size={18} color={T.primary} />
        <span style={{ fontSize: '16px', fontWeight: '700', color: T.text, fontFamily: T.font.body }}>Importar tarefas com IA</span>
      </div>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: T.textMuted, minHeight: '36px', minWidth: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <X size={20} />
      </button>
    </div>
  );

  const renderInput = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '20px', flex: 1 }}>
      {lockedAreaSlug && (() => {
        const areaObj = areas.find(a => a.slug === lockedAreaSlug);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', background: T.palette?.bordo?.soft || '#F6E9EC', borderRadius: T.radius.md, fontSize: '12px', color: T.primary, fontWeight: '600' }}>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Contexto atual:</span>
            <span>Área {areaObj?.nome || lockedAreaSlug}</span>
          </div>
        );
      })()}
      <div>
        <label style={labelStyle}>Cole aqui as tarefas, atas de reunião ou descrições</label>
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          placeholder="Ex:&#10;- Comprar materiais para o credenciamento (Thalita, 7 dias antes)&#10;- Enviar devocional para o grupo de intercessão&#10;- Montar estrutura do palco — contratar som, luz e telão&#10;- Definir escala de voluntárias para o check-in"
          rows={isMobile ? 10 : 14}
          style={{ ...inputStyle, minHeight: isMobile ? '200px' : '280px', resize: 'vertical', fontSize: '14px', lineHeight: '1.6' }}
        />
      </div>
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: '#FEF2F2', borderRadius: T.radius.md, color: '#DC2626', fontSize: '13px' }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}
      <button
        onClick={analisar}
        disabled={!texto.trim() || loading}
        style={{
          minHeight: '48px',
          background: texto.trim() && !loading ? T.primary : T.border,
          color: '#FFFFFF',
          border: 'none',
          borderRadius: T.radius.md,
          fontSize: '14px',
          fontWeight: '700',
          cursor: texto.trim() && !loading ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          fontFamily: T.font.body,
        }}
      >
        {loading ? <><Loader2 size={18} className="animate-spin" /> Analisando...</> : <><Sparkles size={18} /> Analisar com IA</>}
      </button>
      <p style={{ fontSize: '12px', color: T.textMuted, textAlign: 'center', lineHeight: '1.5' }}>
        A IA vai sugerir área, frente, responsável, prazo e subtarefas para cada item. Você revisa tudo antes de criar.
      </p>
    </div>
  );

  const renderPreview = () => (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ padding: '12px 20px', borderBottom: `1px solid ${T.border}`, flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', color: T.textMuted, fontFamily: T.font.body }}>
          {sugestoes.length} tarefa{sugestoes.length !== 1 ? 's' : ''} identificada{sugestoes.length !== 1 ? 's' : ''}
        </span>
        <button onClick={() => { setStep('input'); setSugestoes([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.primary, fontSize: '13px', fontWeight: '600', fontFamily: T.font.body }}>
          ← Voltar
        </button>
      </div>
      <div style={{ overflowY: 'auto', flex: 1, padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '14px', overscrollBehavior: 'contain', touchAction: 'pan-y' }}>
        {sugestoes.map((t, idx) => {
          const areaObj = areas.find(a => a.slug === t.area_slug);
          return (
            <div key={idx} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.lg, padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', color: T.textMuted, flexShrink: 0 }}>#{idx + 1}</span>
                <input
                  value={t.titulo}
                  onChange={e => updateItem(idx, 'titulo', e.target.value)}
                  style={{ ...inputStyle, fontWeight: '600', fontSize: '14px', flex: 1 }}
                />
                <button onClick={() => removeTask(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: '4px', minHeight: '32px', minWidth: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Trash2 size={15} />
                </button>
              </div>
              {t.justificativa && (
                <p style={{ fontSize: '12px', color: T.textMuted, fontStyle: 'italic', margin: 0, lineHeight: '1.4', paddingLeft: '4px', borderLeft: `2px solid ${T.border}` }}>{t.justificativa}</p>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>Área</label>
                  <select value={t.area_slug} onChange={e => updateItem(idx, 'area_slug', e.target.value)} style={inputStyle}>
                    <option value="">—</option>
                    {areas.map(a => <option key={a.id} value={a.slug}>{a.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>{t.criar_nova_frente ? 'Nova frente' : 'Frente'}</label>
                  <input
                    value={t.frente_nome || ''}
                    onChange={e => updateItem(idx, 'frente_nome', e.target.value)}
                    placeholder="Nome da frente"
                    style={inputStyle}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>Responsável</label>
                  <input value={t.responsavel_nome || ''} onChange={e => updateItem(idx, 'responsavel_nome', e.target.value)} placeholder="—" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Prazo (dias)</label>
                  <input type="number" value={t.prazo_relativo_dias ?? ''} onChange={e => updateItem(idx, 'prazo_relativo_dias', e.target.value ? Number(e.target.value) : null)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Tipo</label>
                  <select value={t.tipo || 'operacional'} onChange={e => updateItem(idx, 'tipo', e.target.value)} style={inputStyle}>
                    {TIPOS.map(tp => <option key={tp.value} value={tp.value}>{tp.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Prioridade</label>
                <select value={t.prioridade || 'media'} onChange={e => updateItem(idx, 'prioridade', e.target.value)} style={{ ...inputStyle, maxWidth: '160px' }}>
                  {PRIORIDADES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              {(t.subtarefas?.length > 0 || true) && (
                <div>
                  <label style={labelStyle}>Subtarefas</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {(t.subtarefas || []).map((sub, subIdx) => (
                      <div key={subIdx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input value={sub} onChange={e => updateSubtarefa(idx, subIdx, e.target.value)} style={inputStyle} placeholder="Subtarefa..." />
                        <button onClick={() => removeSubtarefa(idx, subIdx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: '4px', minHeight: '32px', minWidth: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                    <button onClick={() => addSubtarefa(idx)} style={{ background: 'none', border: `1px dashed ${T.border}`, borderRadius: T.radius.md, padding: '6px 10px', cursor: 'pointer', color: T.textMuted, fontSize: '12px', fontFamily: T.font.body, display: 'flex', alignItems: 'center', gap: '4px', width: 'fit-content' }}>
                      <Plus size={13} /> Adicionar subtarefa
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ padding: '14px 20px', borderTop: `1px solid ${T.border}`, flexShrink: 0, paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}>
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: '#FEF2F2', borderRadius: T.radius.md, color: '#DC2626', fontSize: '13px', marginBottom: '10px' }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}
        <button
          onClick={confirmar}
          disabled={creating || sugestoes.length === 0}
          style={{
            minHeight: '48px',
            width: '100%',
            background: !creating && sugestoes.length > 0 ? T.primary : T.border,
            color: '#FFFFFF',
            border: 'none',
            borderRadius: T.radius.md,
            fontSize: '14px',
            fontWeight: '700',
            cursor: !creating && sugestoes.length > 0 ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            fontFamily: T.font.body,
          }}
        >
          {creating ? <><Loader2 size={18} className="animate-spin" /> Criando tarefas...</> : <><Check size={18} /> Confirmar e criar {sugestoes.length} tarefa{sugestoes.length !== 1 ? 's' : ''}</>}
        </button>
      </div>
    </div>
  );

  const renderDone = () => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '40px 20px', gap: '16px', textAlign: 'center' }}>
      <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Check size={28} color="#16A34A" />
      </div>
      <div>
        <h3 style={{ fontSize: '18px', fontWeight: '700', color: T.text, margin: 0, fontFamily: T.font.body }}>Tarefas criadas!</h3>
        <p style={{ fontSize: '14px', color: T.textMuted, marginTop: '6px', fontFamily: T.font.body }}>As tarefas já aparecem na sua gestão. Você pode editá-las a qualquer momento.</p>
      </div>
      <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
        <button onClick={() => { setStep('input'); setTexto(''); setSugestoes([]); }} style={{ padding: '10px 16px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.md, cursor: 'pointer', fontSize: '14px', fontWeight: '600', color: T.text, fontFamily: T.font.body }}>
          Importar mais
        </button>
        <button onClick={onClose} style={{ padding: '10px 16px', background: T.primary, border: 'none', borderRadius: T.radius.md, cursor: 'pointer', fontSize: '14px', fontWeight: '600', color: '#FFFFFF', fontFamily: T.font.body }}>
          Fechar
        </button>
      </div>
    </div>
  );

  // Desktop: drawer lateral direito
  if (!isMobile) {
    return (
      <>
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200 }} />
        <div style={{
          position: 'fixed',
          top: 0, right: 0, bottom: 0,
          width: '460px',
          maxWidth: '100vw',
          background: T.surface,
          zIndex: 201,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
          animation: 'iaSlideIn 0.25s ease-out',
        }}>
          <style>{`@keyframes iaSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
          {header}
          {step === 'input' && renderInput()}
          {step === 'preview' && renderPreview()}
          {step === 'done' && renderDone()}
        </div>
      </>
    );
  }

  // Mobile: bottom sheet
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', overscrollBehavior: 'none' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
      <div
        ref={sheetRef}
        style={{
          position: 'relative',
          background: T.surface,
          borderRadius: '16px 16px 0 0',
          maxHeight: '90dvh',
          width: '100%',
          maxWidth: '100%',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          paddingBottom: 'max(0px, env(safe-area-inset-bottom))',
        }}
      >
        <div
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
          style={{ display: 'flex', justifyContent: 'center', paddingTop: '8px', paddingBottom: '8px', flexShrink: 0, touchAction: 'none', cursor: 'grab' }}
        >
          <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: T.border }} />
        </div>
        {header}
        {step === 'input' && renderInput()}
        {step === 'preview' && renderPreview()}
        {step === 'done' && renderDone()}
      </div>
    </div>
  );
}