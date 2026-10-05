import { useState, useMemo } from 'react';
import StatCard from '@/components/m31/ui/StatCard';
import { contarCanonico, receitaConfirmada } from '@/lib/m31Canonico';
import { TOKENS } from '@/lib/m31DesignTokens';

const fmtBRL = n => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MASK = '••••••';

const IcoEye = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
  </svg>
);

/**
 * KPIs de inscrições — contam EXCLUSIVAMENTE pelo veredito canônico.
 * Nunca por status_pagamento: status descreve o pagamento, não prova a vaga.
 */
export default function M31KpiCanonico({ data, isSuperAdmin }) {
  const [showValues, setShowValues] = useState(false);
  const c = useMemo(() => contarCanonico(data), [data]);
  const receita = useMemo(() => receitaConfirmada(data), [data]);

  const kpis = [
    { label: 'Vagas oficiais', value: c.vagas_oficiais, sub: 'confirmadas + isentas', state: 'success', hero: true },
    { label: 'Confirmadas pagas', value: c.confirmada, sub: 'com evidência financeira', state: 'success' },
    { label: 'Em pagamento', value: c.pendente, sub: 'não conta vaga', state: 'warning' },
    { label: 'Em revisão', value: c.revisar, sub: 'decisão humana', state: 'info' },
    { label: 'Fora do universo', value: c.fora_do_universo, sub: 'cancelada / duplicada', state: 'neutral' },
    ...(c.isenta ? [{ label: 'Isentas', value: c.isenta, sub: 'sem cobrança', state: 'success' }] : []),
    ...(c.sem_veredito ? [{ label: 'Sem veredito', value: c.sem_veredito, sub: 'aguarda conciliação', state: 'danger' }] : []),
    ...(isSuperAdmin ? [{ label: 'Receita comprovada', value: showValues ? fmtBRL(receita) : MASK, sub: 'só confirmadas', state: 'neutral' }] : []),
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5 relative">
      {isSuperAdmin && (
        <button
          onClick={() => setShowValues(v => !v)}
          title={showValues ? 'Ocultar valores' : 'Revelar valores'}
          style={{ position: 'absolute', top: '10px', right: '12px', background: 'rgba(255,255,255,0.9)', border: `1px solid ${TOKENS.border}`, borderRadius: '6px', cursor: 'pointer', color: TOKENS.textSubtle, padding: '4px 6px', display: 'flex', zIndex: 2, backdropFilter: 'blur(8px)' }}
        >
          <IcoEye />
        </button>
      )}
      {kpis.map((k, i) => (
        <StatCard key={i} label={k.label} value={k.value} sub={k.sub} state={k.state} hero={k.hero} />
      ))}
    </div>
  );
}