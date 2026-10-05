import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import GhostSugestao from './GhostSugestao';
import { TOKENS as T } from '@/lib/m31DesignTokens';
import { Sparkles, ChevronDown, Loader2 } from 'lucide-react';

/**
 * GhostSugestaoList — lista lazy de sugestões da IA.
 * Só disca o LLM quando o usuário expande. Cache de 10 min.
 * Sugestões não entram no progresso, contagens, filtros ou notificações.
 */
export default function GhostSugestaoList({ area, frente, tarefasExistentes, onAceitar, canEdit, autoExpand }) {
  const [expanded, setExpanded] = useState(!!autoExpand);
  const [descartadas, setDescartadas] = useState([]);

  const { data: sugestoes = [], isLoading } = useQuery({
    queryKey: ['ghost-sugestoes', area?.slug, frente?.slug || 'area-geral'],
    queryFn: async () => {
      const titulosExistentes = tarefasExistentes.map(t => t.titulo).filter(Boolean);
      const prompt = `Você é um especialista em organização do evento M31 (Mulheres 31), um congresso cristão feminino com milhares de participantes.

Contexto atual:
- Área: "${area?.nome || 'N/A'}"
- Frente: "${frente?.nome || 'Geral da área'}"

Tarefas já existentes nesta seção:
${titulosExistentes.length > 0 ? titulosExistentes.map((t, i) => `${i + 1}. ${t}`).join('\n') : 'Nenhuma tarefa ainda.'}

Sugira 3 tarefas operacionais relevantes que AINDA NÃO EXISTEM. Evite duplicatas ou variações semelhantes ao que já existe. Seja específica e prática.

Para cada sugestão, inclua um título curto, uma descrição breve e um checklist de microações (2-4 itens).

Retorne JSON: { "sugestoes": [{ "titulo": "...", "descricao": "...", "checklist": ["item1", "item2"] }] }`;

      const res = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            sugestoes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  titulo: { type: 'string' },
                  descricao: { type: 'string' },
                  checklist: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
      });
      return res.sugestoes || [];
    },
    enabled: !!area && expanded,
    staleTime: 600000,
  });

  // Filter duplicates against existing tasks + descartadas
  const sugestoesFiltradas = useMemo(() => {
    const titulosLower = tarefasExistentes.map(t => t.titulo?.toLowerCase()).filter(Boolean);
    return sugestoes.filter(s => {
      const sLower = s.titulo?.toLowerCase() || '';
      if (descartadas.includes(sLower)) return false;
      return !titulosLower.some(t => t.includes(sLower) || sLower.includes(t));
    });
  }, [sugestoes, tarefasExistentes, descartadas]);

  if (!canEdit) return null;

  return (
    <div style={{ padding: '4px 16px 6px 52px' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: T.textMuted, fontSize: '12px', fontWeight: '600',
          fontFamily: T.font.body, padding: '4px 0',
        }}
      >
        <Sparkles size={13} color={T.primary} />
        Sugestões da IA
        {sugestoesFiltradas.length > 0 && ` (${sugestoesFiltradas.length})`}
        <ChevronDown size={13} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
      </button>
      {expanded && isLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 0', color: T.textMuted, fontSize: '12px' }}>
          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Analisando contexto...
        </div>
      )}
      {expanded && !isLoading && sugestoesFiltradas.length === 0 && (
        <div style={{ padding: '8px 0', color: T.textSubtle || T.textMuted, fontSize: '12px' }}>
          Nenhuma sugestão no momento — todas as tarefas relevantes já existem.
        </div>
      )}
      {expanded && !isLoading && sugestoesFiltradas.map((s, i) => (
        <GhostSugestao
          key={i}
          sugestao={s}
          onAdicionar={(sug) => onAceitar(sug)}
          onEditar={(sug) => onAceitar(sug)}
          onDescartar={(sug) => setDescartadas(prev => [...prev, sug.titulo?.toLowerCase()])}
        />
      ))}
    </div>
  );
}