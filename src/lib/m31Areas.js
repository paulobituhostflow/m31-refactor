/**
 * SEED M31 — 7 áreas oficiais + frentes confirmadas.
 * Fonte de verdade em runtime: entidades M31Area / M31Frente.
 * Este arquivo serve apenas como seed/bootstrap e fallback de renderização
 * antes das entidades carregarem. NUNCA manter taxonomia paralela em runtime.
 *
 * Paleta visual: cada área tem sua cor identidade própria.
 */

/**
 * Cores oficiais das 7 áreas M31.
 * Usada por SectorBadge, AreaCard, FrenteCard e qualquer componente
 * que precise da identidade visual da área.
 */
export const AREA_COLORS = {
  coordenacao:  { solid: '#7C3AED', soft: 'rgba(124,58,237,0.08)', text: '#6D28D9' }, // 🟣 roxo
  inscricoes:   { solid: '#2563EB', soft: 'rgba(37,99,235,0.08)', text: '#1D4ED8' },  // 🔵 azul
  logistica:    { solid: '#16A34A', soft: 'rgba(22,163,74,0.08)', text: '#15803D' },  // 🟢 verde
  midia:        { solid: '#EA580C', soft: 'rgba(234,88,12,0.08)', text: '#C2410C' },  // 🟠 laranja
  lojinha:      { solid: '#CA8A04', soft: 'rgba(202,138,4,0.08)', text: '#A16207' }, // 🟡 amarelo
  louvor:       { solid: '#DC2626', soft: 'rgba(220,38,38,0.08)', text: '#B91C1C' },  // 🔴 vermelho
  intercessao:  { solid: '#6D28D9', soft: 'rgba(109,40,217,0.08)', text: '#5B21B6' }, // 🟤 roxo escuro
};

export const SEED_AREAS = [
  { slug: 'coordenacao', nome: 'Coordenação', descricao: 'Guarda-chuva da coordenação geral do evento.', icone: 'ShieldCheck', exige_frente: false, ordem: 1 },
  { slug: 'inscricoes', nome: 'Inscrições', descricao: 'Fluxo de inscrição, recepção e credenciamento das participantes.', icone: 'Users', exige_frente: true, ordem: 2 },
  { slug: 'logistica', nome: 'Logística', descricao: 'Infraestrutura, programação, palco e alimentação.', icone: 'Truck', exige_frente: true, ordem: 3 },
  { slug: 'midia', nome: 'Mídia', descricao: 'Comunicação, cobertura e produção de conteúdo.', icone: 'Clapperboard', exige_frente: false, ordem: 4 },
  { slug: 'lojinha', nome: 'Lojinha', descricao: 'Lojinha e serviços gerais.', icone: 'ShoppingBag', exige_frente: false, ordem: 5 },
  { slug: 'louvor', nome: 'Louvor', descricao: 'Louvor e adoração.', icone: 'Music', exige_frente: false, ordem: 6 },
  { slug: 'intercessao', nome: 'Intercessão', descricao: 'Intercessão e vida espiritual.', icone: 'HeartHandshake', exige_frente: false, ordem: 7 },
];

export const SEED_FRENTE_PADRAO = {
  lider_perfil: 'Líder da Frente',
};

// Frentes confirmadas — slug da área → array de frentes
export const SEED_FRENTE = [
  { area_slug: 'coordenacao', slug: 'experiencia_imersao', nome: 'Experiência e Imersão', descricao: 'Curadoria da jornada espiritual e imersão das participantes.', ordem: 1 },
  { area_slug: 'inscricoes', slug: 'recepcao', nome: 'Recepção', descricao: 'Recepção e acolhimento das participantes.', ordem: 1 },
  { area_slug: 'inscricoes', slug: 'credenciamento', nome: 'Credenciamento', descricao: 'Credenciamento e check-in no dia do evento.', ordem: 2 },
  { area_slug: 'logistica', slug: 'programacao_palco', nome: 'Programação e Palco', descricao: 'Programação, direção de palco e condução do culto.', ordem: 1 },
  { area_slug: 'logistica', slug: 'infraestrutura', nome: 'Infraestrutura', descricao: 'Montagem, sinalização e estrutura física.', ordem: 2 },
  { area_slug: 'logistica', slug: 'alimentacao', nome: 'Alimentação', descricao: 'Cantina, food trucks e alimentação geral.', ordem: 3 },
  { area_slug: 'midia', slug: 'comunicacao_midia', nome: 'Comunicação e Mídia', descricao: 'Cobertura, redes sociais e produção de conteúdo. Em refinamento.', status_definicao: 'em_refinamento', ordem: 1 },
];

/**
 * Camada de compatibilidade: mapeia os 18 setores legados (campo `area` em
 * EventoM31Tarefa) para os slugs das 7 áreas oficiais (M31Area).
 * Usada APENAS para renderização quando a tarefa ainda não possui area_id.
 * Não altera os dados — a classificação real (atribuir area_id) é manual.
 * Tarefas cujo setor legado não consta aqui caem em "A classificar".
 */
export const LEGACY_AREA_TO_NEW_SLUG = {
  coordenacao_geral:        'coordenacao',
  financeiro_admin:         'coordenacao',
  voluntariado_escalas:     'coordenacao',
  preletoras_espaco_filhas: 'coordenacao',
  credenciamento_checkin:   'inscricoes',
  recepcao_acolhimento:     'inscricoes',
  caravanas_transporte:     'inscricoes',
  alimentacao_cantina:      'logistica',
  infraestrutura_logistica: 'logistica',
  sinalizacao_seguranca:    'logistica',
  palco_producao:           'logistica',
  estrutura_montagem_ti:    'logistica',
  marketing:                'midia',
  midias_cobertura:         'midia',
  lojinha_servicos:         'lojinha',
  intercessao:              'intercessao',
  louvor:                   'louvor',
  sala_pastoral_lavapes:    'intercessao',
};

/** Área default para novas tarefas */
export const AREA_DEFAULT_SLUG = 'coordenacao';

/** Lookup helper para fallback de renderização (antes das entidades carregarem) */
export const AREA_LOOKUP_FALLBACK = Object.fromEntries(SEED_AREAS.map(a => [a.slug, a]));