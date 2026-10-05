import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { getJornada } from './M31JornadaCell';

const C = {
  bg: '#ffffff', border: 'rgba(0,0,0,0.08)', borderSt: 'rgba(0,0,0,0.12)',
  text: '#2d2d2d', textSec: '#6b7280', textTer: '#9ca3af',
  brand: '#8B1A2B', success: '#10b981', warning: '#f59e0b', danger: '#ef4444',
  bg3: '#f2f1f0',
};

const IcoX = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;

// Configuração de cada etapa: o que dispara, a descrição e se é elegível.
// Cada etapa envia APENAS a sua parte — nunca a mensagem completa.
const ETAPA_CONFIG = {
  bv: {
    titulo: 'Boas-vindas + QR Code',
    descricao: 'Envia a mensagem de confirmação da inscrição junto do QR Code de entrada. Use quando a participante ainda não recebeu as boas-vindas.',
    tipo: 'envio',
    acaoLabel: 'Enviar boas-vindas',
    funcao: 'm31EnviarBoasVindasConvidada',
    suportaEmail: true,  // pode usar m31ReenviarQRCode com canal=email
  },
  qr: {
    titulo: 'QR Code',
    descricao: 'Reenvia somente o QR Code de entrada da participante. Não reenvia a mensagem de boas-vindas.',
    tipo: 'envio',
    acaoLabel: 'Reenviar QR Code',
    funcao: 'm31ReenviarQRCode',
    suportaEmail: true,
  },
  grupo: {
    titulo: 'Link do grupo',
    descricao: 'Envia somente o convite individual para o grupo oficial no WhatsApp. Não reenvia boas-vindas nem QR Code.',
    tipo: 'envio',
    acaoLabel: 'Enviar link do grupo',
    funcao: 'm31ReenviarLinkGrupoIndividual',
  },
  entrou: {
    titulo: 'Entrou no grupo',
    descricao: 'Marca manualmente que a participante já entrou no grupo oficial. Não dispara nenhuma mensagem.',
    tipo: 'marcar',
    acaoLabel: 'Marcar como entrou no grupo',
  },
  checkin: {
    titulo: 'Check-in',
    descricao: 'Marca manualmente o check-in da participante no evento. Não dispara nenhuma mensagem.',
    tipo: 'marcar',
    acaoLabel: 'Marcar check-in',
  },
};

