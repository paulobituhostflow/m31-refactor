import { useState } from 'react';

const PAG = { aprovado: 'Pago', gratuito: 'Isenta', pendente: 'Pendente', checkout_pendente: 'Checkout pendente', cancelado: 'Cancelada' };

// Painel de conflito dentro da ficha do lote: compara, mostra a situação e oferece três decisões.
export default function GestaoLoteDuplicidade({ error, fields, onIgnore, onEdit, onDistinct }) {
  const [distinct, setDistinct] = useState(false);
  const [identity, setIdentity] = useState(false);
  const [reason, setReason] = useState('');
  const strong = error.code === 'DUPLICATE_CPF';
  return (
    <div className="m31-gestao-error" role="alert">
      <p><strong>{strong ? 'CPF já cadastrado' : 'Possível duplicidade'}</strong></p>
      <p style={{ fontSize: 13 }}>Informado: {fields.nome} · {fields.whatsapp}{fields.email ? ` · ${fields.email}` : ''}</p>
      {error.duplicidades?.map((d) => (
        <div key={d.id} style={{ borderTop: '1px solid #e5e8eb', paddingTop: 6, marginTop: 6, fontSize: 13 }}>
          <p><strong>{d.nome}</strong>{d.codigo_inscricao ? ` · ${d.codigo_inscricao}` : ''}</p>
          <p>{d.whatsapp}{d.email ? ` · ${d.email}` : ''}{d.cpf_final ? ` · CPF final ${d.cpf_final}` : ''}</p>
          <p>Motivo: {d.motivos?.join(', ') || (strong ? 'mesmo CPF' : 'dados semelhantes')}</p>
          <p>Pagamento: {PAG[d.status_pagamento] || d.status_pagamento || '—'} · Confirmação: {d.estado_canonico || '—'} · QR: {d.qr} · Caravana: {d.caravana_nome || 'nenhuma'}</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            <button type="button" className="m31-gestao-btn" onClick={() => onIgnore(d)}>Já cadastrada</button>
            <button type="button" className="m31-gestao-btn" onClick={() => onEdit(d.id)}>Corrigir cadastro</button>
          </div>
        </div>
      ))}
      {!strong && (
        <div style={{ marginTop: 8 }}>
          <label className="m31-gestao-check">
            <input type="checkbox" checked={distinct} onChange={(e) => setDistinct(e.target.checked)} />
            Não é duplicidade
          </label>
          {distinct && (
            <>
              <label className="m31-gestao-check">
                <input type="checkbox" checked={identity} onChange={(e) => setIdentity(e.target.checked)} />
                Conferi a identidade: é outra pessoa.
              </label>
              <div className="m31-gestao-field">
                <label>Justificativa</label>
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: confirmei com a coordenadora, são irmãs" />
              </div>
              <button type="button" className="m31-gestao-btn m31-gestao-btn-primary" disabled={!identity || reason.trim().length < 10} onClick={() => onDistinct(reason.trim())}>
                Liberar inscrição distinta
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
