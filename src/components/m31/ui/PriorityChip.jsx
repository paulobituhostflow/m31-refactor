/**
 * PriorityChip — chip canônico de prioridade.
 * Consome PRIORITY do m31Enums (única fonte de rótulos/cores).
 */
import Badge from './Badge';
import { PRIORITY } from '@/lib/m31Enums';

export default function PriorityChip({ value, size }) {
  const cfg = PRIORITY[value] || { label: value, variant: 'neutral' };
  return <Badge label={cfg.label} variant={cfg.variant} size={size} />;
}