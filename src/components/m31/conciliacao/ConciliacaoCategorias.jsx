/**
 * ConciliacaoCategorias — Cards por categoria: Filhas / Caravana / Voluntárias.
 * Usa CONFIÁVEL (com whatsapp) como número principal, regra oficial 10/07.
 * Filhas: breakdown por valor_pago (lotes).
 * Caravana: com/sem whatsapp (confiável vs revisar).
 * Voluntárias: sempre à parte.
 */
import { TOKENS } from '@/lib/m31DesignTokens';
import { Heart, Bus, HandHeart } from 'lucide-react';

const fmtBRL = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });

function CategoryCard({ icon: Icon, title, color, bg, count, valor, semValor, revisar, children }) {
  return (
    <div style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: TOKENS.radius.lg, padding: '18px', boxShadow: TOKENS.shadowSm }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: TOKENS.radius.md, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={18} color={color} />
        </div>
        <div>
          <div style={{ fontSize: '15px', fontWeight: '700', color: TOKENS.text, fontFamily: TOKENS.font.heading }}>{title}</div>
          <div style={{ fontSize: '12px', color: TOKENS.textMuted }}>{count} inscritas · {fmtBRL(valor)}</div>
        </div>
      </div>
      {revisar > 0 && (
        <div style={{ fontSize: '11px', color: TOKENS.warning, background: TOKENS.warningSoft, padding: '4px 10px', borderRadius: TOKENS.radius.sm, marginBottom: '10px', fontWeight: '600' }}>
          {revisar} sem whatsapp (revisar — não entram no oficial)
        </div>
      )}
      {semValor > 0 && (
        <div style={{ fontSize: '11px', color: TOKENS.warning, background: TOKENS.warningSoft, padding: '4px 10px', borderRadius: TOKENS.radius.sm, marginBottom: '10px', fontWeight: '600' }}>
          {semValor} sem valor no sistema (R$ 0)
        </div>
      )}
      {children}
    </div>
  );
}

export default function ConciliacaoCategorias({ m }) {
  const { filhas, caravana, voluntarios } = m.participantes;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '20px' }}>
      {/* Filhas */}
      <CategoryCard icon={Heart} title="Filhas" color={TOKENS.primary} bg={TOKENS.primarySoft} count={filhas.count} valor={filhas.valor} semValor={filhas.sem_valor} revisar={filhas.revisar}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {filhas.byValor.map((v, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: v.sem_valor ? TOKENS.warningSoft : TOKENS.surfaceSubtle, borderRadius: TOKENS.radius.sm }}>
              <span style={{ fontSize: '12px', color: v.sem_valor ? TOKENS.warning : TOKENS.textMuted, fontWeight: '600' }}>
                {v.sem_valor ? 'Sem valor' : `Lote ${fmtBRL(v.valor)}`}
              </span>
              <span style={{ fontSize: '13px', fontWeight: '700', color: TOKENS.text }}>{v.count}×</span>
            </div>
          ))}
        </div>
      </CategoryCard>

      {/* Caravana */}
      <CategoryCard icon={Bus} title="Caravana" color="#7C3AED" bg="rgba(124,58,237,0.10)" count={caravana.count} valor={caravana.valor} semValor={caravana.sem_valor}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: TOKENS.successSoft, borderRadius: TOKENS.radius.sm }}>
            <span style={{ fontSize: '12px', color: TOKENS.success, fontWeight: '600' }}>Com WhatsApp (confiável)</span>
            <span style={{ fontSize: '13px', fontWeight: '700', color: TOKENS.text }}>{caravana.comWpp}×</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: TOKENS.surfaceSubtle, borderRadius: TOKENS.radius.sm, opacity: 0.6 }}>
            <span style={{ fontSize: '12px', color: TOKENS.textMuted, fontWeight: '600' }}>Sem WhatsApp (revisar)</span>
            <span style={{ fontSize: '13px', fontWeight: '700', color: TOKENS.textMuted }}>{caravana.semWpp}×</span>
          </div>
        </div>
      </CategoryCard>

      {/* Voluntárias */}
      <CategoryCard icon={HandHeart} title="Voluntárias" color="#0D9488" bg="rgba(13,148,136,0.10)" count={voluntarios.count} valor={voluntarios.valor} semValor={voluntarios.sem_valor} revisar={voluntarios.revisar}>
        <div style={{ padding: '10px', background: TOKENS.surfaceSubtle, borderRadius: TOKENS.radius.sm, fontSize: '12px', color: TOKENS.textMuted, textAlign: 'center' }}>
          {voluntarios.count} voluntárias aprovadas (confiável)
        </div>
      </CategoryCard>
    </div>
  );
}