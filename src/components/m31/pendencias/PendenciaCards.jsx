/**
 * PendenciaCards — 8 cards no topo da Auditoria de Inscrições.
 */
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { TOKENS } from '@/lib/m31DesignTokens';

export default function PendenciaCards({ pendencias, resumoCamadas = {} }) {
  const total = pendencias.length;
  const contato = pendencias.filter(p => p.categorias.includes('cadastro') && (p.campos_ausentes.includes('telefone') || p.campos_ausentes.includes('email'))).length;
  const financeiro = pendencias.filter(p => p.categorias.includes('financeiro')).length;
  const origem = pendencias.filter(p => p.categorias.includes('origem')).length;
  const duplicidades = pendencias.filter(p => p.motivos.includes('possivel_duplicidade')).length;
  const presenteadas = pendencias.filter(p => p.motivos.includes('presenteada_incompleta') || p.motivos.includes('cadastro_presenteada_pendente')).length;
  const emAnalise = pendencias.filter(p => p.status_analise === 'em_analise').length;
  const resolvidas = pendencias.filter(p => p.status_analise === 'resolvido' || p.status_analise === 'corrigido').length;

  const [expanded, setExpanded] = useState(false);
  const pendentes = resumoCamadas.auditoria_real ?? pendencias.filter(p => p.auditoria_real?.length > 0 && !['resolvido','corrigido','descartado','em_analise'].includes(p.status_analise)).length;
  const principais = [['Pendentes reais', pendentes], ['Em análise', emAnalise], ['Resolvidos', resolvidas]];
  const extras = [['Inscritas reconhecidas', resumoCamadas.inscritas_reconhecidas ?? 0], ['Dados a completar', resumoCamadas.dados_a_completar ?? 0], ['Sugestões de conciliação', resumoCamadas.sugestoes_conciliacao ?? 0], ['Registros com qualquer apontamento', total], ['Financeiro', financeiro], ['Duplicidades', duplicidades]];

  return (
    <div style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: TOKENS.radius.lg, marginBottom: 12, boxShadow: TOKENS.shadowSm, overflow: 'hidden' }}>
      <button onClick={() => setExpanded(v => !v)} style={{ width: '100%', border: 0, background: 'transparent', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: TOKENS.textSubtle, textTransform: 'uppercase' }}>Resumo da auditoria</span>
        {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderTop: `1px solid ${TOKENS.borderSubtle}` }}>
        {principais.map(([label,value]) => <div key={label} style={{ padding: '10px 8px', textAlign: 'center', borderRight: `1px solid ${TOKENS.borderSubtle}` }}><div style={{ fontSize: 20, fontWeight: 800 }}>{value}</div><div style={{ fontSize: 10, color: TOKENS.textMuted }}>{label}</div></div>)}
      </div>
      {expanded && <div style={{ padding: 10, borderTop: `1px solid ${TOKENS.borderSubtle}`, display: 'flex', gap: 6, flexWrap: 'wrap' }}>{extras.map(([label,value]) => <span key={label} style={{ padding: '5px 8px', borderRadius: 8, background: TOKENS.surfaceSubtle, fontSize: 11, color: TOKENS.textMuted }}><b style={{ color: TOKENS.text }}>{value}</b> {label}</span>)}</div>}
    </div>
  );
}