/**
 * M31DashboardDisparo
 * Monitor de segurança de disparos WhatsApp — controle anti-bloqueio.
 */
import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const C = {
  bg0: '#F6F7FB', bg1: '#FFFFFF', bg2: '#FFFFFF', bg3: '#F2F1F0', bg4: '#F8F8F9',
  text: '#2D2D2D', textSec: '#6B7280', textTer: '#9CA3AF',
  border: 'rgba(0,0,0,0.08)', borderSt: 'rgba(0,0,0,0.12)',
  brand: '#8B1A2B',
  success: '#10B981', successSoft: 'rgba(16,185,129,0.12)',
  warning: '#F59E0B', warningSoft: 'rgba(245,158,11,0.12)',
  danger: '#EF4444',  dangerSoft:  'rgba(239,68,68,0.12)',
  info: '#3B82F6',    infoSoft:    'rgba(59,130,246,0.12)',
};

const STATUS_CONFIG = {
  seguro:   { icon: '🟢', label: 'Seguro',    color: C.success,  bg: C.successSoft },
  atencao:  { icon: '🟡', label: 'Atenção',   color: C.warning,  bg: C.warningSoft },
  risco:    { icon: '🔴', label: 'Risco Alto', color: C.danger,   bg: C.dangerSoft  },
};

const TZ = 'America/Recife';

function fmtHora(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

function KpiCard({ label, value, sub, color = C.text, bg = C.bg2, icon }) {
  return (
    <div style={{ background: bg, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '14px 16px' }}>
      <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '.07em', textTransform: 'uppercase', color: C.textTer, marginBottom: '6px' }}>
        {icon && <span style={{ marginRight: '4px' }}>{icon}</span>}{label}
      </div>
      <div style={{ fontSize: '22px', fontWeight: '700', color, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: C.textSec, marginTop: '2px' }}>{sub}</div>}
    </div>
  );
}

function ProgBar({ value, max, color = C.brand }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ width: '100%', height: '6px', background: C.bg4, borderRadius: '3px' }}>
      <div style={{ width: `${pct}%`, height: '6px', borderRadius: '3px', background: color, transition: 'width .4s' }} />
    </div>
  );
}

function ActionBtn({ onClick, loading, disabled, variant = 'ghost', children }) {
  const [h, setH] = useState(false);
  const bgMap = {
    ghost:   h ? C.bg4 : C.bg3,
    brand:   h ? '#bc3a52' : C.brand,
    success: h ? 'rgba(16,185,129,.25)' : C.successSoft,
    warning: h ? 'rgba(245,158,11,.25)' : C.warningSoft,
  };
  const clrMap = {
    ghost: C.textSec, brand: '#fff', success: C.success, warning: C.warning,
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        padding: '8px 14px', borderRadius: '7px',
        background: bgMap[variant], color: clrMap[variant],
        border: `1px solid ${C.border}`,
        fontSize: '12px', fontWeight: '600', fontFamily: 'Inter, sans-serif',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.5 : 1, transition: 'all .12s',
      }}
    >
      {loading ? '⏳' : null} {children}
    </button>
  );
}

