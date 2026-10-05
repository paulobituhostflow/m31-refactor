import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useM31InscricaoStats } from '@/hooks/useM31InscricaoStats';
import {
  Users, ClipboardCheck, Wallet, Activity, AlertCircle,
  Ticket, HeartHandshake, Settings2, ArrowRight, Sparkles,
  MapPin, QrCode, UserCheck, FileText, CreditCard, Zap, User,
} from 'lucide-react';
import { StatCard } from '@/components/m31/ui';

const M31_LOGO = "/assets/a22f06b49_LOGOM31FILHAS1.png";

const WINE = '#8B1A2B';
const TEXT = '#0F172A';
const SEC = '#475569';
const MUTED = '#94A3B8';
const SUCCESS = '#059669';
const WARN = '#D97706';
const DANGER = '#DC2626';
const INFO = '#2563EB';

function formatSaudacao() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function formatBRL(v) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function getRoleGroup(user, membro, pode) {
  if (user?.role === 'admin' || membro?.perfil === 'super_admin') return 'admin';
  const perfil = membro?.perfil;
  if (pode?.verFinanceiro && !['coordenador', 'coordenadora_geral', 'gestao_operacional', 'lider_setor'].includes(perfil)) {
    return 'financeiro';
  }
  if (['coordenador', 'coordenadora_geral', 'gestao_operacional', 'lider_setor'].includes(perfil)) {
    return 'coordenacao';
  }
  return 'inscricoes';
}

const ROLE_FOCUS = {
  admin: 'Visão Geral Completa',
  coordenacao: 'Operação, Tarefas e Inscrições',
  financeiro: 'Arrecadação e Transações',
  inscricoes: 'Check-in, Inscrições e Caravanas',
};

const STATS_CONFIG = {
  admin: [
    { key: 'reconhecidas', label: 'Inscritas reconhecidas', state: 'success', tab: 'participantes', params: { aba: 'inscricoes' } },
    { key: 'pendentesCobranca', label: 'Cobranças pendentes', state: 'warning', tab: 'participantes', params: { aba: 'inscricoes', status: 'pendente' } },
    { key: 'abandonados', label: 'Checkouts abandonados', state: 'danger', tab: 'participantes', params: { aba: 'leads' } },
    { key: 'tarefasAtrasadas', label: 'Tarefas atrasadas', state: 'brand', tab: 'tarefas', params: { filtroChip: 'late' } },
  ],
  coordenacao: [
    { key: 'reconhecidas', label: 'Inscritas reconhecidas', state: 'success', tab: 'participantes', params: { aba: 'inscricoes' } },
    { key: 'pendentesCobranca', label: 'Cobranças pendentes', state: 'warning', tab: 'participantes', params: { aba: 'inscricoes', status: 'pendente' } },
    { key: 'tarefasAtrasadas', label: 'Tarefas atrasadas', state: 'brand', tab: 'tarefas', params: { filtroChip: 'late' } },
    { key: 'tarefasAndamento', label: 'Tarefas ativas', state: 'info', tab: 'tarefas', params: {} },
  ],
  financeiro: [
    { key: 'receitaConfirmada', label: 'Receita confirmada', state: 'success', tab: 'financeiro', params: {}, format: 'brl' },
    { key: 'receitaPendente', label: 'Receita pendente', state: 'warning', tab: 'transacoes', params: {}, format: 'brl' },
    { key: 'abandonados', label: 'Checkouts abandonados', state: 'danger', tab: 'participantes', params: { aba: 'leads' } },
    { key: 'pendentesCobranca', label: 'Cobranças pendentes', state: 'info', tab: 'participantes', params: { aba: 'inscricoes', status: 'pendente' } },
  ],
  inscricoes: [
    { key: 'reconhecidas', label: 'Inscritas reconhecidas', state: 'success', tab: 'participantes', params: { aba: 'inscricoes' } },
    { key: 'checkins', label: 'Check-ins realizados', state: 'info', tab: 'participantes', params: { aba: 'checkin' } },
    { key: 'abandonados', label: 'Checkouts abandonados', state: 'danger', tab: 'participantes', params: { aba: 'leads' } },
    { key: 'totalCaravanas', label: 'Caravanas ativas', state: 'brand', tab: 'participantes', params: { aba: 'caravanas' } },
  ],
};

