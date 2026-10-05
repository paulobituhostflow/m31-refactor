import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { M31Logo } from '@/components/M31Logo';
import { computeM31Metrics } from '@/lib/m31Metrics';
import { DollarSign, BarChart3, Target,
  Shield, Activity, ChevronRight, Wifi, Zap, AlertCircle, Trophy,
  Clock, HandHeart, Layers, Package, AlertTriangle, CreditCard,
  Eye, EyeOff,
} from 'lucide-react';

/* ────────────────────────────────────────────────────────────────────────────
   DESIGN SYSTEM :: M31 Premium Dashboard
   Ref: Linear · Vercel · Stripe · Notion Calendar
   ──────────────────────────────────────────────────────────────────────────── */

const WINE = '#8B1A2B';
const WINE_GLOW = 'rgba(139,26,43,0.12)';
const SUCCESS = '#059669';
const WARN = '#D97706';
const DANGER = '#DC2626';
const INFO = '#2563EB';
const TEXT = '#0F172A';
const SEC = '#475569';
const MUTED = '#94A3B8';
const SAND = '#F8F6F2';

/* ── Navegação rápida (URL params → M31Admin) ── */
const nav = (path) => () => { window.location.href = path; };

/* ── Hero Card ─────────────────────────────────────────────────────────────── */
function HeroCard({ total, aprovadas, confirmadasFinanceiramente = 0, voluntarias = 0, pendentes, emConciliacao = 0, abandonados }) {
  const meta = 1000;

  return (
    <div style={{
      position: 'relative',
      gridColumn: '1 / -1',
      background: 'linear-gradient(160deg, #FFFFFF 0%, #FDFCFB 40%, #F9F7F3 100%)',
      borderRadius: '24px',
      border: '1px solid rgba(0,0,0,0.05)',
      padding: '36px 40px',
      boxShadow: `
        0 1px 0 rgba(255,255,255,0.8) inset,
        0 4px 24px -1px ${WINE_GLOW},
        0 2px 8px -2px rgba(0,0,0,0.04),
        0 20px 48px -12px rgba(0,0,0,0.06)
      `,
      overflow: 'hidden',
    }}>
      {/* Decorative glow */}
      <div style={{
        position: 'absolute', top: '-60px', right: '-40px',
        width: '240px', height: '240px',
        background: 'radial-gradient(circle, rgba(139,26,43,0.06) 0%, transparent 70%)',
        borderRadius: '50%', pointerEvents: 'none',
      }} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
        <div>
          <div style={{ marginBottom: '24px' }}>
            <M31Logo size="lg" />
          </div>

          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: 'rgba(139,26,43,0.06)',
            borderRadius: '100px', padding: '4px 14px',
            marginBottom: '16px',
          }}>
            <div style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: WINE,
              boxShadow: `0 0 6px ${WINE}`,
            }} />
            <span style={{
              fontSize: '10px', fontWeight: '700', letterSpacing: '0.12em',
              textTransform: 'uppercase', color: WINE,
            }}>
              Evento em andamento
            </span>
          </div>

          <h2 style={{
            fontFamily: '"Inter", sans-serif',
            fontSize: '28px', fontWeight: '800',
            color: TEXT, letterSpacing: '-0.03em',
            margin: '0 0 4px 0', lineHeight: 1.1,
          }}>
            M31 Filhas 2026
          </h2>
          <p style={{
            fontSize: '13px', color: SEC, margin: 0,
            fontWeight: '400',
          }}>
            Central de Operações · Imersão de Mulheres
          </p>
        </div>

        {/* Mini KPI clusters */}
        <div style={{ display: 'flex', gap: '24px', position: 'relative', zIndex: 1 }}>
          <MiniKPI value={aprovadas} label="Inscritas" color={WINE} onClick={nav('/m31-admin?tab=participantes&aba=inscricoes&status=aprovado')} />
          <MiniKPI value={pendentes} label="Pag. Pendente" color={WARN} onClick={nav('/m31-admin?tab=participantes&aba=inscricoes&status=pendente')} />
          <MiniKPI value={abandonados} label="Abandonos" color={DANGER} onClick={nav('/m31-admin?tab=participantes&aba=inscricoes&status=checkout_abandonado')} />
        </div>
      </div>

      {/* Progress Section */}
      <div style={{ marginTop: '28px', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: SEC, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Meta: {meta.toLocaleString('pt-BR')} mulheres
            </span>
            <span style={{ fontSize: '11px', color: MUTED }}>·</span>
            <span style={{ fontSize: '11px', color: SEC }}>
              {confirmadasFinanceiramente} confirmadas financeiramente · {emConciliacao} em conciliação · {total} registros no banco
            </span>
          </div>
          <span style={{
            fontFamily: '"Inter", sans-serif',
            fontSize: '14px', fontWeight: '700', color: WINE,
          }}>
            {Math.min(Math.round((aprovadas / meta) * 100), 100)}% concluído
          </span>
        </div>

        {/* Glass progress bar */}
        <div style={{
          height: '16px', background: 'rgba(0,0,0,0.04)',
          borderRadius: '100px', overflow: 'hidden',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.04)',
        }}>
          <div style={{
            height: '100%', width: `${Math.min(Math.round((aprovadas / meta) * 100), 100)}%`,
            background: `linear-gradient(90deg, ${WINE} 0%, #D4748B 40%, #E8A0B0 100%)`,
            borderRadius: '100px',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 0 12px rgba(139,26,43,0.2)',
            transition: 'width 1.4s cubic-bezier(0.22, 1, 0.36, 1)',
            position: 'relative',
          }}>
            {/* Shine */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(180deg, rgba(255,255,255,0.4) 0%, transparent 50%)',
              borderRadius: '100px',
            }} />
          </div>
        </div>

        {/* Sub metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: '16px' }}>
          <MetricDot label="Inscritas reconhecidas" value={aprovadas} color={SUCCESS} pct={total > 0 ? Math.round((aprovadas / total) * 100) : 0} onClick={nav('/m31-admin?tab=participantes&aba=inscricoes')} />
          <MetricDot label="Pag. pendente" value={pendentes} color={WARN} pct={total > 0 ? Math.round((pendentes / total) * 100) : 0} onClick={nav('/m31-admin?tab=participantes&aba=inscricoes&status=pendente')} />
          <MetricDot label="Abandonaram" value={abandonados} color={DANGER} pct={total > 0 ? Math.round((abandonados / total) * 100) : 0} onClick={nav('/m31-admin?tab=participantes&aba=inscricoes&status=checkout_abandonado')} />
          <MetricDot label="Voluntárias (à parte)" value={voluntarias} color={INFO} pct={0} onClick={nav('/m31-admin?tab=voluntarios')} />
        </div>
      </div>
    </div>
  );
}

function MiniKPI({ value, label, color, onClick }) {
  return (
    <div onClick={onClick} style={{ textAlign: 'center', minWidth: '80px', cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{
        fontFamily: '"Inter", sans-serif',
        fontSize: '36px', fontWeight: '800',
        color, letterSpacing: '-0.04em', lineHeight: 1,
      }}>
        {value.toLocaleString('pt-BR')}
      </div>
      <div style={{
        fontSize: '10px', fontWeight: '600',
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: SEC, marginTop: '2px',
      }}>
        {label}
      </div>
    </div>
  );
}

function MetricDot({ label, value, color, pct, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '8px 12px', borderRadius: '10px',
      background: 'rgba(0,0,0,0.015)',
      cursor: onClick ? 'pointer' : 'default',
    }}>
      <div style={{
        width: '8px', height: '8px', borderRadius: '50%',
        background: color, flexShrink: 0,
        boxShadow: `0 0 5px ${color}55`,
      }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '11px', color: SEC, fontWeight: '500' }}>{label}</div>
        <div style={{ fontSize: '12px', fontWeight: '700', color: TEXT }}>
          {value} {pct > 0 ? <span style={{ fontSize: '10px', color: MUTED }}>({pct}%)</span> : null}
        </div>
      </div>
    </div>
  );
}

/* ── Glass Section Header ──────────────────────────────────────────────────── */
function SectionLabel({ icon: Icon, label, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
      <div style={{
        width: '24px', height: '24px', borderRadius: '7px',
        background: `${color}14`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={12} color={color} />
      </div>
      <span style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color }}>
        {label}
      </span>
    </div>
  );
}

/* ── Premium Card ──────────────────────────────────────────────────────────── */
function PremiumCard({ children, style }) {
  return (
    <div style={{
      background: 'linear-gradient(160deg, rgba(255,255,255,0.95) 0%, rgba(252,251,249,0.9) 100%)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderRadius: '18px',
      border: '1px solid rgba(0,0,0,0.05)',
      padding: '22px',
      boxShadow: `
        0 1px 0 rgba(255,255,255,0.6) inset,
        0 2px 12px -2px rgba(0,0,0,0.03),
        0 8px 24px -6px rgba(0,0,0,0.04)
      `,
      transition: 'transform 0.2s ease, box-shadow 0.3s ease',
      display: 'flex', flexDirection: 'column', gap: '14px',
      ...style,
    }}
    onMouseEnter={e => {
      e.currentTarget.style.transform = 'translateY(-2px)';
      e.currentTarget.style.boxShadow = `0 1px 0 rgba(255,255,255,0.6) inset, 0 4px 20px -2px rgba(139,26,43,0.06), 0 12px 32px -8px rgba(0,0,0,0.06)`;
    }}
    onMouseLeave={e => {
      e.currentTarget.style.transform = '';
      e.currentTarget.style.boxShadow = '';
    }}
    >
      {children}
    </div>
  );
}

/* ── Financeiro Card ───────────────────────────────────────────────────────── */
function CardFinanceiro({ inscricoes }) {
  const [mostrarValores, setMostrarValores] = useState(false);
  const aprovadas = inscricoes.filter(i => i.status_pagamento === 'aprovado' || i.status_pagamento === 'gratuito');
  const totalGeral = aprovadas.reduce((s, i) => s + (i.valor_pago || 0), 0);
  const comValor = aprovadas.filter(i => (i.valor_pago || 0) > 0);
  const ticketMedio = comValor.length > 0
    ? Math.round(comValor.reduce((s, i) => s + (i.valor_pago || 0), 0) / comValor.length)
    : 0;

  // Auditoria pendente: pagamentos duplicados reais confirmados no Asaas (dedup por CPF)
  const auditFlag = inscricoes.filter(i => i.observacoes && i.observacoes.includes('AUDITORIA PENDENTE'));
  const cpfAudit = new Map();
  auditFlag.forEach(i => {
    const cpf = (i.cpf || '').replace(/\D/g, '');
    if (cpf && !cpfAudit.has(cpf)) cpfAudit.set(cpf, i.valor_pago || 0);
  });
  const auditoriaPendenteValor = Array.from(cpfAudit.values()).reduce((s, v) => s + v, 0);
  const auditoriaPendentePessoas = cpfAudit.size;

  // Receita real dos últimos 7 dias por dia da semana
  const diasSemana = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const hoje = new Date();
  const semana = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(d.getDate() - i);
    const diaIdx = d.getDay();
    const dataStr = d.toISOString().slice(0, 10);
    const val = inscricoes
      .filter(ins => {
        if (!ins.created_date) return false;
        const inscData = new Date(ins.created_date).toISOString().slice(0, 10);
        return inscData === dataStr && (ins.status_pagamento === 'aprovado' || ins.status_pagamento === 'gratuito');
      })
      .reduce((s, ins) => s + (ins.valor_pago || 0), 0);
    semana.push({ dia: diasSemana[diaIdx], val: Math.round(val) });
  }
  const maxBar = Math.max(...semana.map(s => s.val), 1);

  return (
    <PremiumCard>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <SectionLabel icon={DollarSign} label="Financeiro" color="#0D9488" />
        <button
          onClick={() => setMostrarValores(!mostrarValores)}
          title={mostrarValores ? 'Ocultar valores' : 'Revelar valores'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '6px' }}
        >
          {mostrarValores
            ? <EyeOff size={14} color={MUTED} />
            : <Eye size={14} color={MUTED} />}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <NumBloco valor={`R$ ${totalGeral.toLocaleString('pt-BR')}`} label="Total arrecadado" visivel={mostrarValores} onClick={nav('/m31-admin?tab=participantes&aba=inscricoes&status=aprovado')} />
        <NumBloco valor={`R$ ${ticketMedio}`} label="Ticket médio" visivel={mostrarValores} onClick={nav('/m31-admin?tab=participantes&aba=inscricoes&status=aprovado')} />
      </div>
      {/* Mini bar chart */}
      <div>
        <div style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTED, marginBottom: '8px' }}>
          Esta semana
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '60px' }}>
          {semana.map((s, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <div style={{
                width: '100%', height: `${(s.val / maxBar) * 48}px`,
                background: s.val > 0
                  ? 'linear-gradient(180deg, #0D9488 0%, #14B8A6 100%)'
                  : 'rgba(0,0,0,0.05)',
                borderRadius: '6px 6px 2px 2px',
                boxShadow: s.val > 0 ? '0 2px 6px rgba(13,148,136,0.2)' : 'none',
                transition: 'height 0.6s ease-out',
                minHeight: s.val > 0 ? '8px' : '2px',
              }} />
              <span style={{ fontSize: '10px', color: MUTED }}>{s.dia}</span>
            </div>
          ))}
        </div>
      </div>
      {auditoriaPendentePessoas > 0 && (
        <AuditoriaPendenteRow valor={auditoriaPendenteValor} pessoas={auditoriaPendentePessoas} />
      )}
    </PremiumCard>
  );
}

