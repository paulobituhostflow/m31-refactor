import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { X, Sparkles, Loader, Check, Plus, ListChecks, Lightbulb } from 'lucide-react';
import { TOKENS } from '@/lib/m31DesignTokens';
import { TAREFA_AREAS, TAREFA_AREA_BY_KEY } from '@/lib/m31TarefaAreas';

const T = {
  card: TOKENS.surface, card2: TOKENS.surfaceSubtle, border: TOKENS.border,
  text: TOKENS.text, sec: TOKENS.textMuted, muted: TOKENS.textSubtle,
  primary: TOKENS.primary, onPrimary: TOKENS.onPrimary,
  success: TOKENS.success, input: TOKENS.surface, inputB: TOKENS.borderStrong,
  primarySoft: TOKENS.primarySoft, successSoft: TOKENS.successSoft,
  shadowLg: TOKENS.shadowLg,
};

const AREA_KEYS = TAREFA_AREAS.map(a => a.key);

const fmtPrazo = (p) => p ? new Date(p + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : null;

export default function M31SugestaoTarefasIA({ onClose, onImport, userEmail }) {
  const [modo, setModo] = useState('novas'); // 'novas' | 'subtarefas'
  const [tarefaAlvoId, setTarefaAlvoId] = useState('');
  const [loading, setLoading] = useState(false);
  const [sugestoes, setSugestoes] = useState([]);
  const [selecionadas, setSelecionadas] = useState(new Set());
  const [erro, setErro] = useState(null);
  const [contexto, setContexto] = useState('');
  const [importando, setImportando] = useState(false);

  // Carrega tarefas existentes para dar contexto à IA
  const tarefasQ = useQuery({
    queryKey: ['m31_sugestao_ia_tarefas'],
    queryFn: () => base44.entities.EventoM31Tarefa.list('-created_date', 500),
  });
  const tarefas = tarefasQ.data || [];

  // Resumo das tarefas existentes para o prompt (títulos + áreas + status)
  const resumoExistente = useMemo(() => {
    if (tarefas.length === 0) return 'Nenhuma tarefa cadastrada ainda.';
    const linhas = tarefas.slice(0, 200).map(t => {
      const area = TAREFA_AREA_BY_KEY[t.area]?.label?.split('/')[0]?.trim() || t.area || '?';
      const status = t.status || '?';
      const titulo = (t.titulo || '').slice(0, 80);
      return `- [${area}] (${status}) ${titulo}`;
    });
    return linhas.join('\n');
  }, [tarefas]);

  // Tarefa alvo para subtarefas
  const tarefaAlvo = useMemo(() => tarefas.find(t => t.id === tarefaAlvoId) || null, [tarefas, tarefaAlvoId]);

  async function gerarSugestoes() {
    setLoading(true);
    setErro(null);
    setSugestoes([]);
    setSelecionadas(new Set());

    try {
      let lista = [];

      if (modo === 'subtarefas') {
        if (!tarefaAlvo) {
          setErro('Selecione uma tarefa para sugerir subtarefas.');
          setLoading(false);
          return;
        }

        const prompt = `Você é o GESTOR DE OPERAÇÕES DO M31 FILHAS — o cérebro operacional que transforma cada tarefa em plano executável.

SUA MISSÃO: No M31, cada detalhe precisa ter um responsável, um prazo, um padrão e uma confirmação de que foi concluído.

Decomponha a tarefa abaixo em SUBTAREFAS acionáveis e verificáveis. Para cada subtarefa:
1. Transforme em etapa executável com verbo de ação no infinitivo.
2. Defina a ordem correta de execução.
3. Identifique dependências entre as subtarefas.
4. Indique riscos e pontos críticos.
5. Crie critérios objetivos de conclusão (evidência verificável).
6. Aponte o que está faltando.
7. Priorize o que protege a experiência ou gera receita/inscrições.

Tarefa a decompor:
- Título: ${tarefaAlvo.titulo}
- Descrição: ${tarefaAlvo.descricao || '(sem descrição)'}
- Área: ${tarefaAlvo.area}
- Prazo: ${tarefaAlvo.prazo || 'não definido'}
- Responsável: ${tarefaAlvo.responsavel_nome || 'não definido'}
- Checklist já existente: ${(tarefaAlvo.checklist || []).length} item(ns)

${contexto ? `Contexto adicional da gestora: ${contexto}` : ''}

Gere entre 4 e 10 subtarefas CONCRETAS e verificáveis, em ordem de execução.
Cada subtarefa deve ser específica — não genérica. Exemplo de boa subtarefa: "Conferir a base final das inscritas e separar por ordem alfabética".

Retorne um JSON com esta estrutura exata:
{
  "subtarefas": [
    {
      "texto": "Descrição concisa da subtarefa (verbo no infinitivo, com critério de conclusão implícito)",
      "prazo": "YYYY-MM-DD ou null",
      "prioridade": "alta|media|baixa"
    }
  ]
}`;

        const res = await base44.integrations.Core.InvokeLLM({
          prompt,
          response_json_schema: {
            type: 'object',
            properties: {
              subtarefas: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    texto: { type: 'string' },
                    prazo: { type: 'string' },
                    prioridade: { type: 'string' },
                  },
                },
              },
            },
          },
        });

        lista = (res?.subtarefas || []).filter(s => s.texto).map(s => ({
          ...s,
          isSubtarefa: true,
        }));
      } else {
        // Modo: novas tarefas — usa tarefas existentes como contexto para NÃO duplicar
        const prompt = `Você é o GESTOR DE OPERAÇÕES DO M31 FILHAS — o cérebro operacional que transforma cada demanda em plano executável.

SUA MISSÃO: No M31, cada detalhe precisa ter um responsável, um prazo, um padrão e uma confirmação de que foi concluído.

Para cada demanda recebida, você deve:
1. Identificar o objetivo principal.
2. Definir o resultado final esperado.
3. Dividir o objetivo em etapas.
4. Transformar cada etapa em tarefas executáveis.
5. Dividir tarefas grandes em subtarefas.
6. Definir a ordem correta da execução.
7. Identificar responsáveis e equipes envolvidas.
8. Indicar prazos e datas-limite.
9. Mapear dependências.
10. Indicar riscos e pontos críticos.
11. Criar critérios objetivos de conclusão.
12. Sugerir controles, documentos e checklists necessários.
13. Apontar o que está faltando.
14. Priorizar o que gera receita, inscrições, redução de custos ou proteção da experiência.
15. Atualizar o plano conforme novas informações forem recebidas.

FORMATO DE TAREFA (cada item deve ser específico e acionável, neste padrão):
Exemplo:
- Tarefa: Conferir a base final das inscritas e separar a lista por ordem alfabética.
- Responsável: Gestão de Inscritas
- Prazo: Até 48 horas antes do evento
- Dependência: Encerramento das inscrições
- Evidência de conclusão: Lista final revisada e enviada
- Risco: Participante chegar sem constar na lista
- Plano de contingência: Criar mesa de suporte para divergências

SETORES QUE VOCÊ DEVE CONSIDERAR (mapeie cada tarefa a um destes):

1. Coordenação Geral — Visão do evento, decisões finais, aprovações, alinhamento espiritual.
2. Coordenação Executiva — Planejamento, cronograma, integração entre setores, experiência completa da inscrita, controle das entregas.
3. Produção Técnica — Palco, som, iluminação, telão, projeção, TV de retorno, mesa de corte, energia.
4. Estrutura — Cadeiras, montagem e desmontagem.
5. Gestão de Inscritas — Inscrições, pagamentos, cadastros, check-in, kits, pulseiras, camisas, pós-evento.
6. Comunicação — Planejamento editorial, feed, stories, WhatsApp, reels, artes, textos, avisos, cronograma de divulgação.
7. Mídia e StoryMaker — Roteiro do dia, cobertura em tempo real, frases das ministrações, bastidores, fotos e vídeos, conteúdo pós-evento.
8. Louvor e Culto — Setlist, ensaios, passagem de som, letras, retornos, entradas e saídas, comunicação com a produção.
9. Intercessão — Sala de oração, escalas, cobertura espiritual, apoio às preletoras, lava-pés, momentos de oração.
10. Logística e Fluxo — Entrada, saída, portas, filas, banheiros, almoço, cantina, estacionamento, sinalização, caixa de som externa, comunicação por rádio.
11. Alimentação — Reservas, pagamentos, opções de refeições, identificação das participantes, organização das filas, equipe de distribuição, controle de estoque, limpeza.

O evento acontece em 21 de novembro de 2026. É uma conferência cristã feminina com ~1000 participantes.

Áreas operacionais disponíveis no sistema (use EXATAMENTE uma destas chaves no campo "area"):
${AREA_KEYS.join(', ')}

TAREFAS JÁ EXISTENTES (NÃO repita estas — analise as lacunas):
${resumoExistente}

${contexto ? `Demanda/Contexto adicional da gestora: ${contexto}` : 'Nenhuma demanda específica — faça uma varredura geral de lacunas.'}

Analise criticamente: o que está faltando? Quais setores estão com poucas tarefas? Quais riscos não estão cobertos? Quais dependências não estão mapeadas?

Gere entre 8 e 15 tarefas NOVAS que preencham as lacunas identificadas. Cada tarefa deve incluir risco e plano de contingência na descrição.

Retorne um JSON com esta estrutura exata:
{
  "tarefas": [
    {
      "titulo": "Título conciso e específico da tarefa (com verbo de ação)",
      "descricao": "Inclua: o que fazer, responsável, dependência, evidência de conclusão, risco e plano de contingência.",
      "area": "chave_da_area",
      "prazo": "YYYY-MM-DD ou null",
      "prioridade": "alta|media|baixa",
      "impacto": "alto|medio|baixo"
    }
  ]
}

Priorize o que gera receita, inscrições, reduz custos ou protege a experiência. Inclua prazos realistas considerando que o evento é em 21/nov/2026.`;

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
                    descricao: { type: 'string' },
                    area: { type: 'string' },
                    prazo: { type: 'string' },
                    prioridade: { type: 'string' },
                    impacto: { type: 'string' },
                  },
                },
              },
            },
          },
        });

        lista = (res?.tarefas || []).filter(t => t.titulo && AREA_KEYS.includes(t.area));
      }

      setSugestoes(lista);
      setSelecionadas(new Set(lista.map((_, i) => i)));
    } catch (e) {
      setErro(e.message || 'Erro ao gerar sugestões');
    }
    setLoading(false);
  }

  function toggleSel(idx) {
    setSelecionadas(prev => {
      const n = new Set(prev);
      if (n.has(idx)) n.delete(idx); else n.add(idx);
      return n;
    });
  }

  async function importarSelecionadas() {
    setImportando(true);
    const selecionadasList = [...selecionadas].map(i => sugestoes[i]).filter(Boolean);
    try {
      if (modo === 'subtarefas' && tarefaAlvo) {
        // Adiciona como itens de checklist na tarefa existente
        const checklistAtual = tarefaAlvo.checklist || [];
        const novosItens = selecionadasList.map(s => ({
          id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
          texto: s.texto,
          concluido: false,
        }));
        await base44.entities.EventoM31Tarefa.update(tarefaAlvo.id, {
          checklist: [...checklistAtual, ...novosItens],
        });
      } else {
        // Cria novas tarefas
        await base44.entities.EventoM31Tarefa.bulkCreate(
          selecionadasList.map(t => ({
            titulo: t.titulo,
            descricao: t.descricao || '',
            area: t.area,
            prazo: t.prazo || undefined,
            prioridade: t.prioridade || 'media',
            impacto: t.impacto || 'medio',
            status: 'a_fazer',
            criado_por_email: userEmail,
          }))
        );
      }
      onImport?.(selecionadasList.length);
      onClose();
    } catch (e) {
      setErro('Erro ao importar: ' + (e.message || 'desconhecido'));
    }
    setImportando(false);
  }

  const inputStyle = {
    width: '100%', padding: '9px 12px', background: T.input, border: `1.5px solid ${T.inputB}`,
    borderRadius: TOKENS.radius.md, fontSize: '13px', color: T.text, outline: 'none',
    fontFamily: TOKENS.font.body, boxSizing: 'border-box',
  };

  const podeGerar = modo === 'subtarefas' ? !!tarefaAlvoId : true;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: TOKENS.radius.xl, width: '640px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: T.shadowLg }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: TOKENS.radius.md, background: T.primarySoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={16} color={T.primary} />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Sugestões por IA</div>
              <div style={{ fontSize: '12px', color: T.muted }}>
                {modo === 'subtarefas' ? 'Decompõe uma tarefa em subtarefas (checklist)' : 'Novas tarefas com base nas existentes'}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.muted, padding: '4px' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {/* Segmented: modo */}
          {sugestoes.length === 0 && !loading && (
            <>
              <div style={{ display: 'flex', gap: '0', marginBottom: '16px', background: T.card2, borderRadius: TOKENS.radius.md, padding: '3px' }}>
                <button onClick={() => setModo('novas')} style={{
                  flex: 1, padding: '9px', border: 'none', borderRadius: TOKENS.radius.sm,
                  background: modo === 'novas' ? T.card : 'transparent', color: modo === 'novas' ? T.text : T.muted,
                  fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: TOKENS.font.body,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  boxShadow: modo === 'novas' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none', transition: 'all .15s',
                }}>
                  <Lightbulb size={14} /> Novas tarefas
                </button>
                <button onClick={() => setModo('subtarefas')} style={{
                  flex: 1, padding: '9px', border: 'none', borderRadius: TOKENS.radius.sm,
                  background: modo === 'subtarefas' ? T.card : 'transparent', color: modo === 'subtarefas' ? T.text : T.muted,
                  fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: TOKENS.font.body,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  boxShadow: modo === 'subtarefas' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none', transition: 'all .15s',
                }}>
                  <ListChecks size={14} /> Subtarefas
                </button>
              </div>

              {/* Seleção de tarefa alvo (modo subtarefas) */}
              {modo === 'subtarefas' && (
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: T.muted, display: 'block', marginBottom: '6px' }}>
                    Tarefa para decompor
                  </label>
                  {tarefasQ.isLoading ? (
                    <div style={{ fontSize: '12px', color: T.muted, padding: '9px 0' }}>Carregando tarefas…</div>
                  ) : tarefas.length === 0 ? (
                    <div style={{ fontSize: '12px', color: T.muted, padding: '9px 0' }}>Nenhuma tarefa cadastrada ainda.</div>
                  ) : (
                    <div style={{ position: 'relative' }}>
                      <select value={tarefaAlvoId} onChange={e => setTarefaAlvoId(e.target.value)} style={{ ...inputStyle, appearance: 'none', WebkitAppearance: 'none', paddingRight: '30px', cursor: 'pointer' }}>
                        <option value="">Selecione uma tarefa…</option>
                        {tarefas.map(t => (
                          <option key={t.id} value={t.id}>
                            {(t.titulo || '').slice(0, 60)} — {TAREFA_AREA_BY_KEY[t.area]?.label?.split('/')[0]?.trim() || t.area}
                          </option>
                        ))}
                      </select>
                      <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: T.muted }}>▾</span>
                    </div>
                  )}
                  {tarefaAlvo && (
                    <div style={{ marginTop: '8px', padding: '10px 12px', background: T.primarySoft, border: `1px solid ${T.primary}22`, borderRadius: TOKENS.radius.md, fontSize: '12px', color: T.sec }}>
                      <strong style={{ color: T.text }}>{tarefaAlvo.titulo}</strong>
                      {tarefaAlvo.descricao && <div style={{ marginTop: '3px', fontSize: '11px' }}>{tarefaAlvo.descricao}</div>}
                      {(tarefaAlvo.checklist || []).length > 0 && (
                        <div style={{ marginTop: '5px', fontSize: '11px', color: T.muted }}>Já tem {tarefaAlvo.checklist.length} item(ns) no checklist.</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Contexto adicional */}
              <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: T.muted, display: 'block', marginBottom: '6px' }}>
                Contexto adicional (opcional)
              </label>
              <textarea
                style={{ ...inputStyle, minHeight: '60px', resize: 'vertical', marginBottom: '14px' }}
                value={contexto}
                onChange={e => setContexto(e.target.value)}
                placeholder={modo === 'subtarefas'
                  ? 'Ex: Esta tarefa envolve fornecedores externos, preciso de etapas de validação…'
                  : 'Ex: Estamos com atraso na identidade visual, preciso de foco em marketing…'}
              />

              {/* Info de contexto */}
              {modo === 'novas' && (
                <div style={{ marginBottom: '14px', padding: '10px 12px', background: T.card2, border: `1px solid ${T.border}`, borderRadius: TOKENS.radius.md, fontSize: '11px', color: T.muted }}>
                  ℹ️ A IA analisará <strong style={{ color: T.sec }}>{tarefas.length} tarefa(s) existente(s)</strong> para sugerir apenas o que falta — sem duplicar.
                </div>
              )}

              <button onClick={gerarSugestoes} disabled={!podeGerar} style={{
                width: '100%', padding: '12px', background: podeGerar ? T.primary : T.inputB, border: 'none',
                borderRadius: TOKENS.radius.md, color: T.onPrimary, fontSize: '14px', fontWeight: '600',
                cursor: podeGerar ? 'pointer' : 'not-allowed', fontFamily: TOKENS.font.body,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                opacity: podeGerar ? 1 : 0.5,
              }}>
                <Sparkles size={16} /> Gerar sugestões
              </button>
            </>
          )}

          {loading && (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <Loader size={24} color={T.primary} style={{ animation: 'spin 1s linear infinite' }} />
              <div style={{ fontSize: '13px', color: T.muted, marginTop: '12px' }}>
                {modo === 'subtarefas' ? 'Decompondo tarefa em subtarefas…' : 'Analisando tarefas existentes e gerando sugestões…'}
              </div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {erro && (
            <div style={{ padding: '12px', background: TOKENS.dangerSoft, border: `1px solid ${TOKENS.danger}33`, borderRadius: TOKENS.radius.md, fontSize: '13px', color: TOKENS.danger, marginBottom: '14px' }}>
              {erro}
            </div>
          )}

          {/* Sugestões */}
          {sugestoes.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '12px', color: T.muted }}>
                  {selecionadas.size} de {sugestoes.length} selecionada{selecionadas.length !== 1 ? 's' : ''}
                </span>
                <button onClick={() => setSelecionadas(new Set(sugestoes.map((_, i) => i)))} style={{ background: 'none', border: 'none', color: T.primary, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                  Selecionar todas
                </button>
              </div>

              {/* Badge do modo atual */}
              <div style={{ marginBottom: '10px', fontSize: '11px', fontWeight: '600', color: modo === 'subtarefas' ? T.primary : T.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {modo === 'subtarefas' && tarefaAlvo ? `Subtarefas de: ${tarefaAlvo.titulo?.slice(0, 50)}` : 'Novas tarefas sugeridas'}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                {sugestoes.map((s, i) => {
                  const sel = selecionadas.has(i);
                  return (
                    <div key={i} onClick={() => toggleSel(i)} style={{
                      display: 'flex', gap: '10px', padding: '10px 12px', background: sel ? T.primarySoft : T.card2,
                      border: `1px solid ${sel ? T.primary : T.border}`, borderRadius: TOKENS.radius.md, cursor: 'pointer',
                    }}>
                      <div style={{
                        width: '18px', height: '18px', borderRadius: TOKENS.radius.sm, flexShrink: 0, marginTop: '1px',
                        border: sel ? 'none' : `1.5px solid ${T.inputB}`, background: sel ? T.success : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {sel && <Check size={11} color={T.onPrimary} strokeWidth={3} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {modo === 'subtarefas' ? (
                          <>
                            <div style={{ fontSize: '13px', fontWeight: '500', color: T.text }}>{s.texto}</div>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                              {s.prazo && <span style={{ fontSize: '10px', color: T.muted, background: T.card, padding: '1px 7px', borderRadius: TOKENS.radius.xs }}>📅 {fmtPrazo(s.prazo)}</span>}
                              {s.prioridade && <span style={{ fontSize: '10px', color: s.prioridade === 'alta' ? TOKENS.danger : s.prioridade === 'media' ? TOKENS.warning : T.muted, fontWeight: '600' }}>{s.prioridade}</span>}
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ fontSize: '13px', fontWeight: '600', color: T.text, marginBottom: '3px' }}>{s.titulo}</div>
                            {s.descricao && <div style={{ fontSize: '11px', color: T.sec, marginBottom: '5px' }}>{s.descricao}</div>}
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {s.area && (() => {
                                const area = TAREFA_AREA_BY_KEY[s.area] || TAREFA_AREAS[0];
                                return <span style={{ background: area.bg, color: area.text, borderRadius: TOKENS.radius.xs, padding: '1px 7px', fontSize: '10px', fontWeight: '500' }}>{area.label.split('/')[0].trim()}</span>;
                              })()}
                              {s.prazo && <span style={{ fontSize: '10px', color: T.muted, background: T.card, padding: '1px 7px', borderRadius: TOKENS.radius.xs }}>📅 {fmtPrazo(s.prazo)}</span>}
                              {s.prioridade && <span style={{ fontSize: '10px', color: s.prioridade === 'alta' ? TOKENS.danger : s.prioridade === 'media' ? TOKENS.warning : T.muted, fontWeight: '600' }}>{s.prioridade}</span>}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Ações */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={gerarSugestoes} disabled={importando} style={{
                  flex: 1, padding: '10px', background: 'transparent', border: `1px solid ${T.inputB}`,
                  borderRadius: TOKENS.radius.md, color: T.sec, fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: TOKENS.font.body,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                }}>
                  <Sparkles size={14} /> Gerar novamente
                </button>
                <button onClick={importarSelecionadas} disabled={selecionadas.size === 0 || importando} style={{
                  flex: 1, padding: '10px', background: T.primary, border: 'none',
                  borderRadius: TOKENS.radius.md, color: T.onPrimary, fontSize: '13px', fontWeight: '600',
                  cursor: selecionadas.size === 0 || importando ? 'not-allowed' : 'pointer', fontFamily: TOKENS.font.body,
                  opacity: selecionadas.size === 0 || importando ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                }}>
                  {importando ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : (modo === 'subtarefas' ? <ListChecks size={14} /> : <Plus size={14} />)}
                  {importando ? 'Importando…' : (modo === 'subtarefas'
                    ? `Adicionar ${selecionadas.size} subtarefa${selecionadas.size !== 1 ? 's' : ''}`
                    : `Importar ${selecionadas.size} tarefa${selecionadas.size !== 1 ? 's' : ''}`)}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}