const SHORTCUTS_CONFIG = {
  admin: [
    { icon: Users, label: 'Inscrições', desc: 'Inscritas e caravanas', color: WINE, tab: 'participantes' },
    { icon: ClipboardCheck, label: 'Gestão de Tarefas', desc: 'Acompanhar entregas', color: INFO, tab: 'tarefas' },
    { icon: Wallet, label: 'Financeiro', desc: 'Receita e transações', color: SUCCESS, tab: 'financeiro' },
    { icon: HeartHandshake, label: 'Voluntários', desc: 'Gestão de voluntárias', color: '#7C3AED', tab: 'voluntarios' },
    { icon: Ticket, label: 'Lotes', desc: 'Vagas e disponibilidade', color: '#EA580C', tab: 'lotes' },
    { icon: Activity, label: 'Saúde do Sistema', desc: 'Integrações e status', color: '#6366F1', tab: 'saude' },
    { icon: AlertCircle, label: 'Central de Alertas', desc: 'Pendências operacionais', color: DANGER, tab: 'alertas' },
    { icon: Settings2, label: 'Equipe', desc: 'Membros e acessos', color: SEC, tab: 'equipe' },
  ],
  coordenacao: [
    { icon: Users, label: 'Inscrições', desc: 'Inscritas e caravanas', color: WINE, tab: 'participantes' },
    { icon: ClipboardCheck, label: 'Gestão de Tarefas', desc: 'Acompanhar entregas', color: INFO, tab: 'tarefas' },
    { icon: HeartHandshake, label: 'Voluntários', desc: 'Gestão de voluntárias', color: '#7C3AED', tab: 'voluntarios' },
    { icon: Ticket, label: 'Lotes', desc: 'Vagas e disponibilidade', color: '#EA580C', tab: 'lotes' },
    { icon: AlertCircle, label: 'Central de Alertas', desc: 'Pendências operacionais', color: DANGER, tab: 'alertas' },
    { icon: Zap, label: 'Centro de Operações', desc: 'Automações e filas', color: '#6366F1', tab: 'operacoes' },
  ],
  financeiro: [
    { icon: Wallet, label: 'Dashboard Financeiro', desc: 'Receita e resumo', color: SUCCESS, tab: 'financeiro' },
    { icon: FileText, label: 'Transações', desc: 'Histórico de movimentações', color: INFO, tab: 'transacoes' },
    { icon: CreditCard, label: 'Contas a Pagar/Receber', desc: 'Gestão de contas', color: WINE, tab: 'contas' },
    { icon: Users, label: 'Inscrições', desc: 'Inscritas e status', color: SEC, tab: 'participantes' },
    { icon: AlertCircle, label: 'Central de Alertas', desc: 'Pendências financeiras', color: DANGER, tab: 'alertas' },
  ],
  inscricoes: [
    { icon: Users, label: 'Inscritas', desc: 'Lista de participantes', color: WINE, tab: 'participantes', params: { aba: 'inscricoes' } },
    { icon: MapPin, label: 'Caravanas', desc: 'Grupos e líderes', color: '#EA580C', tab: 'participantes', params: { aba: 'caravanas' } },
    { icon: QrCode, label: 'Check-in', desc: 'Validar entradas', color: INFO, tab: 'participantes', params: { aba: 'checkin' } },
    { icon: UserCheck, label: 'Recuperação', desc: 'Leads e abandonos', color: DANGER, tab: 'participantes', params: { aba: 'leads' } },
    { icon: Ticket, label: 'Lotes', desc: 'Vagas e disponibilidade', color: WARN, tab: 'lotes' },
    { icon: AlertCircle, label: 'Central de Alertas', desc: 'Pendências', color: SEC, tab: 'alertas' },
  ],
};

