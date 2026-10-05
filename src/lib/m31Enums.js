/**
 * m31Enums — Fonte canônica de labels + variantes semânticas.
 * PriorityChip, StatusChip e Badge consomem estes maps.
 * NUNCA duplicar estes rótulos em componentes individuais.
 */
export const PRIORITY = {
  urgente: { label: 'Urgente',  variant: 'danger'  },
  alta:    { label: 'Alta',     variant: 'warning' },
  media:   { label: 'Média',    variant: 'info'    },
  baixa:   { label: 'Baixa',    variant: 'neutral' },
};

export const TASK_STATUS = {
  a_fazer:      { label: 'A Fazer',      variant: 'neutral' },
  em_andamento: { label: 'Em Andamento', variant: 'info'    },
  em_execucao:  { label: 'Em Execução',  variant: 'info'    },
  atencao:      { label: 'Atenção',      variant: 'warning' },
  atrasado:     { label: 'Atrasado',     variant: 'danger'  },
  critico:      { label: 'Crítico',      variant: 'danger'  },
  concluido:    { label: 'Concluído',    variant: 'success' },
  em_revisao:   { label: 'Em Revisão',   variant: 'info'    },
  bloqueado:    { label: 'Bloqueado',    variant: 'neutral' },
};

export const PAYMENT_STATUS = {
  aprovado:            { label: 'Confirmado',      variant: 'success' },
  gratuito:            { label: 'Gratuito',        variant: 'success' },
  pendente:            { label: 'Pendente',        variant: 'warning' },
  checkout_pendente:   { label: 'Checkout gerado', variant: 'info'    },
  checkout_abandonado: { label: 'Abandonado',      variant: 'danger'  },
  cancelado:           { label: 'Cancelado',       variant: 'neutral' },
};

export const SEMANTIC_VARIANTS = ['success', 'warning', 'danger', 'neutral', 'info'];

// Origem do pagamento — de onde veio o dinheiro (não é o mesmo que status).
// Toda inscrição aprovada precisa ter origem_pagamento. asaas exige payment_id; as demais não.
export const PAYMENT_ORIGIN = {
  asaas:        { label: 'Asaas',        variant: 'info'    },
  mercado_pago: { label: 'Mercado Pago', variant: 'info'    },
  pix_manual:   { label: 'Pix Manual',   variant: 'success' },
  importacao:   { label: 'Importação',   variant: 'neutral' },
  gratuidade:   { label: 'Gratuidade',   variant: 'success' },
  desconhecida: { label: 'Desconhecida', variant: 'danger'  },
};

export const PAYMENT_ORIGIN_OPTIONS = Object.entries(PAYMENT_ORIGIN).map(([val, m]) => ({ val, label: m.label }));