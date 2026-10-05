/**
 * PendenciaMobileCard — Card expansível mobile-first para a lista de auditoria.
 * Toque no card abre o drawer de ações; toque em um motivo dá OK (resolve);
 * toque no WhatsApp abre a conversa direto no app.
 */
import { TOKENS } from '@/lib/m31DesignTokens';
import { STATUS_LABELS, STATUS_COLORS, PRIORIDADE_COLORS, waMeUrl } from '@/hooks/useM31PendenciasConciliacao';
import { ChevronRight, Check, MessageCircle } from 'lucide-react';

const MOTIVO_LABELS = {
  nome_incompleto: 'Nome incompleto', email_ausente: 'Sem e-mail', email_invalido: 'E-mail inválido',
  whatsapp_ausente: 'Sem WhatsApp', whatsapp_invalido: 'WhatsApp inválido',
  cpf_ausente: 'Sem CPF', cpf_invalido: 'CPF inválido', cidade_uf_ausente: 'Sem cidade/UF',
  codigo_ausente: 'Sem código', origem_nao_identificada: 'Origem desconhecida',
  gateway_nao_identificado: 'Sem gateway', caravana_sem_id: 'Caravana sem ID',
  voluntario_sem_area: 'Voluntário sem área', aprovado_sem_transacao: 'Aprovado sem transação',
  valor_ausente: 'Sem valor', valor_divergente: 'Valor divergente',
  pagamento_terceiro: 'Pagamento por terceiro', possivel_duplicidade: 'Possível duplicidade',
  presenteada_incompleta: 'Presenteada incompleta', compradora_sem_presenteada: 'Compradora sem presenteada',
  presenteada_sem_compradora: 'Presenteada sem compradora', pagamento_sem_confirmacao: 'Sem confirmação',
  confirmacao_sem_qr: 'Sem QR Code', qr_sem_envio: 'QR não enviado',
  cadastro_presenteada_pendente: 'Cadastro presenteada pendente',
};

const OK_BG = '#DCFCE7';
const OK_TEXT = '#15803D';

export default function PendenciaMobileCard({ pendencia, onClick, onToggleMotivo }) {
  const sc = STATUS_COLORS[pendencia.status_analise] || STATUS_COLORS.pendente_analise;
  const pc = PRIORIDADE_COLORS[pendencia.prioridade] || PRIORIDADE_COLORS.media;
  const resolvidos = pendencia.motivos_resolvidos || [];
  const todosOk = pendencia.motivos.length > 0 && pendencia.motivos.every(m => resolvidos.includes(m));

  return (
    <div
      onClick={() => onClick(pendencia)}
      style={{
        background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: TOKENS.radius.lg,
        borderLeft: pendencia.prioridade === 'alta' ? `4px solid ${TOKENS.primary}` : `1px solid ${TOKENS.border}`,
        padding: '12px 14px', cursor: 'pointer', boxShadow: TOKENS.shadowLg,
        transition: `all ${TOKENS.transition.atomic}`,
      }}
    >
      {/* Row 1: status + prioridade */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ padding: '2px 8px', borderRadius: TOKENS.radius.pill, fontSize: '10px', fontWeight: '700', background: sc.bg, color: sc.text }}>
          {STATUS_LABELS[pendencia.status_analise]}
        </span>
        <span style={{ padding: '2px 8px', borderRadius: TOKENS.radius.pill, fontSize: '10px', fontWeight: '700', background: pc.bg, color: pc.text, textTransform: 'uppercase' }}>
          {pendencia.prioridade}
        </span>
      </div>

      {/* Row 2: nome */}
      <div style={{ fontSize: '15px', fontWeight: '700', color: TOKENS.text, fontFamily: TOKENS.font.heading, marginBottom: '4px' }}>
        {pendencia.nome || '—'}
      </div>

      <div style={{ fontSize: 11, color: TOKENS.textMuted, marginBottom: 6 }}>
        <b style={{ color: TOKENS.text }}>{String(pendencia.status_pagamento || 'Status não identificado').replace(/_/g,' ')}</b> · {pendencia.origem ? String(pendencia.origem).replace(/_/g,' ') : 'Origem não identificada'}
      </div>

      {/* Row 3: no máximo 2 motivos principais */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '6px' }}>
        {pendencia.motivos.slice(0,2).map((m, i) => {
          const ok = resolvidos.includes(m);
          return (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); onToggleMotivo(pendencia, m); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '3px 8px', borderRadius: '6px',
                fontSize: '10px', fontWeight: '700', cursor: 'pointer',
                background: ok ? OK_BG : '#F6E9EC', color: ok ? OK_TEXT : '#8B1A2B',
                border: `1px solid ${ok ? OK_TEXT : 'transparent'}`,
                transition: `all ${TOKENS.transition.atomic}`,
              }}
              title={ok ? 'Motivo resolvido — toque para reabrir' : 'Toque para dar OK neste motivo'}
            >
              <Check size={11} strokeWidth={3} /> {MOTIVO_LABELS[m] || m}
            </button>
          );
        })}
        {pendencia.motivos.length > 2 && <span style={{ fontSize: 10, color: TOKENS.textMuted, alignSelf: 'center' }}>+{pendencia.motivos.length - 2} motivo(s)</span>}
        {todosOk && <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700', background: OK_BG, color: OK_TEXT }}>Pendência concluída ✓</span>}
      </div>

      {/* Row 4: info rápida — WhatsApp abre conversa */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: TOKENS.textMuted }}>
        {pendencia.whatsapp ? (
          <a
            href={waMeUrl(pendencia.whatsapp)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
          >
            <MessageCircle size={13} color="#25D366" fill="#25D366" />
            <span style={{ color: TOKENS.text, fontWeight: '600', textDecoration: 'underline', textDecorationColor: TOKENS.borderStrong }}>{pendencia.whatsapp}</span>
          </a>
        ) : (
          <span>Sem WhatsApp</span>
        )}
        <span style={{ display: 'flex', alignItems: 'center', gap: '2px', color: TOKENS.textSubtle }}>
          Revisar <ChevronRight size={12} />
        </span>
      </div>
    </div>
  );
}