export default function M31JornadaEtapaModal({ etapa, inscricao, onClose }) {
  const qc = useQueryClient();
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);

  if (!etapa || !inscricao) return null;
  const cfg = ETAPA_CONFIG[etapa];
  if (!cfg) return null;

  const j = getJornada(inscricao);
  const jaConcluida = !!j[etapa];
  const isConfirmado = ['aprovado', 'gratuito'].includes(inscricao.status_pagamento);
  const bloqueadoPorPagamento = cfg.tipo === 'envio' && !isConfirmado;

  function buildQrUrl() {
    const codigo = inscricao.codigo_inscricao;
    if (!codigo) return null;
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(codigo)}&bgcolor=FFFFFF&color=000000&format=png`;
  }

  async function baixarQR() {
    const qrUrl = buildQrUrl();
    if (!qrUrl) { setResultado({ ok: false, msg: 'Esta inscrição não possui código gerado.' }); return; }
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
  }

  async function copiarMensagem() {
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
      setResultado({ ok: true, msg: 'Mensagem copiada! Cole no WhatsApp da inscrita e anexe o QR Code.' });
    } catch (e) {
      setResultado({ ok: false, msg: 'Não foi possível copiar. Tente manualmente.' });
    }
  }

  async function disparar(canal) {
    setEnviando(canal || true);
    setResultado(null);
    try {
      if (cfg.tipo === 'marcar') {
        if (etapa === 'entrou') {
          await base44.entities.EventoM31Inscricao.update(inscricao.id, {
            entrou_no_grupo: true,
            data_entrada_grupo: new Date().toISOString(),
            origem_confirmacao_grupo: 'manual',
          });
        } else if (etapa === 'checkin') {
          await base44.entities.EventoM31Inscricao.update(inscricao.id, {
            checkin_realizado: true,
            checkin_at: new Date().toISOString(),
          });
        }
        setResultado({ ok: true, msg: 'Etapa marcada com sucesso.' });
      } else if (canal === 'email') {
        // Email: sempre via m31ReenviarQRCode com canal=email (envia QR + código + grupo)
        const res = await base44.functions.invoke('m31ReenviarQRCode', { inscricao_id: inscricao.id, canal: 'email' });
        const d = res.data || {};
        if (d.success === false || d.error) {
          setResultado({ ok: false, msg: d.error || 'Falha no envio por email.' });
        } else {
          setResultado({ ok: true, msg: `Email enviado para ${d.email_destino || inscricao.email}.` });
        }
      } else {
        // WhatsApp: função original da etapa
        const res = await base44.functions.invoke(cfg.funcao, { inscricao_id: inscricao.id });
        const d = res.data || {};
        if (d.sucesso === false || d.error) {
          setResultado({ ok: false, msg: d.motivo || d.detalhe || d.error || 'Bloqueado pela governança.' });
        } else {
          setResultado({ ok: true, msg: 'WhatsApp enviado com sucesso.' });
        }
      }
      qc.invalidateQueries({ queryKey: ['m31inscricoes-table'] });
    } catch (err) {
      setResultado({ ok: false, msg: err.message });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={onClose}>
      <div style={{ background: C.bg, border: `1px solid ${C.borderSt}`, borderRadius: '12px', width: '100%', maxWidth: '440px', fontFamily: 'Inter,sans-serif' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: C.text, marginBottom: '4px' }}>{cfg.titulo}</div>
            <div style={{ fontSize: '12px', color: C.textSec }}>{inscricao.nome}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.textSec, cursor: 'pointer', padding: '2px' }}><IcoX /></button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>
          {/* Status da etapa */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '100px',
            fontSize: '11px', fontWeight: '600', marginBottom: '14px',
            background: jaConcluida ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
            color: jaConcluida ? C.success : C.warning,
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }} />
            {jaConcluida ? 'Etapa concluída' : 'Etapa pendente'}
          </div>

          <p style={{ fontSize: '13px', color: C.textSec, lineHeight: 1.5, marginBottom: '16px' }}>{cfg.descricao}</p>

          {jaConcluida && (
            <div style={{ padding: '10px 12px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px', fontSize: '12px', color: C.success, marginBottom: '16px' }}>
              ✓ Esta etapa já foi concluída. Só reenvie se realmente for necessário.
            </div>
          )}

          {bloqueadoPorPagamento && (
            <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', fontSize: '12px', color: C.danger, marginBottom: '16px' }}>
              Pagamento não confirmado — não é possível disparar esta etapa.
            </div>
          )}

          {resultado && (
            <div style={{
              padding: '10px 12px', borderRadius: '8px', fontSize: '12px', marginBottom: '16px',
              background: resultado.ok ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${resultado.ok ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
              color: resultado.ok ? C.success : C.danger,
            }}>
              {resultado.ok ? '✓ ' : '✕ '}{resultado.msg}
            </div>
          )}

          {/* Envio manual — baixar QR + copiar mensagem para envio manual no WhatsApp */}
          {cfg.tipo === 'envio' && cfg.suportaEmail && !(resultado && resultado.ok) && (
            <div style={{ marginBottom: '16px', padding: '12px', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: C.textSec, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
                Envio manual
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={baixarQR}
                  disabled={!inscricao.codigo_inscricao}
                  style={{ padding: '7px 12px', background: '#fff', border: `1px solid ${C.borderSt}`, borderRadius: '6px', color: C.text, fontSize: '12px', fontWeight: '600', cursor: !inscricao.codigo_inscricao ? 'not-allowed' : 'pointer', fontFamily: 'Inter,sans-serif', opacity: !inscricao.codigo_inscricao ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  ⬇️ Baixar QR Code
                </button>
                <button
                  onClick={copiarMensagem}
                  style={{ padding: '7px 12px', background: '#fff', border: `1px solid ${C.borderSt}`, borderRadius: '6px', color: C.text, fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'Inter,sans-serif', display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  📋 Copiar mensagem
                </button>
              </div>
              <div style={{ fontSize: '10px', color: C.textTer, marginTop: '6px' }}>
                Baixe o QR, copie a mensagem e cole no WhatsApp da inscrita.
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button onClick={onClose} style={{ padding: '8px 16px', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: '6px', color: C.textSec, fontSize: '13px', fontWeight: '500', cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
              Fechar
            </button>
            {!(resultado && resultado.ok) && cfg.tipo === 'envio' && cfg.suportaEmail && (
              <>
                <button
                  onClick={() => disparar('whatsapp')}
                  disabled={!!enviando || bloqueadoPorPagamento}
                  style={{ padding: '8px 16px', background: bloqueadoPorPagamento ? '#e8e7e5' : '#10b981', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: (!!enviando || bloqueadoPorPagamento) ? 'not-allowed' : 'pointer', fontFamily: 'Inter,sans-serif', opacity: enviando ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  {enviando === 'whatsapp' ? 'Enviando...' : '📱 WhatsApp'}
                </button>
                <button
                  onClick={() => disparar('email')}
                  disabled={!!enviando || bloqueadoPorPagamento || !inscricao.email}
                  style={{ padding: '8px 16px', background: bloqueadoPorPagamento || !inscricao.email ? '#e8e7e5' : C.brand, border: 'none', borderRadius: '6px', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: (!!enviando || bloqueadoPorPagamento || !inscricao.email) ? 'not-allowed' : 'pointer', fontFamily: 'Inter,sans-serif', opacity: enviando ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '5px' }}
                  title={!inscricao.email ? 'Esta inscrição não possui email cadastrado' : ''}
                >
                  {enviando === 'email' ? 'Enviando...' : '✉️ Email'}
                </button>
              </>
            )}
            {!(resultado && resultado.ok) && cfg.tipo === 'envio' && !cfg.suportaEmail && (
              <button
                onClick={() => disparar('whatsapp')}
                disabled={!!enviando || bloqueadoPorPagamento}
                style={{ padding: '8px 16px', background: bloqueadoPorPagamento ? '#e8e7e5' : C.brand, border: 'none', borderRadius: '6px', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: (!!enviando || bloqueadoPorPagamento) ? 'not-allowed' : 'pointer', fontFamily: 'Inter,sans-serif', opacity: enviando ? 0.6 : 1 }}
              >
                {enviando ? 'Enviando...' : (jaConcluida ? `Reenviar — ${cfg.acaoLabel}` : cfg.acaoLabel)}
              </button>
            )}
            {!(resultado && resultado.ok) && cfg.tipo === 'marcar' && (
              <button
                onClick={() => disparar()}
                disabled={!!enviando}
                style={{ padding: '8px 16px', background: C.brand, border: 'none', borderRadius: '6px', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: enviando ? 'not-allowed' : 'pointer', fontFamily: 'Inter,sans-serif', opacity: enviando ? 0.6 : 1 }}
              >
                {enviando ? 'Salvando...' : cfg.acaoLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}