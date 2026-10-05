import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import M31ReguaAutomacao from './M31ReguaAutomacao';
import { relativeTimeBR, getProximoDisparoBR, getTodayStringBR } from '@/lib/dateUtils';

// ── TOKENS ────────────────────────────────────────────────────
const C = {
  bg0: '#F5F6FA', bg1: '#FFFFFF', bg2: '#FFFFFF', bg3: '#F9FAFB', bg4: '#F9FAFB',
  text: '#1A1A1A', textSec: '#6B7280', textTer: '#9CA3AF',
  border: '#E5E7EB', borderSt: '#D1D5DB',
  brand: '#7A1F2B', brandHov: '#6B1A25', brandSoft: 'rgba(122,31,43,0.08)', brandBorder: 'rgba(122,31,43,0.2)',
  success: '#10B981', successSoft: 'rgba(16,185,129,0.12)',
  warning: '#F59E0B', warningSoft: 'rgba(245,158,11,0.12)',
  danger: '#EF4444', dangerSoft: 'rgba(239,68,68,0.12)',
  info: '#3B82F6', infoSoft: 'rgba(59,130,246,0.12)',
  whatsapp: '#25d366',
};

const STATUS_CFG = {
  pendente:            { label: 'Aguardando pagamento', cls: 'warning' },
  checkout_abandonado: { label: 'Abandonado',           cls: 'danger'  },
  aprovado:            { label: 'Pago',                 cls: 'success' },
  cancelado:           { label: 'Cancelado',            cls: 'info'    },
  checkout_pendente:   { label: 'Link enviado',         cls: 'info'    },
};
const STATUS_COLOR = {
  warning: { bg: C.warningSoft, color: C.warning },
  danger:  { bg: C.dangerSoft,  color: C.danger  },
  success: { bg: C.successSoft, color: C.success },
  info:    { bg: C.infoSoft,    color: C.info    },
};

const fmtBRL = n => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtRel = relativeTimeBR;

function initials(nome) {
  if (!nome) return '??';
  const p = nome.trim().split(' ');
  return (p[0][0] + (p[1]?.[0] || '')).toUpperCase();
}

// ── ICONS ─────────────────────────────────────────────────────
const IcoSend    = ({sz=14}) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
const IcoCheck   = ({sz=14}) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
const IcoWA      = ({sz=14}) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.5 14c-.3-.2-1.8-.9-2-1s-.5-.2-.7.2-.8 1-.9 1.2-.3.2-.6 0c-1-.5-1.7-.9-2.3-1.9-.2-.4.2-.4.5-1.1.1-.2 0-.3 0-.5s-.7-1.8-1-2.4c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.4 1.1 2.8 1.2 3c.2.2 2.1 3.2 5.2 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.5.3-.7.3-1.4.2-1.5-.1-.1-.3-.2-.6-.4z"/><path d="M3 21l1.9-5.6A8.5 8.5 0 1 1 9 20.3L3 21"/></svg>;
const IcoRefresh = ({sz=14}) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>;
const IcoSearch  = ({sz=14}) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const IcoDown    = ({sz=12}) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>;
const IcoEdit    = ({sz=14}) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
const IcoDownload= ({sz=14}) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
const IcoClock   = ({sz=12}) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
const IcoMail    = ({sz=12}) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>;
const IcoPhone   = ({sz=12}) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
const IcoPause   = ({sz=14}) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>;
const IcoPlay    = ({sz=14}) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>;

// ── UAZAPI STATUS BAR ─────────────────────────────────────────
function UazapiStatusBar() {
  const { data: uazapi, isLoading, refetch } = useQuery({
    queryKey: ['m31uazapiStatus'],
    queryFn: () => base44.functions.invoke('m31CheckUazapiStatus', {}).then(r => r.data),
    refetchInterval: 60000,
    retry: 1,
  });
  const online = uazapi?.connected === true;

  if (isLoading) return null;

  if (!online && uazapi) return (
    <div style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.28)', borderRadius: '10px', padding: '14px 16px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: C.danger, display: 'inline-block', animation: 'blink 1s step-end infinite', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', fontWeight: '700', color: C.danger }}>UAZAPI OFFLINE</div>
        <div style={{ fontSize: '12px', color: 'rgba(239,68,68,0.75)', marginTop: '2px' }}>Instância desconectada. Nenhuma mensagem será enviada até restaurar a conexão.</div>
      </div>
      <button onClick={() => refetch()} style={{ padding: '8px 14px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: C.danger, cursor: 'pointer', fontFamily: 'Inter,sans-serif', fontWeight: '600', fontSize: '12px', flexShrink: 0 }}>↻ Verificar</button>
    </div>
  );

  return (
    <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.18)', borderRadius: '10px', padding: '10px 16px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: C.success, boxShadow: `0 0 0 3px ${C.successSoft}`, display: 'inline-block', flexShrink: 0 }} />
      <span style={{ fontSize: '12px', fontWeight: '600', color: C.success }}>UAZAPI Online</span>
      {uazapi?.mensagens_hoje != null && <span style={{ fontSize: '12px', color: C.textSec, marginLeft: '4px' }}><strong style={{ color: C.text }}>{uazapi.mensagens_hoje}</strong> msgs hoje</span>}
      <button onClick={() => refetch()} style={{ fontSize: '11px', color: C.textTer, background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto', fontFamily: 'Inter,sans-serif' }}>↻</button>
    </div>
  );
}

