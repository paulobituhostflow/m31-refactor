import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Loader2 } from 'lucide-react';
import { gestaoError, gestaoRequest } from '@/lib/m31GestaoApi';
import GestaoDialog from './GestaoDialog';
import GestaoPrecoCaravana from './GestaoPrecoCaravana';
import GestaoExcluirCaravana from './GestaoExcluirCaravana';

export default function GestaoNovaCaravana({ sessionId, caravana, onClose, onSaved, canDelete = false, onDeleted }) {
  const queryClient = useQueryClient();
  const [requestId] = useState(() => crypto.randomUUID());
  const [fields, setFields] = useState(() => Object.fromEntries(['nome', 'cidade_origem', 'lider_nome', 'lider_whatsapp', 'lider_email'].map((field) => [field, caravana?.[field] || ''])));
  const [pending, setPending] = useState(false);
  const sending = useRef(false);
  const [error, setError] = useState(null);

  async function save(event) {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await gestaoRequest('m31GestaoCaravanas', {
        action: caravana ? 'editar' : 'cadastrar',
        session_id: sessionId,
        request_id: requestId,
        fields,
        ...(caravana ? { id: caravana.id, expected_version: caravana.version || caravana.updated_date } : {})
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['m31-operational-list', sessionId, 'caravanas'] }),
        queryClient.invalidateQueries({ queryKey: ['m31-gestao-caravanas', sessionId] }),
        queryClient.invalidateQueries({ queryKey: ['m31-operational-summary', sessionId] }),
        queryClient.invalidateQueries({ queryKey: ['m31-gestao-caravanas-view', sessionId] }),
        queryClient.invalidateQueries({ queryKey: ['m31-gestao-caravana-detail', sessionId] }),
      ]);
      onSaved?.(result.caravana);
      onClose();
    } catch (failure) {
      setError(failure);
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  return (
    <GestaoDialog title={caravana ? 'Editar caravana e líder' : 'Nova caravana'} description="Dados da caravana e contato da líder." onClose={() => !pending && onClose()}>
      <form className="m31-gestao-form" onSubmit={save}>
        <div className="m31-gestao-fields-grid">
          {[
            ['nome', 'Nome da caravana', 'text', undefined],
            ['cidade_origem', 'Cidade de origem', 'text', undefined],
            ['lider_nome', 'Nome completo da líder', 'text', 'name'],
            ['lider_whatsapp', 'WhatsApp da líder com DDD', 'tel', 'tel'],
            ['lider_email', 'E-mail da líder (opcional)', 'email', 'email'],
          ].map(([key, label, type, autoComplete]) => (
            <div className={`m31-gestao-field ${key === 'nome' ? 'm31-gestao-field-wide' : ''}`} key={key}>
              <label htmlFor={`caravana-${key}`}>{label}</label>
              <input
                id={`caravana-${key}`}
                name={key}
                type={type}
                autoComplete={autoComplete}
                value={fields[key]}
                onChange={(event) => {
                  setFields((previous) => ({ ...previous, [key]: event.target.value }));
                  setError((previous) => previous?.code === 'CONFLICT' ? previous : null);
                }}
                required={key !== 'lider_email'}
                maxLength={200}
                disabled={pending}
              />
            </div>
          ))}
        </div>
        {caravana?.id && <GestaoPrecoCaravana caravana={caravana} />}
        {error && <p className="m31-gestao-error" role="alert">{gestaoError(error)}</p>}
        <p className="m31-gestao-muted">
          {caravana ? 'Salvar os dados não envia mensagens nem altera os registros financeiros das participantes.' : 'O cadastro não cria cobranças nem envia mensagens. Depois, inclua as participantes na caravana.'}
        </p>
        {caravana?.id && canDelete && <GestaoExcluirCaravana sessionId={sessionId} caravana={caravana} onDeleted={(result) => { onDeleted?.(result); onClose(); }} />}
        {error?.code === 'CONFLICT' && (
          <button
            type="button"
            className="m31-gestao-btn"
            onClick={async () => {
              await queryClient.invalidateQueries({ queryKey: ['m31-gestao-caravanas-view', sessionId] });
              await queryClient.invalidateQueries({ queryKey: ['m31-gestao-caravana-detail', sessionId] });
              onClose();
            }}
          >
            Atualizar caravana antes de editar
          </button>
        )}
        <div className="m31-gestao-form-actions">
          <button type="button" className="m31-gestao-btn" onClick={onClose} disabled={pending}>Cancelar</button>
          <button type="submit" className="m31-gestao-btn m31-gestao-btn-primary" disabled={pending || error?.code === 'CONFLICT'}>
            {pending ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}
            {pending ? 'Salvando…' : caravana ? 'Salvar alterações' : 'Cadastrar caravana'}
          </button>
        </div>
      </form>
    </GestaoDialog>
  );
}
