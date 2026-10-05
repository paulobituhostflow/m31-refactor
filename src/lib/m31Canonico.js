/**
 * m31Canonico — REGRA ÚNICA de contagem de vagas.
 *
 * Fonte de verdade: o campo `estado_canonico`, calculado exclusivamente por
 * m31ConciliacaoCanonica. Nenhuma tela, KPI, filtro ou exportação pode derivar
 * "quantas inscritas temos" a partir de `status_pagamento`.
 *
 * Motivo (medido em 14/09/2026 sobre 1.052 registros):
 *   contagem por status_pagamento .... 436 confirmadas / R$ 48.351,80
 *   contagem canônica ................ 307 confirmadas / R$ 33.884,83
 *   → 181 registros eram contados como pagos sem evidência financeira
 *     (147 estão em `revisar`) e 11 canônicos ficavam de fora.
 *
 * `status_pagamento` continua existindo e sendo exibido: ele descreve o
 * andamento do pagamento, NÃO prova a vaga.
 */

export const CANONICO = {
  confirmada:      { label: 'Confirmada paga', variant: 'success' },
  isenta:          { label: 'Isenta',          variant: 'success' },
  pendente:        { label: 'Em pagamento',    variant: 'warning' },
  revisar:         { label: 'Em revisão',      variant: 'info'    },
  fora_do_universo:{ label: 'Fora do universo',variant: 'neutral' },
  sem_veredito:    { label: 'Sem veredito',    variant: 'danger'  },
};

/** Estado canônico do registro. Ausência de veredito NUNCA vira vaga. */
export function estadoCanonico(i) {
  return i?.estado_canonico || 'sem_veredito';
}

/** Vaga oficial = confirmada por evidência OU isenta de cobrança. */
export function ehVagaOficial(i) {
  const e = estadoCanonico(i);
  return e === 'confirmada' || e === 'isenta';
}

/** Valor total da compra — asaas_total_value tem prioridade sobre a parcela. */
export function valorTotal(i) {
  return Number(i?.asaas_total_value || i?.valor_pago || 0);
}

/** Receita comprovada: soma apenas de quem tem evidência financeira. */
export function receitaConfirmada(list) {
  return (list || [])
    .filter(i => estadoCanonico(i) === 'confirmada')
    .reduce((s, i) => s + valorTotal(i), 0);
}

/** Contagem por estado canônico. A soma explica 100% dos registros. */
export function contarCanonico(list) {
  const base = { confirmada: 0, isenta: 0, pendente: 0, revisar: 0, fora_do_universo: 0, sem_veredito: 0 };
  for (const i of list || []) base[estadoCanonico(i)]++;
  return { ...base, vagas_oficiais: base.confirmada + base.isenta, total: (list || []).length };
}

/** Opções de filtro por universo canônico. */
export const CANONICO_OPTIONS = [
  { val: 'vagas_oficiais',   label: 'Vagas oficiais' },
  { val: 'confirmada',       label: 'Confirmadas pagas' },
  { val: 'isenta',           label: 'Isentas' },
  { val: 'pendente',         label: 'Em pagamento' },
  { val: 'revisar',          label: 'Em revisão' },
  { val: 'fora_do_universo', label: 'Fora do universo' },
  { val: 'sem_veredito',     label: 'Sem veredito' },
];

/** Aplica o filtro de universo canônico a uma lista. */
export function filtrarCanonico(list, filtro) {
  if (!filtro) return list;
  if (filtro === 'vagas_oficiais') return list.filter(ehVagaOficial);
  return list.filter(i => estadoCanonico(i) === filtro);
}