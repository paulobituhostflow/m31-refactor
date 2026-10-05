/**
 * M31ReconciliacaoAsaas — Painel de Reconciliação Asaas
 *
 * Exibe comparação entre status no sistema e status no Asaas, com botões
 * de reprocessar e reenviar QR Code.
 */
import { useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import {
  RefreshCw, Search, AlertTriangle, CheckCircle2, XCircle,
  QrCode, ShieldCheck, Clock, Loader2,
} from 'lucide-react';

const C = {
  primary: '#8B1A2B', primaryDark: '#6B1422', primaryTint: '#F6E9EC',
  ink: '#2A1F1F', textMuted: '#6B5E5E', border: '#E5DDD5',
  surface: '#FFFFFF', surfaceWarm: '#F6EEE6', canvas: '#FAF7F2',
  success: '#16A34A', warning: '#D97706', danger: '#DC2626', info: '#3B82F6',
};

const STATUS_LABELS = {
  aprovado: { label: 'Aprovado', color: C.success },
  gratuito: { label: 'Gratuito', color: C.success },
  pendente: { label: 'Pendente', color: C.warning },
  checkout_pendente: { label: 'Checkout Pendente', color: C.warning },
  checkout_abandonado: { label: 'Abandonado', color: C.danger },
  cancelado: { label: 'Cancelado', color: C.danger },
};

function StatusBadge({ status }) {
  const info = STATUS_LABELS[status] || { label: status, color: C.textMuted };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '2px 8px', borderRadius: '9999px', fontSize: '11px', fontWeight: '600',
      background: `${info.color}14`, color: info.color,
    }}>
      {info.label}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '4px',
      padding: '16px', background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: '12px', flex: 1, minWidth: '140px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '8px',
          background: `${color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={14} color={color} />
        </div>
        <span style={{ fontSize: '11px', fontWeight: '600', color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
        </span>
      </div>
      <span style={{ fontSize: '24px', fontWeight: '700', color: C.ink }}>{value}</span>
    </div>
  );
}

function Indicador({ ok, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
      {ok ? <CheckCircle2 size={12} color={C.success} /> : <XCircle size={12} color={C.danger} />}
      <span style={{ color: ok ? C.success : C.danger, fontWeight: '500' }}>{label}</span>
    </div>
  );
}

export default function M31ReconciliacaoAsaas() {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [auditMode, setAuditMode] = useState(true);
  const [resultado, setResultado] = useState(null);
  const [acaoEmAndamento, setAcaoEmAndamento] = useState({});

  const auditar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('m31ReconciliarAsaas', { modo: 'audit' });
      setResultado(res);
    } catch (e) {
      alert('Erro ao auditar: ' + (e?.message || 'desconhecido'));
    } finally {
      setLoading(false);
    }
  }, []);

  const reprocessar = useCallback(async (inscricaoId) => {
    setAcaoEmAndamento(prev => ({ ...prev, [inscricaoId]: 'reprocessar' }));
    try {
      await base44.functions.invoke('m31ReconciliarAsaas', { modo: 'corrigir', inscricao_id: inscricaoId });
      await qc.invalidateQueries();
      await auditar();
    } catch (e) {
      alert('Erro ao reprocessar: ' + (e?.message || 'desconhecido'));
    } finally {
      setAcaoEmAndamento(prev => {
        const next = { ...prev };
        delete next[inscricaoId];
        return next;
      });
    }
  }, [auditar, qc]);

  const reenviarQR = useCallback(async (inscricaoId) => {
    setAcaoEmAndamento(prev => ({ ...prev, [inscricaoId]: 'qr' }));
    try {
      await base44.functions.invoke('m31ReenviarQRCode', { inscricao_id: inscricaoId });
      await qc.invalidateQueries();
      await auditar();
    } catch (e) {
      alert('Erro ao reenviar QR: ' + (e?.message || 'desconhecido'));
    } finally {
      setAcaoEmAndamento(prev => {
        const next = { ...prev };
        delete next[inscricaoId];
        return next;
      });
    }
  }, [auditar, qc]);

  const linhas = resultado?.linhas || [];
  const inconsistencias = linhas.filter(l => l.inconsistente);

  return (
    <div style={{ minHeight: '100vh', background: C.canvas, padding: '24px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '10px',
              background: `linear-gradient(135deg, ${C.primary} 0%, ${C.primaryDark} 100%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ShieldCheck size={20} color="#fff" />
            </div>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: '700', color: C.ink, margin: 0 }}>
                Reconciliação Asaas
              </h1>
              <p style={{ fontSize: '13px', color: C.textMuted, margin: 0 }}>
                Safety net automática — detecta e corrige pagamentos confirmados que o webhook não capturou
              </p>
            </div>
          </div>
        </div>

        {/* Stats + Actions */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <StatCard icon={Search} label="Auditadas" value={resultado?.total_auditadas || '—'} color={C.info} />
          <StatCard icon={AlertTriangle} label="Inconsistências" value={resultado?.total_inconsistencias || '—'} color={C.warning} />
          <StatCard icon={CheckCircle2} label="Corrigidas" value={resultado?.total_corrigidas || '—'} color={C.success} />
          <StatCard icon={Clock} label="Pendentes" value={resultado?.total_pendentes_analise || '—'} color={C.danger} />
        </div>

        {/* Action bar */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button
            onClick={auditar}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              background: C.primary, color: '#fff', border: 'none', borderRadius: '8px',
              fontSize: '14px', fontWeight: '600', cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            {loading ? 'Auditando...' : 'Auditar Agora'}
          </button>
        </div>

        {/* Causa raiz */}
        {resultado?.causa_raiz && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '10px',
            padding: '14px 16px', background: `${C.warning}0D`, border: `1px solid ${C.warning}30`,
            borderRadius: '10px', marginBottom: '16px',
          }}>
            <AlertTriangle size={16} color={C.warning} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontSize: '12px', fontWeight: '700', color: C.warning, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Causa Raiz Detectada
              </div>
              <div style={{ fontSize: '13px', color: C.ink, marginTop: '4px' }}>{resultado.causa_raiz}</div>
            </div>
          </div>
        )}

        {/* Tabela de inconsistências */}
        {inconsistencias.length > 0 && (
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: '600', color: C.ink, marginBottom: '12px' }}>
              Inconsistências Encontradas ({inconsistencias.length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {inconsistencias.map((linha) => (
                <div key={linha.id} style={{
                  background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px',
                  padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px',
                }}>
                  {/* Linha 1: nome + status badges */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: C.ink }}>{linha.nome}</div>
                      <div style={{ fontSize: '11px', color: C.textMuted }}>
                        CPF: {linha.cpf} · WhatsApp: {linha.whatsapp} · {linha.email}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <StatusBadge status={linha.status_sistema} />
                      <span style={{ fontSize: '11px', color: C.textMuted }}>vs</span>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        padding: '2px 8px', borderRadius: '9999px', fontSize: '11px', fontWeight: '600',
                        background: `${C.info}14`, color: C.info,
                      }}>
                        Asaas: {linha.status_asaas}
                      </span>
                    </div>
                  </div>

                  {/* Linha 2: indicadores */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
                    <Indicador ok={linha.pagamento_confirmado} label="Pagamento confirmado" />
                    <Indicador ok={linha.webhook_recebido} label="Webhook recebido" />
                    <Indicador ok={linha.inscricao_aprovada} label="Inscrição aprovada" />
                    <Indicador ok={linha.qr_code_gerado} label="QR Code gerado" />
                    <Indicador ok={linha.boas_vindas_enviadas} label="Boas-vindas enviadas" />
                    <Indicador ok={linha.entrega_confirmada} label="Entrega confirmada" />
                  </div>

                  {/* Linha 3: data confirmação + motivo falha */}
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '11px', color: C.textMuted }}>
                    {linha.data_confirmacao && (
                      <span>📅 Confirmação: {new Date(linha.data_confirmacao).toLocaleString('pt-BR')}</span>
                    )}
                    {linha.valor_pago_asaas && (
                      <span>💰 Valor Asaas: R$ {linha.valor_pago_asaas}</span>
                    )}
                    {linha.motivo_falha && (
                      <span style={{ color: C.danger }}>⚠️ {linha.motivo_falha}</span>
                    )}
                  </div>

                  {/* Linha 4: ações */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => reprocessar(linha.id)}
                      disabled={acaoEmAndamento[linha.id] === 'reprocessar'}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px',
                        background: C.primary, color: '#fff', border: 'none', borderRadius: '8px',
                        fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                        opacity: acaoEmAndamento[linha.id] === 'reprocessar' ? 0.6 : 1,
                      }}
                    >
                      {acaoEmAndamento[linha.id] === 'reprocessar'
                        ? <Loader2 size={13} className="animate-spin" />
                        : <RefreshCw size={13} />}
                      Reprocessar
                    </button>
                    <button
                      onClick={() => reenviarQR(linha.id)}
                      disabled={acaoEmAndamento[linha.id] === 'qr'}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px',
                        background: C.surfaceWarm, color: C.primary, border: `1px solid ${C.border}`,
                        borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                        opacity: acaoEmAndamento[linha.id] === 'qr' ? 0.6 : 1,
                      }}
                    >
                      {acaoEmAndamento[linha.id] === 'qr'
                        ? <Loader2 size={13} className="animate-spin" />
                        : <QrCode size={13} />}
                      Reenviar QR
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && resultado && inconsistencias.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
            padding: '48px 24px', background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: '12px',
          }}>
            <CheckCircle2 size={40} color={C.success} />
            <div style={{ fontSize: '16px', fontWeight: '600', color: C.ink }}>
              Nenhuma inconsistência encontrada
            </div>
            <div style={{ fontSize: '13px', color: C.textMuted, textAlign: 'center' }}>
              Todas as {resultado.total_auditadas} inscrições auditadas estão consistentes entre o sistema e o Asaas.
            </div>
          </div>
        )}

        {/* Initial state */}
        {!loading && !resultado && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
            padding: '48px 24px', background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: '12px',
          }}>
            <ShieldCheck size={40} color={C.primary} />
            <div style={{ fontSize: '16px', fontWeight: '600', color: C.ink }}>
              Reconciliação Asaas — Safety Net
            </div>
            <div style={{ fontSize: '13px', color: C.textMuted, textAlign: 'center', maxWidth: '500px' }}>
              Clique em "Auditar Agora" para comparar o status de todas as inscrições com o Asaas.
              A reconciliação automática roda a cada 2 horas e corrige inconsistências automaticamente.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}