function AuditoriaPendenteRow({ valor, pessoas }) {
  const [visivel, setVisivel] = useState(false);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 12px', borderRadius: '10px',
      background: 'rgba(217,119,6,0.05)',
      border: '1px dashed rgba(217,119,6,0.3)',
    }}>
      <div>
        <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.06em', textTransform: 'uppercase', color: WARN }}>
          Auditoria pendente
        </div>
        <div style={{ fontSize: '10px', color: MUTED, marginTop: '1px' }}>
          {pessoas} pagtos duplicados · aguarda decisão
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{
          fontFamily: '"Inter", sans-serif',
          fontSize: '14px', fontWeight: '700',
          color: visivel ? WARN : 'transparent',
          textShadow: visivel ? 'none' : '0 0 8px rgba(217,119,6,0.5)',
          transition: 'all 0.2s',
        }}>
          {visivel ? `R$ ${valor.toLocaleString('pt-BR')}` : 'R$ •••'}
        </span>
        <button onClick={() => setVisivel(!visivel)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', padding: '2px',
        }}>
          {visivel ? <EyeOff size={14} color={MUTED} /> : <Eye size={14} color={MUTED} />}
        </button>
      </div>
    </div>
  );
}

function NumBloco({ valor, label, visivel = true, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: 'rgba(0,0,0,0.012)', borderRadius: '10px',
      padding: '10px 12px',
      cursor: onClick ? 'pointer' : 'default',
    }}>
      <div style={{
        fontFamily: '"Inter", sans-serif',
        fontSize: '18px', fontWeight: '800',
        color: visivel ? TEXT : 'transparent',
        textShadow: visivel ? 'none' : '0 0 10px rgba(15,23,42,0.35)',
        transition: 'all 0.2s',
        userSelect: visivel ? 'auto' : 'none',
      }}>
        {visivel ? valor : 'R$ ••••'}
      </div>
      <div style={{ fontSize: '10px', fontWeight: '500', color: MUTED, marginTop: '2px' }}>
        {label}
      </div>
    </div>
  );
}

