/**
 * Taxonomia oficial de áreas de EventoM31Tarefa (M31 Filhas 2026).
 * Campo único `area` — o macro é apenas rótulo separador visual no dropdown.
 */
export const TAREFA_AREA_GRUPOS = [
  {
    macro: 'GESTÃO',
    areas: [
      { key: 'coordenacao_geral', label: 'Coordenação Geral', color: '#7C3AED' },
      { key: 'financeiro_admin', label: 'Financeiro & Admin', color: '#0D9488' },
    ],
  },
  {
    macro: 'OPERACIONAL',
    areas: [
      { key: 'credenciamento_checkin', label: 'Credenciamento & Check-in', color: '#2563EB' },
      { key: 'recepcao_acolhimento', label: 'Recepção & Acolhimento', color: '#DB2777' },
      { key: 'alimentacao_cantina', label: 'Alimentação & Cantina', color: '#EA580C' },
      { key: 'voluntariado_escalas', label: 'Voluntariado & Escalas', color: '#16A34A' },
      { key: 'caravanas_transporte', label: 'Caravanas & Transporte', color: '#0891B2' },
      { key: 'lojinha_servicos', label: 'Lojinha & Serviços Gerais', color: '#CA8A04' },
    ],
  },
  {
    macro: 'LOGÍSTICA & FLUXO',
    areas: [
      { key: 'infraestrutura_logistica', label: 'Infraestrutura & Logística', color: '#F97316' },
      { key: 'sinalizacao_seguranca', label: 'Sinalização & Segurança', color: '#DC2626' },
    ],
  },
  {
    macro: 'TÉCNICA & PRODUÇÃO',
    areas: [
      { key: 'palco_producao', label: 'Palco & Produção', color: '#9333EA' },
      { key: 'estrutura_montagem_ti', label: 'Estrutura, Montagem & TI', color: '#475569' },
    ],
  },
  {
    macro: 'COMUNICAÇÃO & MÍDIA',
    areas: [
      { key: 'marketing', label: 'Marketing', color: '#8B1A2B' },
      { key: 'midias_cobertura', label: 'Mídias & Cobertura', color: '#D97706' },
    ],
  },
  {
    macro: 'EXPERIÊNCIA ESPIRITUAL',
    areas: [
      { key: 'intercessao', label: 'Intercessão', color: '#3B82F6' },
      { key: 'louvor', label: 'Louvor', color: '#14B8A6' },
      { key: 'sala_pastoral_lavapes', label: 'Sala Pastoral & Lava-pés', color: '#BE185D' },
      { key: 'preletoras_espaco_filhas', label: 'Preletoras & Espaço Filhas', color: '#A855F7' },
    ],
  },
];

/** Lista plana com estilos derivados (dot/bg/text) para chips e legendas */
export const TAREFA_AREAS = TAREFA_AREA_GRUPOS.flatMap(g =>
  g.areas.map(a => ({ ...a, macro: g.macro, dot: a.color, bg: `${a.color}14`, text: a.color }))
);

export const TAREFA_AREA_BY_KEY = Object.fromEntries(TAREFA_AREAS.map(a => [a.key, a]));

/** Área default para novas tarefas / registros sem área */
export const TAREFA_AREA_DEFAULT = 'coordenacao_geral';

/** Mapeamento de migração dos valores legados (schema antigo) → taxonomia nova */
export const MIGRACAO_AREAS_LEGADO = {
  geral: 'coordenacao_geral',        // Coordenação Geral
  oracao: 'intercessao',             // Intercessão
  comunicacao: 'louvor',             // Louvor
  voluntarios: 'marketing',          // Marketing
  financeiro: 'midias_cobertura',    // Mídias → Mídias & Cobertura
  logistica: 'infraestrutura_logistica', // Logística → Infraestrutura & Logística
  checkin: 'credenciamento_checkin',
  recepcao: 'recepcao_acolhimento',
};