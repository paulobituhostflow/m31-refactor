import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { EMPTY_GESTAO_FIELDS, gestaoError, gestaoOperation, mergeGestaoSuggestions, onlyGestaoFields } from '@/lib/m31GestaoApi';
import { formatarGestaoTelefone, normalizarGestaoTelefone } from '@/lib/m31GestaoTelefone';

const STATES = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
const FIELDS = [
  { key: 'nome', label: 'Nome completo', autoComplete: 'name', required: true },
  { key: 'whatsapp', label: 'WhatsApp com DDD', autoComplete: 'tel', inputMode: 'tel', type: 'tel', required: true, placeholder: '(81) 99999-9999' },
  { key: 'email', label: 'E-mail (opcional)', autoComplete: 'email', type: 'email' },
  { key: 'cpf', label: 'CPF (opcional)', inputMode: 'numeric', placeholder: 'Somente números' },
  { key: 'cidade', label: 'Cidade (opcional)', autoComplete: 'address-level2' },
];

// Cadastro manual direto: PREENCHER → CADASTRAR → CONCLUIR.
// Campos, solicitação do clique e nada mais: sem etapa de conferência, sem conciliação
// financeira e sem trava que obrigue a recarregar a página para continuar.
export default function GestaoInscricaoForm({ sessionId, mode = 'create', initialFields, onSubmit, onCancel, onDraftChange, pending, error }) {
  const [fields, setFields] = useState(() => onlyGestaoFields(initialFields || EMPTY_GESTAO_FIELDS));
  const revisions = useRef({});
  const [requestId] = useState(() => crypto.randomUUID());
  const [destination, setDestination] = useState('normal');
  const [caravanaId, setCaravanaId] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiPending, setAiPending] = useState(false);
  const [aiError, setAiError] = useState('');
  const caravanas = useQuery({
    queryKey: ['m31-gestao-caravanas', sessionId],
    queryFn: () => gestaoOperation(sessionId, 'caravanas'),
    enabled: mode === 'create' && destination === 'caravana',
    retry: false,
  });

  function change(field, value) {
    revisions.current[field] = (revisions.current[field] || 0) + 1;
    setFields((previous) => ({ ...previous, [field]: value }));
    onDraftChange?.();
  }

  async function suggest() {
    const startedFields = { ...fields };
    const startedRevisions = { ...revisions.current };
    setAiPending(true);
    setAiError('');
    try {
      const response = await gestaoOperation(sessionId, 'extrair_ia', { texto: aiText });
      setFields((current) => mergeGestaoSuggestions(current, startedFields, revisions.current, startedRevisions, response.fields));
      onDraftChange?.();
    } catch (failure) {
      setAiError(gestaoError(failure));
    } finally {
      setAiPending(false);
    }
  }

  function submit(event) {
    event.preventDefault();
    if (pending || aiPending) return;
    const normalized = normalizarGestaoTelefone(fields.whatsapp);
    const submittedFields = { ...fields, whatsapp: normalized || fields.whatsapp };
    if (normalized) setFields((current) => ({ ...current, whatsapp: formatarGestaoTelefone(normalized) }));
    onSubmit({ fields: submittedFields, request_id: requestId, ...(mode === 'create' && destination === 'caravana' ? { caravana_id: caravanaId } : {}) });
  }

  return (
    <form className="m31-gestao-form" onSubmit={submit}>
      {mode === 'transfer' && (
        <p className="m31-gestao-notice">Preencha os dados da nova participante. A mesma vaga e seus registros financeiros serão preservados.</p>
      )}
      {mode === 'create' && (
        <div className="m31-gestao-field">
          <label htmlFor="gestao-destino">Tipo de inscrição</label>
          <select id="gestao-destino" value={destination} onChange={(event) => setDestination(event.target.value)} disabled={pending}>
            <option value="normal">Inscrição normal</option>
            <option value="caravana">Incluir em caravana existente</option>
          </select>
        </div>
      )}
      {mode === 'create' && destination === 'caravana' && (
        <div className="m31-gestao-field">
          <label htmlFor="gestao-caravana">Caravana</label>
          <select id="gestao-caravana" value={caravanaId} onChange={(event) => setCaravanaId(event.target.value)} required disabled={pending || caravanas.isLoading}>
            <option value="">{caravanas.isLoading ? 'Carregando caravanas…' : 'Selecione uma caravana'}</option>
            {caravanas.data?.items?.map((item) => (
              <option key={item.id} value={item.id}>{item.nome}</option>
            ))}
          </select>
          {caravanas.error && (
            <p role="alert">
              Não foi possível carregar as caravanas. <button type="button" onClick={() => caravanas.refetch()} className="m31-gestao-link">Tentar novamente</button>
            </p>
          )}
        </div>
      )}
      <div className="m31-gestao-ai">
        <button type="button" className="m31-gestao-btn" onClick={() => setAiOpen(!aiOpen)} aria-expanded={aiOpen} disabled={pending}>
          <Sparkles size={17} aria-hidden="true" />Preencher com IA
        </button>
        {aiOpen && (
          <div className="m31-gestao-ai-fields">
            <label htmlFor="gestao-ai-texto">Cole os dados de uma participante</label>
            <textarea
              id="gestao-ai-texto"
              value={aiText}
              onChange={(event) => setAiText(event.target.value)}
              maxLength={10000}
              rows={4}
              placeholder="Nome, WhatsApp, cidade e outros dados disponíveis…"
            />
            <p className="m31-gestao-muted">A IA sugere dados. Confira os campos e cadastre.</p>
            <button type="button" className="m31-gestao-btn" onClick={suggest} disabled={aiPending || pending || !aiText.trim()}>
              {aiPending ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Sparkles size={17} aria-hidden="true" />}
              {aiPending ? 'Lendo os dados…' : 'Sugerir preenchimento'}
            </button>
            {aiError && <p className="m31-gestao-error" role="alert">{aiError} Você pode continuar preenchendo manualmente.</p>}
          </div>
        )}
      </div>
      <div className="m31-gestao-fields-grid">
        {FIELDS.map(({ key, label, ...attributes }) => (
          <div key={key} className={`m31-gestao-field ${key === 'nome' ? 'm31-gestao-field-wide' : ''}`}>
            <label htmlFor={`gestao-${key}`}>{label}</label>
            <input
              id={`gestao-${key}`}
              name={key}
              value={fields[key]}
              onChange={(event) => change(key, event.target.value)}
              onBlur={key === 'whatsapp' ? (event) => {
                const formatted = formatarGestaoTelefone(event.target.value);
                if (formatted !== event.target.value) change(key, formatted);
              } : undefined}
              maxLength={key === 'nome' ? 180 : 200}
              disabled={pending}
              {...attributes}
            />
          </div>
        ))}
        <div className="m31-gestao-field">
          <label htmlFor="gestao-estado">UF (opcional)</label>
          <select id="gestao-estado" name="estado" value={fields.estado} onChange={(event) => change('estado', event.target.value)} disabled={pending}>
            <option value="">Selecione</option>
            {STATES.map((state) => <option key={state} value={state}>{state}</option>)}
          </select>
        </div>
      </div>
      {error && (
        <div className="m31-gestao-error" role="alert">
          <p>{gestaoError(error)}</p>
          {error.duplicidades?.length > 0 && (
            <ul>
              {error.duplicidades.map((item, index) => (
                <li key={item.id || index}>
                  {item.nome || 'Inscrição existente'}
                  {item.codigo_inscricao ? ` · ${item.codigo_inscricao}` : ''}
                  {item.motivo ? ` · ${item.motivo}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {mode === 'create' && (
        <p className="m31-gestao-muted">
          A participação será confirmada pela equipe. O pagamento ficará pendente. Nenhuma cobrança, mensagem ou QR será enviado.
        </p>
      )}
      <div className="m31-gestao-form-actions">
        <button type="button" className="m31-gestao-btn" onClick={onCancel} disabled={pending}>Cancelar</button>
        <button type="submit" className="m31-gestao-btn m31-gestao-btn-primary" disabled={pending || aiPending}>
          {pending ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}
          {pending ? 'Cadastrando…' : mode === 'create' ? 'Cadastrar inscrição' : mode === 'transfer' ? 'Confirmar troca de titular' : 'Salvar alterações'}
        </button>
      </div>
    </form>
  );
}
