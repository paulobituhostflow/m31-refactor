/**
 * ConciliacaoTopCards — 3 cards grandes do topo.
 * Segue regra oficial 10/07: 258 inscritas + 33 voluntárias + gateway-comprovado.
 * NUNCA mostra bruto ambíguo (301/195) como número principal.
 */
import { CheckCircle2, HandHeart, Building2 } from 'lucide-react';
import { TOKENS } from '@/lib/m31DesignTokens';

const fmtBRL = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function ConciliacaoTopCards({ m }) {
  const { oficial, gateway_comprovado, participantes } = m;

  const cards = [
    {
      icon: CheckCircle2,
      label: 'Inscritas Pagas',
      value: oficial.inscritas,
      sub: `Filhas ${participantes.filhas.count} + Caravana ${participantes.caravana.count} · fonte: inscrições`,
      color: TOKENS.success,
      bg: TOKENS.successSoft,
    },
    {
      icon: HandHeart,
      label: 'Voluntárias',
      value: oficial.voluntarias,
      sub: 'sempre à parte · fonte: inscrições',
      color: TOKENS.info,
      bg: TOKENS.infoSoft,
    },
    {
      icon: Building2,
      label: 'Gateway Comprovado',
      value: gateway_comprovado.pagas,
      sub: `${fmtBRL(gateway_comprovado.valor_bruto)} bruto · vs ${gateway_comprovado.vs_total} no sistema`,
      color: TOKENS.primary,
      bg: TOKENS.primarySoft,
    },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '20px' }}>
      {cards.map((c, i) => (
        <div key={i} style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: TOKENS.radius.lg, padding: '20px', boxShadow: TOKENS.shadowSm, display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: TOKENS.radius.md, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <c.icon size={22} color={c.color} />
          </div>
          <div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: TOKENS.text, fontFamily: TOKENS.font.heading, lineHeight: '1.1' }}>{c.value}</div>
            <div style={{ fontSize: '12px', color: TOKENS.textSubtle, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' }}>{c.label}</div>
            <div style={{ fontSize: '11px', color: TOKENS.textMuted, marginTop: '2px' }}>{c.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}