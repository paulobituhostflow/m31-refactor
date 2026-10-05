/**
 * ConciliacaoGateways — Comparação MP vs Asaas vs Sem gateway.
 * Mostra receita bruta, taxas, líquido, pendências e divergências.
 */
import { TOKENS } from '@/lib/m31DesignTokens';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

const fmtBRL = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function GatewayRow({ label, icon: Icon, color, bruto, taxa, liquido, pagas, extras, statusLabel, statusColor }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', borderBottom: `1px solid ${TOKENS.borderSubtle}` }}>
      <div style={{ width: '36px', height: '36px', borderRadius: TOKENS.radius.sm, background: color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={18} color={color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: '600', color: TOKENS.text }}>{label}</span>
          <span style={{ fontSize: '11px', fontWeight: '600', color: statusColor, background: statusColor + '15', padding: '2px 8px', borderRadius: TOKENS.radius.pill }}>{statusLabel}</span>
        </div>
        <div style={{ fontSize: '12px', color: TOKENS.textMuted, marginTop: '3px' }}>{pagas} transações pagas{extras ? ` · ${extras}` : ''}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '16px', fontWeight: '700', color: TOKENS.text }}>{fmtBRL(bruto)}</div>
        <div style={{ fontSize: '11px', color: TOKENS.textMuted }}>líq: {fmtBRL(liquido)} · taxa: {fmtBRL(taxa)}</div>
      </div>
    </div>
  );
}

export default function ConciliacaoGateways({ m }) {
  return (
    <div style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: TOKENS.radius.lg, marginBottom: '20px', boxShadow: TOKENS.shadowSm }}>
      <div style={{ padding: '16px 18px', borderBottom: `1px solid ${TOKENS.border}` }}>
        <div style={{ fontSize: '15px', fontWeight: '700', color: TOKENS.text, fontFamily: TOKENS.font.heading }}>Conciliação por Gateway</div>
        <div style={{ fontSize: '12px', color: TOKENS.textMuted, marginTop: '2px' }}>
          Receita: <strong style={{ color: TOKENS.text }}>transações importadas</strong> (195 pagas) · Headcount: <strong style={{ color: TOKENS.text }}>inscrições</strong> (301 aprovadas, inclui 175 sem gateway)
        </div>
      </div>
      <GatewayRow label="Mercado Pago" icon={AlertTriangle} color={TOKENS.warning} bruto={m.financeiro.mp.bruto} taxa={m.financeiro.mp.taxa} liquido={m.financeiro.mp.liquido} pagas={m.financeiro.mp.pagas} extras={`${m.conciliacao.pendentes} órfãs`} statusLabel="PARCIAL" statusColor={TOKENS.warning} />
      <GatewayRow label="Asaas" icon={CheckCircle2} color={TOKENS.success} bruto={m.financeiro.asaas.bruto} taxa={m.financeiro.asaas.taxa} liquido={m.financeiro.asaas.liquido} pagas={m.financeiro.asaas.pagas} extras={`${m.financeiro.asaas.pendentes} pendentes`} statusLabel="100%" statusColor={TOKENS.success} />
      <GatewayRow label="Sem Gateway" icon={XCircle} color={TOKENS.danger} bruto={m.participantes.valor_total - m.financeiro.consolidado.bruto} taxa={0} liquido={m.participantes.valor_total - m.financeiro.consolidado.bruto} pagas={m.conciliacao.sem_gateway} extras="pagamento via líder/import" statusLabel="REVISAR" statusColor={TOKENS.danger} />
      <div style={{ padding: '14px 18px', background: TOKENS.surfaceSubtle, borderRadius: `0 0 ${TOKENS.radius.lg} ${TOKENS.radius.lg}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', fontWeight: '700', color: TOKENS.text }}>Consolidado</span>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '18px', fontWeight: '700', color: TOKENS.primary }}>{fmtBRL(m.financeiro.consolidado.bruto)}</span>
          <span style={{ fontSize: '12px', color: TOKENS.textMuted, marginLeft: '8px' }}>líq {fmtBRL(m.financeiro.consolidado.liquido)} · taxa {fmtBRL(m.financeiro.consolidado.taxa)}</span>
        </div>
      </div>
    </div>
  );
}