/* ── Funil de Conversão ────────────────────────────────────────────────────── */
function CardFunil({ metricas }) {
  const leads = metricas.total || 0;
  const checkout = metricas.aprovadas + metricas.pendentes + (metricas.abandonados || 0);
  const pagaram = metricas.aprovadas || 0;

  const etapas = [
    { label: 'Leads', valor: leads, cor: WINE, href: '/m31-admin?tab=participantes&aba=inscricoes' },
    { label: 'Checkout', valor: checkout, cor: '#C8405C', href: '/m31-admin?tab=participantes&aba=inscricoes&status=pendente' },
    { label: 'Pagaram', valor: pagaram, cor: SUCCESS, href: '/m31-admin?tab=participantes&aba=inscricoes&status=aprovado' },
  ];

  const maxVal = Math.max(...etapas.map(e => e.valor), 1);

  return (
    <PremiumCard>
      <SectionLabel icon={BarChart3} label="Funil de Conversão" color="#6366F1" />
      <div style={{ position: 'relative' }}>
        {etapas.map((e, i) => {
          const drop = i > 0 ? etapas[i - 1].valor - e.valor : 0;
          return (
            <div key={i} onClick={nav(e.href)} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: '600', color: SEC }}>{e.label}</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  {i > 0 && drop > 0 && (
                    <span style={{ fontSize: '10px', color: DANGER, fontWeight: '600' }}>-{drop}</span>
                  )}
                  <span style={{ fontSize: '14px', fontWeight: '700', color: e.cor }}>
                    {e.valor.toLocaleString('pt-BR')}
                  </span>
                </div>
              </div>
              <div style={{
                height: '10px', background: 'rgba(0,0,0,0.04)',
                borderRadius: '100px', overflow: 'hidden',
                marginBottom: i < etapas.length - 1 ? '8px' : 0,
              }}>
                <div style={{
                  height: '100%', width: `${(e.valor / maxVal) * 100}%`,
                  background: `linear-gradient(90deg, ${e.cor}, ${e.cor}88)`,
                  borderRadius: '100px',
                  transition: 'width 1s ease-out',
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </PremiumCard>
  );
}

/* ── Saúde do Sistema ──────────────────────────────────────────────────────── */
function CardSaude() {
  const { data: saude, isError } = useQuery({
    queryKey: ['m31-dashboard-health'],
    queryFn: async () => (await base44.functions.invoke('m31HealthCheck', {})).data,
    refetchInterval: 60000,
    retry: false,
  });
  const fallback = isError ? 'error' : 'unknown';
  const providerLabel = (provider) => provider?.message?.includes('simulado')
    ? 'Simulado'
    : ({ success: 'Online', warning: 'Atenção', error: 'Indisponível', unknown: 'Sem observação' }[provider?.status || fallback]);
  const automationFailed = (saude?.automations?.failed || 0) + (saude?.queue?.failed || 0);
  const servicos = [
    { nome: 'ASAAS', status: saude?.asaas?.status || fallback, label: providerLabel(saude?.asaas), icon: Shield },
    { nome: 'UAZAPI', status: saude?.uazapi?.status || fallback, label: providerLabel(saude?.uazapi), icon: Activity },
    { nome: 'Webhooks', status: saude?.webhooks?.status || fallback, label: providerLabel(saude?.webhooks), icon: Wifi },
    { nome: 'Automações', status: !saude ? fallback : automationFailed ? 'error' : saude.automations?.active ? 'success' : 'warning', label: !saude ? (isError ? 'Indisponível' : 'Consultando') : automationFailed ? `${automationFailed} falhas` : saude.automations?.active ? `${saude.automations.active} ativas` : 'Pausadas', icon: Zap },
  ];

  return (
    <PremiumCard>
      <SectionLabel icon={Activity} label="Saúde do Sistema" color="#6366F1" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {servicos.map((s, i) => {
          const isOn = s.status === 'success';
          const color = isOn ? SUCCESS : s.status === 'error' ? DANGER : s.status === 'unknown' ? MUTED : WARN;
          const svcHref = s.nome === 'ASAAS' ? '/m31-admin?tab=saude&focus=asaas'
            : s.nome === 'UAZAPI' ? '/m31-admin?tab=saude&focus=uazapi'
            : s.nome === 'Webhooks' ? '/m31-admin?tab=saude&focus=webhooks'
            : '/m31-admin?tab=operacoes';
          return (
            <div key={i} onClick={nav(svcHref)} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '8px 10px', borderRadius: '10px',
              background: 'rgba(0,0,0,0.015)',
              cursor: 'pointer',
            }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '8px',
                background: `${color}14`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <s.icon size={13} color={color} />
              </div>
              <span style={{ fontSize: '12px', fontWeight: '500', color: TEXT, flex: 1 }}>{s.nome}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: color,
                  boxShadow: `0 0 8px ${color}66`,
                  animation: isOn ? 'pulse-green 2s infinite' : 'none',
                }} />
                <span style={{ fontSize: '10px', fontWeight: '600', color }}>
                  {s.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div onClick={nav('/m31-admin?tab=saude')} style={{ fontSize: '10px', color: MUTED, textAlign: 'center', cursor: 'pointer' }}>
        {saude?.timestamp ? `Consultado às ${new Date(saude.timestamp).toLocaleTimeString('pt-BR')}` : isError ? 'Não foi possível consultar' : 'Consultando estados'}
      </div>
    </PremiumCard>
  );
}

/* ── Status do Estoque (Lotes) ─────────────────────────────────────────────── */
function CardLotes({ inscricoes }) {
  const lotes = [
    { key: 'lote_1', nome: 'Lote 1', cor: WINE },
    { key: 'lote_2', nome: 'Lote 2', cor: '#C8405C' },
    { key: 'lote_3', nome: 'Lote 3', cor: '#D4748B' },
    { key: 'lote_4', nome: 'Lote 4', cor: '#E8A0B0' },
  ];

  const distribuicao = lotes.map(l => {
    const lote = inscricoes.filter(i => i.lote === l.key);
    const total = lote.length;
    const pagas = lote.filter(i => i.status_pagamento === 'aprovado' || i.status_pagamento === 'gratuito').length;
    const pendentes = lote.filter(i => i.status_pagamento === 'pendente' || i.status_pagamento === 'checkout_pendente').length;
    const abandonados = lote.filter(i => i.status_pagamento === 'checkout_abandonado').length;
    return { ...l, total, pagas, pendentes, abandonados };
  });

  const maxTotal = Math.max(...distribuicao.map(d => d.total), 1);

  return (
    <PremiumCard>
      <SectionLabel icon={Layers} label="Status do Estoque" color={WINE} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {distribuicao.map((l, i) => (
          <div key={l.key} onClick={nav('/m31-admin?tab=participantes&aba=inscricoes&lote=' + l.key)} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
              <span style={{ fontSize: '11px', fontWeight: '600', color: TEXT }}>{l.nome}</span>
              <span style={{ fontSize: '11px', fontWeight: '700', color: l.cor }}>{l.total}</span>
            </div>
            <div style={{
              height: '8px', background: 'rgba(0,0,0,0.04)',
              borderRadius: '100px', overflow: 'hidden',
              display: 'flex',
            }}>
              <div style={{
                height: '100%',
                width: l.total > 0 ? `${(l.pagas / l.total) * 100}%` : '0%',
                background: `linear-gradient(90deg, ${SUCCESS}, #34D399)`,
                transition: 'width 0.8s ease-out',
              }} />
              <div style={{
                height: '100%',
                width: l.total > 0 ? `${(l.pendentes / l.total) * 100}%` : '0%',
                background: `linear-gradient(90deg, ${WARN}, #FBBF24)`,
                transition: 'width 0.8s ease-out',
              }} />
              <div style={{
                height: '100%',
                width: l.total > 0 ? `${(l.abandonados / l.total) * 100}%` : '0%',
                background: `linear-gradient(90deg, ${DANGER}, #F87171)`,
                transition: 'width 0.8s ease-out',
              }} />
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '3px' }}>
              <span style={{ fontSize: '10px', color: SUCCESS }}>{l.pagas} pagas</span>
              <span style={{ fontSize: '10px', color: WARN }}>{l.pendentes} pend.</span>
              <span style={{ fontSize: '10px', color: DANGER }}>{l.abandonados} aband.</span>
            </div>
          </div>
        ))}
      </div>
    </PremiumCard>
  );
}

/* ── Ranking de Caravanas ──────────────────────────────────────────────────── */
function CardRankingCaravanas({ caravanas }) {
  const ranking = [...caravanas]
    .filter(c => c.ativa !== false)
    .sort((a, b) => (b.total_membros || 0) - (a.total_membros || 0))
    .slice(0, 5);

  return (
    <PremiumCard>
      <SectionLabel icon={Trophy} label="Ranking de Caravanas" color="#EA580C" />
      {ranking.map((c, i) => {
        const isTop = i < 3;
        const colors = ['#F59E0B', '#94A3B8', '#CD853F'];
        return (
          <div key={c.id} onClick={nav('/m31-admin?tab=participantes&aba=caravanas')} style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '8px 10px', borderRadius: '10px',
            background: isTop ? `${colors[i]}08` : 'rgba(0,0,0,0.012)',
            border: isTop ? `1px solid ${colors[i]}20` : '1px solid transparent',
            cursor: 'pointer',
          }}>
            <span style={{
              fontSize: '11px', fontWeight: '700', width: '24px', textAlign: 'center',
              color: isTop ? colors[i] : MUTED,
            }}>
              {isTop ? ['1º','2º','3º'][i] : `${i+1}º`}
            </span>
            <span style={{ fontSize: '13px', color: TEXT, fontWeight: '500', flex: 1 }}>
              {c.nome}
            </span>
            <span style={{
              fontSize: '11px', fontWeight: '700',
              background: `${isTop ? colors[i] : '#94A3B8'}18`,
              color: isTop ? colors[i] : MUTED,
              padding: '2px 9px', borderRadius: '100px',
            }}>
              {c.total_membros || 0}
            </span>
          </div>
        );
      })}
    </PremiumCard>
  );
}

/* ── Voluntárias (por setor) ───────────────────────────────────────────────── */
function CardVoluntariasSetor({ voluntarios }) {
  const setores = [
    { key: 'intercessao', label: 'Intercessão', cor: '#7C3AED' },
    { key: 'louvor',      label: 'Louvor',      cor: '#2563EB' },
    { key: 'alimentacao', label: 'Alimentação',  cor: '#EA580C' },
    { key: 'midia',       label: 'Mídia',       cor: '#D97706' },
    { key: 'logistica',   label: 'Logística',   cor: '#059669' },
  ];

  const contagem = {};
  setores.forEach(s => {
    contagem[s.key] = voluntarios.filter(v => v.setor === s.key && v.status !== 'inativo').length;
  });
  const total = Object.values(contagem).reduce((a, b) => a + b, 0);
  const maxVal = Math.max(...Object.values(contagem), 1);

  return (
    <PremiumCard>
      <SectionLabel icon={HandHeart} label="Voluntárias" color="#7C3AED" />
      <div onClick={nav('/m31-admin?tab=voluntarios')} style={{
        fontFamily: '"Inter", sans-serif',
        fontSize: '22px', fontWeight: '800', color: TEXT,
        cursor: 'pointer',
      }}>
        {total} <span style={{ fontSize: '11px', fontWeight: '500', color: SEC }}>cadastradas</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {setores.map(s => {
          const val = contagem[s.key] || 0;
          return (
            <div key={s.key} onClick={nav('/m31-admin?tab=voluntarios&setor=' + s.key)} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <span style={{ fontSize: '10px', color: SEC, width: '75px', textAlign: 'right' }}>
                {s.label}
              </span>
              <div style={{
                flex: 1, height: '5px',
                background: 'rgba(0,0,0,0.04)',
                borderRadius: '100px', overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', width: `${Math.round((val / maxVal) * 100)}%`,
                  background: `linear-gradient(90deg, ${s.cor}, ${s.cor}88)`,
                  borderRadius: '100px', transition: 'width 0.6s ease-out',
                }} />
              </div>
              <span style={{ fontSize: '11px', fontWeight: '700', color: s.cor, width: '20px' }}>
                {val}
              </span>
            </div>
          );
        })}
      </div>
    </PremiumCard>
  );
}

/* ── Central do Gestor ─────────────────────────────────────────────────────── */
function CardCentralGestor({ metricas }) {
  const itens = [];
  if (metricas.abandonados > 0) itens.push({ label: `${metricas.abandonados} abandonaram checkout`, cor: DANGER, icon: AlertTriangle, href: '/m31-admin?tab=participantes&aba=leads' });
  itens.push({ label: `${metricas.tarefasCriticas?.length || 0} tarefas atrasadas`, cor: WARN, icon: AlertCircle, href: '/m31-admin?tab=tarefas&filtroChip=late' });
  itens.push({ label: 'Verificar lotes próximos do fim', cor: INFO, icon: Package, href: '/m31-admin?tab=lotes' });
  itens.push({ label: 'Atualizar templates WhatsApp', cor: SEC, icon: Zap, href: '/m31-admin?tab=config_bot' });

  return (
    <PremiumCard>
      <SectionLabel icon={Target} label="Central do Gestor" color={DANGER} />
      <div style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTED }}>
        O que precisa da sua atenção
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {itens.map((item, i) => (
          <div key={i} onClick={nav(item.href)} style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '9px 12px', borderRadius: '10px',
            background: `${item.cor}06`,
            border: `1px solid ${item.cor}14`,
            cursor: 'pointer',
          }}>
            <div style={{
              width: '26px', height: '26px', borderRadius: '7px',
              background: `${item.cor}16`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <item.icon size={12} color={item.cor} />
            </div>
            <span style={{ fontSize: '11px', color: TEXT, fontWeight: '500', flex: 1 }}>
              {item.label}
            </span>
            <ChevronRight size={13} color={MUTED} />
          </div>
        ))}
      </div>
    </PremiumCard>
  );
}