// ── REGUA CARD + BOTTOM SHEET ──────────────────────────────────
function ReguaCard({ stats, ativo, onToggle, proximoDisparo, onDisparar, disparando }) {
  const [showSheet, setShowSheet] = useState(false);
  const [horarioInicio, setHorarioInicio] = useState('07:00');
  const [horarioFim, setHorarioFim] = useState('20:00');
  const [intervalo, setIntervalo] = useState('30');
  const [limiteDiario, setLimiteDiario] = useState('100');
  const [diasAtivos, setDiasAtivos] = useState(['seg','ter','qua','qui','sex']);

  const dias = [
    { id: 'dom', label: 'Dom' },
    { id: 'seg', label: 'Seg' },
    { id: 'ter', label: 'Ter' },
    { id: 'qua', label: 'Qua' },
    { id: 'qui', label: 'Qui' },
    { id: 'sex', label: 'Sex' },
    { id: 'sab', label: 'Sáb' },
  ];

  const toggleDia = d => setDiasAtivos(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  return (
    <>
      <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '16px', marginBottom: '12px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: ativo ? C.success : C.textTer, boxShadow: ativo ? `0 0 0 3px ${C.successSoft}` : 'none', display: 'inline-block' }} />
            <span style={{ fontSize: '14px', fontWeight: '700', color: C.text }}>Régua Automática</span>
          </div>
          <span style={{ fontSize: '11px', fontWeight: '600', padding: '3px 10px', borderRadius: '20px', background: ativo ? C.successSoft : C.bg3, color: ativo ? C.success : C.textSec, border: `1px solid ${ativo ? 'rgba(16,185,129,0.25)' : C.border}` }}>
            {ativo ? '● Ativa' : '○ Pausada'}
          </span>
        </div>

        {/* Config row */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
          {[
            { label: 'Início', value: horarioInicio },
            { label: 'Fim', value: horarioFim },
            { label: 'Intervalo', value: `${intervalo} min` },
          ].map(cfg => (
            <div key={cfg.label} style={{ background: C.bg3, borderRadius: '8px', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '10px', color: C.textTer, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.05em' }}>{cfg.label}</span>
              <span style={{ fontSize: '14px', fontWeight: '700', color: C.text }}>{cfg.value}</span>
            </div>
          ))}
          <div style={{ background: C.bg3, borderRadius: '8px', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
            <span style={{ fontSize: '10px', color: C.textTer, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.05em' }}>Próximo envio</span>
            <span style={{ fontSize: '14px', fontWeight: '700', color: ativo ? C.success : C.textSec }}>{proximoDisparo}</span>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: '0', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${C.border}`, marginBottom: '14px' }}>
          {[
            { label: 'Hoje',      value: stats.enviosHoje,  color: C.text },
            { label: 'Recuper.',  value: stats.recuperados, color: C.success },
            { label: 'Opt-out',   value: stats.optOut,      color: C.textSec },
          ].map((s, i) => (
            <div key={s.label} style={{ flex: 1, padding: '10px 0', textAlign: 'center', borderRight: i < 2 ? `1px solid ${C.border}` : 'none' }}>
              <div style={{ fontSize: '18px', fontWeight: '700', color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '10px', color: C.textTer, marginTop: '2px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setShowSheet(true)}
            style={{ flex: 1, padding: '12px', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: '10px', color: C.text, fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontFamily: 'Inter,sans-serif' }}
          >
            <IcoEdit /> Editar horários
          </button>
          <button
            onClick={onToggle}
            style={{ flex: 1, padding: '12px', background: ativo ? C.dangerSoft : C.successSoft, border: `1px solid ${ativo ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)'}`, borderRadius: '10px', color: ativo ? C.danger : C.success, fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontFamily: 'Inter,sans-serif' }}
          >
            {ativo ? <><IcoPause /> Pausar</> : <><IcoPlay /> Ativar</>}
          </button>
        </div>

        {/* Disparar agora */}
        <button
          onClick={onDisparar}
          disabled={disparando}
          style={{ width: '100%', marginTop: '8px', padding: '13px', background: disparando ? C.bg3 : C.brand, border: 'none', borderRadius: '10px', color: '#fff', fontSize: '14px', fontWeight: '700', cursor: disparando ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontFamily: 'Inter,sans-serif', opacity: disparando ? 0.7 : 1 }}
        >
          <IcoSend /> {disparando ? 'Disparando…' : 'Disparar régua agora'}
        </button>

        <div style={{ marginTop: '8px', textAlign: 'center', fontSize: '11px', color: C.textTer }}>Horário local UTC-3 · America/Recife</div>
      </div>

      {/* BOTTOM SHEET */}
      {showSheet && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div onClick={() => setShowSheet(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)' }} />
          <div style={{ position: 'relative', background: C.bg2, borderRadius: '20px 20px 0 0', padding: '0 0 32px', maxHeight: '85vh', overflowY: 'auto', border: `1px solid ${C.borderSt}` }}>
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
              <div style={{ width: '40px', height: '4px', borderRadius: '2px', background: C.bg4 }} />
            </div>
            <div style={{ padding: '16px 20px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <span style={{ fontSize: '16px', fontWeight: '700', color: C.text }}>Configurar Régua</span>
                <button onClick={() => setShowSheet(false)} style={{ background: C.bg3, border: 'none', color: C.textSec, cursor: 'pointer', fontSize: '18px', lineHeight: 1, width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: C.textTer, textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: '6px' }}>Início</label>
                  <input type="time" value={horarioInicio} onChange={e => setHorarioInicio(e.target.value)} style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '12px', color: C.text, fontSize: '16px', fontWeight: '600', fontFamily: 'Inter,sans-serif', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: C.textTer, textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: '6px' }}>Fim</label>
                  <input type="time" value={horarioFim} onChange={e => setHorarioFim(e.target.value)} style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '12px', color: C.text, fontSize: '16px', fontWeight: '600', fontFamily: 'Inter,sans-serif', outline: 'none' }} />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '11px', fontWeight: '600', color: C.textTer, textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: '6px' }}>Intervalo entre disparos (minutos)</label>
                <input type="number" min="5" max="120" value={intervalo} onChange={e => setIntervalo(e.target.value)} style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '12px 14px', color: C.text, fontSize: '16px', fontWeight: '600', fontFamily: 'Inter,sans-serif', outline: 'none' }} />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '11px', fontWeight: '600', color: C.textTer, textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: '6px' }}>Limite diário de mensagens</label>
                <input type="number" min="1" max="500" value={limiteDiario} onChange={e => setLimiteDiario(e.target.value)} style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '12px 14px', color: C.text, fontSize: '16px', fontWeight: '600', fontFamily: 'Inter,sans-serif', outline: 'none' }} />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ fontSize: '11px', fontWeight: '600', color: C.textTer, textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: '10px' }}>Dias ativos</label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {dias.map(d => (
                    <button key={d.id} onClick={() => toggleDia(d.id)} style={{ padding: '10px 14px', borderRadius: '10px', border: `1px solid ${diasAtivos.includes(d.id) ? C.brand : C.border}`, background: diasAtivos.includes(d.id) ? C.brandSoft : C.bg3, color: diasAtivos.includes(d.id) ? C.brand : C.textSec, fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'Inter,sans-serif', minWidth: '44px', minHeight: '44px' }}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ fontSize: '11px', color: C.textTer, marginBottom: '16px', padding: '10px 12px', background: C.bg3, borderRadius: '8px' }}>
                ℹ️ Horário local UTC-3 · America/Recife
              </div>

              <button onClick={() => setShowSheet(false)} style={{ width: '100%', padding: '15px', background: C.brand, border: 'none', borderRadius: '12px', color: '#fff', fontSize: '15px', fontWeight: '700', cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                Salvar configurações
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── KPI STRIP MOBILE ──────────────────────────────────────────
function KpiGrid({ stats, elegiveis }) {
  const cells = [
    { label: 'Pendentes',  value: stats.totalPendentes,    color: C.warning },
    { label: 'Enviados hoje', value: stats.enviosHoje,     color: C.text },
    { label: 'Recuperados', value: stats.recuperados,      color: C.success },
    { label: 'Opt-out',    value: stats.optOut,             color: C.textSec },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '12px' }}>
      {cells.map((k, i) => (
        <div key={i} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '14px 16px' }}>
          <div style={{ fontSize: '22px', fontWeight: '700', color: k.color, fontVariantNumeric: 'tabular-nums', marginBottom: '2px' }}>{k.value}</div>
          <div style={{ fontSize: '11px', color: C.textTer, fontWeight: '500' }}>{k.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── LEAD CARD MOBILE ──────────────────────────────────────────
function LeadCard({ lead, enviando, onReenviar, onRecuperar }) {
  const st = STATUS_CFG[lead.status_pagamento] || STATUS_CFG.pendente;
  const sc = STATUS_COLOR[st.cls];
  const isPending = ['pendente', 'checkout_abandonado'].includes(lead.status_pagamento);
  const waLink = `https://wa.me/55${(lead.whatsapp || '').replace(/\D/g, '')}`;
  const nome = lead.nome || '';
  const primeiroNome = nome.split(' ')[0];

  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: '12px', overflow: 'hidden', marginBottom: '8px' }}>
      {/* Valor + Status */}
      <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: `1px solid ${C.border}` }}>
        <div>
          <div style={{ fontSize: '20px', fontWeight: '700', color: C.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{fmtBRL(lead.valor_pago)}</div>
          <div style={{ fontSize: '11px', color: C.textTer, marginTop: '3px' }}>{lead.lote?.replace('_', ' ')} {lead.tipo === 'publico_geral' ? '· público geral' : lead.tipo ? `· ${lead.tipo}` : ''}</div>
        </div>
        <span style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '.05em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: '20px', background: sc.bg, color: sc.color, border: `1px solid ${sc.color}30`, whiteSpace: 'nowrap' }}>
          {st.label}
        </span>
      </div>

      {/* Pessoa */}
      <div style={{ padding: '12px 16px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: C.bg4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textSec, fontWeight: '700', fontSize: '13px', flexShrink: 0 }}>
            {initials(nome)}
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: C.text }}>{primeiroNome}</div>
            <div style={{ fontSize: '11px', color: C.textTer, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <IcoClock sz={10} />
              {fmtRel(lead.checkout_abandoned_at || lead.created_date)}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: C.textSec }}>
            <IcoPhone sz={11} />
            <span>{lead.whatsapp ? `+55 ${lead.whatsapp}` : '—'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: C.textSec }}>
            <IcoMail sz={11} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.email}</span>
          </div>
        </div>
      </div>

      {/* Ações */}
      <div style={{ padding: '10px 16px 14px', display: 'flex', gap: '8px' }}>
        <a href={waLink} target="_blank" rel="noreferrer" style={{ flex: 1, padding: '11px 0', background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.25)', borderRadius: '10px', color: C.whatsapp, fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontFamily: 'Inter,sans-serif', textDecoration: 'none', minHeight: '44px' }}>
          <IcoWA sz={15} /> WhatsApp
        </a>
        {isPending && (
          <button onClick={() => onReenviar(lead)} disabled={enviando === lead.id} style={{ flex: 1, padding: '11px 0', background: C.brandSoft, border: `1px solid ${C.brandBorder}`, borderRadius: '10px', color: C.brand, fontSize: '13px', fontWeight: '600', cursor: enviando === lead.id ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontFamily: 'Inter,sans-serif', opacity: enviando === lead.id ? 0.6 : 1, minHeight: '44px' }}>
            {enviando === lead.id ? <><IcoRefresh /> Enviando…</> : <><IcoSend /> Enviar</>}
          </button>
        )}
        {isPending && (
          <button onClick={() => onRecuperar(lead)} style={{ width: '44px', height: '44px', background: C.successSoft, border: '1px solid rgba(16,185,129,0.25)', borderRadius: '10px', color: C.success, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter,sans-serif', flexShrink: 0 }}>
            <IcoCheck sz={16} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── DISPARO FEEDBACK ──────────────────────────────────────────
function DisparoFeedback({ resultado, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 250, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0' }}>
      <div style={{ background: C.bg2, border: `1px solid ${C.borderSt}`, borderRadius: '20px 20px 0 0', width: '100%', maxWidth: '480px', padding: '24px 24px 40px', textAlign: 'center' }}>
        <div style={{ width: '40px', height: '4px', borderRadius: '2px', background: C.bg4, margin: '0 auto 20px' }} />
        <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: C.successSoft, border: `1px solid ${C.success}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '22px' }}>✓</div>
        <div style={{ fontSize: '18px', fontWeight: '700', color: C.text, marginBottom: '6px' }}>Régua disparada!</div>
        <div style={{ fontSize: '13px', color: C.textSec, marginBottom: '24px' }}>Processamento concluído</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px', marginBottom: '24px' }}>
          {[
            { label: 'Enviadas', value: resultado.enviados, color: C.success },
            { label: 'Atualizados', value: resultado.atualizados, color: C.info },
            { label: 'Falhas', value: resultado.falhas, color: resultado.falhas > 0 ? C.danger : C.textTer },
          ].map(s => (
            <div key={s.label} style={{ background: C.bg3, borderRadius: '10px', padding: '16px 8px' }}>
              <div style={{ fontSize: '28px', fontWeight: '800', color: s.color, marginBottom: '4px', fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
              <div style={{ fontSize: '10px', color: C.textTer, lineHeight: 1.3 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <button onClick={onClose} style={{ width: '100%', padding: '14px', background: C.brand, border: 'none', borderRadius: '12px', color: '#fff', fontSize: '14px', fontWeight: '700', cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>Fechar</button>
      </div>
    </div>
  );
}

// ── TEMPLATE EDITOR ───────────────────────────────────────────
function TemplateEditor({ template, onSave, onClose }) {
  const [text, setText] = useState(template.content || '');
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ background: C.bg2, border: `1px solid ${C.borderSt}`, borderRadius: '20px 20px 0 0', width: '100%', maxWidth: '480px', padding: '0 20px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
          <div style={{ width: '40px', height: '4px', borderRadius: '2px', background: C.bg4 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <span style={{ fontSize: '15px', fontWeight: '600', color: C.text }}>{template.name}</span>
          <button onClick={onClose} style={{ background: C.bg3, border: 'none', color: C.textSec, cursor: 'pointer', fontSize: '18px', lineHeight: 1, width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>
        <div style={{ fontSize: '11px', color: C.textTer, marginBottom: '8px', padding: '8px 10px', background: C.bg3, borderRadius: '8px' }}>
          Variáveis: <code style={{ color: C.brand }}>{'{nome}'}</code> · <code style={{ color: C.brand }}>{'{valor}'}</code> · <code style={{ color: C.brand }}>{'{link_checkout}'}</code>
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={5} style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: '10px', color: C.text, fontFamily: 'Inter,sans-serif', fontSize: '14px', padding: '12px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
        <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '13px', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: '10px', color: C.textSec, fontSize: '14px', fontWeight: '600', cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>Cancelar</button>
          <button onClick={() => onSave(template.id, text)} style={{ flex: 2, padding: '13px', background: C.brand, border: 'none', borderRadius: '10px', color: '#fff', fontSize: '14px', fontWeight: '700', cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

// ── FILTROS TABS ──────────────────────────────────────────────
const TABS = [
  { val: 'todos_pendentes', label: 'Pendentes' },
  { val: 'wpp_sem_checkout', label: '📱 Sem checkout' },
  { val: 'abandonado',      label: 'Abandono' },
  { val: 'gerado',          label: 'Checkout' },
  { val: 'recuperado',      label: 'Recuperados' },
  { val: 'optout',          label: 'Opt-out' },
];

// ── ABANDONO WPP CARD ─────────────────────────────────────────
function AbandonoWppCard({ stats5min, onDisparar, disparando }) {
  return (
    <div style={{ background: C.bg2, border: `1px solid rgba(37,211,102,0.2)`, borderRadius: '12px', padding: '16px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <span style={{ fontSize: '16px' }}>📱</span>
        <div>
          <div style={{ fontSize: '14px', fontWeight: '700', color: C.text }}>Abandono após WhatsApp</div>
          <div style={{ fontSize: '11px', color: C.textTer }}>Captura quem preencheu o número mas não finalizou</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '12px' }}>
        {[
          { label: 'Aguardando 5min', value: stats5min.aguardando, color: C.warning },
          { label: 'Acionados',       value: stats5min.acionados,  color: C.info },
          { label: 'Sem WPP válido',  value: stats5min.semWpp,     color: C.textTer },
        ].map(s => (
          <div key={s.label} style={{ background: C.bg3, borderRadius: '8px', padding: '10px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontWeight: '700', color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
            <div style={{ fontSize: '10px', color: C.textTer, marginTop: '2px', lineHeight: 1.2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: '11px', color: C.textTer, marginBottom: '10px', padding: '8px 10px', background: C.bg3, borderRadius: '8px', lineHeight: 1.5 }}>
        ⚠️ <strong style={{ color: C.warning }}>Segurança:</strong> máx 3 por lote · pausa 10–15 min · janela 08h–20h · limite 20/dia
      </div>

      <button
        onClick={onDisparar}
        disabled={disparando || stats5min.aguardando === 0}
        style={{ width: '100%', padding: '12px', background: disparando || stats5min.aguardando === 0 ? C.bg3 : 'rgba(37,211,102,0.15)', border: `1px solid ${disparando || stats5min.aguardando === 0 ? C.border : 'rgba(37,211,102,0.35)'}`, borderRadius: '10px', color: disparando || stats5min.aguardando === 0 ? C.textTer : C.whatsapp, fontSize: '13px', fontWeight: '600', cursor: disparando || stats5min.aguardando === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontFamily: 'Inter,sans-serif' }}
      >
        <IcoWA sz={14} /> {disparando ? 'Disparando…' : stats5min.aguardando === 0 ? 'Nenhum aguardando' : `Disparar recuperação (${stats5min.aguardando} pendentes)`}
      </button>
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────
export default function M31LeadsAbandonados() {
  const qc = useQueryClient();
  const [subTab,    setSubTab]    = useState('leads');
  const [filtro,    setFiltro]    = useState('todos_pendentes');
  const [loteFilt,  setLoteFilt]  = useState('todos_lotes');
  const [busca,     setBusca]     = useState('');
  const [ordenar,   setOrdenar]   = useState('valor');
  const [enviando,  setEnviando]  = useState(null);
  const [autoAtiva, setAutoAtiva] = useState(true);
  const [disparando,setDisparando]= useState(false);
  const [disparoResultado, setDisparoResultado] = useState(null);
  const [editTmpl,  setEditTmpl]  = useState(null);
  const [showFiltros, setShowFiltros] = useState(false);
  const [disparando5min, setDisparando5min] = useState(false);

  const { data: lotes = [] } = useQuery({
    queryKey: ['m31lotes'],
    queryFn: () => base44.entities.EventoM31Lote.list(),
  });

  const { data: inscricoes = [], isLoading, refetch } = useQuery({
    queryKey: ['m31leads'],
    queryFn: async () => {
      const insc = await base44.entities.EventoM31Inscricao.list('-created_date', 500);
      const loteMap = Object.fromEntries(lotes.map(l => [l.codigo, l.valor]));
      return insc.map(i => ({
        ...i,
        valor_pago: i.valor_pago && i.valor_pago > 0 ? i.valor_pago : (loteMap[i.lote] || 0)
      }));
    },
    enabled: lotes.length > 0,
    refetchInterval: 60000,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['m31templates'],
    queryFn: () => base44.entities.M31MessageTemplate.list('trigger_stage', 20),
  });

  const stats5min = useMemo(() => {
    const agora = new Date();
    const candidatas = inscricoes.filter(i =>
      i.tipo === 'publico_geral' &&
      i.status_pagamento === 'checkout_pendente' &&
      !i.asaas_charge_url &&
      !i.opt_out
    );
    return {
      aguardando: candidatas.filter(i =>
        i.recovery_attempts === 0 &&
        i.next_contact_at &&
        new Date(i.next_contact_at) <= agora
      ).length,
      acionados: candidatas.filter(i => (i.recovery_attempts || 0) > 0).length,
      semWpp: candidatas.filter(i => !i.whatsapp || i.whatsapp.replace(/\D/g,'').length < 10).length,
    };
  }, [inscricoes]);

  const stats = useMemo(() => {
    const pg = inscricoes.filter(i => !['voluntario','doacao'].includes(i.tipo));
    const pend = pg.filter(i => ['pendente','checkout_abandonado'].includes(i.status_pagamento));
    const aprov = pg.filter(i => i.status_pagamento === 'aprovado');
    const recup = aprov.filter(i => (i.recovery_attempts || 0) > 0);
    const hoje = getTodayStringBR();
    return {
      gerados:         pg.filter(i => i.status_pagamento === 'pendente').length,
      abandonados:     pg.filter(i => i.status_pagamento === 'checkout_abandonado').length,
      totalPendentes:  pend.length,
      aprovados:       aprov.length,
      recuperados:     recup.length,
      receitaPendente: pend.reduce((s, i) => s + (i.valor_pago || 0), 0),
      receitaRecuperada: recup.reduce((s, i) => s + (i.valor_pago || 0), 0),
      enviosHoje:      inscricoes.filter(i => i.last_contact_at && new Date(i.last_contact_at).toLocaleDateString('sv-SE', { timeZone: 'America/Recife' }) === hoje).length,
      optOut:          inscricoes.filter(i => i.opt_out).length,
    };
  }, [inscricoes]);

  const leads = useMemo(() => {
    let list = inscricoes.filter(i => !['voluntario','doacao'].includes(i.tipo));
    if (filtro === 'todos_pendentes')  list = list.filter(i => ['pendente','checkout_abandonado'].includes(i.status_pagamento));
    else if (filtro === 'wpp_sem_checkout') list = list.filter(i => i.status_pagamento === 'checkout_pendente' && !i.asaas_charge_url);
    else if (filtro === 'abandonado')  list = list.filter(i => i.status_pagamento === 'checkout_abandonado');
    else if (filtro === 'gerado')      list = list.filter(i => i.status_pagamento === 'pendente');
    else if (filtro === 'recuperado')  list = list.filter(i => i.status_pagamento === 'aprovado' && (i.recovery_attempts||0) > 0);
    else if (filtro === 'optout')      list = list.filter(i => i.opt_out);
    if (loteFilt !== 'todos_lotes')   list = list.filter(i => i.lote === loteFilt);
    if (busca) {
      const b = busca.toLowerCase();
      list = list.filter(i => i.nome?.toLowerCase().includes(b) || i.email?.toLowerCase().includes(b) || (i.whatsapp||'').includes(b));
    }
    if (ordenar === 'valor')         list = [...list].sort((a,b) => (b.valor_pago||0)-(a.valor_pago||0));
    else if (ordenar === 'prioridade') list = [...list].sort((a,b) => ({'high':0,'medium':1,'low':2}[a.priority]??1)-({'high':0,'medium':1,'low':2}[b.priority]??1));
    else if (ordenar === 'recente')  list = [...list].sort((a,b) => new Date(b.created_date)-new Date(a.created_date));
    return list;
  }, [inscricoes, filtro, loteFilt, busca, ordenar]);

  const tabCounts = useMemo(() => {
    const base = inscricoes.filter(i => !['voluntario','doacao'].includes(i.tipo));
    return {
      todos_pendentes:  base.filter(i => ['pendente','checkout_abandonado'].includes(i.status_pagamento)).length,
      wpp_sem_checkout: base.filter(i => i.status_pagamento === 'checkout_pendente' && !i.asaas_charge_url).length,
      abandonado:       base.filter(i => i.status_pagamento === 'checkout_abandonado').length,
      gerado:           base.filter(i => i.status_pagamento === 'pendente').length,
      recuperado:       base.filter(i => i.status_pagamento === 'aprovado' && (i.recovery_attempts||0)>0).length,
      optout:           base.filter(i => i.opt_out).length,
    };
  }, [inscricoes]);

  const proximoDisparo = useMemo(() => getProximoDisparoBR(), []);
  const elegiveis = useMemo(() =>
    inscricoes.filter(i => ['pendente','checkout_abandonado'].includes(i.status_pagamento) && !i.opt_out && (!i.next_contact_at || new Date(i.next_contact_at) <= new Date())).length
  , [inscricoes]);

  async function handleReenviar(lead) {
    setEnviando(lead.id);
    await base44.functions.invoke('m31ReenviarCobranca', { inscricao_id: lead.id });
    await refetch();
    setEnviando(null);
  }
  async function handleRecuperar(lead) {
    await base44.entities.EventoM31Inscricao.update(lead.id, { status_pagamento: 'aprovado' });
    qc.invalidateQueries({ queryKey: ['m31leads'] });
  }
  async function handleDisparar5min() {
    setDisparando5min(true);
    await base44.functions.invoke('m31RecuperarLeads', {});
    await refetch();
    setDisparando5min(false);
  }

  async function handleDisparar() {
    setDisparando(true);
    const res = await base44.functions.invoke('m31ReguaAutomatica', {});
    await refetch();
    setDisparando(false);
    const r = res?.data || {};
    setDisparoResultado({
      enviados:    r.enviados ?? r.mensagens_enviadas ?? r.sent ?? 0,
      atualizados: r.atualizados ?? r.leads_processados ?? r.processed ?? 0,
      falhas:      r.falhas ?? r.erros ?? r.errors ?? 0,
    });
  }
  async function handleSaveTmpl(id, content) {
    await base44.entities.M31MessageTemplate.update(id, { content });
    qc.invalidateQueries({ queryKey: ['m31templates'] });
    setEditTmpl(null);
  }

  function exportCSV() {
    const rows = leads.map(l => [l.nome, l.email, l.whatsapp, l.status_pagamento, l.valor_pago, l.lote].join(','));
    const csv = ['nome,email,whatsapp,status,valor,lote', ...rows].join('\n');
    const a = document.createElement('a'); a.href = 'data:text/csv,' + encodeURIComponent(csv); a.download = 'leads.csv'; a.click();
  }

  if (isLoading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
      <div style={{ width: '28px', height: '28px', border: `2px solid ${C.border}`, borderTopColor: C.brand, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ fontFamily: 'Inter,sans-serif', fontSize: '14px', color: C.text, WebkitFontSmoothing: 'antialiased', maxWidth: '100%', overflowX: 'hidden' }}>

      {/* SUB-TABS */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', background: C.bg2, borderRadius: '10px', padding: '4px', border: `1px solid ${C.border}` }}>
        {[{ id: 'leads', label: 'Leads' }, { id: 'regua', label: 'Régua' }].map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontFamily: 'Inter,sans-serif', fontSize: '13px', fontWeight: subTab === t.id ? '700' : '500', background: subTab === t.id ? C.bg4 : 'transparent', color: subTab === t.id ? C.text : C.textSec, transition: 'all .15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'regua' ? (
        <M31ReguaAutomacao />
      ) : (
        <>
          <UazapiStatusBar />

          {/* RECEITA DESTACADA */}
          <div style={{ background: `linear-gradient(135deg, ${C.bg2} 0%, rgba(122,31,43,0.08) 100%)`, border: `1px solid ${C.brandBorder}`, borderRadius: '12px', padding: '16px', marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: '600', color: C.textTer, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '4px' }}>Receita recuperável</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: C.text, fontVariantNumeric: 'tabular-nums', marginBottom: '2px' }}>{fmtBRL(stats.receitaPendente)}</div>
            <div style={{ fontSize: '12px', color: C.textSec }}>{stats.totalPendentes} leads · {elegiveis} elegíveis para contato</div>
          </div>

          {/* KPI GRID */}
          <KpiGrid stats={stats} elegiveis={elegiveis} />

          {/* ABANDONO APÓS WHATSAPP */}
          <AbandonoWppCard
            stats5min={stats5min}
            onDisparar={handleDisparar5min}
            disparando={disparando5min}
          />

          {/* RÉGUA CARD */}
          <ReguaCard
            stats={stats}
            ativo={autoAtiva}
            onToggle={() => setAutoAtiva(v => !v)}
            proximoDisparo={proximoDisparo}
            onDisparar={handleDisparar}
            disparando={disparando}
          />

          {/* FILTROS TABS */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
              {TABS.map(t => (
                <button key={t.val} onClick={() => setFiltro(t.val)} style={{ padding: '8px 14px', fontSize: '13px', fontWeight: filtro === t.val ? '700' : '500', color: filtro === t.val ? C.text : C.textSec, background: filtro === t.val ? C.bg4 : C.bg2, border: `1px solid ${filtro === t.val ? C.borderSt : C.border}`, borderRadius: '20px', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'Inter,sans-serif', minHeight: '36px', flexShrink: 0 }}>
                  {t.label}
                  <span style={{ fontSize: '11px', fontWeight: '700', padding: '1px 6px', borderRadius: '10px', background: filtro === t.val ? 'rgba(0,0,0,0.06)' : C.bg3, color: filtro === t.val ? C.textSec : C.textTer }}>
                    {tabCounts[t.val]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* BUSCA + ORDENAR + EXPORTAR */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <div style={{ flex: 1, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '0 12px', display: 'flex', alignItems: 'center', gap: '8px', minHeight: '44px' }}>
              <IcoSearch sz={14} />
              <input
                style={{ background: 'none', border: 'none', outline: 'none', color: C.text, fontFamily: 'Inter,sans-serif', fontSize: '14px', flex: 1, width: '100%' }}
                placeholder="Buscar…"
                value={busca}
                onChange={e => setBusca(e.target.value)}
              />
            </div>
            <button onClick={exportCSV} style={{ width: '44px', height: '44px', background: C.bg2, border: `1px solid ${C.border}`, borderRadius: '10px', color: C.textSec, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <IcoDownload sz={16} />
            </button>
          </div>

          {/* ORDENAR ROW */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', color: C.textSec }}>{leads.length} leads</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {['valor', 'prioridade', 'recente'].map(o => (
                <button key={o} onClick={() => setOrdenar(o)} style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '20px', border: `1px solid ${ordenar === o ? C.borderSt : C.border}`, background: ordenar === o ? C.bg4 : C.bg2, color: ordenar === o ? C.text : C.textSec, cursor: 'pointer', fontFamily: 'Inter,sans-serif', fontWeight: ordenar === o ? '600' : '400', minHeight: '32px' }}>
                  {o}
                </button>
              ))}
              <button onClick={() => refetch()} style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '20px', border: `1px solid ${C.border}`, background: C.bg2, color: C.textTer, cursor: 'pointer', fontFamily: 'Inter,sans-serif', minHeight: '32px', display: 'flex', alignItems: 'center' }}>
                <IcoRefresh sz={12} />
              </button>
            </div>
          </div>

          {/* LEAD CARDS */}
          {leads.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 16px', color: C.textTer, fontSize: '14px', background: C.bg2, borderRadius: '12px', border: `1px solid ${C.border}` }}>
              Nenhum lead neste filtro
            </div>
          ) : (
            leads.map(lead => (
              <LeadCard key={lead.id} lead={lead} enviando={enviando} onReenviar={handleReenviar} onRecuperar={handleRecuperar} />
            ))
          )}

          {/* TEMPLATES */}
          {templates.length > 0 && (
            <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '16px', marginTop: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '.06em', textTransform: 'uppercase', color: C.textTer, marginBottom: '14px' }}>Templates de mensagem</div>
              {templates.map((t, i) => (
                <div key={t.id} style={{ padding: '12px 0', borderBottom: i < templates.length - 1 ? `1px solid ${C.border}` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '500', color: C.text, marginBottom: '2px' }}>{t.name}</div>
                    <div style={{ fontSize: '11px', color: C.textTer }}>{t.sends_total > 0 ? `${t.sends_total} envios · ${t.responses_total || 0} respostas` : 'Sem envios ainda'}</div>
                  </div>
                  <button onClick={() => setEditTmpl(t)} style={{ padding: '8px 14px', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: '8px', color: C.textSec, fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'Inter,sans-serif', minHeight: '36px' }}>
                    <IcoEdit sz={12} /> Editar
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {editTmpl && <TemplateEditor template={editTmpl} onSave={handleSaveTmpl} onClose={() => setEditTmpl(null)} />}
      {disparoResultado && <DisparoFeedback resultado={disparoResultado} onClose={() => setDisparoResultado(null)} />}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.3} }
      `}</style>
    </div>
  );
}