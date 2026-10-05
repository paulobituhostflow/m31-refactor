import {
  TrendingUp, Wallet, Percent, Clock, CheckCircle2, ShoppingCart, RotateCcw, AlertTriangle,
} from 'lucide-react';

const fmtBRL = n => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function Card({ icon: Icon, label, value, sub, accent }) {
  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E8ECF3', borderRadius: '12px', padding: '18px',
      display: 'flex', flexDirection: 'column', gap: '10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '12px', fontWeight: '600', color: '#6B7280' }}>{label}</span>
        <div style={{
          width: '30px', height: '30px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${accent}14`,
        }}>
          <Icon size={16} color={accent} />
        </div>
      </div>
      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '24px', fontWeight: '700', color: '#1A1A2E' }}>
        {value}
      </div>
      {sub && <span style={{ fontSize: '11px', color: '#9CA3AF' }}>{sub}</span>}
    </div>
  );
}

export default function FinCards({ stats }) {
  const cards = [
    { icon: TrendingUp, label: 'Receita recebida', value: fmtBRL(stats.receitaRecebida), sub: `${stats.inscricoesPagas} inscrições pagas`, accent: '#10B981' },
    { icon: Wallet, label: 'Receita líquida', value: fmtBRL(stats.receitaLiquida), sub: 'após taxas estimadas', accent: '#059669' },
    { icon: Percent, label: 'Taxas', value: fmtBRL(stats.taxas), sub: 'estimativa de gateway', accent: '#F59E0B' },
    { icon: Clock, label: 'Valor a receber', value: fmtBRL(stats.valorAReceber), sub: `${stats.pendentes.length} pendentes`, accent: '#3B82F6' },
    { icon: CheckCircle2, label: 'Inscrições pagas', value: String(stats.inscricoesPagas), sub: `${stats.pagamentosUnicos} pagamentos únicos`, accent: '#10B981' },
    { icon: ShoppingCart, label: 'Checkouts em aberto', value: String(stats.checkoutsAbertoCount), sub: 'com link de pagamento', accent: '#6366F1' },
    { icon: RotateCcw, label: 'Estornos / cancelamentos', value: String(stats.estornosCancelamentos), sub: 'inscrições canceladas', accent: '#EF4444' },
    { icon: AlertTriangle, label: 'Divergências financeiras', value: String(stats.divergenciasCount), sub: 'sem rastreio completo', accent: '#F97316' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
      {cards.map((c, i) => <Card key={i} {...c} />)}
    </div>
  );
}