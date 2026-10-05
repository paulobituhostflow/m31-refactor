import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useM31InscricaoStats } from '@/hooks/useM31InscricaoStats';
import { Activity, AlertTriangle, XCircle, Zap, CreditCard, Webhook, RefreshCw, Users, Truck, Heart, Clock } from 'lucide-react';

// ── Design tokens (Clean Light) ──
const T = {
  bg: '#F9FAFB',
  card: '#FFFFFF',
  border: '#E5E7EB',
  text: '#1A1A1A',
  sec: '#6B7280',
  muted: '#9CA3AF',
  success: '#16A34A',
  warning: '#F59E0B',
  danger: '#DC2626',
  brand: '#7A1F2B',
};

// ── Status Dot ──
function StatusDot({ status }) {
  const cfg = {
    ok: { bg: '#DCFCE7', dot: '#16A34A', label: 'Online' },
    warning: { bg: '#FEF3C7', dot: '#F59E0B', label: 'Atenção' },
    error: { bg: '#FEE2E2', dot: '#DC2626', label: 'Erro' },
    unknown: { bg: '#F3F4F6', dot: '#9CA3AF', label: 'Verificando' },
  };
  const c = cfg[status] || cfg.unknown;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px', borderRadius: '100px', background: c.bg, fontSize: '12px', fontWeight: '600', color: c.dot }}>
      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: c.dot, display: 'inline-block' }} />
      {c.label}
    </span>
  );
}