/* ── Próximos Vencimentos ──────────────────────────────────────────────────── */
function CardProximosVencimentos({ tarefas }) {
  return (
    <PremiumCard>
      <SectionLabel icon={Clock} label="Próximos Vencimentos" color={WARN} />
      {tarefas.slice(0, 4).map((t, i) => {
        const dias = diasRestantes(t.prazo);
        return (
          <div key={t.id || i} onClick={nav('/m31-admin?tab=tarefas')} style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '7px 10px', borderRadius: '8px',
            background: i % 2 === 0 ? 'rgba(0,0,0,0.012)' : 'transparent',
            cursor: 'pointer',
          }}>
            <div style={{
              width: '5px', height: '5px', borderRadius: '50%',
              background: WARN, flexShrink: 0,
            }} />
            <span style={{ fontSize: '12px', color: TEXT, flex: 1 }}>{t.titulo}</span>
            <span style={{
              fontSize: '10px', fontWeight: '700',
              padding: '2px 7px', borderRadius: '5px',
              background: `${WARN}14`, color: WARN,
            }}>
              {dias}
            </span>
          </div>
        );
      })}
    </PremiumCard>
  );
}

/* ── Últimos Pagamentos ────────────────────────────────────────────────────── */
function CardUltimosPagamentos({ pagtos }) {
  const cores = [WINE, '#7C3AED', '#EA580C', '#0D9488', '#2563EB'];
  return (
    <PremiumCard>
      <SectionLabel icon={CreditCard} label="Últimos Pagamentos" color="#0D9488" />
      {pagtos.slice(0, 5).map((p, i) => (
        <div key={i} onClick={nav('/m31-admin?tab=participantes&aba=inscricoes&status=aprovado')} style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '6px 8px', borderRadius: '8px',
          cursor: 'pointer',
        }}>
          <div style={{
            width: '26px', height: '26px', borderRadius: '50%',
            background: `linear-gradient(135deg, ${cores[i]}, ${cores[i]}cc)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '10px', fontWeight: '700', color: '#fff',
            flexShrink: 0,
          }}>
            {p.nome?.[0] || '?'}
          </div>
          <span style={{ fontSize: '12px', color: TEXT, fontWeight: '500', flex: 1 }}>
            {p.nome}
          </span>
          <span style={{ fontSize: '12px', fontWeight: '700', color: SUCCESS }}>
            R$ {(p.valor_pago || 0).toFixed(0)}
          </span>
        </div>
      ))}
    </PremiumCard>
  );
}

/* ── Helpers ───────────────────────────────────────────────────────────────── */
function diasRestantes(prazo) {
  if (!prazo) return '—';
  const diff = Math.ceil((new Date(prazo + 'T12:00:00') - new Date()) / 86400000);
  if (diff < 0) return 'Vencido';
  if (diff === 0) return 'Hoje';
  return `${diff}d`;
}

/* ══════════════════════════════════════════════════════════════════════════════
   DASHBOARD PRINCIPAL
   ══════════════════════════════════════════════════════════════════════════════ */
export default function M31BentoDashboard() {
  const { data: inscricoes = [] } = useQuery({
    queryKey: ['m31-bento-inscricoes'],
    queryFn: () => base44.entities.EventoM31Inscricao.list('-created_date', 2000),
    refetchInterval: 30000,
  });
  const { data: caravanas = [] } = useQuery({
    queryKey: ['m31-bento-caravanas'],
    queryFn: () => base44.entities.EventoM31Caravana.list('-created_date', 50),
    refetchInterval: 30000,
  });
  const { data: voluntarios = [] } = useQuery({
    queryKey: ['m31-bento-voluntarios'],
    queryFn: () => base44.entities.EventoM31Voluntario.list('-created_date', 100),
    refetchInterval: 30000,
  });
  const { data: tarefas = [] } = useQuery({
    queryKey: ['m31-bento-tarefas'],
    queryFn: () => base44.entities.EventoM31Tarefa.list('-created_date', 200),
    refetchInterval: 30000,
  });

  const m = useMemo(() => {
    // REGRA OFICIAL ÚNICA (m31Metrics) — mesma fonte de todas as telas
    const base = computeM31Metrics(inscricoes);
    const total = base.totalBanco;
    // Headcount operacional reconhecido (Filhas + Caravana). Cadastro incompleto não exclui.
    const aprovadas = base.inscritasReconhecidas;
    const pendentes = base.cobrancasPendentes;
    const abandonados = base.abandonaram;
    const confirmadasFinanceiramente = base.comuns;
    const emConciliacao = base.emConciliacao;
    const voluntarias = base.voluntarias;

    const tarefasCriticas = tarefas.filter(t =>
      t.status === 'critico' || t.status === 'atrasado' || t.status === 'bloqueado'
    );
    const now = new Date();
    const tarefasProximas = tarefas.filter(t => {
      if (!t.prazo || t.status === 'concluido') return false;
      const d = (new Date(t.prazo + 'T12:00:00') - now) / 86400000;
      return d >= 0 && d <= 30;
    }).sort((a, b) => new Date(a.prazo) - new Date(b.prazo));

    // Homens (Paulo, José Silvestre) não são participantes do evento feminino:
    // registros marcados com "homem — evento feminino" nunca aparecem na lista.
    const pagtos = inscricoes
      .filter(i => i.valor_pago > 0 && !(i.observacoes || '').includes('homem — evento feminino'))
      .sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date))
      .slice(0, 5);

    return { total, aprovadas, pendentes, abandonados, confirmadasFinanceiramente, emConciliacao, voluntarias, tarefasCriticas, tarefasProximas, pagtos };
  }, [inscricoes, caravanas, voluntarios, tarefas]);

  return (
    <div style={{
      fontFamily: 'Inter, sans-serif',
      position: 'relative',
    }}>
      {/* Background gradient mesh */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: -1,
        background: `
          radial-gradient(ellipse 80% 50% at 20% 10%, rgba(139,26,43,0.025) 0%, transparent 60%),
          radial-gradient(ellipse 60% 40% at 80% 70%, rgba(99,102,241,0.02) 0%, transparent 50%),
          radial-gradient(ellipse 50% 30% at 50% 100%, rgba(13,148,136,0.02) 0%, transparent 50%)
        `,
        pointerEvents: 'none',
      }} />

      {/* Header */}
      <div style={{ marginBottom: '18px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2px',
        }}>
          <h1 style={{
            fontFamily: '"Inter", sans-serif',
            fontSize: '20px', fontWeight: '700',
            color: TEXT, margin: 0, letterSpacing: '-0.03em',
          }}>
            Visão Geral
          </h1>
          <div style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: SUCCESS,
            boxShadow: `0 0 6px ${SUCCESS}88`,
          }} />
        </div>
        <p style={{ fontSize: '11px', color: MUTED, margin: 0 }}>
          M31 Filhas · Imersão 2026 · Atualizado em tempo real
        </p>
      </div>

      {/* ═══ HERO ROW ═══ */}
      <HeroCard
        total={m.total}
        aprovadas={m.aprovadas}
        confirmadasFinanceiramente={m.confirmadasFinanceiramente}
        voluntarias={m.voluntarias}
        pendentes={m.pendentes}
        emConciliacao={m.emConciliacao}
        abandonados={m.abandonados}
      />

      {/* ═══ ROW 2: Financeiro · Funil · Saúde ═══ */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '16px', margin: '16px 0',
      }}>
        <CardFinanceiro inscricoes={inscricoes} />
        <CardFunil metricas={m} />
        <CardSaude />
      </div>

      {/* ═══ ROW 3: Lotes · Caravanas · Voluntárias ═══ */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '16px', marginBottom: '16px',
      }}>
        <CardLotes inscricoes={inscricoes} />
        <CardRankingCaravanas caravanas={caravanas} />
        <CardVoluntariasSetor voluntarios={voluntarios} />
      </div>

      {/* ═══ ROW 4: Gestor · Vencimentos · Pagamentos ═══ */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '16px', marginBottom: '16px',
      }}>
        <CardCentralGestor metricas={m} />
        <CardProximosVencimentos tarefas={m.tarefasProximas} />
        <CardUltimosPagamentos pagtos={m.pagtos} />
      </div>

      {/* Animations */}
      <style>{`
        @keyframes pulse-green {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.3); }
        }
        @media (max-width: 1200px) {
          .premium-row { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 768px) {
          .premium-row { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}