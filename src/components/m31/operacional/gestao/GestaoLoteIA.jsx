import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCheck, Loader2, Sparkles } from 'lucide-react';
import { gestaoError, gestaoOperation, onlyGestaoFields } from '@/lib/m31GestaoApi';
import GestaoLoteBloco from './GestaoLoteBloco';

export default function GestaoLoteIA({ sessionId, onClose, onCreated, onEdit }) {
  const [destination, setDestination] = useState('caravana');
  const [caravanaId, setCaravanaId] = useState('');
  const [text, setText] = useState('');
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState('');
  const [items, setItems] = useState([]);
  const inFlight = useRef(new Set());
  const caravanas = useQuery({
    queryKey: ['m31-gestao-caravanas', sessionId],
    queryFn: () => gestaoOperation(sessionId, 'caravanas'),
    enabled: destination === 'caravana',
    retry: false
  });

  const update = (i, patch) => setItems((list) => list.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  async function read() {
    setReading(true);
    setReadError('');
    try {
      const res = await gestaoOperation(sessionId, 'extrair_ia_lote', { texto: text });
      const found = (res.participantes || []).map((f) => ({
        fields: onlyGestaoFields(f),
        reviewed: false,
        status: 'idle',
        error: null,
        dupReviewed: false,
        requestId: crypto.randomUUID()
      }));
      if (!found.length) setReadError('Nenhuma participante identificada no texto.');
      setItems((list) => [...list.filter((it) => it.status !== 'done'), ...found]);
    } catch (e) {
      setReadError(gestaoError(e));
    } finally {
      setReading(false);
    }
  }

  async function submitOne(i, item, refresh = true) {
    if (!caravanaId) {
      update(i, { error: { message: 'Selecione a caravana antes de cadastrar.' } });
      return;
    }
    if (inFlight.current.has(item.requestId)) return;
    inFlight.current.add(item.requestId);
    update(i, { status: 'pending', error: null });
    try {
      const res = await gestaoOperation(sessionId, 'cadastrar', {
        fields: item.fields,
        request_id: item.requestId,
        caravana_id: caravanaId,
        confirmar_lote: true,
        ...(item.dupReviewed ? { duplicidades_revisadas: true, duplicidade_justificativa: item.justificativa } : {})
      });
      const result = res.reused
        ? 'Já cadastrada'
        : res.coincidencias?.length
          ? `Participação confirmada · pagamento pendente · aviso: ${[...new Set(res.coincidencias.flatMap(c => c.motivos))].join(' e ')} de outra inscrição`
          : 'Participação confirmada · pagamento pendente';
      update(i, { status: 'done', result, semelhantes: res.semelhantes || [] });
      if (refresh) onCreated?.();
    } catch (e) {
      update(i, { status: 'idle', error: e });
    } finally {
      inFlight.current.delete(item.requestId);
    }
  }

  async function submitApproved() {
    for (const [i, item] of items.entries()) {
      if (item.reviewed && item.status === 'idle' && !item.error?.duplicidades?.length) {
        await submitOne(i, item, false);
      }
    }
    onCreated?.();
  }

  const approved = items.filter((it) => it.reviewed && it.status === 'idle').length;
  const doneCount = items.filter((it) => it.status === 'done').length;

  return (
    <div className="m31-gestao-form">
      {destination === 'caravana' && (
        <div className="m31-gestao-field">
          <label>Caravana</label>
          <select value={caravanaId} onChange={(e) => setCaravanaId(e.target.value)} disabled={caravanas.isLoading}>
            <option value="">{caravanas.isLoading ? 'Carregando caravanas…' : 'Selecione uma caravana'}</option>
            {caravanas.data?.items?.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </div>
      )}
      <div className="m31-gestao-field">
        <label>Cole os dados de várias participantes</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={30000}
          rows={6}
          placeholder="Cole a lista com nome, WhatsApp, CPF, cidade de cada mulher…"
        />
      </div>
      <button type="button" className="m31-gestao-btn" onClick={read} disabled={reading || !text.trim()}>
        {reading ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />}
        {reading ? 'Lendo as participantes…' : 'Separar participantes com IA'}
      </button>
      {readError && <p className="m31-gestao-error" role="alert">{readError}</p>}
      {items.length > 0 && (
        <p className="m31-gestao-muted" aria-live="polite">
          {items.length} participantes identificadas · {doneCount} cadastradas · {approved} aprovadas aguardando
        </p>
      )}
      {items.map((item, i) => (
        <GestaoLoteBloco
          key={item.requestId}
          index={i}
          item={item}
          onChange={(p) => update(i, p)}
          onRemove={() => setItems((l) => l.filter((_, j) => j !== i))}
          onEdit={onEdit}
          onSubmit={(extra) => {
            const next = { ...item, ...(extra || {}) };
            if (extra) update(i, extra);
            submitOne(i, next);
          }}
        />
      ))}
      <p className="m31-gestao-muted">
        Cada participante aprovada terá a participação confirmada na caravana, com pagamento pendente. Este cadastro não cria cobrança nem envia mensagens ou QR automaticamente.
      </p>
      <div className="m31-gestao-form-actions">
        <button type="button" className="m31-gestao-btn" onClick={onClose}>Fechar</button>
        {items.length > 0 && (
          <button type="button" className="m31-gestao-btn m31-gestao-btn-primary" onClick={submitApproved} disabled={!approved}>
            <CheckCheck size={17} />Cadastrar aprovadas ({approved})
          </button>
        )}
      </div>
    </div>
  );
}
