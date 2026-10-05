import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { TOKENS } from '@/lib/m31DesignTokens';

import M31Inscricoes from './M31Inscricoes';
import M31Caravanas from './M31Caravanas';
import M31CheckinPanel from './M31CheckinPanel';
import M31LeadsAbandonados from './M31LeadsAbandonados';
import M31GestaoMensagens from './M31GestaoMensagens';
import M31PendenciasConciliacao from './pendencias/M31PendenciasConciliacao';

// ── Design tokens (Light Executive) ───────────────────────────
const C = {
  bg:        TOKENS.background,
  surface1:  TOKENS.surface,
  surface2:  TOKENS.surfaceSubtle,
  border:    TOKENS.border,
  brand:     TOKENS.primary,
  brandSoft: TOKENS.primarySoft,
  text:      TOKENS.text,
  textSec:   TOKENS.textMuted,
  textMuted: TOKENS.textSubtle,
  success:   TOKENS.success,
  warning:   TOKENS.warning,
  info:      TOKENS.info,
  danger:    TOKENS.danger,
};

const fmtBRL = n => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// SOMENTE participantes que compraram ingresso — voluntários excluídos
const TIPOS_PARTICIPANTE = ['publico_geral', 'caravana', 'doacao'];

// ── Definição das abas — SEM voluntários ─────────────────────
const ABAS = [
  { id: 'inscricoes', label: 'Inscritas',   permissao: 'verInscricoes' },
  { id: 'caravanas',  label: 'Caravanas',   permissao: 'verCaravanas' },
  { id: 'pendentes',  label: 'Pendentes',   permissao: 'verInscricoes' },
  { id: 'auditoria',  label: 'Auditoria',   permissao: 'verInscricoes' },
  { id: 'checkin',    label: 'Check-in',    permissao: 'fazerCheckin' },
  { id: 'leads',      label: 'Recuperação', permissao: 'verLeads' },
  { id: 'mensagens',  label: 'Mensagens',   permissao: 'verMensagens' },
];

