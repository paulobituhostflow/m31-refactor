/**
 * M31ConfiguracaoEvento — Formulário em etapas com sidebar navigation.
 * Seções: Informações Gerais · Ingressos e Lotes · Formulário Personalizado.
 */
import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { TOKENS } from '@/lib/m31DesignTokens';
import { PageHeader } from '@/components/m31/ui';
import AbaInformacoesGerais from './config-evento/AbaInformacoesGerais';
import AbaIngressosLotes from './config-evento/AbaIngressosLotes';
import AbaFormularioPersonalizado from './config-evento/AbaFormularioPersonalizado';
import M31Cupons from '@/components/m31/M31Cupons';
import { Info, Ticket, FormInput, BadgePercent } from 'lucide-react';

const SECTIONS = [
  { id: 'informacoes', label: 'Informações Gerais', icon: Info, desc: 'Título, data, preletores' },
  { id: 'ingressos', label: 'Ingressos e Lotes', icon: Ticket, desc: 'Preços, vagas, promocionais' },
  { id: 'cupons', label: 'Cupons', icon: BadgePercent, desc: 'Cupons de desconto e cortesia' },
  { id: 'formulario', label: 'Formulário Personalizado', icon: FormInput, desc: 'Campos do formulário' },
];

export default function M31ConfiguracaoEvento() {
  const [activeSection, setActiveSection] = useState('informacoes');

  const { data: config = null, isLoading } = useQuery({
    queryKey: ['m31_config_evento'],
    queryFn: async () => {
      const list = await base44.entities.EventoM31Configuracao.list('-created_date', 5);
      return list[0] || null;
    },
  });

  const handleSave = async (data) => {
    if (config?.id) {
      await base44.entities.EventoM31Configuracao.update(config.id, data);
    } else {
      await base44.entities.EventoM31Configuracao.create(data);
    }
  };

  if (isLoading) return (
    <div style={{ textAlign: 'center', padding: '60px', color: TOKENS.textMuted, fontSize: '14px' }}>
      <div style={{ width: '28px', height: '28px', border: `2px solid ${TOKENS.border}`, borderTopColor: TOKENS.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
      Carregando configuração...
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: 'Inscrições' }, { label: 'Configuração do Evento' }]}
        title="Configuração do Evento"
        subtitle="Gerencie as informações do evento, ingressos e formulário de inscrição"
      />

      <div className="m31-config-main" style={{ display: 'flex', gap: '16px', minHeight: '400px' }}>
        {/* Sidebar navigation */}
        <div className="m31-config-sidebar" style={{ width: '220px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {SECTIONS.map(s => {
            const active = activeSection === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '10px',
                  padding: '12px 14px', borderRadius: TOKENS.radius.md,
                  background: active ? TOKENS.primarySoft : 'transparent',
                  border: `1px solid ${active ? TOKENS.primary : 'transparent'}`,
                  cursor: 'pointer', textAlign: 'left',
                  fontFamily: TOKENS.font.body, transition: `all ${TOKENS.transition.atomic}`,
                }}
              >
                <s.icon size={16} color={active ? TOKENS.primary : TOKENS.textMuted} style={{ flexShrink: 0, marginTop: '1px' }} />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: active ? TOKENS.primary : TOKENS.text }}>{s.label}</div>
                  <div style={{ fontSize: '11px', color: TOKENS.textMuted, marginTop: '1px' }}>{s.desc}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Content area */}
        <div style={{ flex: 1, minWidth: 0, background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: TOKENS.radius.lg, padding: '20px', boxShadow: TOKENS.shadowSm }}>
          {activeSection === 'informacoes' && <AbaInformacoesGerais config={config} onSave={handleSave} />}
          {activeSection === 'ingressos' && <AbaIngressosLotes />}
          {activeSection === 'cupons' && <M31Cupons />}
          {activeSection === 'formulario' && <AbaFormularioPersonalizado config={config} onSave={handleSave} />}
        </div>
      </div>

      {/* Mobile: a sidebar vira um tab bar horizontal no topo */}
      <style>{`
        @media (max-width: 768px) {
          .m31-config-sidebar { flex-direction: row !important; width: 100% !important; overflow-x: auto; margin-bottom: 12px; }
          .m31-config-sidebar button { white-space: nowrap; flex-shrink: 0; }
          .m31-config-main { flex-direction: column !important; }
        }
      `}</style>
    </div>
  );
}