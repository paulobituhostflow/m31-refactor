import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';

const fmtBRL = n => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const METODO_LABEL = {
  PIX: 'PIX',
  CREDIT_CARD: 'Cartão de Crédito',
  BOLETO: 'Boleto',
  DEBIT_CARD: 'Cartão de Débito',
  TRANSFER: 'Transferência',
};

/**
 * ComprovanteAsaas — Verificação visual de pagamento confirmado no Asaas.
 * Auto-busca os dados do pagamento ao abrir e exibe um selo de confirmação
 * com os detalhes da transação + botão para abrir/baixar o comprovante.
 */
export default function ComprovanteAsaas({ inscricao }) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [erro, setErro] = useState(null);
  const [buscou, setBuscou] = useState(false);

  const isConfirmado = ['aprovado', 'gratuito'].includes(inscricao.status_pagamento);
  const temPaymentId = !!inscricao.asaas_payment_id;
  const temChargeUrl = !!inscricao.asaas_charge_url;

  // Auto-buscar verificação ao montar (apenas para confirmados com payment_id)
  useEffect(() => {
    if (isConfirmado && temPaymentId && !buscou) {
      verificar();
    }
  }, []);

  async function verificar() {
    if (!temPaymentId) return;
    setLoading(true);
    setErro(null);
    try {
      const res = await base44.functions.invoke('m31BuscarComprovanteAsaas', { inscricao_id: inscricao.id });
      setData(res.data);
      qc.invalidateQueries({ queryKey: ['m31inscricoes-table'] });
    } catch (err) {
      setErro(err.message || 'Erro ao verificar pagamento');
    } finally {
      setLoading(false);
      setBuscou(true);
    }
  }

  function abrirComprovante() {
    const url = data?.urls?.transaction_receipt_url || data?.urls?.invoice_url || inscricao.asaas_charge_url;
    if (url) {
      window.open(url, '_blank');
    } else {
      alert('Comprovante não disponível. ID Asaas: ' + inscricao.asaas_payment_id);
    }
  }

  // Não há nada para mostrar se não tem payment_id nem charge_url
  if (!temPaymentId && !temChargeUrl) return null;

  // ── ESTADO: CARREGANDO ──
  if (loading) {
    return (
      <div style={{
        marginTop: '16px', padding: '14px', borderRadius: '8px',
        background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.20)',
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <div style={{ width: '16px', height: '16px', border: '2px solid rgba(59,130,246,0.30)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <span style={{ fontSize: '12px', color: '#3b82f6', fontWeight: '500' }}>Verificando pagamento no Asaas...</span>
      </div>
    );
  }

  // ── ESTADO: ERRO ──
  if (erro) {
    return (
      <div style={{ marginTop: '16px' }}>
        <div style={{
          padding: '14px', borderRadius: '8px',
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.20)',
        }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#ef4444', marginBottom: '4px' }}>
            ⚠ Não foi possível verificar no Asaas
          </div>
          <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '10px' }}>{erro}</div>
          <button
            onClick={verificar}
            style={{
              fontSize: '11px', fontWeight: '600', color: '#ef4444', background: 'none',
              border: '1px solid rgba(239,68,68,0.30)', borderRadius: '6px',
              padding: '5px 12px', cursor: 'pointer', fontFamily: 'Inter,sans-serif',
            }}
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  // ── ESTADO: CONFIRMADO COM DADOS DO ASAAS ──
  if (isConfirmado && data?.pagamento_asaas) {
    const pag = data.pagamento_asaas;
    const asaasConfirmado = pag.status === 'CONFIRMED' || pag.status === 'RECEIVED';
    const cor = asaasConfirmado ? '#10b981' : '#f59e0b';
    const bgCor = asaasConfirmado ? 'rgba(16,185,129,0.06)' : 'rgba(245,158,11,0.06)';
    const borderCor = asaasConfirmado ? 'rgba(16,185,129,0.20)' : 'rgba(245,158,11,0.20)';

    return (
      <div style={{ marginTop: '16px' }}>
        <div style={{
          padding: '14px', borderRadius: '8px',
          background: bgCor, border: `1px solid ${borderCor}`,
        }}>
          {/* Selo de verificação */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%',
              background: cor, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: cor }}>
                {asaasConfirmado ? 'Pagamento confirmado no Asaas' : 'Status: ' + pag.status}
              </div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>
                Verificado em tempo real · ID: {pag.id}
              </div>
            </div>
          </div>

          {/* Detalhes da transação */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Método</div>
              <div style={{ fontSize: '12px', color: '#2d2d2d', fontWeight: '500' }}>{METODO_LABEL[pag.billing_type] || pag.billing_type || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Valor</div>
              <div style={{ fontSize: '12px', color: '#2d2d2d', fontWeight: '500' }}>{fmtBRL(pag.value)}</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Data pagamento</div>
              <div style={{ fontSize: '12px', color: '#2d2d2d', fontWeight: '500' }}>{pag.payment_date || pag.date_created || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cliente</div>
              <div style={{ fontSize: '12px', color: '#2d2d2d', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pag.client_name || inscricao.nome}</div>
            </div>
          </div>

          {/* Botão de comprovante */}
          <button
            onClick={abrirComprovante}
            style={{
              width: '100%', padding: '9px 14px', fontSize: '12px', fontWeight: '600',
              color: '#fff', background: cor, border: 'none', borderRadius: '6px',
              cursor: 'pointer', fontFamily: 'Inter,sans-serif',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Abrir comprovante no Asaas
          </button>
        </div>
      </div>
    );
  }

  // ── ESTADO: NÃO CONFIRMADO (checkout pendente) — link de cobrança ──
  if (!isConfirmado && temChargeUrl) {
    return (
      <div style={{ marginTop: '16px' }}>
        <button
          onClick={() => window.open(inscricao.asaas_charge_url, '_blank')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            fontSize: '12px', color: '#8B1A2B', fontWeight: '500',
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'Inter,sans-serif', padding: 0,
          }}
        >
          Ver cobrança no Asaas →
        </button>
      </div>
    );
  }

  // ── ESTADO: CONFIRMADO mas sem dados do Asaas (ainda não buscou) ──
  if (isConfirmado && !buscou && temPaymentId) {
    return (
      <div style={{ marginTop: '16px' }}>
        <button
          onClick={verificar}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            fontSize: '12px', color: '#8B1A2B', fontWeight: '500',
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'Inter,sans-serif', padding: 0,
          }}
        >
          Verificar pagamento no Asaas →
        </button>
      </div>
    );
  }

  return null;
}