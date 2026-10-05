/**
 * M31ContratoParcelas — parcelas de UM contrato.
 * Permite: gerar parcelas automaticamente (se parcelado), editar valor/vencimento,
 * marcar como pago (com "pago por"), anexar comprovante e enviar por WhatsApp.
 */
import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Paperclip, Send, Check, FileText, Loader2, Trash2, ArrowLeft } from 'lucide-react';
import { TOKENS } from '@/lib/m31DesignTokens';
import { feedback } from '@/components/m31/ui';

const formatBRL = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const STATUS_CFG = {
  pendente:  { label: 'Pendente',  color: TOKENS.warning },
  pago:      { label: 'Pago',      color: TOKENS.success },
  atrasado:  { label: 'Atrasado',  color: TOKENS.danger },
  cancelado: { label: 'Cancelado', color: TOKENS.textSubtle },
};

export default function M31ContratoParcelas({ fornecedor, contrato, onVoltar }) {
  const qc = useQueryClient();
  const [enviandoId, setEnviandoId] = useState(null);
  const [uploadId, setUploadId] = useState(null);
  const [gerando, setGerando] = useState(false);

  const { data: parcelas = [], isLoading } = useQuery({
    queryKey: ['m31_contract_payments', contrato.id],
    queryFn: () => base44.entities.SupplierPayment.filter({ contract_id: contrato.id }, 'numero_parcela', 200),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['m31_contract_payments', contrato.id] });
    qc.invalidateQueries({ queryKey: ['m31_supplier_payments', fornecedor.id] });
  };

  const atualizar = useMutation({
    mutationFn: ({ id, data }) => base44.entities.SupplierPayment.update(id, data),
    onSuccess: invalidate,
  });
  const deletar = useMutation({
    mutationFn: (id) => base44.entities.SupplierPayment.delete(id),
    onSuccess: () => { invalidate(); feedback.success('Parcela removida.'); },
  });

  const totalPago = parcelas.filter(p => p.status === 'pago').reduce((s, p) => s + (p.valor || 0), 0);
  const totalPendente = parcelas.filter(p => p.status !== 'pago' && p.status !== 'cancelado').reduce((s, p) => s + (p.valor || 0), 0);

  const gerarParcelas = async () => {
    const n = contrato.forma_pagamento === 'parcelado' ? (contrato.numero_parcelas || 1) : 1;
    if (parcelas.length > 0) { feedback.warning('Já existem parcelas neste contrato.'); return; }
    setGerando(true);
    try {
      const valorParcela = Math.round((contrato.valor_total / n) * 100) / 100;
      const registros = Array.from({ length: n }, (_, i) => ({
        supplier_id: fornecedor.id,
        supplier_nome: fornecedor.nome,
        contract_id: contrato.id,
        descricao: n > 1 ? `Parcela ${i + 1}/${n} — ${contrato.descricao || ''}`.trim() : (contrato.descricao || 'Pagamento único'),
        numero_parcela: i + 1,
        total_parcelas: n,
        valor: valorParcela,
        status: 'pendente',
      }));
      await base44.entities.SupplierPayment.bulkCreate(registros);
      invalidate();
      feedback.success(`${n} parcela(s) gerada(s).`);
    } catch {
      feedback.error('Erro ao gerar parcelas.');
    } finally {
      setGerando(false);
    }
  };

  const salvarCampo = (p, campo, valor) => {
    atualizar.mutate({ id: p.id, data: { [campo]: valor === '' ? null : valor } });
  };

  const marcarPago = (p, pagoPor) => {
    atualizar.mutate({ id: p.id, data: { status: 'pago', data_pagamento: new Date().toISOString(), pago_por: pagoPor } });
  };
  const marcarPendente = (p) => {
    atualizar.mutate({ id: p.id, data: { status: 'pendente', data_pagamento: null } });
  };

  const handleUpload = async (p, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadId(p.id);
    try {
      const res = await base44.integrations.Core.UploadFile({ file, purpose: 'finance' });
      atualizar.mutate({ id: p.id, data: { comprovante_url: res.file_url } });
      feedback.success('Comprovante anexado.');
    } catch {
      feedback.error('Erro no upload do comprovante.');
    } finally {
      setUploadId(null);
    }
  };

  const enviarWhatsApp = async (p) => {
    if (!p.comprovante_url) { feedback.warning('Anexe o comprovante antes de enviar.'); return; }
    if (!fornecedor.telefone) { feedback.warning('O fornecedor não tem WhatsApp cadastrado.'); return; }
    setEnviandoId(p.id);
    try {
      const res = await base44.functions.invoke('m31EnviarComprovanteFornecedor', { payment_id: p.id });
      if (res.data?.sucesso) { feedback.success('Comprovante enviado (fornecedor + Thalita).'); invalidate(); }
      else feedback.error(res.data?.error || 'Falha ao enviar comprovante.');
    } catch {
      feedback.error('Erro ao enviar comprovante.');
    } finally {
      setEnviandoId(null);
    }
  };

  const inputStyle = { padding: '6px 9px', background: TOKENS.surface, border: `1.5px solid ${TOKENS.borderStrong}`, borderRadius: TOKENS.radius.md, fontSize: '12px', color: TOKENS.text, outline: 'none', boxSizing: 'border-box' };
  const btnBase = { padding: '6px 11px', borderRadius: TOKENS.radius.md, fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px', border: 'none' };
  const btnGhost = { ...btnBase, background: 'transparent', border: `1px solid ${TOKENS.borderStrong}`, color: TOKENS.textMuted };
  const card = { background: TOKENS.surfaceSubtle, border: `1px solid ${TOKENS.border}`, borderRadius: TOKENS.radius.md, padding: '12px 14px' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <button style={{ ...btnGhost, alignSelf: 'flex-start' }} onClick={onVoltar}><ArrowLeft size={13} /> Voltar aos contratos</button>

      <div>
        <div style={{ fontSize: '15px', fontWeight: '700', color: TOKENS.text }}>{contrato.descricao || 'Contrato'}</div>
        <div style={{ fontSize: '12px', color: TOKENS.textMuted, marginTop: '2px' }}>
          {formatBRL(contrato.valor_total)} · {contrato.forma_pagamento === 'parcelado' ? `${contrato.numero_parcelas}x parcelas` : 'Parcela única'}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
        <div style={card}><div style={{ fontSize: '11px', color: TOKENS.textSubtle, fontWeight: '600' }}>Total</div><div style={{ fontSize: '15px', fontWeight: '700', color: TOKENS.text, marginTop: '4px' }}>{formatBRL(contrato.valor_total)}</div></div>
        <div style={card}><div style={{ fontSize: '11px', color: TOKENS.textSubtle, fontWeight: '600' }}>Pago</div><div style={{ fontSize: '15px', fontWeight: '700', color: TOKENS.success, marginTop: '4px' }}>{formatBRL(totalPago)}</div></div>
        <div style={card}><div style={{ fontSize: '11px', color: TOKENS.textSubtle, fontWeight: '600' }}>A pagar</div><div style={{ fontSize: '15px', fontWeight: '700', color: TOKENS.warning, marginTop: '4px' }}>{formatBRL(totalPendente)}</div></div>
      </div>

      {parcelas.length === 0 && !isLoading && (
        <button style={{ ...btnBase, background: TOKENS.primary, color: TOKENS.onPrimary, alignSelf: 'flex-start' }} onClick={gerarParcelas} disabled={gerando}>
          {gerando ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Gerar {contrato.forma_pagamento === 'parcelado' ? `${contrato.numero_parcelas} parcelas` : 'parcela única'}
        </button>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {isLoading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: TOKENS.textSubtle, fontSize: '13px' }}>Carregando…</div>
        ) : parcelas.map(p => {
          const st = STATUS_CFG[p.status] || STATUS_CFG.pendente;
          return (
            <div key={p.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: TOKENS.text }}>{p.descricao || `Parcela ${p.numero_parcela}`}</div>
                <span style={{ fontSize: '11px', fontWeight: '700', color: st.color, background: `${st.color}18`, borderRadius: TOKENS.radius.pill, padding: '2px 9px', whiteSpace: 'nowrap' }}>{st.label}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                <div>
                  <div style={{ fontSize: '10px', color: TOKENS.textSubtle, fontWeight: '600', marginBottom: '3px' }}>VALOR (R$)</div>
                  <input style={{ ...inputStyle, width: '100%' }} type="number" step="0.01" defaultValue={p.valor} onBlur={e => salvarCampo(p, 'valor', parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: TOKENS.textSubtle, fontWeight: '600', marginBottom: '3px' }}>VENCIMENTO</div>
                  <input style={{ ...inputStyle, width: '100%' }} type="date" defaultValue={p.vencimento || ''} onBlur={e => salvarCampo(p, 'vencimento', e.target.value)} />
                </div>
              </div>

              {p.status === 'pago' && (
                <div style={{ fontSize: '11px', color: TOKENS.textMuted, marginBottom: '8px' }}>
                  Pago {p.data_pagamento ? `em ${new Date(p.data_pagamento).toLocaleDateString('pt-BR')}` : ''} {p.pago_por ? `· por ${p.pago_por}` : ''}
                </div>
              )}

              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                {p.status !== 'pago' ? (
                  <>
                    <button style={{ ...btnGhost, color: TOKENS.success, borderColor: `${TOKENS.success}55` }} onClick={() => marcarPago(p, 'Paulo')}><Check size={12} /> Pago (Paulo)</button>
                    <button style={{ ...btnGhost, color: TOKENS.success, borderColor: `${TOKENS.success}55` }} onClick={() => marcarPago(p, 'Ju')}><Check size={12} /> Pago (Ju)</button>
                  </>
                ) : (
                  <button style={btnGhost} onClick={() => marcarPendente(p)}>Reverter p/ pendente</button>
                )}

                <label style={{ ...btnGhost, cursor: 'pointer' }}>
                  {uploadId === p.id ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}
                  {p.comprovante_url ? 'Trocar comprovante' : 'Anexar comprovante'}
                  <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => handleUpload(p, e)} />
                </label>

                {p.comprovante_url && (
                  <a href={p.comprovante_url} target="_blank" rel="noreferrer" style={{ ...btnGhost, textDecoration: 'none' }}><FileText size={12} /> Ver</a>
                )}

                {p.comprovante_url && (
                  <button style={{ ...btnBase, background: '#25D366', color: '#fff' }} onClick={() => enviarWhatsApp(p)} disabled={enviandoId === p.id} title={fornecedor.telefone ? 'Enviar comprovante por WhatsApp' : 'Fornecedor sem WhatsApp'}>
                    {enviandoId === p.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} WhatsApp
                    {p.comprovante_enviado_whatsapp && <Check size={11} />}
                  </button>
                )}

                <button style={{ ...btnGhost, color: TOKENS.danger, borderColor: `${TOKENS.danger}44`, marginLeft: 'auto' }} onClick={() => deletar.mutate(p.id)}><Trash2 size={12} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}