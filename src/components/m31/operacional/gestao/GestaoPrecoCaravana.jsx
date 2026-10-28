import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const moneyText = (value) => (typeof value === 'number' && Number.isFinite(value) && value > 0
  ? `R$ ${value.toFixed(2).replace('.', ',')}` : 'Indisponível');
const toInput = (value) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value.toFixed(2).replace('.', ',') : '');
const parseMoney = (raw) => {
  const clean = String(raw ?? '').replace(/[^\d,.]/g, '');
  if (!clean) return NaN;
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 && value <= 100000 ? Math.round(value * 100) / 100 : NaN;
};
const statusOf = (error) => Number(error?.response?.status ?? error?.status) || 0;
const newRequestId = () => { try { return crypto.randomUUID(); } catch { return ''; } };

async function callCentral(action, payload = {}) {
  const response = await base44.functions.invoke('m31CentralComercial', { ...payload, action });
  const data = response?.data ?? response;
  if (!data || data.ok !== true) {
    throw Object.assign(new Error(data?.error || data?.message || 'A central comercial não confirmou a operação.'), { status: response?.status });
  }
  return data;
}

// The published commercial policy is the only pricing authority: a caravana
// price is its own exception there, so every new checkout reads the same rule.
export default function GestaoPrecoCaravana({ caravana }) {
  const [state, setState] = useState({ status: 'loading', error: '' });
  const [pix, setPix] = useState('');
  const [card, setCard] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [requestId, setRequestId] = useState(newRequestId);
  const alive = useRef(true);

  useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(async () => {
    if (!caravana?.id) return;
    setState({ status: 'loading', error: '' });
    try {
      const catalog = await callCentral('catalogo', { form_id: 'caravana', caravana_id: caravana.id });
      const form = (catalog.forms || []).find((item) => item.id === 'caravana');
      if (!form?.current || !(form.current.pix > 0) || !(form.current.card > 0)) {
        throw new Error('O valor vigente desta caravana não está disponível na central comercial.');
      }
      let panel = null;
      try { panel = await callCentral('painel'); } catch { panel = null; }
      if (!alive.current) return;
      setState({
        status: 'ok',
        error: '',
        price: { pix: form.current.pix, card: form.current.card, own: Boolean(form.current.exception_label) },
        panel,
      });
      setPix(toInput(form.current.pix));
      setCard(toInput(form.current.card));
    } catch (error) {
      if (alive.current) setState({ status: 'error', error: error?.message || 'Não foi possível consultar o preço desta caravana.' });
    }
  }, [caravana?.id]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (saving) return;
    setFeedback(null);
    const pixValue = parseMoney(pix);
    const cardValue = parseMoney(card) || pixValue;
    if (!(pixValue > 0)) { setFeedback({ kind: 'error', text: 'Informe o valor da caravana no PIX, em reais.' }); return; }
    if (!(cardValue > 0)) { setFeedback({ kind: 'error', text: 'Informe o valor da caravana no cartão, em reais.' }); return; }
    const panel = state.panel;
    if (panel?.can_edit !== true || panel?.configured !== true || !panel?.config_id || !Number.isInteger(panel?.version)) {
      setFeedback({ kind: 'error', text: 'Seu acesso não permite publicar preços. Fale com o administrador da central comercial.' });
      return;
    }
    if (!requestId) { setFeedback({ kind: 'error', text: 'Não foi possível iniciar a gravação neste navegador. Recarregue a página.' }); return; }
    setSaving(true);
    try {
      const policy = JSON.parse(JSON.stringify(panel.policy));
      const form = policy.forms.caravana;
      form.exceptions = [
        ...(form.exceptions || []).filter((row) => row.caravana_id !== caravana.id),
        { caravana_id: caravana.id, label: `Condição ${caravana.nome || 'da caravana'}`.slice(0, 120), pix: pixValue, card: cardValue },
      ];
      const result = await callCentral('salvar', {
        policy,
        expected_version: panel.version,
        config_id: panel.config_id,
        request_id: requestId,
        reason: `Ajuste do preço da caravana ${caravana.nome || caravana.id} pela gestão: PIX ${pixValue} e cartão ${cardValue}.`.slice(0, 1000),
      });
      if (result.saved !== true) throw new Error('A gravação não foi confirmada. Reabra a caravana antes de repetir.');
      setRequestId(newRequestId());
      setFeedback({ kind: 'ok', text: 'Preço atualizado. Novos checkouts desta caravana já usam o novo valor; inscrições e cobranças já criadas mantêm o valor registrado.' });
      await load();
    } catch (error) {
      const status = statusOf(error);
      setFeedback({
        kind: 'error',
        text: status === 409
          ? 'Outra pessoa alterou os preços agora. Reabra a caravana para conferir antes de salvar.'
          : (error?.message || 'Não foi possível salvar o preço.'),
      });
      if (status === 409) { setRequestId(newRequestId()); await load(); }
    } finally { setSaving(false); }
  }

  const price = state.price;
  const canEdit = state.panel?.can_edit === true && state.panel?.configured === true;
  const pixValue = parseMoney(pix);
  const cardValue = parseMoney(card) || pixValue;
  const dirty = state.status === 'ok' && Number.isFinite(pixValue) && (pixValue !== price.pix || cardValue !== price.card);
  const titleId = `caravana-preco-${caravana?.id || 'nova'}`;

  return (
    <section className="m31-gestao-price" aria-labelledby={titleId}>
      <div className="m31-gestao-price-head">
        <div>
          <h3 id={titleId}>Preço desta caravana</h3>
          <p className="m31-gestao-muted">Valor aplicado aos novos checkouts desta caravana.</p>
        </div>
        {state.status === 'ok' && <span className={`m31-gestao-price-tag ${price.own ? 'is-own' : ''}`}>{price.own ? 'Condição própria' : 'Condição geral'}</span>}
      </div>
      {state.status === 'loading' && <p className="m31-gestao-muted">Consultando o valor vigente…</p>}
      {state.status === 'error' && <p className="m31-gestao-error" role="alert">{state.error}</p>}
      {state.status === 'ok' && (
        <>
          <div className="m31-gestao-price-current">
            <div><span>PIX</span><strong>{moneyText(price.pix)}</strong></div>
            <div><span>Cartão</span><strong>{moneyText(price.card)}</strong></div>
          </div>
          {canEdit ? (
            <>
              <div className="m31-gestao-fields-grid">
                <div className="m31-gestao-field">
                  <label htmlFor={`${titleId}-pix`}>Novo valor no PIX (R$)</label>
                  <input
                    id={`${titleId}-pix`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={pix}
                    disabled={saving}
                    onChange={(event) => { setPix(event.target.value); setFeedback(null); }}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void save(); } }}
                  />
                </div>
                <div className="m31-gestao-field">
                  <label htmlFor={`${titleId}-cartao`}>Novo valor no cartão (R$)</label>
                  <input
                    id={`${titleId}-cartao`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={card}
                    disabled={saving}
                    onChange={(event) => { setCard(event.target.value); setFeedback(null); }}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void save(); } }}
                  />
                </div>
              </div>
              <div className="m31-gestao-price-actions">
                <button type="button" className="m31-gestao-btn" onClick={save} disabled={saving || !dirty}>
                  {saving ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Save size={17} aria-hidden="true" />}
                  {saving ? 'Salvando…' : 'Salvar preço'}
                </button>
              </div>
            </>
          ) : (
            <p className="m31-gestao-muted">Para alterar este valor é necessário acesso de administrador à central comercial.</p>
          )}
          <p className="m31-gestao-muted">Alterar o preço não modifica inscrições nem cobranças já criadas.</p>
        </>
      )}
      {feedback && <p className={feedback.kind === 'ok' ? 'm31-gestao-success' : 'm31-gestao-error'} role={feedback.kind === 'ok' ? 'status' : 'alert'}>{feedback.text}</p>}
    </section>
  );
}
