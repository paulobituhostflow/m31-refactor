import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { TOKENS } from '@/lib/m31DesignTokens';
import { AlertTriangle, CheckCircle, Clock, Inbox, Send, QrCode, Users, DollarSign, RefreshCw, Activity } from 'lucide-react';

const T = {
  bg: TOKENS.surface,
  card: TOKENS.surface,
  border: TOKENS.border,
  borderSubtle: TOKENS.borderSubtle,
  text: TOKENS.text,
  sec: TOKENS.textMuted,
  muted: TOKENS.textSubtle,
  primary: TOKENS.primary,
  success: TOKENS.success,
  warning: TOKENS.warning,
  danger: TOKENS.danger,
};

function HealthCard({ titulo, valor, status, icon: Icon, descricao, onClick }) {
  const cor = status === 'green' ? T.success : status === 'yellow' ? T.warning : status === 'red' ? T.danger : T.sec;
  const bgSuave = status === 'green' ? TOKENS.successSoft : status === 'yellow' ? TOKENS.warningSoft : status === 'red' ? TOKENS.dangerSoft : TOKENS.surfaceSubtle;

  return (
    <div
      onClick={onClick}
      style={{
        background: T.card,
        border: `1px solid ${T.border}`,
        borderRadius: '12px',
        padding: '16px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.borderColor = TOKENS.borderStrong; e.currentTarget.style.boxShadow = TOKENS.shadowSm; } }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '8px',
          background: bgSuave, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={18} color={cor} strokeWidth={2.25} />
        </div>
        <div style={{
          width: '10px', height: '10px', borderRadius: '50%',
          background: cor,
          boxShadow: status === 'red' ? `0 0 0 4px ${TOKENS.dangerSoft}` : status === 'yellow' ? `0 0 0 4px ${TOKENS.warningSoft}` : `0 0 0 4px ${TOKENS.successSoft}`,
          animation: status === 'red' ? 'pulse 2s infinite' : 'none',
        }} />
      </div>
      <div style={{ fontSize: '28px', fontWeight: '800', color: T.text, fontFamily: 'Inter, sans-serif', lineHeight: '1' }}>
        {valor}
      </div>
      <div style={{ fontSize: '12px', fontWeight: '600', color: T.text, marginTop: '4px' }}>
        {titulo}
      </div>
      {descricao && (
        <div style={{ fontSize: '11px', color: T.muted, marginTop: '4px' }}>
          {descricao}
        </div>
      )}
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
}

export default function M31PainelSaudeOperacional() {
  const [showIncidentes, setShowIncidentes] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['m31-saude-operacional'],
    queryFn: async () => {
      const [aprovSemBV, qrPend, grupoPend, dlq, incidentes, cobrancas, recuperacoes] = await Promise.all([
        base44.entities.EventoM31Inscricao.filter({ status_pagamento: 'aprovado', data_envio_boas_vindas: null }, '+created_date', 500),
        base44.entities.EventoM31Inscricao.filter({ status_pagamento: 'aprovado', qr_envio_status: 'gerado_nao_enviado' }, '+created_date', 500),
        base44.entities.EventoM31Inscricao.filter({ status_pagamento: 'aprovado', status_envio_grupo: 'pendente' }, '+created_date', 500),
        base44.entities.M31DeadLetterQueue.filter({ resolvido: false }, '-created_date', 100),
        base44.entities.M31OperacaoIncidente.filter({ status: 'novo' }, '-created_date', 50),
        base44.entities.EventoM31Inscricao.filter({ status_pagamento: 'pendente' }, '+created_date', 500),
        base44.entities.EventoM31Inscricao.filter({ fila_recuperacao: true, status_fila_recuperacao: 'aguardando_aprovacao' }, '+created_date', 500),
      ]);

      return {
        aprovadas_sem_boas_vindas: aprovSemBV.length,
        qr_pendentes: qrPend.length,
        grupo_pendentes: grupoPend.length,
        dlq_pendentes: dlq.length,
        incidentes_ativos: incidentes.length,
        incidentes_criticos: incidentes.filter(i => i.severidade === 'critico').length,
        cobrancas_pendentes: cobrancas.length,
        recuperacoes_paradas: recuperacoes.length,
        incidentes,
        dlq,
        aprovSemBV,
      };
    },
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
        {[...Array(8)].map((_, i) => (
          <div key={i} style={{ height: '140px', background: T.card, border: `1px solid ${T.border}`, borderRadius: '12px', animation: 'pulse 1.5s infinite' }} />
        ))}
      </div>
    );
  }

  const d = data || {};
  const statusFor = (n, yellowAt = 1, redAt = 10) => n === 0 ? 'green' : n < yellowAt ? 'green' : n < redAt ? 'yellow' : 'red';

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: T.text, fontFamily: 'Inter, sans-serif' }}>
            Saúde Operacional
          </h2>
          <p style={{ fontSize: '12px', color: T.sec, marginTop: '2px' }}>
            Monitoramento em tempo real das garantias de entrega · atualiza a cada 30s
          </p>
        </div>
        <button
          onClick={() => refetch()}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 14px', borderRadius: '8px',
            border: `1px solid ${T.border}`, background: T.card,
            color: T.sec, fontSize: '12px', fontWeight: '600', cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Grid de Health Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <HealthCard
          titulo="Aprovadas sem boas-vindas"
          valor={d.aprovadas_sem_boas_vindas || 0}
          status={statusFor(d.aprovadas_sem_boas_vindas || 0, 1, 10)}
          icon={Send}
          descricao="Safety Net processa a cada 5min"
          onClick={() => setShowIncidentes(false)}
        />
        <HealthCard
          titulo="QR Codes pendentes"
          valor={d.qr_pendentes || 0}
          status={statusFor(d.qr_pendentes || 0, 1, 10)}
          icon={QrCode}
          descricao="Após boas-vindas enviadas"
        />
        <HealthCard
          titulo="Grupo pendente"
          valor={d.grupo_pendentes || 0}
          status={statusFor(d.grupo_pendentes || 0, 1, 10)}
          icon={Users}
          descricao="Link do grupo não enviado"
        />
        <HealthCard
          titulo="Cobranças pendentes"
          valor={d.cobrancas_pendentes || 0}
          status={statusFor(d.cobrancas_pendentes || 0, 5, 50)}
          icon={DollarSign}
          descricao="Aguardando pagamento"
        />
        <HealthCard
          titulo="Recuperações paradas"
          valor={d.recuperacoes_paradas || 0}
          status={statusFor(d.recuperacoes_paradas || 0, 5, 20)}
          icon={Clock}
          descricao="Aguardando aprovação"
        />
        <HealthCard
          titulo="Dead Letter Queue"
          valor={d.dlq_pendentes || 0}
          status={statusFor(d.dlq_pendentes || 0, 1, 5)}
          icon={Inbox}
          descricao="Falhas terminais aguardando"
        />
        <HealthCard
          titulo="Incidentes ativos"
          valor={d.incidentes_ativos || 0}
          status={statusFor(d.incidentes_ativos || 0, 1, 5)}
          icon={AlertTriangle}
          descricao={`${d.incidentes_criticos || 0} crítico(s)`}
          onClick={() => setShowIncidentes(true)}
        />
        <HealthCard
          titulo="Sistema"
          valor={d.aprovadas_sem_boas_vindas === 0 && d.dlq_pendentes === 0 && d.incidentes_ativos === 0 ? 'OK' : 'ATENÇÃO'}
          status={d.aprovadas_sem_boas_vindas === 0 && d.dlq_pendentes === 0 && d.incidentes_ativos === 0 ? 'green' : 'yellow'}
          icon={Activity}
          descricao="Status geral"
        />
      </div>

      {/* Incidentes ativos */}
      {showIncidentes && d.incidentes && d.incidentes.length > 0 && (
        <div style={{
          background: T.card, border: `1px solid ${T.border}`, borderRadius: '12px',
          padding: '16px', marginBottom: '16px',
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: '700', color: T.text, marginBottom: '12px' }}>
            Incidentes Ativos
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {d.incidentes.map(inc => (
              <div key={inc.id} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', borderRadius: '8px',
                background: inc.severidade === 'critico' ? TOKENS.dangerSoft : inc.severidade === 'alto' ? TOKENS.warningSoft : TOKENS.surfaceSubtle,
                border: `1px solid ${T.borderSubtle}`,
              }}>
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                  background: inc.severidade === 'critico' ? T.danger : inc.severidade === 'alto' ? T.warning : T.sec,
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: T.text }}>{inc.descricao}</div>
                  <div style={{ fontSize: '10px', color: T.muted, marginTop: '2px' }}>
                    {inc.tipo} · {inc.origem} · {inc.created_date ? new Date(inc.created_date).toLocaleString('pt-BR') : ''}
                  </div>
                </div>
                {inc.alerta_enviado && (
                  <span style={{ fontSize: '10px', color: T.success, fontWeight: '600' }}>Alerta enviado</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DLQ items */}
      {d.dlq && d.dlq.length > 0 && (
        <div style={{
          background: T.card, border: `1px solid ${T.border}`, borderRadius: '12px',
          padding: '16px',
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: '700', color: T.text, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Inbox size={16} color={T.danger} />
            Dead Letter Queue
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {d.dlq.slice(0, 10).map(item => (
              <div key={item.id} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', borderRadius: '8px',
                background: TOKENS.dangerSoft,
                border: `1px solid ${T.borderSubtle}`,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: T.text }}>
                    {item.inscricao_nome || 'Sem nome'} · {item.etapa}
                  </div>
                  <div style={{ fontSize: '11px', color: T.muted, marginTop: '2px' }}>{item.erro}</div>
                </div>
                <span style={{ fontSize: '10px', color: T.muted }}>
                  {item.created_date ? new Date(item.created_date).toLocaleString('pt-BR') : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {d.aprovadas_sem_boas_vindas === 0 && d.dlq_pendentes === 0 && d.incidentes_ativos === 0 && (
        <div style={{
          background: T.card, border: `1px solid ${T.border}`, borderRadius: '12px',
          padding: '40px', textAlign: 'center',
        }}>
          <CheckCircle size={40} color={T.success} style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: '14px', fontWeight: '700', color: T.text }}>
            Sistema saudável
          </div>
          <div style={{ fontSize: '12px', color: T.sec, marginTop: '4px' }}>
            Todas as garantias de entrega estão operacionais. Nenhum gap detectado.
          </div>
        </div>
      )}
    </div>
  );
}