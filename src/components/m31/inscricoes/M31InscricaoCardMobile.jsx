import { StatusChip } from '@/components/m31/ui';
import { PAYMENT_STATUS } from '@/lib/m31Enums';
import { getJornada } from './M31JornadaCell';
import M31AcoesMenu from './M31AcoesMenu';

const CART_LABEL = { pendente: 'Carta', em_elaboracao: 'Carta ✎', pronta: 'Carta ✓', entregue: 'Carta ✓✓' };
const CART_COLOR = { pendente: '#9ca3af', em_elaboracao: '#f59e0b', pronta: '#10b981', entregue: '#10b981' };

function Pill({ ok, label, color }) {
  const c = color || (ok ? '#10b981' : '#9ca3af');
  return (
    <span style={{
      fontSize: '10px', fontWeight: '600', padding: '2px 7px', borderRadius: '100px',
      background: ok || color ? `${c}18` : '#f3f4f6', color: c, whiteSpace: 'nowrap',
    }}>
      {label}{ok && !color ? ' ✓' : ''}
    </span>
  );
}

export default function M31InscricaoCardMobile({ inscricao, onDetail, onAcao, enviando }) {
  const j = getJornada(inscricao);
  const isConfirmado = ['aprovado', 'gratuito'].includes(inscricao.status_pagamento);
  const waLink = `https://wa.me/55${(inscricao.whatsapp || '').replace(/\D/g, '')}`;
  const busy = enviando === inscricao.id;

  const menuItens = [
    { label: 'Reenviar boas-vindas', onClick: () => onAcao('bv', inscricao), disabled: !isConfirmado || busy },
    { label: 'Reenviar QR Code', onClick: () => onAcao('qr', inscricao), disabled: !isConfirmado || busy },
    { label: 'Reenviar link do grupo', onClick: () => onAcao('grupo', inscricao), disabled: !isConfirmado || busy },
    { label: inscricao.conferida_manualmente ? '✓ Conferida' : 'Marcar como conferida', onClick: () => onAcao('conferida', inscricao), disabled: !!inscricao.conferida_manualmente },
  ];

  return (
    <div
      onClick={() => onDetail(inscricao)}
      style={{
        background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '10px',
        padding: '12px', cursor: 'pointer', fontFamily: 'Inter,sans-serif',
      }}
    >
      {/* Nome + status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: '13.5px', fontWeight: '600', color: '#2d2d2d', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inscricao.nome}</span>
            {inscricao.conferida_manualmente && <span title="Conferida manualmente" style={{ fontSize: '11px', color: '#10b981', flexShrink: 0 }}>●</span>}
          </div>
          {inscricao.pagador_nome && inscricao.pagador_nome !== inscricao.nome && (
            <div style={{ fontSize: '11px', color: '#8b5cf6', fontWeight: '500', marginTop: '1px' }}>
              Pago por: {inscricao.pagador_nome}
            </div>
          )}
        </div>
        <StatusChip value={inscricao.status_pagamento} enumMap={PAYMENT_STATUS} />
      </div>

      {/* Contato */}
      <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
        {inscricao.ordem_operacional != null && (
          <span style={{ fontWeight: '700', color: '#8B1A2B' }}>#{String(inscricao.ordem_operacional).padStart(3, '0')} · </span>
        )}
        {inscricao.whatsapp || '—'} · {inscricao.codigo_inscricao || 'sem código'} · {inscricao.cidade || '—'}
      </div>

      {/* Jornada */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '8px' }}>
        <Pill ok={j.bv} label="BV" />
        <Pill ok={j.qr} label="QR" />
        <Pill ok={j.grupo} label="Grupo" />
        <Pill ok={j.entrou} label="Entrou" />
        <Pill ok={j.checkin} label="Check-in" />
        <Pill ok label={CART_LABEL[j.cartinha]} color={CART_COLOR[j.cartinha]} />
      </div>

      {/* Ações */}
      <div style={{ display: 'flex', gap: '6px', marginTop: '10px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
        <a
          href={waLink} target="_blank" rel="noreferrer"
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
            padding: '7px', background: 'rgba(16,185,129,0.1)', borderRadius: '6px',
            color: '#10b981', fontSize: '12px', fontWeight: '600', textDecoration: 'none',
          }}
        >WhatsApp</a>
        <button
          onClick={() => onDetail(inscricao)}
          style={{
            flex: 1, padding: '7px', background: '#f2f1f0', border: 'none', borderRadius: '6px',
            color: '#6b7280', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'Inter,sans-serif',
          }}
        >Detalhes</button>
        <M31AcoesMenu itens={menuItens} />
      </div>
    </div>
  );
}