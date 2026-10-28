import { useRef, useState } from 'react';
import { gestaoError, gestaoReembolso } from '@/lib/m31GestaoApi';

const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function GestaoReembolsoConfirmar({ sessionId, inscricao, avaliacao, onDone, onCancel }) {
  const requestId = useRef(crypto.randomUUID());
  const [motivo, setMotivo] = useState('');
  const [ciente, setCiente] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const valor = brl(avaliacao.pagamento?.valor);
  const valido = motivo.trim().length >= 15 && ciente;

  async function submit(event) {
    event.preventDefault();
    if (!valido || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await gestaoReembolso(sessionId, 'solicitar', {
        inscricao_id: inscricao.id,
        motivo: motivo.trim(),
        confirmacao: 'REEMBOLSAR_TOTAL',
        request_id: requestId.current,
        expected_fingerprint: avaliacao.fingerprint
      });
      onDone(res?.rotulo || 'Solicitação registrada.');
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="m31-gestao-form" onSubmit={submit}>
      <p className="m31-gestao-notice">
        Reembolso total de <strong>{valor}</strong> ({avaliacao.pagamento?.forma === 'PIX' ? 'Pix' : 'Cartão'}) para {avaliacao.pagamento?.pagador_nome || inscricao.nome}. A inscrição não será cancelada.
      </p>
      <div className="m31-gestao-field">
        <label htmlFor="gestao-reembolso-motivo">Motivo do reembolso (obrigatório)</label>
        <textarea
          id="gestao-reembolso-motivo"
          value={motivo}
          maxLength={1000}
          onChange={(e) => setMotivo(e.target.value)}
          disabled={pending}
          placeholder="Descreva o motivo (mínimo de 15 caracteres)"
          required
        />
      </div>
      <label className="m31-gestao-check">
        <input type="checkbox" checked={ciente} onChange={(e) => setCiente(e.target.checked)} disabled={pending} />
        <span>Confirmo o reembolso total de {valor} pelo Asaas. Essa devolução não pode ser desfeita pelo sistema.</span>
      </label>
      {error && <p className="m31-gestao-error" role="alert">{gestaoError(error)}</p>}
      <div className="m31-gestao-form-actions">
        <button type="button" className="m31-gestao-btn" onClick={onCancel} disabled={pending}>Cancelar</button>
        <button type="submit" className="m31-gestao-btn m31-gestao-btn-primary" disabled={!valido || pending}>
          {pending ? 'Enviando ao Asaas…' : 'Confirmar reembolso total'}
        </button>
      </div>
    </form>
  );
}
