/**
 * operationalRules — PROJEÇÃO do veredito canônico para o painel operacional.
 *
 * NÃO decide mais nada: o estado é lido de `estado_canonico`, gravado por
 * m31ConciliacaoCanonica. Antes existia aqui uma segunda regra de evidência
 * financeira que divergia do frontend — era uma das causas de "cada tela um
 * número". Agora é só tradução de vocabulário:
 *
 *   confirmada / isenta            → official        (vaga oficial)
 *   pendente                       → pending         (aguardando pagamento)
 *   pendente + checkout_abandonado  → recovery       (subfatia de pendente)
 *   revisar                        → reconciliation  (decisão humana)
 *   fora_do_universo               → audit           (não disputa vaga)
 */

export const CONFIRMED_STATUSES = new Set(['aprovado', 'gratuito']);
export const PENDING_STATUSES = new Set(['pendente', 'checkout_pendente']);
export const OPERATIONAL_TYPES = new Set(['publico_geral', 'voluntario', 'caravana']);

/** Registro ainda sem veredito (criado após a última conciliação) nunca é
 *  promovido a vaga oficial: vai para conferência. */
function estadoCanonico(row) {
  if (row.status_pagamento === 'cancelado' || row.duplicada_de_id || row.classificacao_registro === 'teste' ||
      !OPERATIONAL_TYPES.has(row.tipo)) return 'fora_do_universo';
  if (row.estado_canonico) return row.estado_canonico;
  if (CONFIRMED_STATUSES.has(row.status_pagamento)) return 'revisar';
  if (row.status_pagamento === 'cancelado') return 'fora_do_universo';
  if (!OPERATIONAL_TYPES.has(row.tipo)) return 'fora_do_universo';
  return 'pendente';
}

export function bucketFor(row) {
  const estado = estadoCanonico(row);
  if (estado === 'confirmada' || estado === 'isenta') return 'official';
  if (estado === 'revisar') return 'reconciliation';
  if (estado === 'fora_do_universo') return 'audit';
  return row.status_pagamento === 'checkout_abandonado' ? 'recovery' : 'pending';
}

export function classifyOperationalData({ inscricoes = [] }) {
  inscricoes = [...new Map(inscricoes.map(row => [row.id,row])).values()];
  const bucketById = {};
  for (const row of inscricoes) bucketById[row.id] = bucketFor(row);

  const officialSeats = inscricoes.filter((row) => bucketById[row.id] === 'official');
  const count = (bucket) => Object.values(bucketById).filter((value) => value === bucket).length;

  // Duplicidade já foi resolvida pela identidade comprovada e pela matriz auditada,
  // nunca por CPF/telefone/nome isolados: as cópias não canônicas saem do universo com rastro em
  // duplicada_de_id. Aqui só reportamos o que exige decisão humana.
  const conflicts = inscricoes
    .filter((row) => bucketById[row.id] === 'reconciliation')
    .map((row) => ({ reason: row.evidencia_canonica || 'revisao_pendente', key: row.id, ids: [row.id] }));

  return {
    counts: {
      oficiais_conciliadas: count('official'),
      em_conciliacao: count('reconciliation'),
      pendentes_pagamento: count('pending'),
      recuperacao: count('recovery'),
      auditoria: count('audit'),
    },
    bucketById,
    officialSeats,
    conflicts,
  };
}