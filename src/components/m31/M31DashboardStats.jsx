import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { formatDateShortBR, getCurrentHourBR, TIMEZONE_BADGE } from '@/lib/dateUtils';
import { computeM31Metrics, estadoCanonicoDe } from '@/lib/m31Metrics';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  Users, CheckCircle, Clock, DollarSign, Calendar, TrendingUp,
  Zap, AlertCircle, MapPin, Target
} from 'lucide-react';

// ── EVENTO CONFIG ──────────────────────────────────────────────
const EVENT_DATE = new Date('2026-11-21T09:00:00'); // Altere para a data real do evento

// ── DESIGN TOKENS — neutral dark, no red tint ────────────────
const T = {
  bg0:     '#0A0A0C',
  bg1:     '#111114',
  bg2:     '#17171b',
  bg3:     '#1e1e23',
  border:  'rgba(255,255,255,0.06)',
  borderHi:'rgba(255,255,255,0.12)',
  text:    '#ededee',
  textSec: 'rgba(237,237,238,0.60)',
  textMut: 'rgba(237,237,238,0.35)',
  accent:  '#8B1A2B',
  accentLt:'#C44A62',
  green:   '#10b981',
  amber:   '#f59e0b',
  red:     '#ef4444',
  blue:    '#3b82f6',
  purple:  '#8b5cf6',
};

// ── HELPERS ────────────────────────────────────────────────────
const fmt = (n) => n?.toLocaleString('pt-BR') ?? '0';
const fmtBRL = (n) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
// Contagem SEMPRE pelo veredito canônico (estado_canonico). Antes este arquivo
// lia status_pagamento cru e por isso mostrava um número diferente das outras telas.
const isAprovado = (i) => ['confirmada', 'isenta'].includes(estadoCanonicoDe(i));
const isPendente = (i) => estadoCanonicoDe(i) === 'pendente';

function diasParaEvento() {
  const hoje = new Date();
  const diff = EVENT_DATE - hoje;
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// ── MICROINTERAÇÃO CARD ────────────────────────────────────────
function Card({ children, style = {}, onClick, glow }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        backgroundColor: hovered ? T.bg3 : T.bg2,
        border: `1px solid ${hovered ? T.borderHi : T.border}`,
        borderRadius: '12px',
        padding: '20px',
        transition: 'all 0.18s ease',
        transform: hovered ? 'translateY(-2px)' : 'none',
        boxShadow: glow && hovered ? `0 8px 32px ${T.accent}40` : hovered ? '0 4px 20px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.2)',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children, sub }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: '700', color: T.textMut, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {children}
      </div>
      {sub && <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: T.textMut, marginTop: '2px' }}>{sub}</div>}
    </div>
  );
}

function Badge({ children, color = T.amber }) {
  return (
    <span style={{
      backgroundColor: `${color}18`, color, border: `1px solid ${color}30`,
      borderRadius: '5px', padding: '2px 8px', fontSize: '11px',
      fontFamily: 'Inter, sans-serif', fontWeight: '600',
    }}>{children}</span>
  );
}

// ── BLOCO 1: KPI PRINCIPAL ─────────────────────────────────────
function TrendPill({ value, suffix = '' }) {
  if (value == null) return null;
  const pos = value >= 0;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '2px',
      fontSize: '11px', fontWeight: '600', padding: '2px 6px', borderRadius: '5px',
      backgroundColor: pos ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
      color: pos ? '#34D399' : '#F87171',
      border: `1px solid ${pos ? 'rgba(52,211,153,0.20)' : 'rgba(248,113,113,0.20)'}`,
    }}>{pos ? '↑' : '↓'} {Math.abs(value)}{suffix}</span>
  );
}

