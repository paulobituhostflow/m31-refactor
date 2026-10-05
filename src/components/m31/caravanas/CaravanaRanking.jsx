import { C, isConfirmado, isPendente } from './CaravanasUtils';
import { IcoTrophy } from './CaravanasIcons';

const PALETTE = ['#8B1A2B', '#e8a04c', '#6c8ebf', '#5da87d', '#9b6cd4', '#d4a05b'];

export default function CaravanaRanking({ caravanas, inscricoes, onSelect }) {
  const ranked = caravanas
    .map(c => {
      const mb = inscricoes.filter(i => i.caravana_id === c.id);
      return {
        ...c,
        confirmados: mb.filter(isConfirmado).length,
        pendentes:   mb.filter(isPendente).length,
        total:       mb.length,
        receita:     mb.filter(isConfirmado).reduce((s, m) => s + (m.valor_pago || 0), 0),
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const totalGeral = inscricoes.length || 1;

  if (ranked.length === 0) return null;

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: '10px', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ color: '#e8a04c' }}><IcoTrophy /></span>
        <span style={{ fontSize: '13px', fontWeight: '600', color: C.text }}>Top Caravanas</span>
      </div>

      {/* Mini pizza chart (CSS only) */}
      <div style={{ padding: '16px', display: 'flex', gap: '16px', alignItems: 'center', borderBottom: `1px solid ${C.border}` }}>
        <PizzaChart data={ranked.slice(0, 6)} total={totalGeral} palette={PALETTE} onSelect={onSelect} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {ranked.slice(0, 6).map((c, i) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }} onClick={() => onSelect && onSelect(c.id)}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: PALETTE[i] || C.textTer, flexShrink: 0 }} />
              <span style={{ fontSize: '11px', color: C.textSec, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</span>
              <span style={{ fontSize: '11px', fontWeight: '700', color: C.text, fontVariantNumeric: 'tabular-nums' }}>{c.total}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Ranking list */}
      <div>
        {ranked.map((c, i) => (
          <div
            key={c.id}
            onClick={() => onSelect && onSelect(c.id)}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 16px', borderBottom: i < ranked.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer' }}>
            <span style={{ fontSize: '14px', width: '22px', textAlign: 'center', flexShrink: 0 }}>
              {medals[i] || <span style={{ fontSize: '11px', fontWeight: '700', color: C.textTer }}>{i + 1}</span>}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</div>
              <div style={{ fontSize: '11px', color: C.textSec, marginTop: '1px' }}>👤 {c.lider_nome || <span style={{ color: C.danger }}>Sem líder</span>}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: '700', color: C.text, fontVariantNumeric: 'tabular-nums' }}>{c.total}</div>
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '2px' }}>
                <span style={{ fontSize: '10px', color: C.success }}>{c.confirmados}✓</span>
                {c.pendentes > 0 && <span style={{ fontSize: '10px', color: C.warning }}>{c.pendentes}⏳</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PizzaChart({ data, total, palette, onSelect }) {
  const size = 100;
  const cx = size / 2;
  const cy = size / 2;
  const r = 38;

  let cumulative = 0;
  const slices = data.map((c, i) => {
    const pct = c.total / total;
    const startAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    const endAngle = (cumulative + pct) * 2 * Math.PI - Math.PI / 2;
    cumulative += pct;
    return { c, i, startAngle, endAngle, pct };
  });

  const polarToCartesian = (angle, radius) => ({
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      {slices.map(({ c, i, startAngle, endAngle }) => {
        if (endAngle - startAngle < 0.01) return null;
        const start = polarToCartesian(startAngle, r);
        const end = polarToCartesian(endAngle, r);
        const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
        const d = `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
        return (
          <path
            key={c.id}
            d={d}
            fill={palette[i] || C.textTer}
            stroke={C.bg2}
            strokeWidth="1.5"
            style={{ cursor: 'pointer', opacity: 0.9 }}
            onClick={() => onSelect && onSelect(c.id)}
          />
        );
      })}
      {/* Center hole */}
      <circle cx={cx} cy={cy} r={20} fill={C.bg2} />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="700" fill={C.text} fontFamily="Inter,sans-serif">{total}</text>
      <text x={cx} y={cy + 11} textAnchor="middle" dominantBaseline="middle" fontSize="6" fill={C.textTer} fontFamily="Inter,sans-serif">total</text>
    </svg>
  );
}