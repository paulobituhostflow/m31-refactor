// Funil de Vendas — Planejamento visual do fluxo de captura e conversão
import React from 'react';
import { ArrowDown, Layers, Target, MousePointer, CreditCard, CheckCircle, Users } from 'lucide-react';

const WINE = '#8B1A2B';
const STEP_COLORS = ['#8B1A2B', '#C8405C', '#D4748B', '#059669', '#2563EB', '#7C3AED'];

const steps = [
  { key: 'captura', label: 'Página de Captura', icon: MousePointer, desc: 'Landing Page principal com formulário de inscrição', tech: 'Blocos Drag & Drop' },
  { key: 'lead', label: 'Captura do Lead', icon: Users, desc: 'Dados salvos na base com tags automáticas', tech: 'EventoM31Inscricao' },
  { key: 'checkout', label: 'Checkout / Pagamento', icon: CreditCard, desc: 'Integração Asaas com link de pagamento', tech: 'ASAAS API' },
  { key: 'confirmacao', label: 'Confirmação', icon: CheckCircle, desc: 'Pagamento aprovado → boas-vindas automáticas', tech: 'Webhook + WhatsApp' },
  { key: 'pos_venda', label: 'Pós-Venda', icon: Target, desc: 'Régua de relacionamento e grupo WhatsApp', tech: 'ReguaSegura' },
];

export default function BuilderFunil({ config, formConfig, eventName }) {
  return (
    <div style={{ padding: '28px 24px', fontFamily: 'Inter, sans-serif', background: '#F9FAFB', minHeight: '100%' }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{
          fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 700,
          color: '#1F2937', margin: '0 0 4px 0', letterSpacing: '-0.02em',
        }}>
          Funil de Vendas
        </h2>
        <p style={{ fontSize: 13, color: '#6B7280', margin: 0 }}>
          {eventName || 'Evento'} — Fluxo completo de captura, pagamento e pós-venda
        </p>
      </div>

      {/* Visual funnel */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        maxWidth: 520, margin: '0 auto',
      }}>
        {steps.map((step, i) => (
          <React.Fragment key={step.key}>
            {/* Step card */}
            <div style={{
              width: '100%',
              maxWidth: `${520 - i * 40}px`,
              background: '#fff',
              border: `1.5px solid ${i === 0 ? WINE + '44' : '#E5E7EB'}`,
              borderLeft: `4px solid ${STEP_COLORS[i]}`,
              borderRadius: 12,
              padding: '16px 18px',
              boxShadow: i === 0 ? '0 4px 16px rgba(139,26,43,0.08)' : '0 1px 4px rgba(0,0,0,0.04)',
              transition: 'all 0.2s',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: `${STEP_COLORS[i]}14`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <step.icon size={17} color={STEP_COLORS[i]} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: '#1F2937' }}>{step.label}</span>
                    <span style={{ fontSize: 10, background: '#F3F4F6', color: '#6B7280', padding: '1px 7px', borderRadius: 4, fontWeight: 600 }}>
                      Etapa {i + 1}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: '#6B7280', margin: 0, lineHeight: 1.5 }}>{step.desc}</p>
                  <div style={{
                    marginTop: 8, padding: '4px 10px',
                    background: '#F9FAFB', borderRadius: 6,
                    display: 'inline-block',
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      {step.tech}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Connector arrow */}
            {i < steps.length - 1 && (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '4px 0',
              }}>
                <div style={{ width: 2, height: 20, background: 'linear-gradient(180deg, #E5E7EB, #D1D5DB)' }} />
                <ArrowDown size={14} color="#D1D5DB" style={{ marginTop: -2 }} />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Summary */}
      <div style={{
        marginTop: 32, maxWidth: 520, margin: '32px auto 0',
        background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '18px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Layers size={16} color={WINE} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1F2937' }}>Conexões do Funil</span>
        </div>
        <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 6px' }}>
            <strong style={{ color: '#1F2937' }}>Landing → Formulário:</strong> Os blocos da landing page direcionam para o formulário de inscrição.
          </p>
          <p style={{ margin: '0 0 6px' }}>
            <strong style={{ color: '#1F2937' }}>Formulário → Asaas:</strong> Ao submeter, o sistema gera cobrança via Asaas e redireciona para pagamento.
          </p>
          <p style={{ margin: '0 0 6px' }}>
            <strong style={{ color: '#1F2937' }}>Pagamento → Confirmação:</strong> Webhook do Asaas dispara boas-vindas automáticas via WhatsApp.
          </p>
          <p style={{ margin: 0 }}>
            <strong style={{ color: '#1F2937' }}>Lead → Régua:</strong> Inscrições com pagamento pendente entram na régua de recuperação automática.
          </p>
        </div>
      </div>
    </div>
  );
}