// ── Integration Card ──
function IntegrationCard({ icon: Icon, label, status, message, detail }) {
  const colorMap = {
    ok: { border: T.border, accent: T.success, bg: '#F0FDF4' },
    warning: { border: '#FDE68A', accent: T.warning, bg: '#FFFBEB' },
    error: { border: '#FECACA', accent: T.danger, bg: '#FEF2F2' },
    unknown: { border: T.border, accent: T.muted, bg: T.bg },
  };
  const c = colorMap[status] || colorMap.unknown;

  return (
    <div style={{
      background: T.card, border: `1px solid ${c.border}`, borderRadius: '12px', padding: '20px',
      borderLeft: `4px solid ${c.accent}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={18} color={c.accent} />
          </div>
          <span style={{ fontSize: '14px', fontWeight: '600', color: T.text }}>{label}</span>
        </div>
        <StatusDot status={status} />
      </div>
      {message && <div style={{ fontSize: '13px', color: T.sec, marginBottom: detail ? '8px' : 0 }}>{message}</div>}
      {detail && <div style={{ fontSize: '11px', color: T.muted }}>{detail}</div>}
    </div>
  );
}

// ── Automation Status Row ──
function AutomationRow({ name, type, active, lastRun, failed }) {
  const typeLabel = { scheduled: 'Agendada', entity: 'Entidade', connector: 'Conector' }[type] || type;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
      borderBottom: `1px solid ${T.border}`, fontSize: '13px',
    }}>
      <span style={{
        width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
        background: !active ? '#9CA3AF' : failed ? '#DC2626' : '#16A34A',
      }} />
      <span style={{ flex: 1, color: T.text, fontWeight: '500' }}>{name}</span>
      <span style={{ fontSize: '11px', color: T.muted, background: T.bg, padding: '2px 8px', borderRadius: '4px' }}>{typeLabel}</span>
      <span style={{
        fontSize: '11px', fontWeight: '600',
        padding: '2px 8px', borderRadius: '4px',
        background: !active ? '#F3F4F6' : failed ? '#FEE2E2' : '#DCFCE7',
        color: !active ? '#9CA3AF' : failed ? '#DC2626' : '#16A34A',
      }}>
        {!active ? 'Inativa' : failed ? 'Falhou' : 'OK'}
      </span>
    </div>
  );
}

// ── Metric Card ──
function MetricCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: '12px', padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '0.05em', textTransform: 'uppercase', color: T.sec }}>{label}</span>
        <Icon size={16} color={color || T.muted} />
      </div>
      <div style={{ fontSize: '28px', fontWeight: '700', color: T.text, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: T.muted, marginTop: '4px' }}>{sub}</div>}
    </div>
  );
}

// ── Main ──
export default function M31PainelSaude() {
  const { data: health, isLoading, refetch } = useQuery({
    queryKey: ['m31health'],
    queryFn: () => base44.functions.invoke('m31HealthCheck', {}).then(r => r.data),
    refetchInterval: 60000,
  });
  const { confirmadas, total: totalInsc, pendentes: pendentesInsc, abandonadas: abandonadasInsc } = useM31InscricaoStats();

  const autoSnapshot = health?.automations || { total: 0, active: 0, inactive: 0, failed: 0, automations: [] };

  const overallScore = (() => {
    if (!health) return 'unknown';
    return health.overall || 'unknown';
  })();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '80px' }}>
        <div style={{ textAlign: 'center' }}>
          <RefreshCw size={24} color={T.muted} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ fontSize: '14px', color: T.sec }}>Verificando integrações...</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: 'Inter, sans-serif' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Activity size={22} color={T.brand} />
            <span style={{ fontSize: '18px', fontWeight: '700', color: T.text }}>Saúde do Sistema</span>
            <span style={{
              padding: '3px 12px', borderRadius: '100px', fontSize: '12px', fontWeight: '600',
              background: overallScore === 'healthy' ? '#DCFCE7' : overallScore === 'warning' ? '#FEF3C7' : '#FEE2E2',
              color: overallScore === 'healthy' ? '#16A34A' : overallScore === 'warning' ? '#D97706' : '#DC2626',
            }}>
              {overallScore === 'healthy' ? 'Saudável' : overallScore === 'warning' ? 'Atenção' : 'Crítico'}
            </span>
          </div>
          <div style={{ fontSize: '13px', color: T.muted, marginTop: '4px' }}>
            Atualizado {health?.timestamp ? new Date(health.timestamp).toLocaleTimeString('pt-BR') : 'agora'}
          </div>
        </div>
        <button onClick={() => refetch()} style={{
          display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
          background: T.card, border: `1px solid ${T.border}`, borderRadius: '8px',
          color: T.sec, fontSize: '13px', fontWeight: '500', cursor: 'pointer',
        }}>
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {/* ── Integrations Grid ── */}
      <div>
        <div style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '0.06em', textTransform: 'uppercase', color: T.muted, marginBottom: '10px' }}>
          Integrações
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
          <IntegrationCard
            icon={CreditCard}
            label="ASAAS (Pagamentos)"
            status={health?.asaas?.status || 'unknown'}
            message={health?.asaas?.message || 'Verificando...'}
          />
          <IntegrationCard
            icon={Zap}
            label="UAZAPI (WhatsApp)"
            status={health?.uazapi?.status || 'unknown'}
            message={health?.uazapi?.message || 'Verificando...'}
            detail={health?.uazapi?.phone ? `Número: ${health.uazapi.phone}` : null}
          />
          <IntegrationCard
            icon={Webhook}
            label="Webhooks (Asaas)"
            status={health?.webhooks?.status || 'unknown'}
            message={health?.webhooks?.message || 'Verificando...'}
          />
        </div>
      </div>

      {/* ── Alerta crítico ── */}
      {overallScore === 'critical' && (
        <div style={{
          background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px',
          padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <XCircle size={20} color={T.danger} style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: T.danger }}>Atenção: Sistema requer intervenção</div>
            <div style={{ fontSize: '12px', color: '#991B1B', marginTop: '2px' }}>
              {health?.asaas?.status === 'error' && '• ASAAS com erro de conexão. '}
              {health?.uazapi?.status === 'error' && '• UAZAPI offline. '}
              {health?.uazapi?.status === 'warning' && health?.asaas?.status !== 'error' && '• UAZAPI desconectada. '}
              {(health?.automations?.inactive || 0) > 0 && `${health?.automations?.inactive || 0} automações estão inativas.`}
            </div>
          </div>
        </div>
      )}

      {/* ── Operational Metrics ── */}
      <div>
        <div style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '0.06em', textTransform: 'uppercase', color: T.muted, marginBottom: '10px' }}>
          Visão Operacional
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
          <MetricCard label="Confirmadas" value={confirmadas} sub={`${totalInsc} total`} icon={Users} color={T.brand} />
          <MetricCard label="Pendentes" value={pendentesInsc} sub="Pagamento pendente" icon={Clock} color={T.warning} />
          <MetricCard label="Abandonadas" value={abandonadasInsc} sub="Checkout abandonado" icon={AlertTriangle} color={T.danger} />
          <MetricCard label="Caravanas" value={health?.data?.caravanas?.total || 0} sub="Ativas" icon={Truck} color="#3B82F6" />
          <MetricCard label="Voluntárias" value={health?.data?.voluntarias?.total || 0} sub="Ativas" icon={Heart} color="#EC4899" />
        </div>
      </div>

      {/* ── Automations Status ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '0.06em', textTransform: 'uppercase', color: T.muted }}>
            Automações
          </span>
          <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: T.sec }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#16A34A' }} /> {autoSnapshot.active} ativas
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#9CA3AF' }} /> {autoSnapshot.inactive} inativas
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#DC2626' }} /> {autoSnapshot.failed} com falha
            </span>
          </div>
        </div>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: '12px', overflow: 'hidden' }}>
          {autoSnapshot.automations.map((a, i) => (
            <AutomationRow key={i} {...a} lastRun={null} />
          ))}
        </div>
      </div>

      {/* ── Recomendações ── */}
      <div style={{
        background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px',
        padding: '16px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <AlertTriangle size={16} color={T.warning} />
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#92400E' }}>Recomendações</span>
        </div>
        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#92400E', lineHeight: 1.8 }}>
          <li>Reativar Régua Segura (10h e 16h) para retomar cobranças automáticas</li>
          <li>Reativar Boas-vindas Automáticas para confirmadas</li>
          <li>Reativar Recuperação de Checkout para leads abandonados</li>
          {health?.uazapi?.status === 'warning' && <li>Reconectar UAZAPI (WhatsApp) para retomar envios</li>}
          {health?.asaas?.status === 'error' && <li>Verificar chave ASAAS_API_KEY nas configurações</li>}
        </ul>
      </div>
    </div>
  );
}