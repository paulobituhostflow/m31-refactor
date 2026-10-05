/**
 * M31CentroOverview — Aba de Visão Geral (360°) do Centro da Participante.
 * Mostra cards de status clicáveis que navegam para as abas detalhadas.
 */
import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import {
  ClipboardCheck, CreditCard, MapPin, Users, QrCode,
  Bus, HandHeart, MessageSquare, Clock, Activity,
  Mail, CheckCircle2, XCircle, RefreshCw,
} from 'lucide-react';

const C = {
  text: '#2d2d2d', textSec: '#6b7280', textTer: '#9ca3af',
  border: 'rgba(0,0,0,0.08)',
  brand: '#8B1A2B', success: '#10b981', warning: '#f59e0b',
  danger: '#ef4444', info: '#3b82f6', purple: '#8b5cf6',
  bg1: '#f8f8f9',
};

const fmtBRL = n => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function StatusCard({ icon: Icon, label, value, color, tabTarget, onClick }) {
  return (
    <button
      onClick={() => onClick(tabTarget)}
      style={{
        display: 'flex', flexDirection: 'column', gap: '6px',
        padding: '12px', background: '#fff', border: `1px solid ${C.border}`,
        borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
        transition: 'border-color 0.12s', fontFamily: 'Inter,sans-serif',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = color}
      onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{
          width: '24px', height: '24px', borderRadius: '6px',
          background: `${color}14`, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={13} color={color} />
        </div>
        <span style={{ fontSize: '10px', fontWeight: '600', color: C.textSec, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
        </span>
      </div>
      <span style={{ fontSize: '13px', fontWeight: '700', color: C.text }}>
        {value}
      </span>
    </button>
  );
}

function StatPill({ label, value, color }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '8px 4px', background: C.bg1, borderRadius: '8px', flex: 1,
    }}>
      <span style={{ fontSize: '15px', fontWeight: '700', color: color || C.text }}>{value}</span>
      <span style={{ fontSize: '9px', color: C.textSec, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '2px' }}>{label}</span>
    </div>
  );
}

export default function M31CentroOverview({ inscricao, voluntario, onNavigate }) {
  const qc = useQueryClient();
  const [validando, setValidando] = useState(false);
  const isConfirmado = ['aprovado', 'gratuito'].includes(inscricao.status_pagamento);
  const statusLabel = {
    aprovado: 'Confirmado', gratuito: 'Gratuito',
    pendente: 'Pendente', checkout_pendente: 'Checkout gerado',
    checkout_abandonado: 'Abandonado', cancelado: 'Cancelado',
  }[inscricao.status_pagamento] || inscricao.status_pagamento;

  const valorExibido = (inscricao.tipo === 'caravana' && isConfirmado) ? 90 : (inscricao.valor_pago || 0);

  // ── Status de entrega ──
  const pagamentoOk = isConfirmado;
  const confirmacaoWhatsOk = !!inscricao.data_envio_boas_vindas;
  const qrEnviado = inscricao.qr_envio_status === 'enviado_com_sucesso';
  const qrGerado = !!inscricao.qrcode_url;
  const emailOk = inscricao.email_envio_status === 'enviado';
  const entregaConfirmada = inscricao.conferida_manualmente === true;

  // Mostra bloco de entrega apenas se pagamento estiver confirmado
  const mostrarEntrega = pagamentoOk;

  async function handleValidarEntrega() {
    setValidando(true);
    try {
      await base44.functions.invoke('m31ValidarEntregaConfirmacao', { inscricao_id: inscricao.id });
      await qc.invalidateQueries({ queryKey: ['m31inscricoes-table'] });
      await qc.invalidateQueries({ queryKey: ['drawer-msgs', inscricao.id] });
    } catch (e) {
      alert('Erro ao validar entrega: ' + (e?.message || 'desconhecido'));
    } finally {
      setValidando(false);
    }
  }

  function DeliveryIndicator({ icon: Icon, label, ok, detail }) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '8px 10px', background: '#fff', border: `1px solid ${ok ? `${C.success}30` : `${C.warning}30`}`,
        borderRadius: '8px',
      }}>
        <Icon size={14} color={ok ? C.success : C.warning} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '10px', fontWeight: '600', color: C.textSec, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
          <div style={{ fontSize: '11px', color: ok ? C.success : C.warning, fontWeight: '600' }}>{detail}</div>
        </div>
        {ok ? <CheckCircle2 size={14} color={C.success} /> : <XCircle size={14} color={C.warning} />}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* ── Status Cards Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <StatusCard icon={ClipboardCheck} label="Inscrição" value={statusLabel}
          color={isConfirmado ? C.success : inscricao.status_pagamento === 'checkout_abandonado' ? C.danger : C.warning}
          tabTarget="dados" onClick={onNavigate} />

        <StatusCard icon={CreditCard} label="Pagamento" value={pagamentoOk ? 'Confirmado' : 'Pendente'}
          color={pagamentoOk ? C.success : C.warning}
          tabTarget="pagamento" onClick={onNavigate} />

        <StatusCard icon={MapPin} label="Check-in" value={inscricao.checkin_realizado ? 'Realizado' : 'Pendente'}
          color={inscricao.checkin_realizado ? C.success : C.textTer}
          tabTarget="acoes" onClick={onNavigate} />

        <StatusCard icon={Users} label="Grupo WhatsApp" value={inscricao.entrou_no_grupo ? 'Entrou' : 'Não entrou'}
          color={inscricao.entrou_no_grupo ? C.success : C.warning}
          tabTarget="acoes" onClick={onNavigate} />

        <StatusCard icon={QrCode} label="QR Code" value={qrEnviado ? 'Enviado' : qrGerado ? 'Gerado' : 'Não gerado'}
          color={qrEnviado ? C.success : qrGerado ? C.purple : C.textTer}
          tabTarget="qrcode" onClick={onNavigate} />

        {inscricao.tipo === 'caravana' && (
          <StatusCard icon={Bus} label="Caravana" value={inscricao.caravana_nome || 'Sem vínculo'}
            color={inscricao.caravana_id ? C.info : C.danger}
            tabTarget="caravana" onClick={onNavigate} />
        )}

        {voluntario && (
          <StatusCard icon={HandHeart} label="Voluntariado" value={voluntario.setor || '—'}
            color={C.purple} tabTarget="voluntariado" onClick={onNavigate} />
          )
        }
      </div>

      {/* ── Entrega de Confirmação (só mostra se pagamento confirmado) ── */}
      {mostrarEntrega && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '10px', fontWeight: '600', color: C.textSec, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Entrega da Confirmação
            </span>
            <button onClick={handleValidarEntrega} disabled={validando} style={{
              display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px',
              background: C.brand, color: '#fff', border: 'none', borderRadius: '6px',
              fontSize: '10px', fontWeight: '600', cursor: validando ? 'wait' : 'pointer',
              opacity: validando ? 0.6 : 1, fontFamily: 'Inter,sans-serif',
            }}>
              <RefreshCw size={11} className={validando ? 'animate-spin' : ''} />
              {validando ? 'Validando...' : 'Validar e reenviar'}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <DeliveryIndicator icon={CreditCard} label="Pagamento" ok={pagamentoOk}
              detail={pagamentoOk ? 'Confirmado' : 'Pendente'} />
            <DeliveryIndicator icon={MessageSquare} label="Confirmação WhatsApp" ok={confirmacaoWhatsOk}
              detail={confirmacaoWhatsOk ? `Enviada · ${new Date(inscricao.data_envio_boas_vindas).toLocaleDateString('pt-BR')}` : 'Não enviada'} />
            <DeliveryIndicator icon={QrCode} label="QR Code" ok={qrEnviado}
              detail={qrEnviado ? 'Enviado com sucesso' : qrGerado ? 'Gerado, não enviado' : 'Não gerado'} />
            <DeliveryIndicator icon={Mail} label="E-mail de confirmação" ok={emailOk}
              detail={emailOk ? 'Enviado' : 'Não enviado'} />
            <DeliveryIndicator icon={CheckCircle2} label="Entrega confirmada" ok={entregaConfirmada}
              detail={entregaConfirmada ? 'Conferida manualmente' : 'Não conferida'} />
          </div>
        </div>
      )}

      {/* ── Quick Stats ── */}
      <div>
        <div style={{ fontSize: '10px', fontWeight: '600', color: C.textSec, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
          Estatísticas
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <StatPill label="Mensagens" value={inscricao.recovery_attempts || 0} color={C.info} />
          <StatPill label="Recuperações" value={inscricao.recovery_attempts || 0} color={C.warning} />
          <StatPill label="Tent. QR" value={inscricao.qr_tentativas_envio || 0} color={C.purple} />
        </div>
      </div>

      {/* ── Atalhos Rápidos ── */}
      <div>
        <div style={{ fontSize: '10px', fontWeight: '600', color: C.textSec, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
          Atalhos
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button onClick={() => onNavigate('whatsapp')} style={{
            display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px',
            background: C.bg1, border: `1px solid ${C.border}`, borderRadius: '6px',
            fontSize: '11px', color: C.textSec, cursor: 'pointer', fontFamily: 'Inter,sans-serif',
          }}>
            <MessageSquare size={12} /> WhatsApp
          </button>
          <button onClick={() => onNavigate('historico')} style={{
            display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px',
            background: C.bg1, border: `1px solid ${C.border}`, borderRadius: '6px',
            fontSize: '11px', color: C.textSec, cursor: 'pointer', fontFamily: 'Inter,sans-serif',
          }}>
            <Clock size={12} /> Linha do Tempo
          </button>
          <button onClick={() => onNavigate('logs')} style={{
            display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px',
            background: C.bg1, border: `1px solid ${C.border}`, borderRadius: '6px',
            fontSize: '11px', color: C.textSec, cursor: 'pointer', fontFamily: 'Inter,sans-serif',
          }}>
            <Activity size={12} /> Logs
          </button>
          <button onClick={() => onNavigate('acoes')} style={{
            display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px',
            background: C.bg1, border: `1px solid ${C.border}`, borderRadius: '6px',
            fontSize: '11px', color: C.textSec, cursor: 'pointer', fontFamily: 'Inter,sans-serif',
          }}>
            <ClipboardCheck size={12} /> Ações
          </button>
        </div>
      </div>
    </div>
  );
}