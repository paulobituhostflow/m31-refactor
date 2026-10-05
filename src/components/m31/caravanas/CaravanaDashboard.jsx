import { C, fmtBRL } from './CaravanasUtils';

export default function CaravanaDashboard({ stats }) {
  const kpis = [
    { label: 'Caravanas',     value: stats.totalCaravanas, color: C.text,    sub: null },
    { label: 'Total membros', value: stats.totalMembros,   color: C.text,    sub: null },
    { label: 'Confirmados',   value: stats.confirmados,    color: C.success, sub: stats.totalMembros > 0 ? `${Math.round(stats.confirmados/stats.totalMembros*100)}%` : null },
    { label: 'Pendentes',     value: stats.pendentes,      color: C.warning, sub: stats.totalMembros > 0 ? `${Math.round(stats.pendentes/stats.totalMembros*100)}%` : null },
    { label: 'Receita',       value: fmtBRL(stats.receita),color: C.text,    sub: null },
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '8px',
    }}>
      {/* Receita vai full-width no mobile */}
      {kpis.map((k, i) => (
        <div
          key={k.label}
          style={{
            background: C.bg2,
            border: `1px solid ${C.border}`,
            borderRadius: '10px',
            padding: '14px 16px',
            gridColumn: i === 4 ? 'span 2' : 'span 1',
          }}
        >
          <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '.07em', textTransform: 'uppercase', color: C.textTer, marginBottom: '6px' }}>{k.label}</div>
          <div style={{ fontSize: i === 4 ? '18px' : '24px', fontWeight: '700', color: k.color, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{k.value}</div>
          {k.sub && <div style={{ fontSize: '11px', color: C.textTer, marginTop: '3px' }}>{k.sub} do total</div>}
        </div>
      ))}
    </div>
  );
}