// ── Tab Bar ───────────────────────────────────────────────────
function TabBar({ abas, abaAtiva, onAbaChange, badges }) {
  return (
    <div style={{
      overflowX: 'auto',
      overflowY: 'hidden',
      scrollbarWidth: 'none',
      msOverflowStyle: 'none',
      WebkitOverflowScrolling: 'touch',
      display: 'flex',
      borderBottom: `1px solid ${C.border}`,
      marginBottom: '16px',
      flexShrink: 0,
    }}>
      <style>{`.hub-tabbar::-webkit-scrollbar{display:none}`}</style>
      <div className="hub-tabbar" style={{ display: 'flex', gap: '2px', whiteSpace: 'nowrap' }}>
        {abas.map(aba => {
          const isActive = abaAtiva === aba.id;
          const badge = badges?.[aba.id];
          return (
            <button
              key={aba.id}
              onClick={() => onAbaChange(aba.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '10px 14px',
                background: 'transparent',
                border: 'none',
                borderBottom: isActive ? `2px solid ${C.brand}` : '2px solid transparent',
                cursor: 'pointer',
                fontFamily: TOKENS.font.body,
                fontSize: '13px',
                fontWeight: isActive ? '600' : '400',
                color: isActive ? C.text : C.textSec,
                transition: `all ${TOKENS.transition.atomic}`,
                whiteSpace: 'nowrap',
                WebkitTapHighlightColor: 'transparent',
                flexShrink: 0,
              }}
            >
              {aba.label}
              {badge > 0 && (
                <span style={{
                  fontSize: '10px', fontWeight: '700',
                  minWidth: '18px', height: '16px',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: isActive ? C.brand : TOKENS.surfaceSubtle,
                  color: TOKENS.onPrimary, borderRadius: TOKENS.radius.pill, padding: '0 4px',
                }}>
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── KPI Card ─────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: C.surface1,
        border: `1px solid ${C.border}`,
        borderRadius: TOKENS.radius.lg,
        padding: '14px 16px',
        textAlign: 'left',
        cursor: onClick ? 'pointer' : 'default',
        fontFamily: TOKENS.font.body,
        flex: '1 1 130px',
        minWidth: '120px',
        transition: `border-color ${TOKENS.transition.atomic}`,
      }}
      onMouseEnter={e => onClick && (e.currentTarget.style.borderColor = color || C.brand)}
      onMouseLeave={e => onClick && (e.currentTarget.style.borderColor = C.border)}
    >
      <div style={{ fontSize: '20px', fontWeight: '700', color: color || C.text, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '11px', color: C.textSec, marginTop: '4px' }}>{label}</div>
      {sub != null && <div style={{ fontSize: '10px', color: C.textMuted, marginTop: '2px' }}>{sub}</div>}
    </button>
  );
}

// ── Aba Pendentes — somente participantes (não voluntários) ───
function AbaPendentes() {
  const { data: inscricoes = [], isLoading } = useQuery({
    queryKey: ['m31hub_pendentes_participantes'],
    queryFn: () => base44.entities.EventoM31Inscricao.list('-created_date', 600),
  });

  const pendentes = useMemo(() =>
    inscricoes.filter(i =>
      TIPOS_PARTICIPANTE.includes(i.tipo) &&
      ['pendente', 'checkout_pendente', 'checkout_abandonado'].includes(i.status_pagamento)
    ),
  [inscricoes]);

  if (isLoading) return <LoadingSpinner />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: C.text }}>Pendências Ativas</div>
          <div style={{ fontSize: '11px', color: C.textMuted, marginTop: '2px' }}>
            {pendentes.length} participante{pendentes.length !== 1 ? 's' : ''} aguardando ação
          </div>
        </div>
        <span style={{
          fontSize: '11px', fontWeight: '700', padding: '4px 10px',
          borderRadius: TOKENS.radius.pill,
          background: TOKENS.warningSoft, color: C.warning,
        }}>
          {pendentes.length}
        </span>
      </div>

      {pendentes.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: C.textMuted, fontSize: '13px' }}>
          Nenhuma pendência no momento. 🎉
        </div>
      ) : pendentes.map(i => {
         const isAbandoned = i.status_pagamento === 'checkout_abandonado';
         return (
           <div key={i.id} style={{
             background: C.surface1,
             border: `1px solid ${isAbandoned ? TOKENS.dangerSoft : TOKENS.warningSoft}`,
             borderRadius: TOKENS.radius.lg,
             padding: '12px 14px',
             display: 'flex',
             alignItems: 'center',
             gap: '10px',
           }}>
            <div style={{
              width: '8px', height: '8px', borderRadius: TOKENS.radius.pill, flexShrink: 0,
              background: isAbandoned ? C.danger : C.warning,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: '500', color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {i.nome}
              </div>
              <div style={{ fontSize: '11px', color: C.textMuted }}>
                {i.tipo === 'caravana' ? `Caravana · ${i.caravana_nome || '-'}` : 'Individual'} · {i.lote || '-'}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <span style={{
                fontSize: '10px', fontWeight: '600', padding: '2px 8px', borderRadius: TOKENS.radius.pill,
                background: isAbandoned ? TOKENS.dangerSoft : TOKENS.warningSoft,
                color: isAbandoned ? C.danger : C.warning,
                display: 'block', marginBottom: '2px',
              }}>
                {isAbandoned ? 'Abandonado' : 'Pendente'}
              </span>
              {i.whatsapp && (
                <a
                  href={`https://wa.me/${i.whatsapp.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: '10px', color: C.info, textDecoration: 'none' }}
                >
                  WhatsApp
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
      <div style={{ width: '24px', height: '24px', border: `2px solid ${C.border}`, borderTopColor: C.brand, borderRadius: TOKENS.radius.pill, animation: 'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ── HUB PARTICIPANTES — apenas inscritas (não voluntários) ────
export default function M31ParticipantesHub({ pode, defaultAba = 'inscricoes', initialFiltroStatus, initialFiltroCaravanaId, initialFiltroLote, initialFiltroGrupo, onNavigateTo }) {
  const [abaAtiva, setAbaAtiva] = useState(defaultAba);

  // Badge de pendentes — somente participantes
  const { data: pendentesData = [] } = useQuery({
    queryKey: ['m31hub_pendentes_badge_participantes'],
    queryFn: async () => {
      const all = await base44.entities.EventoM31Inscricao.list('-created_date', 600);
      return all.filter(i =>
        TIPOS_PARTICIPANTE.includes(i.tipo) &&
        ['pendente', 'checkout_pendente', 'checkout_abandonado'].includes(i.status_pagamento)
      );
    },
    refetchInterval: 120000,
  });

  const badges = useMemo(() => ({
    pendentes: pendentesData.length,
  }), [pendentesData]);

  // Filtrar abas visíveis
  const abasVisiveis = useMemo(() =>
    ABAS.filter(a => pode?.[a.permissao] !== false),
  [pode]);

  const abaValidaAtiva = abasVisiveis.find(a => a.id === abaAtiva)
    ? abaAtiva
    : (abasVisiveis[0]?.id || 'inscricoes');

  return (
    <div style={{ fontFamily: TOKENS.font.body, color: C.text, display: 'flex', flexDirection: 'column', minHeight: 0 }}>

      {/* Título */}
      <div style={{ marginBottom: '12px' }}>
        <h1 style={{ fontSize: '16px', fontWeight: '700', color: C.text, margin: 0, letterSpacing: '-.015em' }}>
          Participantes
        </h1>
        <div style={{ fontSize: '11px', color: C.textMuted, marginTop: '2px' }}>
          Inscritas individuais · Caravanas · Check-in · Recuperação
        </div>
      </div>

      <TabBar
        abas={abasVisiveis}
        abaAtiva={abaValidaAtiva}
        onAbaChange={setAbaAtiva}
        badges={badges}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        {abaValidaAtiva === 'inscricoes' && <M31Inscricoes filtroTipos={TIPOS_PARTICIPANTE} filtroStatus={initialFiltroStatus} filtroCaravanaId={initialFiltroCaravanaId} filtroLoteInicial={initialFiltroLote} filtroGrupoInicial={initialFiltroGrupo} />}
        {abaValidaAtiva === 'caravanas'  && <M31Caravanas />}
        {abaValidaAtiva === 'pendentes'  && <AbaPendentes />}
        {abaValidaAtiva === 'auditoria'  && <M31PendenciasConciliacao />}
        {abaValidaAtiva === 'checkin'    && <M31CheckinPanel />}
        {abaValidaAtiva === 'leads'      && <M31LeadsAbandonados />}
        {abaValidaAtiva === 'mensagens'  && <M31GestaoMensagens />}
      </div>
    </div>
  );
}