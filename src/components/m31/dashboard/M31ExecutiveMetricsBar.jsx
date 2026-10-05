/**
 * M31ExecutiveMetricsBar — 3 cards clicáveis com dados reais.
 * Cada card direciona para Participantes/Inscrições com filtro de status.
 * Usa StatCard canônico (dot + suffix para porcentagem).
 */
import StatCard from '@/components/m31/ui/StatCard';

export default function M31ExecutiveMetricsBar({ data = {}, onNavigate }) {
  const total = data.total || 1;
  const cards = [
    {
      dot: '#10B981',
      label: 'Inscritas reconhecidas',
      sub: `Headcount operacional · ${data.voluntarias || 0} voluntárias à parte`,
      value: data.inscritasReconhecidas ?? data.inscritas ?? 0,
      suffix: `(${Math.round(((data.inscritasReconhecidas ?? data.inscritas ?? 0) / total) * 100)}%)`,
      state: 'success',
      hero: true,
      onClick: () => onNavigate?.('participantes', { aba: 'inscricoes' }),
    },
    {
      dot: '#F59E0B',
      label: 'Cobranças pendentes',
      sub: 'obrigação financeira identificada',
      value: data.cobrancasPendentes ?? data.pagPendente ?? 0,
      suffix: `(${Math.round(((data.cobrancasPendentes ?? data.pagPendente ?? 0) / total) * 100)}%)`,
      state: 'warning',
      onClick: () => onNavigate?.('participantes', { aba: 'inscricoes', status: 'pendente' }),
    },
    {
      dot: '#EF4444',
      label: 'Abandonaram',
      sub: 'checkout não finalizado',
      value: data.abandonaram || 0,
      suffix: `(${Math.round(((data.abandonaram || 0) / total) * 100)}%)`,
      state: 'danger',
      onClick: () => onNavigate?.('participantes', { aba: 'inscricoes', status: 'checkout_abandonado' }),
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {cards.map((c, i) => <StatCard key={i} {...c} />)}
    </div>
  );
}