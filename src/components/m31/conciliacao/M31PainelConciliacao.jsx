/**
 * M31PainelConciliacao — Painel de Conciliação Financeira.
 * Fonte única da verdade: cruza transações importadas (gateways) com inscrições.
 */
import { TOKENS } from '@/lib/m31DesignTokens';
import { PageHeader } from '@/components/m31/ui';
import { useM31Conciliacao } from '@/hooks/useM31Conciliacao';
import ConciliacaoTopCards from './ConciliacaoTopCards';
import ConciliacaoGateways from './ConciliacaoGateways';
import ConciliacaoCategorias from './ConciliacaoCategorias';
import ConciliacaoPendencias from './ConciliacaoPendencias';

export default function M31PainelConciliacao() {
  const { metrics, isLoading } = useM31Conciliacao();

  if (isLoading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ width: '28px', height: '28px', border: `3px solid ${TOKENS.border}`, borderTopColor: TOKENS.primary, borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: 'Financeiro' }, { label: 'Conciliação' }]}
        title="Conciliação Financeira"
        subtitle="Base44 como fonte única da verdade — transações vs inscrições"
      />
      <ConciliacaoTopCards m={metrics} />
      <ConciliacaoGateways m={metrics} />
      <ConciliacaoCategorias m={metrics} />
      <ConciliacaoPendencias m={metrics} />
    </div>
  );
}