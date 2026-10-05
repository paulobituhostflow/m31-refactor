/**
 * ConciliacaoPendencias — Lista de pendências de conciliação.
 * Órfãos MP (40), inscrições sem gateway (175), Asaas pendentes (57).
 */
import { useState } from 'react';
import { TOKENS } from '@/lib/m31DesignTokens';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

const fmtBRL = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function PendenciaGroup({ title, count, color, bg, children, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: TOKENS.radius.md, overflow: 'hidden' }}>
      <button onClick={() => setOpen(!open)} style={{ width: '100%', padding: '12px 16px', background: bg, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontFamily: TOKENS.font.body }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={16} color={color} />
          <span style={{ fontSize: '13px', fontWeight: '600', color: TOKENS.text }}>{title}</span>
          <span style={{ fontSize: '12px', fontWeight: '700', color, background: bg, padding: '2px 8px', borderRadius: TOKENS.radius.pill }}>{count}</span>
        </div>
        {open ? <ChevronDown size={16} color={TOKENS.textMuted} /> : <ChevronRight size={16} color={TOKENS.textMuted} />}
      </button>
      {open && children}
    </div>
  );
}

export default function ConciliacaoPendencias({ m }) {
  const orfaos = m.pendencias.orfaos_mp || [];
  const semGw = m.pendencias.sem_gateway || [];

  return (
    <div style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: TOKENS.radius.lg, padding: '18px', boxShadow: TOKENS.shadowSm }}>
      <div style={{ fontSize: '15px', fontWeight: '700', color: TOKENS.text, fontFamily: TOKENS.font.heading, marginBottom: '14px' }}>
        Pendências de Conciliação
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <PendenciaGroup title="Órfãos Mercado Pago (pagos sem inscrição)" count={orfaos.length} color={TOKENS.warning} bg={TOKENS.warningSoft} defaultOpen={false}>
          <div style={{ maxHeight: '300px', overflowY: 'auto', borderTop: `1px solid ${TOKENS.border}` }}>
            {orfaos.map((o, i) => (
              <div key={i} style={{ padding: '10px 16px', borderBottom: `1px solid ${TOKENS.borderSubtle}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: TOKENS.text }}>{o.email || o.nome_pagador || 'Sem identificação'}</div>
                  <div style={{ fontSize: '11px', color: TOKENS.textMuted }}>ID: {o.transaction_id}{o.cpf ? ` · CPF: ${o.cpf}` : ''}</div>
                </div>
                <span style={{ fontSize: '14px', fontWeight: '700', color: TOKENS.text }}>{fmtBRL(o.valor_bruto)}</span>
              </div>
            ))}
          </div>
        </PendenciaGroup>
        <PendenciaGroup title="Inscrições aprovadas sem gateway" count={m.conciliacao.sem_gateway} color={TOKENS.danger} bg={TOKENS.dangerSoft} defaultOpen={false}>
          <div style={{ maxHeight: '300px', overflowY: 'auto', borderTop: `1px solid ${TOKENS.border}` }}>
            {semGw.map((s, i) => (
              <div key={i} style={{ padding: '10px 16px', borderBottom: `1px solid ${TOKENS.borderSubtle}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: TOKENS.text }}>{s.nome}</div>
                  <div style={{ fontSize: '11px', color: TOKENS.textMuted }}>{s.origem_pagamento || 'sem origem'}{s.codigo_inscricao ? ` · ${s.codigo_inscricao}` : ''}</div>
                </div>
                <span style={{ fontSize: '14px', fontWeight: '700', color: TOKENS.text }}>{fmtBRL(s.valor_pago)}</span>
              </div>
            ))}
          </div>
        </PendenciaGroup>
        <div style={{ padding: '10px 14px', background: TOKENS.infoSoft, borderRadius: TOKENS.radius.md, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: TOKENS.info }}>Asaas pendentes (a receber)</span>
          <span style={{ fontSize: '14px', fontWeight: '700', color: TOKENS.info }}>{m.pendencias.asaas_pendentes_count}</span>
        </div>
      </div>
    </div>
  );
}