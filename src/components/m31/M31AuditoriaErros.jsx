import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const C = {
  bg: '#F8F7F5',
  card: '#FFFFFF',
  border: '#E5E7EB',
  brand: '#8A2634',
  text1: '#1F2937',
  text2: '#6B7280',
  text3: '#9CA3AF',
  critico: { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA', dot: '#EF4444' },
  alto:    { bg: '#FFF7ED', text: '#C2410C', border: '#FED7AA', dot: '#F97316' },
  medio:   { bg: '#FEFCE8', text: '#A16207', border: '#FEF08A', dot: '#EAB308' },
  baixo:   { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE', dot: '#3B82F6' },
};

const STATUS_LABEL = { novo: 'Novo', em_analise: 'Em Análise', resolvido: 'Resolvido', ignorado: 'Ignorado' };
const STATUS_STYLE = {
  novo:       { bg: '#FEF2F2', text: '#DC2626' },
  em_analise: { bg: '#FFF7ED', text: '#C2410C' },
  resolvido:  { bg: '#F0FDF4', text: '#166534' },
  ignorado:   { bg: '#F9FAFB', text: '#6B7280' },
};
const ORIGEM_LABEL = {
  formulario: 'Formulário', webhook: 'Webhook', asaas: 'Asaas',
  uazapi: 'UAZAPI', zapi: 'UAZAPI', automacao: 'Automação', sistema: 'Sistema',
};

function GravidadeBadge({ g }) {
  const s = C[g] || C.medio;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: s.bg, color: s.text, border: `1px solid ${s.border}`, letterSpacing: '0.05em' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {g.toUpperCase()}
    </span>
  );
}

function StatusBadge({ s }) {
  const st = STATUS_STYLE[s] || STATUS_STYLE.novo;
  return (
    <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: st.bg, color: st.text }}>
      {STATUS_LABEL[s] || s}
    </span>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { timeZone: 'America/Recife', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function M31AuditoriaErros() {
  const qc = useQueryClient();
  const [filtroStatus, setFiltroStatus]     = useState('todos');
  const [filtroGravidade, setFiltroGravidade] = useState('todas');
  const [filtroOrigem, setFiltroOrigem]     = useState('todas');
  const [expandido, setExpandido]           = useState(null);
  const [reenviando, setReenviando]         = useState(null);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['m31_audit_logs'],
    queryFn: () => base44.entities.M31AuditLog.list('-created_date', 200),
    refetchInterval: 30000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.M31AuditLog.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['m31_audit_logs'] }),
  });

  async function handleReenviar(log) {
    setReenviando(log.id);
    try {
      await base44.functions.invoke('m31AlertarGestor', {
        chave_unica: log.chave_unica + '_reenvio_' + Date.now(),
        tipo_erro: log.tipo_erro,
        gravidade: log.gravidade,
        origem: log.origem,
        descricao: log.descricao,
        possivel_causa: log.possivel_causa || '',
        acao_recomendada: log.acao_recomendada || '',
        pessoa_nome: log.pessoa_nome,
        pessoa_email: log.pessoa_email,
        pessoa_telefone: log.pessoa_telefone,
        pessoa_id: log.pessoa_id,
      });
      await updateMutation.mutateAsync({ id: log.id, data: { alerta_enviado_em: new Date().toISOString() } });
    } finally {
      setReenviando(null);
    }
  }

  function handleStatus(log, novoStatus) {
    const patch = { status: novoStatus };
    if (novoStatus === 'resolvido') patch.resolvido_em = new Date().toISOString();
    updateMutation.mutate({ id: log.id, data: patch });
  }

  const filtered = logs.filter(l => {
    if (filtroStatus !== 'todos' && l.status !== filtroStatus) return false;
    if (filtroGravidade !== 'todas' && l.gravidade !== filtroGravidade) return false;
    if (filtroOrigem !== 'todas' && l.origem !== filtroOrigem) return false;
    return true;
  });

  const counts = { critico: 0, alto: 0, medio: 0, baixo: 0, novo: 0 };
  logs.forEach(l => {
    if (counts[l.gravidade] !== undefined) counts[l.gravidade]++;
    if (l.status === 'novo') counts.novo++;
  });

  const FiltroBtn = ({ value, current, onChange, label }) => (
    <button
      onClick={() => onChange(value)}
      style={{
        padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
        border: `1px solid ${current === value ? C.brand : C.border}`,
        background: current === value ? '#FFF0F2' : C.card,
        color: current === value ? C.brand : C.text2,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ padding: '24px', maxWidth: 900, margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text1, fontFamily: 'Inter, sans-serif', margin: 0 }}>
          Auditoria & Erros
        </h2>
        <p style={{ fontSize: 13, color: C.text2, marginTop: 4 }}>
          Monitoramento em tempo real de falhas no sistema M31.
        </p>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Crítico', value: counts.critico, g: 'critico' },
          { label: 'Alto',    value: counts.alto,    g: 'alto' },
          { label: 'Médio',   value: counts.medio,   g: 'medio' },
          { label: 'Novos',   value: counts.novo,    g: 'baixo', override: { bg: '#F5F3FF', text: '#6D28D9', border: '#DDD6FE' } },
        ].map(({ label, value, g, override }) => {
          const s = override || C[g];
          return (
            <div key={label} style={{ background: s.bg, border: `1px solid ${s.border || C.border}`, borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: s.text || C.text1 }}>{value}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: s.text || C.text2, marginTop: 2, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
            </div>
          );
        })}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: C.text3, fontWeight: 600, letterSpacing: '0.06em' }}>STATUS:</span>
          {['todos', 'novo', 'em_analise', 'resolvido', 'ignorado'].map(v =>
            <FiltroBtn key={v} value={v} current={filtroStatus} onChange={setFiltroStatus}
              label={v === 'todos' ? 'Todos' : STATUS_LABEL[v] || v} />
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: C.text3, fontWeight: 600, letterSpacing: '0.06em' }}>GRAVIDADE:</span>
          {['todas', 'critico', 'alto', 'medio', 'baixo'].map(v =>
            <FiltroBtn key={v} value={v} current={filtroGravidade} onChange={setFiltroGravidade}
              label={v === 'todas' ? 'Todas' : v.charAt(0).toUpperCase() + v.slice(1)} />
          )}
        </div>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.text3 }}>Carregando...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, background: C.card, borderRadius: 12, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text1 }}>Nenhum erro encontrado</div>
          <div style={{ fontSize: 13, color: C.text2, marginTop: 4 }}>O sistema está funcionando normalmente.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(log => {
            const isOpen = expandido === log.id;
            const st = C[log.gravidade] || C.medio;
            return (
              <div key={log.id} style={{ background: C.card, border: `1px solid ${isOpen ? C.brand : C.border}`, borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.15s' }}>
                {/* Linha principal */}
                <div
                  onClick={() => setExpandido(isOpen ? null : log.id)}
                  style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
                >
                  <div style={{ width: 4, height: 36, borderRadius: 2, background: st.dot, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {log.tipo_erro?.replace(/_/g, ' ') || 'Erro desconhecido'}
                    </div>
                    <div style={{ fontSize: 12, color: C.text2, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {log.descricao}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                    <GravidadeBadge g={log.gravidade} />
                    <StatusBadge s={log.status} />
                    <span style={{ fontSize: 11, color: C.text3 }}>{ORIGEM_LABEL[log.origem] || log.origem}</span>
                    <span style={{ fontSize: 11, color: C.text3 }}>{formatDate(log.created_date)}</span>
                    <span style={{ fontSize: 14, color: C.text3, userSelect: 'none' }}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Detalhes expandidos */}
                {isOpen && (
                  <div style={{ borderTop: `1px solid ${C.border}`, padding: '16px 20px', background: '#FAFAFA' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                      {log.pessoa_nome && <InfoRow label="Nome" value={log.pessoa_nome} />}
                      {log.pessoa_email && <InfoRow label="Email" value={log.pessoa_email} />}
                      {log.pessoa_telefone && <InfoRow label="Telefone" value={log.pessoa_telefone} />}
                      {log.pessoa_id && <InfoRow label="ID" value={log.pessoa_id} />}
                      {log.alert_count > 1 && <InfoRow label="Alertas enviados" value={log.alert_count} />}
                      {log.alerta_enviado_em && <InfoRow label="Último alerta" value={formatDate(log.alerta_enviado_em)} />}
                    </div>

                    {log.possivel_causa && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>Possível causa</div>
                        <div style={{ fontSize: 13, color: C.text1 }}>{log.possivel_causa}</div>
                      </div>
                    )}
                    {log.acao_recomendada && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>Ação recomendada</div>
                        <div style={{ fontSize: 13, color: C.text1 }}>{log.acao_recomendada}</div>
                      </div>
                    )}

                    {/* Ações */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                      {log.status !== 'resolvido' && (
                        <ActionBtn color="#166534" bg="#F0FDF4" border="#86EFAC"
                          onClick={() => handleStatus(log, 'resolvido')} label="✓ Marcar como resolvido" />
                      )}
                      {log.status === 'novo' && (
                        <ActionBtn color="#92400E" bg="#FFFBEB" border="#FCD34D"
                          onClick={() => handleStatus(log, 'em_analise')} label="🔍 Em análise" />
                      )}
                      {log.status !== 'ignorado' && log.status !== 'resolvido' && (
                        <ActionBtn color="#6B7280" bg="#F9FAFB" border="#E5E7EB"
                          onClick={() => handleStatus(log, 'ignorado')} label="Ignorar" />
                      )}
                      {log.status === 'resolvido' && (
                        <ActionBtn color="#C2410C" bg="#FFF7ED" border="#FED7AA"
                          onClick={() => handleStatus(log, 'novo')} label="↩ Reabrir" />
                      )}
                      <ActionBtn
                        color={C.brand} bg="#FFF0F2" border="#FECACA"
                        onClick={() => handleReenviar(log)}
                        label={reenviando === log.id ? '⏳ Enviando...' : '📲 Reenviar alerta para Paulo'}
                        disabled={reenviando === log.id}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#1F2937' }}>{value}</div>
    </div>
  );
}

function ActionBtn({ label, onClick, color, bg, border, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
        border: `1px solid ${border}`, background: bg, color, opacity: disabled ? 0.6 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      {label}
    </button>
  );
}