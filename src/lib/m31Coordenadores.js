/**
 * Configuração de coordenadores para acesso simplificado (Gestão Rápida).
 * 
 * super_user: true → vê e edita TODAS as áreas
 * area_slug: string → filtra tarefas apenas da área correspondente
 * 
 * Áreas sem coordenador definido (Mídia, Lojinha) NÃO aparecem no seletor.
 * 
 * Slugs das áreas: coordenacao, inscricoes, logistica, midia, lojinha, louvor, intercessao
 */
export const COORDENADORES = [
  // ── Super-usuários (todas as áreas) ──
  { nome: 'Thalita', super_user: true },
  { nome: 'Wendel', super_user: true },
  { nome: 'Juliana Beltrão', super_user: true },
  { nome: 'Paulo', super_user: true },

  // ── Coordenadores por área ──
  { nome: 'Thaisa Videres', area_slug: 'inscricoes' },
  { nome: 'Dário', area_slug: 'louvor' },
  { nome: 'Pr. Eduardo', area_slug: 'intercessao' },

  // ── Áreas sem coordenador (NÃO aparecer no seletor) ──
  // Mídia — A definir
  // Lojinha — A definir
];