function KpiPrincipal({ icon: Icon, label, value, sub, trend, onClick }) {
  return (
    <Card onClick={onClick} glow={!!onClick} style={onClick ? { cursor: 'pointer' } : {}}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', fontWeight: '600', color: T.textMut, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {label}
        </span>
        <div style={{
          width: '26px', height: '26px', borderRadius: '7px',
          backgroundColor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={12} color={T.textMut} />
        </div>
      </div>
      <div style={{
        fontFamily: 'Inter, sans-serif', fontSize: '28px',
        fontWeight: '800', color: T.text, lineHeight: 1, marginBottom: '8px',
        letterSpacing: '-0.02em',
      }}>
        {value}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {sub && <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', color: T.textMut }}>{sub}</div>}
        {trend != null && <TrendPill value={trend} />}
      </div>
    </Card>
  );
}

// ── BLOCO 4: INSIGHTS ─────────────────────────────────────────
function InsightCard({ tipo, texto, icon: Icon }) {
  const cfg = {
    critico:     { color: T.red,    bgStr: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.20)' },
    atencao:     { color: T.amber,  bgStr: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.20)' },
    oportunidade:{ color: T.green,  bgStr: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.20)' },
  }[tipo] || { color: T.blue, bgStr: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.20)' };

  const [h, setH] = useState(false);
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        backgroundColor: h ? cfg.bgStr : 'transparent',
        border: `1px solid ${h ? cfg.border : T.border}`,
        borderRadius: '10px', padding: '14px 16px',
        display: 'flex', alignItems: 'flex-start', gap: '12px',
        transition: 'all 0.15s ease',
        transform: h ? 'translateX(3px)' : 'none',
      }}>
      <div style={{ width: '28px', height: '28px', borderRadius: '7px', backgroundColor: `${cfg.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
        <Icon size={13} color={cfg.color} />
      </div>
      <div>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: T.text, lineHeight: '1.5' }}>{texto}</div>
        <Badge color={cfg.color}>{tipo.toUpperCase()}</Badge>
      </div>
    </div>
  );
}

// ── TOOLTIP CUSTOMIZADO ────────────────────────────────────────
function CustomTooltip({ active, payload, label, prefix = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ backgroundColor: T.bg3, border: `1px solid ${T.borderHi}`, borderRadius: '8px', padding: '10px 14px' }}>
      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: T.textSec, marginBottom: '6px' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: '700', color: p.color }}>
          {prefix}{typeof p.value === 'number' && prefix === 'R$ ' ? fmtBRL(p.value).replace('R$\u00a0', '') : fmt(p.value)} <span style={{ fontSize: '11px', fontWeight: '400', color: T.textMut }}>{p.name}</span>
        </div>
      ))}
    </div>
  );
}

// ── FILTROS ────────────────────────────────────────────────────
const PERIODS = [
  { label: '7d', days: 7 },
  { label: '15d', days: 15 },
  { label: '30d', days: 30 },
  { label: 'Tudo', days: 9999 },
];

// ── COMPONENTE PRINCIPAL ───────────────────────────────────────
export default function M31DashboardStats({ onNavigate }) {
  const [period, setPeriod] = useState(30);
  const [filterLote, setFilterLote] = useState('todos');
  const [filterTipo, setFilterTipo] = useState('todos');

  const { data: lotes = [] } = useQuery({
    queryKey: ['m31lotes'],
    queryFn: () => base44.entities.EventoM31Lote.list('ordem', 10),
  });

  const { data: inscricoes = [], isLoading } = useQuery({
    queryKey: ['m31inscricoes'],
    queryFn: async () => {
      const insc = await base44.entities.EventoM31Inscricao.list('-created_date', 2000);
      const loteMap = Object.fromEntries(lotes.map(l => [l.codigo, l.valor]));
      
      // Se valor_pago for 0 ou não existir, usa o valor do lote
      return insc.map(i => ({
        ...i,
        valor_pago: i.valor_pago && i.valor_pago > 0 ? i.valor_pago : (loteMap[i.lote] || 0)
      }));
    },
    enabled: lotes.length > 0,
    refetchInterval: 60000,
  });

  // ── DADOS FILTRADOS ──────────────────────────────────────────
  const filtradas = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - period);
    return inscricoes.filter(i => {
      const dentroP = period === 9999 || new Date(i.created_date) >= cutoff;
      const dentroL = filterLote === 'todos' || i.lote === filterLote;
      const dentroT = filterTipo === 'todos' || i.tipo === filterTipo;
      return dentroP && dentroL && dentroT;
    });
  }, [inscricoes, period, filterLote, filterTipo]);

  // ── STATS GERAIS (sem filtro) ───────────────────────────────
  const global = useMemo(() => {
    const base = computeM31Metrics(inscricoes);
    const pagantes = inscricoes.filter(i => estadoCanonicoDe(i) === 'confirmada' && (i.valor_pago || 0) > 0);
    const ticketMedio = pagantes.length > 0
      ? pagantes.reduce((s, i) => s + (i.valor_pago || 0), 0) / pagantes.length
      : 0;
    const taxa = base.inscricoesCanonicas > 0
      ? Math.round(base.vagasOficiais / base.inscricoesCanonicas * 100)
      : 0;
    return {
      inscritasReconhecidas: base.inscritasReconhecidas,
      confirmadasFinanceiramente: base.confirmadasFinanceiramente,
      vagasOficiais: base.vagasOficiais,
      receita: base.receitaConfirmada,
      ticketMedio,
      cobrancasPendentes: base.cobrancasPendentes,
      emRevisao: base.emConciliacao,
      taxa,
    };
  }, [inscricoes]);

  // ── GRÁFICO EVOLUÇÃO DIÁRIA ─────────────────────────────────
  const evolucaoDados = useMemo(() => {
    const map = {};
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (period === 9999 ? 60 : period));
    inscricoes.filter(i => new Date(i.created_date) >= cutoff).forEach(i => {
      const d = formatDateShortBR(i.created_date);
      if (!map[d]) map[d] = { data: d, qtd: 0, receita: 0, confirmadas: 0 };
      map[d].qtd++;
      if (isAprovado(i)) { map[d].confirmadas++; map[d].receita += i.valor_pago || 0; }
    });
    return Object.values(map).sort((a, b) => {
      const [da, ma] = a.data.split('/').map(Number);
      const [db, mb] = b.data.split('/').map(Number);
      return ma !== mb ? ma - mb : da - db;
    });
  }, [inscricoes, period]);

  // ── GRÁFICO HORÁRIOS ────────────────────────────────────────
  const horariosDados = useMemo(() => {
    const map = {};
    for (let h = 0; h < 24; h++) map[h] = { hora: `${String(h).padStart(2,'0')}h`, vendas: 0 };
    inscricoes.filter(isAprovado).forEach(i => {
      const h = getCurrentHourBR
        ? parseInt(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Recife', hour: 'numeric', hour12: false }).format(new Date(i.created_date)), 10)
        : new Date(i.created_date).getHours();
      if (!isNaN(h)) map[h].vendas++;
    });
    return Object.values(map);
  }, [inscricoes]);

  // ── CIDADES TOP ─────────────────────────────────────────────
  const cidadesTop = useMemo(() => {
    const map = {};
    inscricoes.filter(i => i.cidade).forEach(i => {
      const c = i.cidade.trim();
      if (!map[c]) map[c] = 0;
      map[c]++;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([city, count]) => ({ city, count }));
  }, [inscricoes]);

  // ── PIZZA TIPOS ─────────────────────────────────────────────
  const tiposPizza = useMemo(() => {
    const m = { publico_geral: 0, voluntario: 0, caravana: 0, doacao: 0 };
    inscricoes.filter(isAprovado).forEach(i => { if (m[i.tipo] !== undefined) m[i.tipo]++; });
    const labels = { publico_geral: 'Público Geral', voluntario: 'Voluntários', caravana: 'Caravanas', doacao: 'Doações' };
    const colors = [T.accentLt, T.blue, T.green, T.purple];
    return Object.entries(m).map(([k, v], idx) => ({ name: labels[k], value: v, color: colors[idx] })).filter(e => e.value > 0);
  }, [inscricoes]);

  // ── PERFORMANCE LOTES ───────────────────────────────────────
  const lotesDados = useMemo(() => {
    return lotes.map(l => {
      const vendas = inscricoes.filter(i => i.lote === l.codigo && isAprovado(i)).length;
      const pendentes = inscricoes.filter(i => i.lote === l.codigo && isPendente(i)).length;
      const pct = l.vagas_total > 0 ? Math.round(vendas / l.vagas_total * 100) : 0;
      return { nome: l.nome, codigo: l.codigo, valor: l.valor, vagas: l.vagas_total, vendas, pendentes, pct, ativo: l.ativo };
    });
  }, [lotes, inscricoes]);

  // ── INSIGHTS AUTOMÁTICOS ────────────────────────────────────
  const insights = useMemo(() => {
    const list = [];
    const dias = diasParaEvento();
    const { confirmadasFinanceiramente, receita, ticketMedio, cobrancasPendentes, taxa } = global;

    if (cobrancasPendentes > 50) list.push({ tipo: 'critico', icon: AlertCircle, texto: `${cobrancasPendentes} cobranças identificadas continuam pendentes. Revise a recuperação.` });
    else if (cobrancasPendentes > 10) list.push({ tipo: 'atencao', icon: Clock, texto: `${cobrancasPendentes} cobranças identificadas estão pendentes.` });

    if (taxa < 30) list.push({ tipo: 'critico', icon: TrendingUp, texto: `Taxa de conversão está em apenas ${taxa}%. Revise a estratégia de comunicação.` });
    else if (taxa < 60) list.push({ tipo: 'atencao', icon: TrendingUp, texto: `Taxa de conversão em ${taxa}%. Há margem para melhoria com campanhas segmentadas.` });
    else list.push({ tipo: 'oportunidade', icon: CheckCircle, texto: `Ótima conversão! ${taxa}% dos inscritos confirmaram pagamento.` });

    if (dias < 30) list.push({ tipo: 'critico', icon: Calendar, texto: `Faltam apenas ${dias} dias para o evento e há ${cobrancasPendentes} cobranças pendentes.` });
    else if (dias < 60) list.push({ tipo: 'atencao', icon: Calendar, texto: `${dias} dias para o evento. Bom momento para intensificar campanhas de conversão.` });
    else list.push({ tipo: 'oportunidade', icon: Calendar, texto: `${dias} dias pela frente. Excelente janela para campanhas de remarketing e indicação.` });

    if (ticketMedio > 0) list.push({ tipo: 'oportunidade', icon: DollarSign, texto: `Ticket médio está em ${fmtBRL(ticketMedio)}. Considere upsell com add-ons ou combos.` });

    const loteAtivo = lotesDados.find(l => l.ativo);
    if (loteAtivo) {
      const restantes = loteAtivo.vagas - loteAtivo.vendas;
      if (restantes < 30) list.push({ tipo: 'critico', icon: Zap, texto: `${loteAtivo.nome} quase esgotado! Restam apenas ${restantes} vagas. Crie urgência nas comunicações.` });
      else list.push({ tipo: 'oportunidade', icon: Target, texto: `${loteAtivo.nome} ativo com ${restantes} vagas disponíveis (${loteAtivo.pct}% vendido).` });
    }

    if (cidadesTop.length > 0) {
      list.push({ tipo: 'oportunidade', icon: MapPin, texto: `Principal origem: ${cidadesTop[0].city} com ${cidadesTop[0].count} inscritas. Foque aí para maximizar retorno.` });
    }

    return list.slice(0, 6);
  }, [global, lotesDados, cidadesTop]);

  // ── FILTROS SELECT STYLE ─────────────────────────────────────
  const selStyle = {
    backgroundColor: T.bg2, border: `1px solid ${T.border}`, borderRadius: '7px',
    color: T.textSec, fontFamily: 'Inter, sans-serif', fontSize: '12px',
    padding: '6px 10px', outline: 'none', cursor: 'pointer',
  };

  if (isLoading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '8px' }}>
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{
          height: '80px', borderRadius: '12px',
          background: `linear-gradient(90deg, ${T.bg1} 25%, ${T.bg2} 50%, ${T.bg1} 75%)`,
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite',
        }} />
      ))}
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

      {/* ── FILTROS ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: T.textMut }}>Período:</span>
        <div style={{ display: 'flex', gap: '6px' }}>
          {PERIODS.map(p => (
            <button key={p.days} onClick={() => setPeriod(p.days)} style={{
              ...selStyle,
              backgroundColor: period === p.days ? T.accent : T.bg2,
              color: period === p.days ? '#fff' : T.textSec,
              border: `1px solid ${period === p.days ? T.accentLt : T.border}`,
              fontWeight: period === p.days ? '600' : '400',
              transition: 'all 0.15s',
            }}>{p.label}</button>
          ))}
        </div>
        <select value={filterLote} onChange={e => setFilterLote(e.target.value)} style={selStyle}>
          <option value="todos">Todos os Lotes</option>
          <option value="lote_1">1º Lote</option>
          <option value="lote_2">2º Lote</option>
          <option value="lote_3">3º Lote</option>
          <option value="lote_4">4º Lote</option>
        </select>
        <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} style={selStyle}>
          <option value="todos">Todos os Tipos</option>
          <option value="publico_geral">Público Geral</option>
          <option value="voluntario">Voluntários</option>
          <option value="caravana">Caravanas</option>
          <option value="doacao">Doações</option>
        </select>
        <div style={{ marginLeft: 'auto', fontFamily: 'Inter, sans-serif', fontSize: '12px', color: T.textMut, textAlign: 'right' }}>
          <div>{filtradas.length} registros • Atualiza a cada 60s</div>
          <div style={{ fontSize: '11px', opacity: 0.6 }}>{TIMEZONE_BADGE}</div>
        </div>
      </div>

      {/* ── BLOCO 1: KPIs PRINCIPAIS ────────────────────────── */}
      <div>
      <SectionTitle sub="Visão executiva do evento">VISÃO GERAL</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
        {/* Contagem regressiva — destaque único */}
        <div style={{
          gridColumn: 'span 2',
          backgroundColor: T.bg2, border: `1px solid ${T.borderHi}`,
          borderRadius: '12px', padding: '20px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', fontWeight: '700', color: T.textMut, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>Dias para o evento</div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '52px', fontWeight: '800', color: T.text, lineHeight: 1, letterSpacing: '-0.03em' }}>{diasParaEvento()}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: T.textSec }}>{EVENT_DATE.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
          </div>
        </div>

        <KpiPrincipal icon={Users} label="Inscritas reconhecidas" value={fmt(global.inscritasReconhecidas)} sub="headcount operacional · meta 1.000" onClick={() => onNavigate?.('inscricoes')} />
        <KpiPrincipal icon={CheckCircle} label="Confirmadas financeiramente" value={fmt(global.confirmadasFinanceiramente)} sub="evidência financeira estrita" onClick={() => onNavigate?.('inscricoes')} />
        <KpiPrincipal icon={Clock} label="Cobranças pendentes" value={fmt(global.cobrancasPendentes)} sub="obrigação financeira identificada" onClick={() => onNavigate?.('leads')} />
        <KpiPrincipal icon={AlertCircle} label="Em conciliação" value={fmt(global.emRevisao)} sub="vínculo ainda não resolvido" onClick={() => onNavigate?.('inscricoes')} />
        <KpiPrincipal icon={DollarSign} label="Receita" value={fmtBRL(global.receita)} sub="pagamentos com evidência" />
        <KpiPrincipal icon={TrendingUp} label="Ticket Médio" value={fmtBRL(global.ticketMedio)} sub="por inscrita pagante" />
      </div>
      </div>

      {/* ── BLOCO 4: INSIGHTS ───────────────────────────────── */}
      <div>
        <SectionTitle sub="Análise automática baseada nos dados atuais">INSIGHTS ESTRATÉGICOS</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {insights.map((ins, i) => (
            <InsightCard key={i} tipo={ins.tipo} texto={ins.texto} icon={ins.icon} />
          ))}
          {insights.length === 0 && (
            <div style={{ gridColumn: 'span 2', textAlign: 'center', color: T.textMut, fontFamily: 'Inter, sans-serif', fontSize: '13px', padding: '24px' }}>
              Dados insuficientes para gerar insights.
            </div>
          )}
        </div>
      </div>

      {/* ── BLOCO 2: EVOLUÇÃO DE VENDAS ─────────────────────── */}
      <div>
        <SectionTitle sub="Volume diário de inscrições e receita confirmada">EVOLUÇÃO DE VENDAS</SectionTitle>
        <Card style={{ padding: '24px' }}>
          {evolucaoDados.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={evolucaoDados} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="gradConf" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={T.green} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={T.green} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradQtd" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={T.accentLt} stopOpacity={0.20} />
                    <stop offset="95%" stopColor={T.accentLt} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="data" tick={{ fill: T.textMut, fontSize: 10, fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: T.textMut, fontSize: 10, fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '12px', color: T.textSec, fontFamily: 'Inter' }} />
                <Area type="monotone" dataKey="qtd" name="Inscrições" stroke={T.accentLt} strokeWidth={2} fill="url(#gradQtd)" dot={false} />
                <Area type="monotone" dataKey="confirmadas" name="Confirmadas" stroke={T.green} strokeWidth={2} fill="url(#gradConf)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: T.textMut, fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
              Sem dados no período selecionado
            </div>
          )}
        </Card>
      </div>

      {/* ── BLOCO 3: PERFORMANCE LOTES ──────────────────────── */}
      {lotesDados.length > 0 && (
        <div>
          <SectionTitle sub="Faturamento, ocupação e taxa de conversão por lote">PERFORMANCE COMERCIAL — LOTES</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            {lotesDados.map(l => (
              <Card key={l.codigo} style={{
                border: l.ativo ? `1px solid ${T.accentLt}40` : `1px solid ${T.border}`,
                background: T.bg2,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: '600', color: T.textSec }}>{l.nome}</span>
                  {l.ativo && <Badge color={T.accentLt}>ATIVO</Badge>}
                </div>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '22px', fontWeight: '800', color: T.text, marginBottom: '4px' }}>
                  {fmtBRL(l.valor)}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: T.green }}>{l.vendas} vendidas</span>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: T.amber }}>{l.pendentes} pend.</span>
                </div>
                <div style={{ width: '100%', height: '5px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '3px', marginBottom: '6px' }}>
                  <div style={{
                    width: `${l.pct}%`, height: '5px', borderRadius: '3px',
                    background: l.ativo ? T.accentLt : 'rgba(255,255,255,0.12)',
                    transition: 'width 0.5s ease',
                  }} />
                </div>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', color: T.textMut }}>
                  {l.pct}% ocupado • {l.vagas - l.vendas} restantes
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── ANÁLISES: HORÁRIOS + CIDADES + TIPOS ────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>

        {/* Horários de venda */}
        <div>
          <SectionTitle sub="Horários com maior volume de compra">VENDAS POR HORÁRIO</SectionTitle>
          <Card style={{ padding: '24px' }}>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={horariosDados} margin={{ top: 0, right: 5, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="hora" tick={{ fill: T.textMut, fontSize: 9, fontFamily: 'Inter' }} axisLine={false} tickLine={false} interval={2} />
                <YAxis tick={{ fill: T.textMut, fontSize: 10, fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="vendas" name="Vendas" fill={T.accentLt} radius={[3, 3, 0, 0]} maxBarSize={16}
                  label={false}
                  isAnimationActive={true}
                />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* Pizza tipos */}
        <div>
          <SectionTitle sub="Distribuição de confirmadas">PERFIL DO PÚBLICO</SectionTitle>
          <Card style={{ padding: '20px', height: 'calc(100% - 40px)' }}>
            {tiposPizza.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={130}>
                  <PieChart>
                    <Pie data={tiposPizza} cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={3} dataKey="value">
                      {tiposPizza.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => [v, '']} contentStyle={{ backgroundColor: T.bg3, border: `1px solid ${T.borderHi}`, borderRadius: '8px', fontFamily: 'Inter' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '8px' }}>
                  {tiposPizza.map((e, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: e.color }} />
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', color: T.textSec }}>{e.name}</span>
                      </div>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', fontWeight: '600', color: T.text }}>{e.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0', color: T.textMut, fontFamily: 'Inter, sans-serif', fontSize: '12px' }}>
                Sem confirmadas ainda
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Cidades */}
      {cidadesTop.length > 0 && (
        <div>
          <SectionTitle sub="Principais cidades de origem das inscritas">DISTRIBUIÇÃO GEOGRÁFICA</SectionTitle>
          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {cidadesTop.map((c, i) => {
                const max = cidadesTop[0].count;
                const pct = Math.round(c.count / max * 100);
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: '500', color: T.text }}>{c.city}</span>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: '700', color: T.accentLt }}>{c.count}</span>
                    </div>
                    <div style={{ width: '100%', height: '3px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '2px' }}>
                      <div style={{ width: `${pct}%`, height: '3px', backgroundColor: i === 0 ? T.accentLt : T.textMut, borderRadius: '2px', transition: 'width 0.4s' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}