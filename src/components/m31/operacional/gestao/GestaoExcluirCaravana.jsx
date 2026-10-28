import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2 } from 'lucide-react';
import { gestaoError, gestaoRequest } from '@/lib/m31GestaoApi';

// Deletion never erases a participant: inscriptions and payments stay, the group link is released.
export default function GestaoExcluirCaravana({ sessionId, caravana, onDeleted }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const total = Number.isFinite(caravana?.total_participantes) ? caravana.total_participantes : 0;
  const confirmed = String(nome || '').trim().toLowerCase() === String(caravana?.nome || '').trim().toLowerCase() && Boolean(String(nome || '').trim());

  async function remove() {
    if (!confirmed || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await gestaoRequest('m31GestaoCaravanas', {
        action: 'excluir',
        session_id: sessionId,
        id: caravana.id,
        confirmacao: String(nome).trim(),
        expected_version: caravana.version || caravana.updated_date,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['m31-operational-list', sessionId, 'caravanas'] }),
        queryClient.invalidateQueries({ queryKey: ['m31-gestao-caravanas', sessionId] }),
        queryClient.invalidateQueries({ queryKey: ['m31-operational-summary', sessionId] }),
        queryClient.invalidateQueries({ queryKey: ['m31-gestao-caravanas-view', sessionId] }),
        queryClient.invalidateQueries({ queryKey: ['m31-gestao-caravana-detail', sessionId] }),
      ]);
      onDeleted?.(result);
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="m31-gestao-danger" aria-labelledby={`caravana-excluir-${caravana.id}`}>
      <h3 id={`caravana-excluir-${caravana.id}`}>Excluir caravana</h3>
      <p className="m31-gestao-muted">A caravana sai da lista e do formulário público. Esta ação não pode ser desfeita.</p>
      {!open ? (
        <div className="m31-gestao-price-actions">
          <button type="button" className="m31-gestao-btn m31-gestao-btn-danger" onClick={() => { setOpen(true); setError(null); }}>
            <Trash2 size={17} aria-hidden="true" />Excluir caravana
          </button>
        </div>
      ) : (
        <>
          <p className="m31-gestao-muted">
            {total > 0
              ? `${total} participante${total > 1 ? 's' : ''} desta caravana ${total > 1 ? 'ficarão' : 'ficará'} sem caravana. Inscrições, pagamentos e histórico não são apagados.`
              : 'Esta caravana não tem participantes vinculadas.'}
          </p>
          <div className="m31-gestao-field">
            <label htmlFor={`caravana-excluir-nome-${caravana.id}`}>Digite o nome da caravana para confirmar</label>
            <input
              id={`caravana-excluir-nome-${caravana.id}`}
              type="text"
              autoComplete="off"
              value={nome}
              disabled={pending}
              onChange={(event) => { setNome(event.target.value); setError(null); }}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void remove(); } }}
            />
          </div>
          {error && <p className="m31-gestao-error" role="alert">{error?.code === 'CARAVAN_DELETE_FORBIDDEN' ? 'Somente o administrador pode excluir caravanas.' : gestaoError(error)}</p>}
          <div className="m31-gestao-price-actions">
            <button type="button" className="m31-gestao-btn" onClick={() => { setOpen(false); setNome(''); setError(null); }} disabled={pending}>Cancelar</button>
            <button type="button" className="m31-gestao-btn m31-gestao-btn-danger" onClick={remove} disabled={pending || !confirmed}>
              {pending ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Trash2 size={17} aria-hidden="true" />}
              {pending ? 'Excluindo…' : 'Excluir definitivamente'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