export default function M31DashboardDisparo() {
  const qc = useQueryClient();
  const [dispLog, setDispLog] = useState(null);

  const { data: dash, isLoading, refetch } = useQuery({
    queryKey: ['m31_dashboard_seguranca'],
    queryFn: () => base44.functions.invoke('m31DashboardSeguranca', {}).then(r => r.data),
    refetchInterval: 60000,
  });

  const dispararBoasVindas = useMutation({
    mutationFn: () => base44.functions.invoke('m31EnviarBoasVindas', {}).then(r => r.data),
    onSuccess: (data) => { setDispLog({ tipo: 'boas_vindas', ...data }); qc.invalidateQueries(['m31_dashboard_seguranca']); },
  });

  const dispararRegua = useMutation({
    mutationFn: () => base44.functions.invoke('m31ReguaSegura', {}).then(r => r.data),
    onSuccess: (data) => { setDispLog({ tipo: 'regua', ...data }); qc.invalidateQueries(['m31_dashboard_seguranca']); },
  });

  if (isLoading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
      <div style={{ width: '28px', height: '28px', border: `2px solid ${C.border}`, borderTopColor: C.brand, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const d = dash || {};
  const statusCfg = STATUS_CONFIG[d.status] || STATUS_CONFIG.seguro;
  const bloqueado = d.bloqueado;
  const hoje = d.hoje || {};
  const fila = d.fila || {};
  const u24 = d.ultimas_24h || {};
  const logs = d.logs_recentes || [];

  const pctLimite = hoje.limite_diario > 0 ? Math.round((hoje.mensagens_enviadas / hoje.limite_diario) * 100) : 0;

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', color: C.text, display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Status geral */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: statusCfg.bg, border: `1px solid ${statusCfg.color}40`,
        borderRadius: '10px', padding: '16px 20px', flexWrap: 'wrap', gap: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ fontSize: '28px' }}>{statusCfg.icon}</div>
          <div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: statusCfg.color }}>{statusCfg.label}</div>
            <div style={{ fontSize: '12px', color: C.textSec, marginTop: '2px' }}>
              {bloqueado ? '🚨 Número bloqueado detectado! Não disparar.' :
               d.status === 'atencao' ? 'Taxa de entrega baixa ou opt-outs elevados. Reduza o volume.' :
               'Sistema operando normalmente. Pode disparar com cautela.'}
            </div>
          </div>
        </div>
        <button onClick={() => refetch()} style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '7px 12px', color: C.textSec, fontSize: '12px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
          🔄 Atualizar
        </button>
      </div>

      {/* KPIs principais */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
        <KpiCard label="Enviadas Hoje" value={hoje.mensagens_enviadas || 0} sub={`limite: ${hoje.limite_diario || 25}`} color={C.text} />
        <KpiCard label="Boas-vindas" value={hoje.boas_vindas || 0} sub="hoje" color={C.success} />
        <KpiCard label="Cobranças" value={hoje.cobrancas || 0} sub="hoje" color={C.info} />
        <KpiCard label="Falhas" value={hoje.falhas || 0} sub="hoje" color={hoje.falhas > 0 ? C.danger : C.textTer} />
        <KpiCard label="Opt-outs" value={hoje.optouts || 0} sub="hoje" color={hoje.optouts > 0 ? C.warning : C.textTer} />
        <KpiCard label="Dias s/ bloqueio" value={hoje.dias_sem_bloqueio || 0} sub="streak" color={C.success} />
      </div>

      {/* Barra de uso diário */}
      <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: '600', color: C.textSec }}>Cota diária</span>
          <span style={{ fontSize: '12px', color: C.textSec, fontVariantNumeric: 'tabular-nums' }}>
            {hoje.mensagens_enviadas || 0} / {hoje.limite_diario || 25} ({pctLimite}%)
          </span>
        </div>
        <ProgBar value={hoje.mensagens_enviadas || 0} max={hoje.limite_diario || 25} color={pctLimite > 80 ? C.danger : pctLimite > 60 ? C.warning : C.success} />
        <div style={{ fontSize: '11px', color: C.textTer, marginTop: '6px' }}>
          Último envio: {fmtDateTime(hoje.ultimo_envio)} · Taxa de entrega 24h: {u24.taxa_entrega ?? '—'}%
        </div>
      </div>

      {/* Fila */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '14px 18px' }}>
          <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '.07em', textTransform: 'uppercase', color: C.textTer, marginBottom: '12px' }}>Fila de Envio</div>
          {[
            { label: '✅ Confirmadas sem boas-vindas', value: fila.confirmadas_sem_boas_vindas || 0, color: C.success },
            { label: '⏳ Pendentes para cobrança',     value: fila.pendentes_para_cobranca || 0,    color: C.warning },
            { label: '🚫 Opt-outs',                    value: fila.opt_outs || 0,                   color: C.textTer },
            { label: '⛔ Encerrados',                  value: fila.encerrados || 0,                 color: C.textTer },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: '12px', color: C.textSec }}>{label}</span>
              <span style={{ fontSize: '13px', fontWeight: '700', color, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
            </div>
          ))}
        </div>

        <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '14px 18px' }}>
          <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '.07em', textTransform: 'uppercase', color: C.textTer, marginBottom: '12px' }}>Últimas 24h</div>
          {[
            { label: 'Total enviados', value: u24.total_enviados || 0, color: C.text },
            { label: 'Sucesso',        value: u24.total_sucesso || 0,  color: C.success },
            { label: 'Falhas',         value: u24.total_falhas || 0,   color: u24.total_falhas > 0 ? C.danger : C.textTer },
            { label: 'Taxa entrega',   value: `${u24.taxa_entrega ?? '—'}%`, color: (u24.taxa_entrega || 100) >= 90 ? C.success : C.warning },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: '12px', color: C.textSec }}>{label}</span>
              <span style={{ fontSize: '13px', fontWeight: '700', color, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Ações */}
      <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '16px 20px' }}>
        <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '.07em', textTransform: 'uppercase', color: C.textTer, marginBottom: '14px' }}>Disparar Manualmente</div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: bloqueado ? '14px' : '0' }}>
          {/* Boas-vindas */}
          <div style={{ flex: 1, minWidth: '220px', background: C.bg3, borderRadius: '8px', padding: '14px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: C.text, marginBottom: '4px' }}>✅ Boas-vindas</div>
            <div style={{ fontSize: '11px', color: C.textSec, marginBottom: '12px' }}>
              Envia para confirmadas que ainda não receberam. Seguro para disparar agora.
            </div>
            <div style={{ fontSize: '11px', color: C.success, marginBottom: '10px' }}>
              {fila.confirmadas_sem_boas_vindas || 0} na fila
            </div>
            <ActionBtn
              variant="success"
              loading={dispararBoasVindas.isPending}
              disabled={bloqueado || (fila.confirmadas_sem_boas_vindas || 0) === 0}
              onClick={() => dispararBoasVindas.mutate()}
            >
              Disparar Boas-vindas
            </ActionBtn>
          </div>

          {/* Régua de cobrança */}
          <div style={{ flex: 1, minWidth: '220px', background: C.bg3, borderRadius: '8px', padding: '14px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: C.text, marginBottom: '4px' }}>⚡ Régua de Cobrança</div>
            <div style={{ fontSize: '11px', color: C.textSec, marginBottom: '12px' }}>
              Lotes de 5, intervalo 20-60s, pausa 10 min entre lotes. Apenas horário seguro (8h-20h).
            </div>
            <div style={{ fontSize: '11px', color: C.warning, marginBottom: '10px' }}>
              {fila.pendentes_para_cobranca || 0} pendentes · {hoje.limite_diario - (hoje.mensagens_enviadas || 0)} vagas restantes hoje
            </div>
            <ActionBtn
              variant="warning"
              loading={dispararRegua.isPending}
              disabled={bloqueado || (fila.pendentes_para_cobranca || 0) === 0}
              onClick={() => dispararRegua.mutate()}
            >
              Disparar Régua
            </ActionBtn>
          </div>
        </div>

        {bloqueado && (
          <div style={{ padding: '12px 14px', background: C.dangerSoft, border: `1px solid ${C.danger}40`, borderRadius: '8px', fontSize: '12px', color: C.danger }}>
            🚨 <strong>Número bloqueado.</strong> Não dispare nenhuma mensagem. Aguarde resolução manual do bloqueio no UAZAPI antes de retomar.
          </div>
        )}
      </div>

      {/* Resultado do último disparo */}
      {dispLog && (
        <div style={{ background: C.successSoft, border: `1px solid ${C.success}40`, borderRadius: '8px', padding: '14px 18px', fontSize: '12px', color: C.success }}>
          ✓ <strong>Disparo realizado:</strong>{' '}
          {dispLog.tipo === 'boas_vindas'
            ? `${dispLog.enviados || 0} boas-vindas enviadas, ${dispLog.falhas || 0} falhas, ${dispLog.elegiveis || 0} elegíveis`
            : `${dispLog.disparados || 0} mensagens enviadas, ${dispLog.erros || 0} erros, ${dispLog.encerrados || 0} leads encerrados`}
          {dispLog.skipped && ` · Pulado: ${dispLog.reason}`}
          <button onClick={() => setDispLog(null)} style={{ marginLeft: '12px', background: 'none', border: 'none', color: C.success, cursor: 'pointer', fontSize: '12px' }}>✕</button>
        </div>
      )}

      {/* Log recente */}
      {logs.length > 0 && (
        <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, fontSize: '10px', fontWeight: '700', letterSpacing: '.07em', textTransform: 'uppercase', color: C.textTer }}>
            Últimos Envios (24h)
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
              <thead>
                <tr>
                  {['Nome', 'Tipo', 'Status', 'Horário', 'Erro'].map(h => (
                    <th key={h} style={{ padding: '8px 14px', fontSize: '10px', fontWeight: '700', letterSpacing: '.06em', textTransform: 'uppercase', color: C.textTer, textAlign: 'left', background: C.bg1, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((l, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '8px 14px', fontSize: '12px', color: C.textSec }}>{l.nome || '—'}</td>
                    <td style={{ padding: '8px 14px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '600', padding: '2px 7px', borderRadius: '4px',
                        background: l.tipo === 'boas_vindas' ? C.successSoft : C.infoSoft,
                        color: l.tipo === 'boas_vindas' ? C.success : C.info }}>
                        {l.tipo}
                      </span>
                    </td>
                    <td style={{ padding: '8px 14px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '600', padding: '2px 7px', borderRadius: '4px',
                        background: l.sucesso ? C.successSoft : C.dangerSoft,
                        color: l.sucesso ? C.success : C.danger }}>
                        {l.sucesso ? '✓ OK' : '✗ Falha'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 14px', fontSize: '11px', color: C.textTer, whiteSpace: 'nowrap' }}>
                      {fmtDateTime(l.enviado_em)}
                    </td>
                    <td style={{ padding: '8px 14px', fontSize: '11px', color: C.danger }}>
                      {l.erro ? l.erro.substring(0, 40) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}