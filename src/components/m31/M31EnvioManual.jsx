/**
 * M31EnvioManual — geração manual de dados de envio (QR, cobranças, mensagens).
 * Nenhum botão envia WhatsApp — apenas gera/copia/baixa. Conta em modo restrito.
 *
 * Design: 100% aderente ao Design System M31 (tokens, primitivos, sem hex inline).
 */
import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { TOKENS } from '@/lib/m31DesignTokens';
import { PAYMENT_STATUS } from '@/lib/m31Enums';
import { DataTable, StatusChip, EmptyState } from '@/components/m31/ui';
import SectionPage from '@/components/m31/ui/SectionPage';
import SegmentedControl from '@/components/m31/ui/SegmentedControl';
import { feedback } from '@/components/m31/ui/Toast';
import {
  ShieldCheck, Copy, Download, RefreshCw, QrCode, Link2,
  MessageCircle, CheckCircle2, Clock, Inbox, FileText,
} from 'lucide-react';

const fmtDate = d => d
  ? new Date(d).toLocaleDateString('pt-BR') + ' ' + new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  : '—';
const fmtBRL = n => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ── HELPERS ─────────────────────────────────────────────────────────
function buildQRUrl(codigo) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(codigo)}&bgcolor=FFFFFF&color=000000&format=png`;
}
function buildWelcomeMessage(insc) {
  const nome = insc.nome?.split(' ')[0] || 'Querida';
  const codigo = insc.codigo_inscricao || '';
  const caravana = insc.caravana_nome ? `\n🚌 Caravana: ${insc.caravana_nome}` : '';
  return `Olá, ${nome}!\nSua inscrição para o M31 Filhas foi confirmada. 🌸${caravana}\n🎟 Código da inscrição: ${codigo}\n\n📲 Seu QR Code de check-in está pronto. Apresente no credenciamento do evento!`;
}
function buildRecoveryMessage(insc, invoiceUrl) {
  const nome = insc.nome?.split(' ')[0] || 'Visitante';
  const link = invoiceUrl || insc.asaas_charge_url || '';
  return `Oii ${nome} 😊\n\nVi que você começou sua inscrição no M31 Filhas mas ainda não finalizou 💛\n\nPrecisando de ajuda, pode falar comigo.\n\n👉 Pagar inscrição: ${link}`;
}
function buildWaLink(whatsapp, message) {
  const phone = (whatsapp || '').replace(/\D/g, '');
  return `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`;
}
async function downloadImage(url, filename) {
  const res = await fetch(url);
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl; a.download = filename; a.click();
  URL.revokeObjectURL(objUrl);
}
function downloadBase64(b64, filename) {
  const a = document.createElement('a');
  a.href = `data:image/png;base64,${b64}`; a.download = filename; a.click();
}
function copyText(text) { navigator.clipboard.writeText(text); }

// ── BUTTONS ─────────────────────────────────────────────────────────
const btnBase = {
  display: 'inline-flex', alignItems: 'center', gap: '5px',
  height: TOKENS.buttonHeight.sm, padding: '0 12px',
  borderRadius: TOKENS.radius.md, fontSize: '12px', fontWeight: '600',
  fontFamily: TOKENS.font.body, cursor: 'pointer', whiteSpace: 'nowrap',
  transition: `background ${TOKENS.transition.atomic}, color ${TOKENS.transition.atomic}, opacity ${TOKENS.transition.atomic}`,
};

function BtnPrimary({ children, onClick, disabled, busy }) {
  return (
    <button onClick={onClick} disabled={disabled || busy}
      style={{
        ...btnBase,
        background: TOKENS.primary, color: TOKENS.onPrimary, border: 'none',
        opacity: disabled || busy ? 0.5 : 1,
      }}>
      {busy ? 'Gerando...' : children}
    </button>
  );
}
function BtnGhost({ children, onClick, disabled, href }) {
  const st = {
    ...btnBase,
    background: 'transparent', color: TOKENS.textMuted,
    border: `1px solid ${TOKENS.borderStrong}`,
    opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
    textDecoration: 'none',
  };
  if (href) return <a href={href} target="_blank" rel="noreferrer" style={st}>{children}</a>;
  return <button onClick={onClick} disabled={disabled} style={st}>{children}</button>;
}
function BtnWA({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
      style={{
        ...btnBase,
        background: 'transparent', color: TOKENS.success,
        border: `1px solid ${TOKENS.success}`,
        textDecoration: 'none',
      }}>
      {children}
    </a>
  );
}

// ── CELLS ───────────────────────────────────────────────────────────
function NomeCell({ insc }) {
  return (
    <div>
      <div style={{ fontSize: '13px', fontWeight: '600', color: TOKENS.text, marginBottom: '2px' }}>{insc.nome}</div>
      <div style={{ fontSize: '11px', color: TOKENS.textSubtle }}>{insc.codigo_inscricao || '—'}</div>
    </div>
  );
}
function ContatoCell({ insc }) {
  return (
    <div>
      <div style={{ fontSize: '12px', color: TOKENS.textMuted, marginBottom: '1px' }}>{insc.email}</div>
      <div style={{ fontSize: '11px', color: TOKENS.textSubtle }}>{insc.whatsapp}</div>
    </div>
  );
}

// ── MAIN ────────────────────────────────────────────────────────────
export default function M31EnvioManual({ inscricoes = [], isLoading, onVoltar }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState('confirmadas');
  const [dias, setDias] = useState(7);
  const [busy, setBusy] = useState({});
  const [pixData, setPixData] = useState({});

  // Client-side date filter (created_date built-in — $gte returns 0 falso)
  const cutoff = useMemo(() => {
    if (dias === 0) return null;
    const d = new Date(); d.setDate(d.getDate() - dias);
    return d;
  }, [dias]);

  // Só APROVADAS/GRATUITAS. Remove do envio manual quando boas-vindas E QR
  // já foram disparados (data_envio_boas_vindas + qr_envio_status enviado_com_sucesso).
  // Permanece se faltar boas-vindas OU faltar QR.
  const confirmadas = useMemo(() =>
    inscricoes.filter(i => {
      if (!['aprovado', 'gratuito'].includes(i.status_pagamento)) return false;
      if (cutoff && new Date(i.created_date) < cutoff) return false;
      const boasVindasEnviadas = !!i.data_envio_boas_vindas;
      const qrEnviado = i.qr_envio_status === 'enviado_com_sucesso';
      if (boasVindasEnviadas && qrEnviado) return false; // ambos enviados → sai
      return true;
    }).sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
  , [inscricoes, cutoff]);

  const pendentes = useMemo(() =>
    inscricoes.filter(i =>
      ['checkout_pendente', 'checkout_abandonado', 'pendente'].includes(i.status_pagamento) &&
      (!cutoff || new Date(i.created_date) >= cutoff)
    ).sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
  , [inscricoes, cutoff]);

  // ── HANDLERS ──
  async function handleGerarQR(insc) {
    setBusy(b => ({ ...b, [insc.id]: true }));
    try {
      const codigo = insc.codigo_inscricao || insc.id;
      const qrUrl = buildQRUrl(codigo);
      await base44.entities.EventoM31Inscricao.update(insc.id, {
        qrcode_url: qrUrl, qrcode_token: qrUrl,
        qrcode_gerado_em: new Date().toISOString(),
        qr_envio_status: 'gerado_nao_enviado',
      });
      qc.invalidateQueries({ queryKey: ['m31inscricoes-table'] });
      feedback.success('QR gerado');
    } catch (e) {
      feedback.error(e.message);
    } finally {
      setBusy(b => ({ ...b, [insc.id]: false }));
    }
  }

  function handleCopiarBoasVindas(insc) {
    copyText(buildWelcomeMessage(insc));
    feedback.success('Mensagem copiada');
  }

  async function handleBaixarQR(insc) {
    const url = insc.qrcode_url || buildQRUrl(insc.codigo_inscricao || insc.id);
    const nome = (insc.nome || 'inscricao').replace(/[^a-zA-Z0-9]/g, '_');
    await downloadImage(url, `qr-${nome}.png`);
    feedback.success('QR baixado');
  }

  async function handleGerarCobranca(insc) {
    setBusy(b => ({ ...b, [insc.id]: true }));
    try {
      const res = await base44.functions.invoke('m31GerarCobrancaAvulsa', { inscricao_id: insc.id });
      const d = res.data || {};
      if (d.error) throw new Error(d.error);
      if (d.pix_qr) setPixData(p => ({ ...p, [insc.id]: { qr: d.pix_qr, payload: d.pix_payload } }));
      qc.invalidateQueries({ queryKey: ['m31inscricoes-table'] });
      feedback.success('Cobrança gerada');
    } catch (e) {
      feedback.error(e.message);
    } finally {
      setBusy(b => ({ ...b, [insc.id]: false }));
    }
  }

  function handleCopiarRecuperacao(insc) {
    copyText(buildRecoveryMessage(insc, insc.asaas_charge_url));
    feedback.success('Mensagem copiada');
  }

  function handleCopiarLink(insc) {
    const link = insc.asaas_charge_url;
    if (!link) { feedback.error('Sem link'); return; }
    copyText(link);
    feedback.success('Link copiado');
  }

  function handleBaixarPixQR(insc) {
    const pix = pixData[insc.id];
    if (!pix?.qr) { feedback.error('PIX QR não disponível'); return; }
    const nome = (insc.nome || 'inscricao').replace(/[^a-zA-Z0-9]/g, '_');
    downloadBase64(pix.qr, `pix-${nome}.png`);
    feedback.success('QR baixado');
  }

  // ── COLUMNS ──
  const columnsA = [
    { key: 'nome', label: 'Nome', render: i => <NomeCell insc={i} /> },
    { key: 'whatsapp', label: 'Contato', hideOnMobile: true, render: i => <ContatoCell insc={i} /> },
    { key: 'status_pagamento', label: 'Status', render: i => <StatusChip value={i.status_pagamento} enumMap={PAYMENT_STATUS} /> },
    { key: 'created_date', label: 'Data', hideOnMobile: true, render: i => <span style={{ fontSize: '12px', color: TOKENS.textMuted }}>{fmtDate(i.created_date)}</span> },
    {
      key: 'actions', label: 'Ações', align: 'right',
      render: i => {
        const hasQR = !!i.qrcode_url;
        return (
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {hasQR ? (
              <>
                <BtnGhost onClick={() => handleGerarQR(i)} disabled={busy[i.id]}><RefreshCw size={13} /> Regerar</BtnGhost>
                <BtnGhost onClick={() => handleCopiarBoasVindas(i)}><Copy size={13} /> Copiar mensagem</BtnGhost>
                <BtnGhost onClick={() => handleBaixarQR(i)}><Download size={13} /> Baixar QR</BtnGhost>
              </>
            ) : (
              <BtnPrimary onClick={() => handleGerarQR(i)} busy={busy[i.id]}><QrCode size={13} /> Gerar QR</BtnPrimary>
            )}
          </div>
        );
      },
    },
  ];

  const columnsB = [
    { key: 'nome', label: 'Nome', render: i => <NomeCell insc={i} /> },
    { key: 'whatsapp', label: 'Contato', hideOnMobile: true, render: i => <ContatoCell insc={i} /> },
    { key: 'status_pagamento', label: 'Status', render: i => <StatusChip value={i.status_pagamento} enumMap={PAYMENT_STATUS} /> },
    { key: 'valor_pago', label: 'Valor', hideOnMobile: true, render: i => <span style={{ fontSize: '12px', fontWeight: '600', color: TOKENS.text }}>{fmtBRL(i.valor_pago)}</span> },
    { key: 'created_date', label: 'Data', hideOnMobile: true, render: i => <span style={{ fontSize: '12px', color: TOKENS.textMuted }}>{fmtDate(i.created_date)}</span> },
    {
      key: 'actions', label: 'Ações', align: 'right',
      render: i => {
        const hasCharge = !!i.asaas_charge_url;
        const waLink = buildWaLink(i.whatsapp, buildRecoveryMessage(i, i.asaas_charge_url));
        return (
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {hasCharge ? (
              <>
                <BtnGhost onClick={() => handleGerarCobranca(i)} disabled={busy[i.id]}><RefreshCw size={13} /> Regerar</BtnGhost>
                <BtnGhost onClick={() => handleCopiarRecuperacao(i)}><Copy size={13} /> Copiar mensagem</BtnGhost>
                <BtnGhost onClick={() => handleCopiarLink(i)}><Link2 size={13} /> Copiar link</BtnGhost>
                {pixData[i.id]?.qr && (
                  <BtnGhost onClick={() => handleBaixarPixQR(i)}><Download size={13} /> Baixar QR</BtnGhost>
                )}
                <BtnWA href={waLink}><MessageCircle size={13} /> Abrir no WhatsApp</BtnWA>
              </>
            ) : (
              <BtnPrimary onClick={() => handleGerarCobranca(i)} busy={busy[i.id]}><FileText size={13} /> Gerar cobrança</BtnPrimary>
            )}
          </div>
        );
      },
    },
  ];

  // ── EMPTY STATES ──
  const emptyA = (
    <EmptyState
      icon={CheckCircle2}
      title="Tudo sincronizado"
      description="Todas as confirmadas no período já receberam boas-vindas e QR code. Nada pendente para envio manual."
    />
  );
  const emptyB = (
    <EmptyState
      icon={Inbox}
      title="Nenhuma pendência nos últimos 7 dias"
      description="Não há inscrições pendentes no período selecionado."
      action={dias !== 0 ? (
        <button onClick={() => setDias(0)}
          style={{
            ...btnBase,
            background: TOKENS.primary, color: TOKENS.onPrimary, border: 'none',
          }}>
          <Clock size={13} /> Ampliar janela
        </button>
      ) : undefined}
    />
  );

  const currentData = tab === 'confirmadas' ? confirmadas : pendentes;
  const currentColumns = tab === 'confirmadas' ? columnsA : columnsB;
  const currentEmpty = tab === 'confirmadas' ? emptyA : emptyB;

  // ── HEADER ACTION ──
  const headerAction = (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
      <select value={dias} onChange={e => setDias(Number(e.target.value))}
        style={{
          height: TOKENS.buttonHeight.sm, padding: '0 28px 0 10px',
          background: TOKENS.surface, border: `1px solid ${TOKENS.border}`,
          borderRadius: TOKENS.radius.md, color: TOKENS.text,
          fontSize: '12px', fontFamily: TOKENS.font.body, cursor: 'pointer',
          appearance: 'none', WebkitAppearance: 'none',
        }}>
        <option value={7}>Últimos 7 dias</option>
        <option value={15}>Últimos 15 dias</option>
        <option value={30}>Últimos 30 dias</option>
        <option value={0}>Tudo</option>
      </select>
      {onVoltar && (
        <button onClick={onVoltar}
          style={{
            ...btnBase,
            background: TOKENS.surface, color: TOKENS.textMuted,
            border: `1px solid ${TOKENS.border}`,
          }}>
          ← Voltar
        </button>
      )}
    </div>
  );

  // ── RENDER ──
  return (
    <SectionPage
      title="Envio Manual"
      subtitle="O sistema apenas gera os dados. Nada é enviado automaticamente."
      action={headerAction}
    >
      {/* BANNER DE SEGURANÇA */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 14px', marginBottom: '16px',
        background: 'var(--m31-surface-warm)',
        border: `1px solid ${TOKENS.borderSubtle}`,
        borderRadius: TOKENS.radius.lg,
      }}>
        <ShieldCheck size={18} color={TOKENS.textSubtle} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: '13px', color: TOKENS.textMuted, lineHeight: '1.5' }}>
          O sistema apenas gera os dados. Nada é enviado automaticamente. Conta WhatsApp em modo restrito.
        </span>
      </div>

      {/* SEGMENTED CONTROL */}
      <div style={{ marginBottom: '16px' }}>
        <SegmentedControl
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'confirmadas', label: 'Boas-vindas · confirmadas', count: confirmadas.length },
            { id: 'pendentes', label: 'Recuperação · pendentes', count: pendentes.length },
          ]}
        />
      </div>

      {/* DATA TABLE */}
      <DataTable
        columns={currentColumns}
        data={currentData}
        loading={isLoading}
        emptyTitle={tab === 'confirmadas' ? 'Tudo sincronizado' : 'Nenhuma pendência nos últimos 7 dias'}
        emptyIcon={tab === 'confirmadas' ? CheckCircle2 : Inbox}
        emptyAction={tab === 'pendentes' && dias !== 0 ? (
          <button onClick={() => setDias(0)}
            style={{ ...btnBase, background: TOKENS.primary, color: TOKENS.onPrimary, border: 'none' }}>
            <Clock size={13} /> Ampliar janela
          </button>
        ) : undefined}
      />
    </SectionPage>
  );
}