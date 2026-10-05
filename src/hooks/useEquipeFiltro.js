import { useMemo } from 'react';

// ── EQUIPES OPERACIONAIS ───────────────────────────────────
// Mapeamento entre os times visuais e os valores do campo "area"
// que já existe em EventoM31Tarefa (e "setor" em EventoM31Membro).
// "Geral" (area: null) exibe todos os registros.
export const EQUIPES = [
  { value: 'geral',          label: 'Geral',           area: null },
  { value: 'recepcao',       label: 'Recepção',        area: 'recepcao' },
  { value: 'credenciamento', label: 'Credenciamento',  area: 'checkin' },
  { value: 'infraestrutura', label: 'Infraestrutura',  area: 'logistica' },
  { value: 'producao_palco', label: 'Produção/Palco',  area: 'comunicacao' },
];

export const EQUIPE_MAP = Object.fromEntries(EQUIPES.map(e => [e.value, e]));

// Mapeamento de áreas do EventoM31ChecklistItem para equipes
export const CHECKLIST_AREA_TO_EQUIPE = {
  'ESTRUTURA': 'infraestrutura',
  'ALIMENTAR': 'infraestrutura',
  'EFETIVO': 'credenciamento',
  'ARTE': 'producao_palco',
  'LOUVOR/PREGAÇÃO': 'producao_palco',
  'EXTRA': 'geral',
};

/**
 * Hook desacoplado: recebe dados brutos + equipeAtiva,
 * devolve os registros filtrados por área.
 * Funciona com qualquer entidade que tenha campo "area" ou "setor".
 */
export function useEquipeFiltro(dados, equipeAtiva) {
  const equipe = EQUIPE_MAP[equipeAtiva] || EQUIPES[0];
  const areaAlvo = equipe?.area;

  const filtrados = useMemo(() => {
    if (!areaAlvo) return dados;
    return dados.filter(item => (item.area || item.setor) === areaAlvo);
  }, [dados, areaAlvo]);

  return { filtrados, equipe };
}