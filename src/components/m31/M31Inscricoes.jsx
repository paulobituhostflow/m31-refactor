import { useState, useMemo, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDateTimeBR, TIMEZONE_BADGE } from '@/lib/dateUtils';
import ComprovanteAsaas from '@/components/m31/ComprovanteAsaas';
import { useM31Auth } from '@/lib/m31Auth';
import M31InscricaoDrawer from '@/components/m31/inscricao-drawer/M31InscricaoDrawer';
import { StatusChip } from '@/components/m31/ui';
import M31FiltrosRapidos, { QUICK_FILTERS } from '@/components/m31/inscricoes/M31FiltrosRapidos';
import M31InscricaoCardMobile from '@/components/m31/inscricoes/M31InscricaoCardMobile';
import M31AcoesMenu from '@/components/m31/inscricoes/M31AcoesMenu';
import { JornadaDots, JornadaLegenda } from '@/components/m31/inscricoes/M31JornadaCell';
import M31JornadaEtapaModal from '@/components/m31/inscricoes/M31JornadaEtapaModal';
import { PAYMENT_STATUS } from '@/lib/m31Enums';
import M31KpiCanonico from '@/components/m31/inscricoes/M31KpiCanonico';
import { CANONICO, CANONICO_OPTIONS, filtrarCanonico, estadoCanonico } from '@/lib/m31Canonico';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import M31ImportarParticipantes from '@/components/m31/M31ImportarParticipantes';
import M31ExportarLeads from '@/components/m31/M31ExportarLeads';
import M31EnvioManual from '@/components/m31/M31EnvioManual';
import { fmtOrdem, matchOrdem } from '@/lib/m31Ordem';

// ── TOKENS (padrão unificado — espelha m31DesignTokens) ──────
import { TOKENS } from '@/lib/m31DesignTokens';
const C = {
  bg0: TOKENS.surface, bg1: TOKENS.background, bg2: TOKENS.surface, bg3: TOKENS.surfaceSubtle, bg4: TOKENS.borderSubtle,
  text: TOKENS.text, textSec: TOKENS.textMuted, textTer: TOKENS.textSubtle,
  border: TOKENS.border, borderSt: TOKENS.borderStrong,
  brand: TOKENS.primary, brandHov: TOKENS.primaryHover,
  success: TOKENS.success, successSoft: TOKENS.successSoft,
  warning: TOKENS.warning, warningSoft: TOKENS.warningSoft,
  danger:  TOKENS.danger,  dangerSoft:  TOKENS.dangerSoft,
  info:    TOKENS.info,    infoSoft:    TOKENS.infoSoft,
  amber:   TOKENS.warning,
};

// Vocabulário unificado via m31Enums (PAYMENT_STATUS) + StatusChip canônico.

const TIPO_LABEL = {
  publico_geral: 'Geral', voluntario: 'Voluntário',
  caravana: 'Caravana', doacao: 'Doação',
};

const fmtBRL = n => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = formatDateTimeBR;
// Normaliza para busca: lowercase + remove letras duplicadas consecutivas (ex: "daniella" → "daniela")
const norm = (s) => (s || '').toLowerCase().replace(/(.)\1+/g, '$1');
const TIPOS_PART = ['publico_geral', 'caravana', 'doacao'];

// ── ICONS ─────────────────────────────────────────────────────
const IcoSearch  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const IcoDown    = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>;
const IcoWA      = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.5 14c-.3-.2-1.8-.9-2-1s-.5-.2-.7.2-.8 1-.9 1.2-.3.2-.6 0c-1-.5-1.7-.9-2.3-1.9-.2-.4.2-.4.5-1.1.1-.2 0-.3 0-.5s-.7-1.8-1-2.4c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.4 1.1 2.8 1.2 3c.2.2 2.1 3.2 5.2 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.5.3-.7.3-1.4.2-1.5-.1-.1-.3-.2-.6-.4z"/><path d="M3 21l1.9-5.6A8.5 8.5 0 1 1 9 20.3L3 21"/></svg>;
const IcoEye     = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
const IcoSend    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
const IcoCheck   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
const IcoDownload= () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
const IcoUpload  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
const IcoX       = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IcoPrev    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>;
const IcoNext    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>;

// ── STATUS BADGE ──────────────────────────────────────────────
function StatusBadge({ status }) {
  return <StatusChip value={status} enumMap={PAYMENT_STATUS} />;
}

// KPIs migrados para M31KpiCanonico — contam pelo veredito canônico, nunca por status.