function QuickCard({ icon: Icon, label, desc, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', gap: '10px',
        background: '#fff', border: '1px solid #E5E7EB', borderRadius: '14px',
        padding: '18px', textAlign: 'left', cursor: 'pointer',
        transition: 'border-color 0.15s ease, box-shadow 0.2s ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.boxShadow = `0 4px 16px -4px ${color}22`; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={{
        width: '36px', height: '36px', borderRadius: '10px',
        background: `${color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={18} color={color} />
      </div>
      <div>
        <div style={{ fontSize: '14px', fontWeight: '600', color: TEXT }}>{label}</div>
        <div style={{ fontSize: '12px', color: MUTED, marginTop: '2px' }}>{desc}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color, fontSize: '12px', fontWeight: '600', marginTop: 'auto' }}>
        Acessar <ArrowRight size={13} />
      </div>
    </button>
  );
}

export default function M31HomeTab({ user, membro, pode, onNavigate }) {
  const navigate = useNavigate();
  const roleGroup = getRoleGroup(user, membro, pode);
  const needsCaravanas = roleGroup === 'inscricoes' || roleGroup === 'admin';

  const { reconhecidas, confirmadas: aprovadas, pendentesCobranca, abandonaram: abandonados, checkins, receitaConfirmada, receitaPendente, isLoading: loadingStats } = useM31InscricaoStats();
  const { data: tarefas = [] } = useQuery({
    queryKey: ['m31_home_tarefas'],
    queryFn: () => base44.entities.EventoM31Tarefa.list('-created_date', 200),
    refetchInterval: 60000,
  });
  const { data: caravanas = [] } = useQuery({
    queryKey: ['m31_home_caravanas'],
    queryFn: () => base44.entities.EventoM31Caravana.filter({ ativa: true }),
    enabled: needsCaravanas,
    refetchInterval: 60000,
  });

  const data = {
    reconhecidas,
    aprovadas,
    pendentesCobranca,
    abandonados,
    tarefasAtrasadas: tarefas.filter(t => ['atrasado', 'critico', 'bloqueado'].includes(t.status)).length,
    tarefasAndamento: tarefas.filter(t => ['em_andamento', 'a_fazer', 'em_execucao'].includes(t.status)).length,
    checkins,
    totalCaravanas: caravanas.length,
    receitaConfirmada,
    receitaPendente,
  };

  const perfilLabel = membro?.perfil === 'super_admin' ? 'Super Admin'
    : membro?.perfil === 'coordenador' ? 'Coordenador'
    : membro?.perfil === 'coordenadora_geral' ? 'Coord. Geral'
    : membro?.perfil === 'gestora_inscricoes' ? 'Gestora de Inscrições'
    : membro?.perfil === 'coordenacao_participantes' ? 'Coord. Participantes'
    : membro?.perfil === 'gestao_operacional' ? 'Gestão Operacional'
    : membro?.perfil === 'lider_setor' ? 'Líder de Setor'
    : membro?.perfil === 'voluntario' ? 'Voluntária'
    : membro?.perfil === 'checkin' ? 'Check-in'
    : 'Equipe';

  const go = (tab, params) => onNavigate ? onNavigate(tab, params) : navigate(`/m31-admin?tab=${tab}`);

  const stats = STATS_CONFIG[roleGroup] || STATS_CONFIG.inscricoes;
  const shortcuts = SHORTCUTS_CONFIG[roleGroup] || SHORTCUTS_CONFIG.inscricoes;

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', color: TEXT, maxWidth: '900px', margin: '0 auto' }}>
      {/* Hero — compacto com métrica */}
      <div style={{
        background: 'linear-gradient(135deg, #FDF7F7 0%, #F8F0F0 100%)',
        borderRadius: '12px', padding: '20px', marginBottom: '20px',
        border: '1px solid #E5DEDE',
      }}>
        {/* Linha superior: badge M31 + saudação + Sparkles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            background: '#fff', border: '1px solid #F2D8DC', borderRadius: '8px',
            padding: '4px 8px', fontSize: '12px', fontWeight: '700', color: '#8B1A2B',
            flexShrink: 0, letterSpacing: '0.02em',
          }}>
            M31
          </div>
          <div style={{ flex: 1, fontSize: '15px', fontWeight: '600', color: '#2A1F1F', letterSpacing: '-0.01em' }}>
            {formatSaudacao()}, {user?.full_name?.split(' ')[0] || 'equipe'} 👋
          </div>
          <Sparkles size={16} color="#8B1A2B" style={{ flexShrink: 0 }} />
        </div>
        {/* Separador */}
        <div style={{ height: '1px', background: '#E5DEDE', margin: '12px 0' }} />
        {/* Linha inferior: pills de perfil/foco + métrica de tarefas */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              fontSize: '11px', fontWeight: '500', color: '#475569',
              background: '#fff', border: '1px solid #E5DEDE', padding: '3px 8px', borderRadius: '100px',
            }}>
              <User size={11} color="#8B1A2B" />
              {perfilLabel}
            </span>
            <span style={{ fontSize: '10px', color: '#94A3B8' }}>•</span>
            <span style={{
              fontSize: '11px', fontWeight: '500', color: '#475569',
              background: '#fff', border: '1px solid #E5DEDE', padding: '3px 8px', borderRadius: '100px',
            }}>
              {ROLE_FOCUS[roleGroup]}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
            <span style={{
              fontSize: '11px', fontWeight: '600', color: '#fff',
              background: '#8B1A2B', padding: '3px 8px', borderRadius: '100px',
            }}>
              {data.tarefasAtrasadas + data.tarefasAndamento} tarefas
            </span>
            <span style={{ fontSize: '11px', color: '#6B5E5E', fontWeight: '500' }}>hoje</span>
          </div>
        </div>
      </div>

      {/* Stats dinâmicos por perfil — StatCard canônico */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {stats.map(s => (
          <StatCard
            key={s.key}
            label={s.label}
            value={loadingStats ? '—' : (s.format === 'brl' ? formatBRL(data[s.key] || 0) : (data[s.key] || 0))}
            state={s.state}
            onClick={() => go(s.tab, s.params || {})}
          />
        ))}
      </div>

      {/* Atalhos dinâmicos por perfil */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <Sparkles size={15} color={WINE} />
        <h2 style={{ fontSize: '14px', fontWeight: '600', color: TEXT, margin: 0 }}>Atalhos rápidos</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {shortcuts.map((sc, i) => (
          <QuickCard
            key={i}
            icon={sc.icon}
            label={sc.label}
            desc={sc.desc}
            color={sc.color}
            onClick={() => go(sc.tab, sc.params || {})}
          />
        ))}
      </div>
    </div>
  );
}