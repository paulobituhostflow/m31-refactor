/**
 * StatusChip — chip canônico de status a partir de um enum map.
 * Uso: <StatusChip value={t.status} enumMap={TASK_STATUS} />
 *      <StatusChip value={p.status_pagamento} enumMap={PAYMENT_STATUS} />
 */
import Badge from './Badge';

export default function StatusChip({ value, enumMap, size }) {
  const cfg = (enumMap && enumMap[value]) || { label: value, variant: 'neutral' };
  return <Badge label={cfg.label} variant={cfg.variant} size={size} />;
}