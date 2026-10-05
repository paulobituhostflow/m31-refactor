/**
 * M31FornecedorFinanceiro — drawer do financeiro de um fornecedor.
 * Nível 1: lista de contratos do fornecedor (criar contrato, anexar arquivo).
 * Nível 2 (drill-down): parcelas do contrato selecionado (M31ContratoParcelas).
 */
import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, FileText, ChevronRight, Loader2, Trash2, Paperclip } from 'lucide-react';
import { TOKENS } from '@/lib/m31DesignTokens';
import { feedback } from '@/components/m31/ui';
import M31ContratoParcelas from '@/components/m31/fornecedores/M31ContratoParcelas';

const formatBRL = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function M31FornecedorFinanceiro({ fornecedor, onClose }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [contratoSel, setContratoSel] = useState(null);
  const [uploadando, setUploadando] = useState(false);
  const [form, setForm] = useState({ descricao: '', valor_total: '', forma_pagamento: 'parcela_unica', numero_parcelas: 1, contrato_url: '', observacoes: '' });

  const { data: contratos = [], isLoading } = useQuery({
    queryKey: ['m31_supplier_contracts', fornecedor.id],
    queryFn: () => base44.entities.SupplierContract.filter({ supplier_id: fornecedor.id }, '-created_date', 100),
  });

  // Totais de pagamentos do fornecedor (para o resumo do topo)
  const { data: pagamentos = [] } = useQuery({
    queryKey: ['m31_supplier_payments', fornecedor.id],
    queryFn: () => base44.entities.SupplierPayment.filter({ supplier_id: fornecedor.id }, 'vencimento', 500),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['m31_supplier_contracts', fornecedor.id] });

  const criar = useMutation({
    mutationFn: (data) => base44.entities.SupplierContract.create(data),
    onSuccess: () => { invalidate(); feedback.success('Contrato criado.'); },
  });
  const deletar = useMutation({
    mutationFn: (id) => base44.entities.SupplierContract.delete(id),
    onSuccess: () => { invalidate(); feedback.success('Contrato removido.'); },
  });

  const totalContratado = contratos.reduce((s, c) => s + (c.valor_total || 0), 0);
  const totalPago = pagamentos.filter(p => p.status === 'pago').reduce((s, p) => s + (p.valor || 0), 0);
  const totalPendente = pagamentos.filter(p => p.status !== 'pago' && p.status !== 'cancelado').reduce((s, p) => s + (p.valor || 0), 0);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadando(true);
    try {
      const res = await base44.integrations.Core.UploadFile({ file, purpose: 'finance' });
      setForm(f => ({ ...f, contrato_url: res.file_url }));
      feedback.success('Arquivo anexado.');
    } catch {
      feedback.error('Erro no upload.');
    } finally {
      setUploadando(false);
    }
  };

  const handleCriar = () => {
    if (!form.valor_total) { feedback.warning('Informe o valor total do contrato.'); return; }
    criar.mutate({
      supplier_id: fornecedor.id,
      supplier_nome: fornecedor.nome,
      descricao: form.descricao,
      valor_total: parseFloat(form.valor_total),
      forma_pagamento: form.forma_pagamento,
      numero_parcelas: form.forma_pagamento === 'parcelado' ? (parseInt(form.numero_parcelas) || 1) : 1,
      contrato_url: form.contrato_url || undefined,
      observacoes: form.observacoes || undefined,
    });
    setForm({ descricao: '', valor_total: '', forma_pagamento: 'parcela_unica', numero_parcelas: 1, contrato_url: '', observacoes: '' });
    setShowForm(false);
  };

  const inputStyle = { width: '100%', padding: '8px 11px', background: TOKENS.surface, border: `1.5px solid ${TOKENS.borderStrong}`, borderRadius: TOKENS.radius.md, fontSize: '13px', color: TOKENS.text, outline: 'none', boxSizing: 'border-box' };
  const btnBase = { padding: '7px 13px', borderRadius: TOKENS.radius.md, fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px', border: 'none' };
  const btnPrimary = { ...btnBase, background: TOKENS.primary, color: TOKENS.onPrimary };
  const btnGhost = { ...btnBase, background: 'transparent', border: `1px solid ${TOKENS.borderStrong}`, color: TOKENS.textMuted };
  const card = { background: TOKENS.surfaceSubtle, border: `1px solid ${TOKENS.border}`, borderRadius: TOKENS.radius.md, padding: '12px 14px' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(640px, 100%)', height: '100%', background: TOKENS.surface, borderLeft: `1px solid ${TOKENS.border}`, overflowY: 'auto', animation: 'm31-drawer-slide 250ms cubic-bezier(0.16,1,0.3,1)' }}>
        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${TOKENS.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, background: TOKENS.surface, zIndex: 2 }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: TOKENS.textSubtle }}>Financeiro do fornecedor</div>
            <div style={{ fontSize: '17px', fontWeight: '700', color: TOKENS.text, marginTop: '3px' }}>{fornecedor.nome}</div>
            <div style={{ fontSize: '12px', color: TOKENS.textMuted, marginTop: '1px' }}>{fornecedor.telefone || 'sem WhatsApp'}{fornecedor.categoria ? ` · ${fornecedor.categoria}` : ''}</div>
          </div>
          <button onClick={onClose} style={{ ...btnGhost, padding: '6px' }}><X size={16} /></button>
        </div>

        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {contratoSel ? (
            <M31ContratoParcelas fornecedor={fornecedor} contrato={contratoSel} onVoltar={() => setContratoSel(null)} />
          ) : (
            <>
              {/* Resumo */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <div style={card}><div style={{ fontSize: '11px', color: TOKENS.textSubtle, fontWeight: '600' }}>Contratado</div><div style={{ fontSize: '16px', fontWeight: '700', color: TOKENS.text, marginTop: '4px' }}>{formatBRL(totalContratado)}</div></div>
                <div style={card}><div style={{ fontSize: '11px', color: TOKENS.textSubtle, fontWeight: '600' }}>Pago</div><div style={{ fontSize: '16px', fontWeight: '700', color: TOKENS.success, marginTop: '4px' }}>{formatBRL(totalPago)}</div></div>
                <div style={card}><div style={{ fontSize: '11px', color: TOKENS.textSubtle, fontWeight: '600' }}>A pagar</div><div style={{ fontSize: '16px', fontWeight: '700', color: TOKENS.warning, marginTop: '4px' }}>{formatBRL(totalPendente)}</div></div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button style={btnPrimary} onClick={() => setShowForm(v => !v)}><Plus size={13} /> Novo contrato</button>
              </div>

              {/* Form novo contrato */}
              {showForm && (
                <div style={{ ...card, background: TOKENS.surface, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <input style={inputStyle} placeholder="Descrição do que foi contratado" value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} />
                  </div>
                  <input style={inputStyle} type="number" step="0.01" placeholder="Valor total (R$)" value={form.valor_total} onChange={e => setForm({ ...form, valor_total: e.target.value })} />
                  <select style={inputStyle} value={form.forma_pagamento} onChange={e => setForm({ ...form, forma_pagamento: e.target.value })}>
                    <option value="parcela_unica">Parcela única</option>
                    <option value="parcelado">Parcelado</option>
                  </select>
                  {form.forma_pagamento === 'parcelado' && (
                    <input style={inputStyle} type="number" min="1" placeholder="Nº de parcelas" value={form.numero_parcelas} onChange={e => setForm({ ...form, numero_parcelas: e.target.value })} />
                  )}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <input style={inputStyle} placeholder="Observações (opcional)" value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} />
                  </div>
                  <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <label style={{ ...btnGhost, cursor: 'pointer' }}>
                      {uploadando ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}
                      {form.contrato_url ? 'Trocar arquivo do contrato' : 'Anexar contrato (PDF/imagem)'}
                      <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={handleUpload} />
                    </label>
                    {form.contrato_url && <a href={form.contrato_url} target="_blank" rel="noreferrer" style={{ ...btnGhost, textDecoration: 'none' }}><FileText size={12} /> Ver</a>}
                  </div>
                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                    <button style={btnGhost} onClick={() => setShowForm(false)}>Cancelar</button>
                    <button style={btnPrimary} onClick={handleCriar}>Criar contrato</button>
                  </div>
                </div>
              )}

              {/* Lista de contratos */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: TOKENS.textSubtle, marginBottom: '10px' }}>
                  Contratos {contratos.length > 0 && `(${contratos.length})`}
                </div>
                {isLoading ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: TOKENS.textSubtle, fontSize: '13px' }}>Carregando…</div>
                ) : contratos.length === 0 ? (
                  <div style={{ ...card, textAlign: 'center', color: TOKENS.textSubtle, fontSize: '13px', padding: '24px' }}>Nenhum contrato cadastrado para este fornecedor.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {contratos.map(c => (
                      <div key={c.id} style={{ ...card, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }} onClick={() => setContratoSel(c)}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = TOKENS.borderStrong; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = TOKENS.border; }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: TOKENS.text }}>{c.descricao || 'Contrato'}</div>
                          <div style={{ fontSize: '11px', color: TOKENS.textMuted, marginTop: '2px' }}>
                            {formatBRL(c.valor_total)} · {c.forma_pagamento === 'parcelado' ? `${c.numero_parcelas}x parcelas` : 'Parcela única'}
                          </div>
                        </div>
                        {c.contrato_url && <a href={c.contrato_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ ...btnGhost, textDecoration: 'none', padding: '5px 9px' }}><FileText size={12} /></a>}
                        <button style={{ ...btnGhost, color: TOKENS.danger, borderColor: `${TOKENS.danger}44`, padding: '5px 9px' }} onClick={e => { e.stopPropagation(); deletar.mutate(c.id); }}><Trash2 size={12} /></button>
                        <ChevronRight size={16} color={TOKENS.textSubtle} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}