// ── DETAIL MODAL ──────────────────────────────────────────────
function DetailModal({ inscricao, caravanas, onClose, onSaved }) {
  const qc = useQueryClient();
  const [savingCaravana, setSavingCaravana] = useState(false);
  const [selectedCaravanaId, setSelectedCaravanaId] = useState(inscricao.caravana_id || '');
  const [loadingComprovante, setLoadingComprovante] = useState(false);

  const isConfirmado = ['aprovado','gratuito'].includes(inscricao.status_pagamento);

  async function handleVerAsaas(e) {
    // Para pagamentos confirmados, buscar a URL permanente do comprovante em tempo real.
    // O campo asaas_charge_url pode conter a URL de checkout (que expira após pagamento).
    if (isConfirmado && inscricao.asaas_payment_id) {
      setLoadingComprovante(true);
      try {
        const res = await base44.functions.invoke('m31BuscarComprovanteAsaas', { inscricao_id: inscricao.id });
        const url = res.data?.urls?.transaction_receipt_url || res.data?.urls?.invoice_url || inscricao.asaas_charge_url;
        qc.invalidateQueries({ queryKey: ['m31inscricoes-table'] });
        if (url) {
          window.open(url, '_blank');
        } else {
          alert('Comprovante não disponível no Asaas para este pagamento. Verifique diretamente no painel do Asaas usando o ID: ' + inscricao.asaas_payment_id);
        }
        return;
      } catch (err) {
        // Fallback: usa a URL armazenada, se houver
        if (inscricao.asaas_charge_url) {
          window.open(inscricao.asaas_charge_url, '_blank');
        } else {
          alert('Não foi possível buscar o comprovante no Asaas. ID do pagamento: ' + inscricao.asaas_payment_id);
        }
        return;
      } finally {
        setLoadingComprovante(false);
      }
    }
    // Não confirmado: abre a URL de checkout/cobrança
    if (inscricao.asaas_charge_url) {
      window.open(inscricao.asaas_charge_url, '_blank');
    } else if (inscricao.asaas_payment_id) {
      alert('Esta inscrição possui ID Asaas (' + inscricao.asaas_payment_id + ') mas sem URL de cobrança. Verifique no painel do Asaas.');
    }
  }

  const semCaravana = inscricao.tipo === 'caravana' && !inscricao.caravana_id;

  async function handleVincularCaravana() {
    if (!selectedCaravanaId) return;
    setSavingCaravana(true);
    const car = caravanas.find(c => c.id === selectedCaravanaId);
    await base44.entities.EventoM31Inscricao.update(inscricao.id, {
      caravana_id: selectedCaravanaId,
      caravana_nome: car?.nome || '',
    });
    qc.invalidateQueries({ queryKey: ['m31inscricoes-table'] });
    setSavingCaravana(false);
    onSaved?.();
    onClose();
  }

  // Valor exibido: caravana confirmada = R$ 90 fixo
  const valorExibido = (inscricao.tipo === 'caravana' && ['aprovado','gratuito'].includes(inscricao.status_pagamento))
    ? 90
    : (inscricao.valor_pago || 0);

  const rows = [
    ['Nome',         inscricao.nome],
    ['E-mail',       inscricao.email],
    ['WhatsApp',     inscricao.whatsapp],
    ['CPF',          inscricao.cpf],
    ['Cidade/Estado',`${inscricao.cidade || '—'} / ${inscricao.estado || '—'}`],
    ['Tipo',         TIPO_LABEL[inscricao.tipo] || inscricao.tipo],
    ['Lote',         inscricao.lote?.replace('_',' ') || '—'],
    ['Valor',        fmtBRL(valorExibido)],
    ['Parcelamento', inscricao.asaas_installment_count && inscricao.asaas_installment_count > 1
      ? `${inscricao.asaas_installment_count}x de ${fmtBRL(inscricao.asaas_installment_value || (valorExibido / inscricao.asaas_installment_count))}`
      : 'À vista'],
    ['Status',       null],
    ['Nº interno',   fmtOrdem(inscricao.ordem_operacional) || '—'],
    ['Cod. inscrição', inscricao.codigo_inscricao || '—'],
    ['WhatsApp (QR)', inscricao.qr_envio_status === 'enviado_com_sucesso' ? '✅ Enviado' : inscricao.qr_envio_status === 'falha_envio' ? '❌ Falha' : inscricao.qr_envio_status === 'reenvio_pendente' ? '⏳ Reenvio pendente' : '⚪ Não enviado'],
    ['Email (QR)',   inscricao.email_envio_status === 'enviado' ? `✅ Enviado${inscricao.email_boas_vindas_enviado_em ? ' em ' + fmtDate(inscricao.email_boas_vindas_enviado_em) : ''}` : inscricao.email_envio_status === 'falha' ? '❌ Falha no envio' : '⚪ Não enviado'],
    ['ID Asaas',     inscricao.asaas_payment_id || '—'],
    ['Criado em',    fmtDate(inscricao.created_date)],
    ['Tentativas bot', inscricao.recovery_attempts || 0],
    ['Último contato', fmtDate(inscricao.last_contact_at)],
    ['Obs.',         inscricao.observacoes || '—'],
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={onClose}>
      <div style={{ background: C.bg2, border: `1px solid ${C.borderSt}`, borderRadius: '10px', width: '100%', maxWidth: '520px', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: C.text, marginBottom: '6px' }}>{inscricao.nome}</div>
            <StatusBadge status={inscricao.status_pagamento} />
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.textSec, cursor: 'pointer', padding: '2px' }}><IcoX /></button>
        </div>

        {/* Alerta sem caravana */}
        {semCaravana && (
          <div style={{ margin: '16px 24px 0', padding: '12px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: C.warning, marginBottom: '8px' }}>⚠ Sem caravana vinculada</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <select
                  value={selectedCaravanaId}
                  onChange={e => setSelectedCaravanaId(e.target.value)}
                  style={{ width: '100%', appearance: 'none', WebkitAppearance: 'none', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: '6px', color: C.text, fontFamily: 'Inter,sans-serif', fontSize: '12px', padding: '7px 28px 7px 10px', outline: 'none', cursor: 'pointer' }}
                >
                  <option value="">Selecionar caravana...</option>
                  {caravanas.map(c => (
                    <option key={c.id} value={c.id}>{c.nome} {c.cidade_origem ? `· ${c.cidade_origem}` : ''}</option>
                  ))}
                </select>
                <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: C.textTer }}><IcoDown /></span>
              </div>
              <button
                onClick={handleVincularCaravana}
                disabled={!selectedCaravanaId || savingCaravana}
                style={{ padding: '7px 14px', background: selectedCaravanaId ? C.brand : C.bg4, border: 'none', borderRadius: '6px', color: '#fff', fontSize: '12px', fontWeight: '600', cursor: selectedCaravanaId ? 'pointer' : 'not-allowed', fontFamily: 'Inter,sans-serif', opacity: savingCaravana ? 0.6 : 1, whiteSpace: 'nowrap' }}
              >
                {savingCaravana ? 'Salvando...' : 'Vincular'}
              </button>
            </div>
          </div>
        )}

        {/* Caravana vinculada */}
        {inscricao.tipo === 'caravana' && inscricao.caravana_id && (
          <div style={{ margin: '16px 24px 0', padding: '10px 14px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.18)', borderRadius: '8px', fontSize: '12px', color: C.success }}>
            ✓ Caravana: <strong>{inscricao.caravana_nome || inscricao.caravana_id}</strong>
          </div>
        )}

        {/* Dados */}
        <div style={{ padding: '20px 24px' }}>
          {rows.map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.border}`, gap: '16px' }}>
              <span style={{ fontSize: '12px', color: C.textSec, flexShrink: 0 }}>{label}</span>
              {label === 'Status'
                ? <StatusBadge status={inscricao.status_pagamento} />
                : <span style={{ fontSize: '12px', color: C.text, textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
              }
            </div>
          ))}
          {/* Verificação de pagamento Asaas — selo de confirmação + comprovante */}
          <ComprovanteAsaas inscricao={inscricao} />
        </div>
      </div>
    </div>
  );
}

// ── ICON ACTION ───────────────────────────────────────────────
function IA({ title, onClick, href, variant, children, disabled }) {
  const [h, setH] = useState(false);
  const bg = h && !disabled
    ? variant === 'wa' ? C.success : variant === 'brand' ? C.brand : variant === 'green' ? C.success : C.bg4
    : C.bg3;
  const color = h && !disabled
    ? (variant === 'wa' || variant === 'brand' || variant === 'green') ? '#fff' : C.text
    : C.textSec;
  const btn = (
    <button title={title} onClick={onClick} disabled={disabled}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: bg, border: `1px solid ${h ? C.borderSt : C.border}`, borderRadius: '5px', color, cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all .12s', opacity: disabled ? .4 : 1, flexShrink: 0 }}
    >{children}</button>
  );
  if (href) return <a href={href} target="_blank" rel="noreferrer" style={{ display: 'flex' }}>{btn}</a>;
  return btn;
}

// ── SELECT FILTER ─────────────────────────────────────────────
function FilterSelect({ value, onChange, options, placeholder }) {
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        appearance: 'none', WebkitAppearance: 'none',
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: '8px',
        color: value ? C.text : C.textSec, fontFamily: 'Inter,sans-serif', fontSize: '13px', fontWeight: '500',
        padding: '8px 30px 8px 12px', outline: 'none', cursor: 'pointer', minHeight: '36px',
      }}>
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
      </select>
      <span style={{ position: 'absolute', right: '9px', pointerEvents: 'none', color: C.textTer }}><IcoDown /></span>
    </div>
  );
}

// ── TABLE ROW ─────────────────────────────────────────────────
function TableRow({ inscricao, onDetail, onReenviar, onMarcarPago, onEntrarGrupo, onAcao, onEtapa, enviando, isSuperAdmin }) {
  const [h, setH] = useState(false);
  const waLink = `https://wa.me/55${(inscricao.whatsapp || '').replace(/\D/g,'')}`;
  const isPending = ['pendente','checkout_pendente','checkout_abandonado'].includes(inscricao.status_pagamento);
  const isConfirmado = ['aprovado','gratuito'].includes(inscricao.status_pagamento);
  const semCaravana = inscricao.tipo === 'caravana' && !inscricao.caravana_id;
  const podeMarcarGrupo = isConfirmado && !inscricao.entrou_no_grupo;
  const busy = enviando === inscricao.id;

  // Valor exibido: caravana confirmada = R$ 90 fixo
  const valorExibido = (inscricao.tipo === 'caravana' && isConfirmado) ? 90 : (inscricao.valor_pago || 0);

  const baixarQR = async () => {
    const codigo = inscricao.codigo_inscricao;
    if (!codigo) { alert('Esta inscrição ainda não possui código gerado.'); return; }
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(codigo)}&bgcolor=FFFFFF&color=000000&format=png`;
    try {
      const res = await fetch(qrUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `QR_${inscricao.nome?.replace(/\s+/g, '_') || inscricao.id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      window.open(qrUrl, '_blank');
    }
  };

  const copiarMensagem = async () => {
    const primeiroNome = inscricao.nome?.split(' ')[0] || 'Querida';
    const texto =
      `Olá, ${primeiroNome}! 🌸\n` +
      `Sua inscrição no M31 Filhas está confirmada!\n\n` +
      `🎟️ Código da sua inscrição: ${inscricao.codigo_inscricao || '(não gerado)'}\n\n` +
      `📲 Seu QR Code está na imagem anexa.\n` +
      `Apresente-o no credenciamento do evento.\n\n` +
      `Nos vemos no M31! 💛`;
    try {
      await navigator.clipboard.writeText(texto);
      alert('✅ Mensagem copiada! Cole no WhatsApp da inscrita.');
    } catch (e) {
      prompt('Copie a mensagem:', texto);
    }
  };

  const menuItens = [
    { label: 'Reenviar boas-vindas', onClick: () => onAcao('bv', inscricao), disabled: !isConfirmado || busy },
    { label: 'Reenviar QR Code (WhatsApp)', onClick: () => onAcao('qr', inscricao), disabled: !isConfirmado || busy },
    { label: 'Enviar QR por Email', onClick: () => onAcao('qr_email', inscricao), disabled: !isConfirmado || !inscricao.email || busy },
    { label: 'Baixar QR Code', onClick: baixarQR, disabled: !inscricao.codigo_inscricao },
    { label: 'Copiar mensagem de boas-vindas', onClick: copiarMensagem, disabled: !isConfirmado },
    { label: 'Reenviar link do grupo', onClick: () => onAcao('grupo', inscricao), disabled: !isConfirmado || busy },
    { label: inscricao.conferida_manualmente ? '✓ Conferida' : 'Marcar como conferida', onClick: () => onAcao('conferida', inscricao), disabled: !!inscricao.conferida_manualmente },
  ];

  return (
    <tr onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ background: h ? 'rgba(168,52,74,0.02)' : 'transparent', transition: 'background .1s', cursor: 'default' }}>

      {/* Nome */}
      <td style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: C.text, marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{inscricao.nome}</span>
          {inscricao.conferida_manualmente && <span title="Conferida manualmente" style={{ fontSize: '10px', color: C.success, flexShrink: 0 }}>●</span>}
        </div>
        {inscricao.pagador_nome && inscricao.pagador_nome !== inscricao.nome && (
          <div style={{ fontSize: '11px', color: '#8b5cf6', fontWeight: '500', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>
            Pago por: {inscricao.pagador_nome}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {inscricao.ordem_operacional != null && (
            <span title="Nº operacional interno" style={{ fontSize: '11px', fontWeight: '700', color: C.brand, whiteSpace: 'nowrap', flexShrink: 0 }}>{fmtOrdem(inscricao.ordem_operacional)}</span>
          )}
          <span style={{ fontSize: '11px', color: C.textTer, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>{inscricao.codigo_inscricao || '—'}</span>
          {semCaravana && (
            <span style={{ fontSize: '10px', fontWeight: '600', padding: '1px 6px', borderRadius: '3px', background: 'rgba(245,158,11,0.12)', color: C.warning }}>
              Sem caravana
            </span>
          )}
        </div>
      </td>

      {/* Contato */}
      <td style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: '12px', color: C.textSec, marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>{inscricao.email}</div>
        <div style={{ fontSize: '11px', color: C.textTer, whiteSpace: 'nowrap' }}>{inscricao.whatsapp}</div>
      </td>

      {/* Status */}
      <td style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap', textAlign: 'center' }}>
        <StatusBadge status={inscricao.status_pagamento} />
        <div style={{ marginTop: '4px', fontSize: '10px', fontWeight: '600', color: C.textTer }} title="Veredito canônico — única base para contar vaga">
          {CANONICO[estadoCanonico(inscricao)]?.label || '—'}
        </div>
      </td>

      {/* Jornada */}
      <td className="col-jornada" style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap', textAlign: 'center' }}>
        <JornadaDots inscricao={inscricao} onEtapa={onEtapa} />
      </td>

      {/* Lote */}
      <td className="col-lote" style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: '12px', color: C.text }}>{inscricao.lote?.replace('_',' ') || '—'}</div>
        <div style={{ fontSize: '11px', color: C.textTer }}>{TIPO_LABEL[inscricao.tipo] || inscricao.tipo}</div>
      </td>

      {/* Valor */}
      {isSuperAdmin && (
        <td style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap', textAlign: 'right' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: C.text, fontVariantNumeric: 'tabular-nums' }}>{fmtBRL(valorExibido)}</span>
        </td>
      )}

      {/* Data */}
      <td className="col-data" style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap', textAlign: 'right' }}>
        <span style={{ fontSize: '12px', color: C.textSec }}>{fmtDate(inscricao.created_date)}</span>
      </td>

      {/* Ações */}
      <td style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <IA title="Abrir WhatsApp" href={waLink} variant="wa"><IcoWA /></IA>
          <IA title="Ver detalhes" onClick={() => onDetail(inscricao)}><IcoEye /></IA>
          {isPending && (
            <IA title="Reenviar cobrança" onClick={() => onReenviar(inscricao)} variant="brand" disabled={busy}>
              <IcoSend />
            </IA>
          )}
          {isPending && (
            <IA title="Marcar como pago" onClick={() => onMarcarPago(inscricao)} variant="green">
              <IcoCheck />
            </IA>
          )}
          {podeMarcarGrupo && (
            <IA title="Marcar como entrou no grupo" onClick={() => onEntrarGrupo(inscricao)} variant="brand">
              <IcoCheck />
            </IA>
          )}
          <M31AcoesMenu itens={menuItens} />
        </div>
      </td>
    </tr>
  );
}

// ── MAIN ──────────────────────────────────────────────────────
const PAGE_SIZES = [25, 50, 100];

// filtroTipos: array de tipos permitidos (ex: ['publico_geral','caravana','doacao'])
// Se não passado, mostra todos.
export default function M31Inscricoes({ filtroTipos, filtroStatus: initialFiltroStatus, filtroCaravanaId: initialFiltroCaravanaId, filtroLoteInicial, filtroGrupoInicial }) {
  const { isSuperAdmin } = useM31Auth();
  const qc = useQueryClient();
  const [busca,     setBusca]     = useState('');
  const [filtroStatus, setFiltroStatus] = useState(initialFiltroStatus || '');
  const [filtroCaravanaId, setFiltroCaravanaId] = useState(initialFiltroCaravanaId || '');
  const [filtroLote,   setFiltroLote]   = useState(filtroLoteInicial || '');
  const [filtroGrupo,  setFiltroGrupo]  = useState(filtroGrupoInicial || ''); // '', 'entrou', 'fora'
  const [filtroTipo,   setFiltroTipo]   = useState('');
  const [filtroCanonico, setFiltroCanonico] = useState(''); // universo canônico (regra única de vaga)
  const [page,      setPage]      = useState(1);
  const [pageSize,  setPageSize]  = useState(25);
  const [detalhe,   setDetalhe]   = useState(null);
  const [etapaModal, setEtapaModal] = useState(null); // { etapa, inscricao }
  const [enviando,  setEnviando]  = useState(null);
  const [filtroRapido, setFiltroRapido] = useState('todas');
  const [modalAcao, setModalAcao] = useState(null); // 'importar' | 'exportar' | null
  const [modoEnvioManual, setModoEnvioManual] = useState(false);

  // Ressincroniza os filtros SOMENTE quando as props de navegação realmente mudam.
  // Sem isso, uma re-renderização do pai podia manter o filtro de caravana preso,
  // impossibilitando limpá-lo pela interface.
  const propsAnteriores = useRef({ initialFiltroStatus, initialFiltroCaravanaId, filtroLoteInicial, filtroGrupoInicial });
  useEffect(() => {
    const ant = propsAnteriores.current;
    if (ant.initialFiltroStatus !== initialFiltroStatus) setFiltroStatus(initialFiltroStatus || '');
    if (ant.initialFiltroCaravanaId !== initialFiltroCaravanaId) setFiltroCaravanaId(initialFiltroCaravanaId || '');
    if (ant.filtroLoteInicial !== filtroLoteInicial) setFiltroLote(filtroLoteInicial || '');
    if (ant.filtroGrupoInicial !== filtroGrupoInicial) setFiltroGrupo(filtroGrupoInicial || '');
    propsAnteriores.current = { initialFiltroStatus, initialFiltroCaravanaId, filtroLoteInicial, filtroGrupoInicial };
  }, [initialFiltroStatus, initialFiltroCaravanaId, filtroLoteInicial, filtroGrupoInicial]);

  // Os filtros de navegação também vivem na URL (?caravana_id=...). Sem limpá-los
  // de lá, qualquer remontagem do painel reaplicava o filtro — era isso que fazia
  // a tela "não sair de caravana".
  const limparParamsUrl = (chaves) => {
    const url = new URL(window.location.href);
    chaves.forEach(k => url.searchParams.delete(k));
    window.history.replaceState({}, '', url.toString());
  };

  const limparCaravana = () => {
    setFiltroCaravanaId('');
    propsAnteriores.current.initialFiltroCaravanaId = undefined;
    limparParamsUrl(['caravana_id']);
    setPage(1);
  };

  const limparTudo = () => {
    setBusca(''); setFiltroStatus(''); setFiltroCaravanaId('');
    setFiltroLote(''); setFiltroTipo(''); setFiltroGrupo(''); setFiltroCanonico('');
    setFiltroRapido('todas'); setPage(1);
    propsAnteriores.current = {};
    limparParamsUrl(['caravana_id', 'status', 'lote', 'grupo']);
  };



  const { data: raw = { inscricoes: [], caravanas: [] }, isLoading } = useQuery({
    queryKey: ['m31inscricoes-table'],
    queryFn: async () => {
      const [insc, lotes, caravanas] = await Promise.all([
        base44.entities.EventoM31Inscricao.list('-created_date', 2000),
        base44.entities.EventoM31Lote.list(),
        base44.entities.EventoM31Caravana.list('-created_date', 200),
      ]);
      const loteMap = Object.fromEntries(lotes.map(l => [l.codigo, l.valor]));
      const inscricoes = insc.map(i => {
        // Valor total da inscrição: asaas_total_value tem prioridade (parcelas x valor parcela)
        // valor_pago pode conter apenas o valor de uma parcela — nunca usar como total
        let valor = i.asaas_total_value && i.asaas_total_value > 0
          ? i.asaas_total_value
          : (i.valor_pago && i.valor_pago > 0 ? i.valor_pago : (loteMap[i.lote] || 0));
        if (i.tipo === 'caravana' && ['aprovado','gratuito'].includes(i.status_pagamento)) {
          valor = 90;
        }
        return { ...i, valor_pago: valor };
      });
      return { inscricoes, caravanas };
    },
    refetchInterval: 120000,
  });

  const { inscricoes, caravanas } = raw;

  // ── FILTROS ──
  const filtered = useMemo(() => {
    let list = inscricoes;
    // Filtro estrutural por tipos (vem da prop do Hub pai)
    if (filtroTipos && filtroTipos.length > 0) list = list.filter(i => filtroTipos.includes(i.tipo));
    if (filtroRapido && filtroRapido !== 'todas') {
      const qf = QUICK_FILTERS.find(f => f.id === filtroRapido);
      if (qf) list = list.filter(qf.fn);
    }
    if (filtroStatus) {
      // "pendente" inclui pendente + checkout_pendente (pagamento não confirmado)
      if (filtroStatus === 'pendente') {
        list = list.filter(i => i.status_pagamento === 'pendente' || i.status_pagamento === 'checkout_pendente');
      } else {
        list = list.filter(i => i.status_pagamento === filtroStatus);
      }
    }
    if (filtroCaravanaId) list = list.filter(i => i.caravana_id === filtroCaravanaId);
    if (filtroLote)   list = list.filter(i => i.lote === filtroLote);
    if (filtroTipo)   list = list.filter(i => i.tipo === filtroTipo);
    list = filtrarCanonico(list, filtroCanonico);
    if (filtroGrupo === 'entrou') list = list.filter(i => i.entrou_no_grupo === true);
    else if (filtroGrupo === 'fora') list = list.filter(i => i.entrou_no_grupo !== true && ['aprovado','gratuito'].includes(i.status_pagamento));
    if (busca) {
      const b = norm(busca);
      list = list.filter(i =>
        norm(i.nome).includes(b) ||
        norm(i.email).includes(b) ||
        norm(i.whatsapp).includes(b) ||
        norm(i.codigo_inscricao).includes(b) ||
        matchOrdem(busca, i.ordem_operacional)
      );
    }
    return list;
  }, [inscricoes, busca, filtroStatus, filtroCaravanaId, filtroLote, filtroTipo, filtroGrupo, filtroRapido, filtroTipos, filtroCanonico]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  // Reset page on filter change
  const setFilter = (fn) => { fn(); setPage(1); };

  // ── CSV EXPORT ──
  function exportCSV() {
    const cols = ['nome','email','whatsapp','cpf','cidade','estado','tipo','lote','valor_pago','status_pagamento','estado_canonico','evidencia_canonica','origem_inscricao','origem_pagamento','codigo_inscricao','created_date'];
    const rows = [cols.join(';'), ...filtered.map(i => cols.map(c => `"${i[c] || ''}"`).join(';'))];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'm31-inscricoes.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleReenviar(i) {
    setEnviando(i.id);
    await base44.functions.invoke('m31ReenviarCobranca', { inscricao_id: i.id });
    setEnviando(null);
  }
  async function handleMarcarPago(i) {
    await base44.entities.EventoM31Inscricao.update(i.id, { status_pagamento: 'aprovado' });
    qc.invalidateQueries({ queryKey: ['m31inscricoes-table'] });
  }
  async function handleEntrarGrupo(i) {
    await base44.entities.EventoM31Inscricao.update(i.id, {
      entrou_no_grupo: true,
      data_entrada_grupo: new Date().toISOString(),
      origem_confirmacao_grupo: 'manual',
    });
    qc.invalidateQueries({ queryKey: ['m31inscricoes-table'] });
  }

  // Ações rápidas: reenvios via funções existentes (governança preservada) + conferência manual
  async function handleAcao(tipo, i) {
    if (tipo === 'conferida') {
      await base44.entities.EventoM31Inscricao.update(i.id, { conferida_manualmente: true });
      qc.invalidateQueries({ queryKey: ['m31inscricoes-table'] });
      return;
    }
    const fn = tipo === 'bv' ? 'm31EnviarBoasVindasConvidada'
      : tipo === 'qr' ? 'm31ReenviarQRCode'
      : tipo === 'qr_email' ? 'm31ReenviarQRCode'
      : 'm31ReenviarLinkGrupoIndividual';
    const payload = tipo === 'qr_email' ? { inscricao_id: i.id, canal: 'email' } : { inscricao_id: i.id };
    setEnviando(i.id);
    try {
      const res = await base44.functions.invoke(fn, payload);
      const d = res.data || {};
      if (d.sucesso === false || d.error) {
        alert(`Não enviado: ${d.motivo || d.detalhe || d.error || 'bloqueado pela governança'}`);
      }
      qc.invalidateQueries({ queryKey: ['m31inscricoes-table'] });
    } finally {
      setEnviando(null);
    }
  }

  // ── SHARED STYLES ──
  const inp = { background: C.bg2, border: `1px solid ${C.border}`, borderRadius: '6px', color: C.text, fontFamily: 'Inter,sans-serif', fontSize: '12px', outline: 'none' };
  const thStyle = { padding: '9px 12px', fontSize: '11px', fontWeight: '600', letterSpacing: '.06em', textTransform: 'uppercase', color: C.textTer, textAlign: 'left', whiteSpace: 'nowrap', background: C.bg1, borderBottom: `1px solid ${C.border}` };

  if (isLoading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
      <div style={{ width: '28px', height: '28px', border: `2px solid ${C.border}`, borderTopColor: C.brand, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (modoEnvioManual) {
    return <M31EnvioManual inscricoes={inscricoes} isLoading={isLoading} onVoltar={() => setModoEnvioManual(false)} />;
  }

  return (
    <div className="m31-inscricoes-wrap" style={{ fontFamily: 'Inter,sans-serif', color: C.text }}>
      {/* PAGE HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: '600', letterSpacing: '-.015em', color: C.text, marginBottom: '4px' }}>Inscrições</h1>
          <div style={{ fontSize: '13px', color: C.textSec }}>{filtered.length} resultado{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}</div>
          <div style={{ fontSize: '11px', color: C.textTer, marginTop: '2px' }}>{TIMEZONE_BADGE}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button onClick={() => setModalAcao('importar')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: C.bg2, border: `1px solid ${C.border}`, borderRadius: '6px', color: C.textSec, fontSize: '12px', fontWeight: '500', cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
            <IcoUpload /> Importar
          </button>
          <button onClick={() => setModalAcao('exportar')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: C.bg2, border: `1px solid ${C.border}`, borderRadius: '6px', color: C.textSec, fontSize: '12px', fontWeight: '500', cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
            <IcoDownload /> Exportar
          </button>
          <button onClick={exportCSV} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: C.bg2, border: `1px solid ${C.border}`, borderRadius: '6px', color: C.textSec, fontSize: '12px', fontWeight: '500', cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
            <IcoDownload /> CSV
          </button>
          <button
            onClick={() => setModoEnvioManual(v => !v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 14px',
              background: modoEnvioManual ? C.brand : C.bg2,
              border: `1px solid ${modoEnvioManual ? C.brand : C.border}`,
              borderRadius: '6px', color: modoEnvioManual ? '#fff' : C.textSec,
              fontSize: '12px', fontWeight: '500', cursor: 'pointer', fontFamily: 'Inter,sans-serif',
            }}
          >
            📤 Envio Manual
          </button>
        </div>
      </div>

      {/* KPI STRIP */}
      <M31KpiCanonico data={(filtroTipos && filtroTipos.length > 0) ? inscricoes.filter(i => filtroTipos.includes(i.tipo)) : inscricoes} isSuperAdmin={isSuperAdmin} />

      {/* FILTROS RÁPIDOS */}
      <M31FiltrosRapidos
        list={(filtroTipos && filtroTipos.length > 0) ? inscricoes.filter(i => filtroTipos.includes(i.tipo)) : inscricoes}
        ativo={filtroRapido}
        onChange={v => { setFiltroRapido(v); setPage(1); }}
      />

      {/* TOOLBAR — mobile-first: busca em linha própria, filtros em scroll horizontal */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        {/* Search — largura total */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: C.bg2, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '10px 12px', minHeight: '44px' }}>
          <span style={{ color: C.textTer, flexShrink: 0 }}><IcoSearch /></span>
          <input
            style={{ ...inp, border: 'none', background: 'none', flex: 1, fontSize: '14px', color: C.text }}
            placeholder="Buscar por nome, email, telefone, código, #nº..."
            value={busca}
            onChange={e => { setBusca(e.target.value); setPage(1); }}
          />
          {busca && <button onClick={() => { setBusca(''); setPage(1); }} style={{ background: 'none', border: 'none', color: C.textSec, cursor: 'pointer', display: 'flex', padding: 0 }}><IcoX /></button>}
        </div>

        {/* Filters row — scroll horizontal no mobile */}
        <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-none pb-1">
          <FilterSelect value={filtroCanonico} onChange={v => setFilter(() => setFiltroCanonico(v))} placeholder="Universo (vaga)" options={CANONICO_OPTIONS} />
          <FilterSelect value={filtroStatus} onChange={v => setFilter(() => setFiltroStatus(v))} placeholder="Status" options={[
            { val: 'aprovado',            label: 'Confirmado' },
            { val: 'gratuito',            label: 'Gratuito' },
            { val: 'pendente',            label: 'Pendente' },
            { val: 'checkout_pendente',   label: 'Checkout gerado' },
            { val: 'checkout_abandonado', label: 'Abandonado' },
            { val: 'cancelado',           label: 'Cancelado' },
          ]} />
          <FilterSelect value={filtroCaravanaId} onChange={v => { if (!v) { limparCaravana(); } else { setFiltroCaravanaId(v); setPage(1); } }} placeholder="Caravana" options={caravanas.map(c => ({ val: c.id, label: c.nome }))} />
          <FilterSelect value={filtroLote} onChange={v => setFilter(() => setFiltroLote(v))} placeholder="Lote" options={[
            { val: 'lote_1', label: '1º Lote' },
            { val: 'lote_2', label: '2º Lote' },
            { val: 'lote_3', label: '3º Lote' },
            { val: 'lote_4', label: '4º Lote' },
          ]} />
          {/* Filtro de tipo: só mostra opções permitidas pelo contexto */}
          <FilterSelect value={filtroTipo} onChange={v => setFilter(() => setFiltroTipo(v))} placeholder="Tipo" options={[
            ...(!filtroTipos || filtroTipos.includes('publico_geral') ? [{ val: 'publico_geral', label: 'Público Geral' }] : []),
            ...(!filtroTipos || filtroTipos.includes('caravana')      ? [{ val: 'caravana',      label: 'Caravana' }]      : []),
            ...(!filtroTipos || filtroTipos.includes('doacao')        ? [{ val: 'doacao',        label: 'Doação' }]        : []),
            ...(!filtroTipos || filtroTipos.includes('voluntario')    ? [{ val: 'voluntario',    label: 'Voluntário' }]    : []),
          ]} />

          {/* Chip de caravana ativa — limpar com um clique (o select nativo não
              deixava claro qual caravana estava aplicada) */}
          {filtroCaravanaId && (
            <button
              onClick={limparCaravana}
              title="Remover filtro de caravana"
              style={{ fontSize: '12px', color: C.brand, background: 'rgba(168,52,74,0.08)', border: '1px solid rgba(168,52,74,0.20)', borderRadius: '8px', padding: '8px 10px', cursor: 'pointer', fontFamily: 'Inter,sans-serif', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', flexShrink: 0, minHeight: '36px' }}
            >
              {caravanas.find(c => c.id === filtroCaravanaId)?.nome || 'Caravana'} <IcoX />
            </button>
          )}

          {/* Grupo filter badge (vindo da Home: No Grupo / Fora Grupo) */}
          {filtroGrupo && (
            <button
              onClick={() => { setFiltroGrupo(''); setPage(1); }}
              style={{ fontSize: '12px', color: C.brand, background: 'rgba(168,52,74,0.08)', border: '1px solid rgba(168,52,74,0.20)', borderRadius: '8px', padding: '8px 10px', cursor: 'pointer', fontFamily: 'Inter,sans-serif', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', flexShrink: 0, minHeight: '36px' }}
            >
              {filtroGrupo === 'entrou' ? '✓ No grupo' : '⚠ Fora do grupo'} <IcoX />
            </button>
          )}

          {/* Clear filters */}
          {(filtroStatus || filtroCaravanaId || filtroLote || filtroTipo || filtroGrupo || filtroCanonico || busca || filtroRapido !== 'todas') && (
            <button onClick={limparTudo}
              style={{ fontSize: '12px', color: C.brand, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter,sans-serif', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', flexShrink: 0 }}>
              <IcoX /> Limpar
            </button>
          )}
        </div>
      </div>

      {/* CARDS MOBILE */}
      <div className="m31-insc-cards" style={{ display: 'none', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
        {paginated.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: C.textTer, fontSize: '13px', background: C.bg2, border: `1px solid ${C.border}`, borderRadius: '10px' }}>
            Nenhuma inscrição encontrada
          </div>
        ) : paginated.map(i => (
          <M31InscricaoCardMobile key={i.id} inscricao={i} onDetail={setDetalhe} onAcao={handleAcao} enviando={enviando} />
        ))}
      </div>

      {/* LEGENDA DA JORNADA */}
      <div className="col-jornada" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '10px', padding: '10px 14px', background: C.bg1, border: `1px solid ${C.border}`, borderRadius: '8px' }}>
        <span style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '.06em', textTransform: 'uppercase', color: C.textTer }}>Jornada:</span>
        <JornadaLegenda color={C.textSec} />
      </div>

      {/* TABLE */}
      <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: '12px', overflow: 'hidden', boxShadow: 'var(--m31-light)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="m31-insc-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Nome</th>
                <th style={thStyle}>Contato</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                <th className="col-jornada" style={{ ...thStyle, textAlign: 'center' }}>Jornada</th>
                <th className="col-lote" style={thStyle}>Lote / Tipo</th>
                {isSuperAdmin && <th className="col-valor" style={{ ...thStyle, textAlign: 'right' }}>Valor</th>}
                <th className="col-data" style={{ ...thStyle, textAlign: 'right' }}>Data</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={isSuperAdmin ? 8 : 7} style={{ padding: '60px 24px', textAlign: 'center', color: C.textTer, fontSize: '14px' }}>
                    <div style={{ marginBottom: '8px', fontSize: '24px' }}>🔍</div>
                    <div style={{ fontWeight: '500', color: C.textSec, marginBottom: '4px' }}>Nenhuma inscrição encontrada</div>
                    <div style={{ fontSize: '13px' }}>Tente ajustar os filtros ou a busca</div>
                  </td>
                </tr>
              ) : paginated.map(i => (
                <TableRow
                  key={i.id}
                  inscricao={i}
                  onDetail={setDetalhe}
                  onReenviar={handleReenviar}
                  onMarcarPago={handleMarcarPago}
                  onEntrarGrupo={handleEntrarGrupo}
                  onAcao={handleAcao}
                  onEtapa={(etapa, insc) => setEtapaModal({ etapa, inscricao: insc })}
                  enviando={enviando}
                  isSuperAdmin={isSuperAdmin}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        {filtered.length > 0 && (
          <div style={{ padding: '12px 18px', borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            {/* Left: results per page */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: C.textSec }}>
              <span>Mostrar</span>
              <div style={{ position: 'relative' }}>
                <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ ...inp, padding: '5px 26px 5px 10px', appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' }}>
                  {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <span style={{ position: 'absolute', right: '7px', top: '50%', transform: 'translateY(-50%)', color: C.textTer, pointerEvents: 'none' }}><IcoDown /></span>
              </div>
              <span>por página · {filtered.length} resultados</span>
            </div>

            {/* Right: page nav */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
                style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: '5px', color: page === 1 ? C.textTer : C.textSec, cursor: page === 1 ? 'not-allowed' : 'pointer' }}>
                <IcoPrev />
              </button>
              {/* Page numbers */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let p;
                if (totalPages <= 5) p = i + 1;
                else if (page <= 3) p = i + 1;
                else if (page >= totalPages - 2) p = totalPages - 4 + i;
                else p = page - 2 + i;
                return (
                  <button key={p} onClick={() => setPage(p)}
                    style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: page === p ? C.brand : C.bg3, border: `1px solid ${page === p ? C.brand : C.border}`, borderRadius: '5px', color: page === p ? '#fff' : C.textSec, cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>
                    {p}
                  </button>
                );
              })}
              <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}
                style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: '5px', color: page === totalPages ? C.textTer : C.textSec, cursor: page === totalPages ? 'not-allowed' : 'pointer' }}>
                <IcoNext />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* DRAWER PADRÃO */}
      <M31InscricaoDrawer
        inscricao={detalhe}
        onClose={() => setDetalhe(null)}
      />

      {/* MODAL DE DISPARO DE ETAPA DA JORNADA */}
      {etapaModal && (
        <M31JornadaEtapaModal
          etapa={etapaModal.etapa}
          inscricao={etapaModal.inscricao}
          onClose={() => setEtapaModal(null)}
        />
      )}

      {/* Modal: Importar / Exportar Participantes */}
      <Dialog open={modalAcao !== null} onOpenChange={(v) => { if (!v) { setModalAcao(null); qc.invalidateQueries({ queryKey: ['m31inscricoes-table'] }); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{modalAcao === 'importar' ? 'Importar Participantes' : 'Exportar Participantes'}</DialogTitle>
          </DialogHeader>
          {modalAcao === 'importar' && <M31ImportarParticipantes />}
          {modalAcao === 'exportar' && <M31ExportarLeads />}
        </DialogContent>
      </Dialog>

      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        .m31-inscricoes-wrap.m31-inscricoes-wrap input,
        .m31-inscricoes-wrap.m31-inscricoes-wrap select,
        .m31-inscricoes-wrap.m31-inscricoes-wrap textarea {
          background-color: #ffffff !important;
          border-color: rgba(0,0,0,0.12) !important;
          color: #2d2d2d !important;
        }
        .m31-inscricoes-wrap.m31-inscricoes-wrap input::placeholder,
        .m31-inscricoes-wrap.m31-inscricoes-wrap textarea::placeholder {
          color: #9ca3af !important;
        }
        .m31-inscricoes-wrap.m31-inscricoes-wrap option {
          background: #ffffff !important;
          color: #2d2d2d !important;
        }
        @media (max-width: 640px) {
          .m31-insc-cards { display: flex !important; }
          .m31-insc-table { display: none !important; }
          .m31-insc-table .col-lote,
          .m31-insc-table .col-data,
          .m31-insc-table .col-valor { display: none !important; }
          .m31-insc-table th,
          .m31-insc-table td { padding-left: 8px !important; padding-right: 8px !important; }
          .m31-insc-table col-nome,
          .m31-insc-table .col-nome { max-width: 100px !important; }
        }
      `}</style>
    </div>
  );
}