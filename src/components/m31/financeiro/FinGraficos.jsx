import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';

const CORES = ['#8B1A2B', '#3B82F6', '#10B981', '#F59E0B', '#6366F1', '#EC4899', '#14B8A6'];
const fmtBRL = n => 'R$ ' + (n || 0).toLocaleString('pt-BR');

function Painel({ titulo, children, vazio }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E8ECF3', borderRadius: '12px', padding: '18px' }}>
      <h4 style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: '600', color: '#1A1A2E', margin: '0 0 14px 0' }}>
        {titulo}
      </h4>
      {vazio
        ? <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: '13px' }}>Sem dados no período</div>
        : <div style={{ height: '200px' }}>{children}</div>}
    </div>
  );
}

export default function FinGraficos({ graficos }) {
  const { receitaPorDia, receitaPorProvedor, formasPagamento, pagosVsNao, conversao } = graficos;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '14px' }}>
      <Painel titulo="Receita por dia" vazio={receitaPorDia.length === 0}>
        <ResponsiveContainer>
          <LineChart data={receitaPorDia}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#94A3B8' }} />
            <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} width={50} />
            <Tooltip formatter={v => fmtBRL(v)} />
            <Line type="monotone" dataKey="valor" stroke="#8B1A2B" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Painel>

      <Painel titulo="Receita por provedor" vazio={receitaPorProvedor.length === 0}>
        <ResponsiveContainer>
          <BarChart data={receitaPorProvedor}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis dataKey="nome" tick={{ fontSize: 11, fill: '#94A3B8' }} />
            <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} width={50} />
            <Tooltip formatter={v => fmtBRL(v)} />
            <Bar dataKey="valor" fill="#3B82F6" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Painel>

      <Painel titulo="Formas de pagamento" vazio={formasPagamento.length === 0}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={formasPagamento} dataKey="valor" nameKey="nome" cx="50%" cy="50%" outerRadius={70} label={e => e.nome}>
              {formasPagamento.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </Painel>

      <Painel titulo="Pagos × não pagos" vazio={pagosVsNao.every(p => p.valor === 0)}>
        <ResponsiveContainer>
          <BarChart data={pagosVsNao} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis type="number" tick={{ fontSize: 11, fill: '#94A3B8' }} />
            <YAxis type="category" dataKey="nome" tick={{ fontSize: 11, fill: '#94A3B8' }} width={80} />
            <Tooltip />
            <Bar dataKey="valor" fill="#10B981" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Painel>

      <Painel titulo="Conversão de checkout" vazio={false}>
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '44px', fontWeight: '700', color: '#8B1A2B' }}>
            {conversao.toFixed(1)}%
          </div>
          <div style={{ width: '100%', maxWidth: '240px', height: '10px', background: '#F1F5F9', borderRadius: '100px', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(conversao, 100)}%`, height: '100%', background: '#8B1A2B' }} />
          </div>
          <span style={{ fontSize: '12px', color: '#6B7280' }}>inscrições pagas ÷ total de checkouts</span>
        </div>
      </Painel>
    </div>
  );
}