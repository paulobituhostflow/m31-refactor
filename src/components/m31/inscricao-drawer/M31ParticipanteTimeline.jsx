/**
 * M31ParticipanteTimeline — Timeline única e cronológica da participante.
 * Agrega eventos da própria inscrição + logs de mensagens + logs de grupo.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { formatDateTimeBR } from '@/lib/dateUtils';
import {
  UserPlus, CreditCard, CheckCircle2, MessageSquare,
  UserCheck, QrCode, MapPin, Send, AlertCircle, Webhook,
} from 'lucide-react';

const C = {
  text: '#2d2d2d', textSec: '#6b7280', textTer: '#9ca3af',
  border: 'rgba(0,0,0,0.08)',
  brand: '#8B1A2B', success: '#10b981', warning: '#f59e0b',
  danger: '#ef4444', info: '#3b82f6', purple: '#8b5cf6',
};

function fmt(ts) {
  if (!ts) return null;
  try { return formatDateTimeBR(ts); } catch { return null; }
}

function buildEvents(inscricao, msgs, grupoLogs) {
  const events = [];

  // 1. Inscrição criada
  if (inscricao.created_date) {
    events.push({
      ts: inscricao.created_date, icon: UserPlus, color: C.brand,
      title: 'Inscrição criada',
      detail: inscricao.codigo_inscricao || inscricao.email,
    });
  }

  // 2. Checkout criado (asaas_charge_url presente + status checkout_pendente)
  if (inscricao.asaas_charge_url && inscricao.status_pagamento !== 'checkout_pendente' || inscricao.status_pagamento === 'checkout_pendente') {
    const ts = inscricao.checkout_abandoned_at || inscricao.updated_date || inscricao.created_date;
    events.push({
      ts, icon: CreditCard, color: C.info,
      title: 'Checkout criado',
      detail: inscricao.asaas_billing_type ? `Método: ${inscricao.asaas_billing_type}` : null,
    });
  }

  // 3. Pagamento confirmado
  if (['aprovado', 'gratuito'].includes(inscricao.status_pagamento)) {
    events.push({
      ts: inscricao.updated_date || inscricao.created_date,
      icon: CheckCircle2, color: C.success,
      title: 'Pagamento confirmado',
      detail: inscricao.valor_pago ? `R$ ${inscricao.valor_pago.toFixed(2)}` : 'Gratuito',
    });
  }

  // 4. Webhook recebido (aproximação: quando status virou aprovado)
  if (['aprovado', 'gratuito'].includes(inscricao.status_pagamento) && inscricao.asaas_payment_id) {
    events.push({
      ts: inscricao.updated_date || inscricao.created_date,
      icon: Webhook, color: C.success,
      title: 'Webhook recebido',
      detail: `ID Asaas: ${inscricao.asaas_payment_id}`,
    });
  }

  // 5. Boas-vindas enviada (campo dedicado)
  if (inscricao.data_envio_boas_vindas) {
    events.push({
      ts: inscricao.data_envio_boas_vindas,
      icon: MessageSquare, color: C.success,
      title: 'Boas-vindas enviada',
      detail: inscricao.whatsapp,
    });
  }

  // 6. Logs de mensagens (M31MessageLog)
  (msgs || []).forEach(m => {
    events.push({
      ts: m.enviado_em || inscricao.created_date,
      icon: m.sucesso ? Send : AlertCircle,
      color: m.sucesso ? C.success : C.danger,
      title: m.sucesso ? `Mensagem: ${m.tipo}` : `Falha: ${m.tipo}`,
      detail: m.erro || (m.mensagem ? m.mensagem.slice(0, 60) : null),
    });
  });

  // 7. Grupo enviado (M31GrupoEnvioLog)
  (grupoLogs || []).forEach(g => {
    events.push({
      ts: g.enviado_em || inscricao.created_date,
      icon: UserCheck, color: g.sucesso ? C.success : C.danger,
      title: g.tipo_envio === 'link_convite' ? 'Link do grupo enviado' : 'Mensagem no grupo',
      detail: g.cancelado ? 'Cancelado' : g.nome_grupo,
    });
  });

  // 8. Entrou no grupo
  if (inscricao.entrou_no_grupo && inscricao.data_entrada_grupo) {
    events.push({
      ts: inscricao.data_entrada_grupo,
      icon: UserCheck, color: C.success,
      title: 'Entrou no grupo',
      detail: `Origem: ${inscricao.origem_confirmacao_grupo || '—'}`,
    });
  }

  // 9. QR Code gerado
  if (inscricao.qrcode_gerado_em) {
    events.push({
      ts: inscricao.qrcode_gerado_em,
      icon: QrCode, color: C.purple,
      title: 'QR Code gerado',
    });
  }

  // 10. QR Code enviado
  if (inscricao.qr_ultimo_envio_em) {
    events.push({
      ts: inscricao.qr_ultimo_envio_em,
      icon: QrCode, color: inscricao.qr_envio_status === 'enviado_com_sucesso' ? C.success : C.warning,
      title: `QR Code enviado (${inscricao.qr_envio_status || '—'})`,
      detail: `Tentativas: ${inscricao.qr_tentativas_envio || 0}`,
    });
  }

  // 11. Check-in realizado
  if (inscricao.checkin_realizado && inscricao.checkin_at) {
    events.push({
      ts: inscricao.checkin_at,
      icon: MapPin, color: C.brand,
      title: 'Check-in realizado',
    });
  }

  // Sort por timestamp descendente (mais recente primeiro)
  return events
    .filter(e => e.ts)
    .sort((a, b) => new Date(b.ts) - new Date(a.ts));
}

export default function M31ParticipanteTimeline({ inscricao }) {
  const { data: msgs = [] } = useQuery({
    queryKey: ['timeline-msgs', inscricao.id],
    queryFn: () => base44.asServiceRole.entities.M31MessageLog
      .filter({ inscricao_id: inscricao.id }, '-enviado_em', 50),
    enabled: !!inscricao?.id,
  });

  const { data: grupoLogs = [] } = useQuery({
    queryKey: ['timeline-grupo', inscricao.id],
    queryFn: () => base44.asServiceRole.entities.M31GrupoEnvioLog
      .filter({ inscricao_id: inscricao.id }, '-enviado_em', 50),
    enabled: !!inscricao?.id,
  });

  const events = useMemo(
    () => buildEvents(inscricao, msgs, grupoLogs),
    [inscricao, msgs, grupoLogs],
  );

  if (events.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: C.textTer, fontSize: '13px' }}>
        Nenhum evento registrado ainda.
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', padding: '8px 0' }}>
      {/* Linha vertical */}
      <div style={{
        position: 'absolute', left: '19px', top: '8px', bottom: '8px',
        width: '2px', background: C.border,
      }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        {events.map((e, i) => {
          const Icon = e.icon;
          return (
            <div key={i} style={{ display: 'flex', gap: '14px', padding: '10px 0', position: 'relative' }}>
              {/* Ícone */}
              <div style={{
                width: '40px', height: '40px', borderRadius: '50%',
                background: `${e.color}14`, border: `2px solid ${e.color}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, zIndex: 1, position: 'relative',
              }}>
                <Icon size={16} color={e.color} />
              </div>
              {/* Conteúdo */}
              <div style={{ flex: 1, minWidth: 0, paddingTop: '4px' }}>
                <div style={{ fontSize: '11px', color: C.textTer, fontWeight: '500', marginBottom: '2px' }}>
                  {fmt(e.ts)}
                </div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: C.text }}>
                  {e.title}
                </div>
                {e.detail && (
                  <div style={{ fontSize: '11px', color: C.textSec, marginTop: '2px', wordBreak: 'break-word' }}>
                    {e.detail}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}