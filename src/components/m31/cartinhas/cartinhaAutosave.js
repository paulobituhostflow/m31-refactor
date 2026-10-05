import { cartinhasErrorMessage, cartinhasErrorStatus } from '../../../lib/m31CartinhasApi.js';
import { tipoDestinatariaCartinha } from '../../../../worker/functions/m31Cartinhas/cartinhaPadrao.js';

/** Uma fila por editor. Retry mantém UUID e payload. Atualização da lista não entra nesta fila. */
export function createCartinhaAutosave({ inscricao, save, onSaved, storage, delay = 1200, setTimer = setTimeout, clearTimer = clearTimeout, online = () => globalThis.navigator?.onLine !== false, uuid = () => crypto.randomUUID() }) {
  let record = inscricao;
  let savedText = record.cartinha_texto || '';
  let savedStatus = record.cartinha_status || 'pendente';
  let savedSupport = record.cartinha_suporte || 'digital';
  let pending = null;
  let state = { text: savedText, status: savedStatus, support: savedSupport, version: record.cartinha_versao || 0, titularRef: record.titular_ref, dirty: false, saving: false, localSaved: false, localSaving: false, offline: !online(), error: '', localError: '', conflict: false, ready: !storage };
  let timer = null, disposed = false, revision = 0;
  let queue = Promise.resolve(), localQueue = Promise.resolve();
  const listeners = new Set();
  const emit = patch => { state = { ...state, ...patch }; if (!disposed) listeners.forEach(fn => fn(state)); };
  const cancelTimer = () => { if (timer !== null) clearTimer(timer); timer = null; };
  const snapshot = () => ({ tipoDestinataria: tipoDestinatariaCartinha(record), text: state.text, status: state.status, version: state.version, titularRef: state.titularRef, support: state.support, savedSupport, savedText, savedStatus, pending, dirty: state.dirty, updatedAt: new Date().toISOString() });
  function localCopy() {
    if (!storage) return Promise.resolve(false);
    const value = snapshot(), rev = revision;
    emit({ localSaving: true });
    const task = localQueue.then(() => storage.write(value)).then(() => {
      if (revision === rev) emit({ localSaved: true, localSaving: false, localError: '' });
      return true;
    }).catch(() => {
      emit({ localSaved: false, localSaving: false, localError: 'Não foi possível salvar no dispositivo. Mantenha esta tela aberta ou copie o texto.' });
      return false;
    });
    localQueue = task.then(() => {});
    return task;
  }
  function schedule() {
    cancelTimer();
    if (state.ready && state.dirty && !state.conflict && online() && !disposed) timer = setTimer(() => { timer = null; persist().catch(() => {}); }, delay);
  }
  // Descoberta de rascunho: olha as cópias desta autora+inscrição de QUALQUER aba
  // (inclusive abas fechadas / navegador reiniciado — a cópia vive no dispositivo,
  // não na sessão da aba) e retoma a MAIS RECENTE. Conflitos de titular/versão
  // ficam preservados para revisão humana; nada é aplicado automaticamente.
  const ready = storage ? Promise.resolve()
    .then(() => (storage.readAll ? storage.readAll() : storage.read().then(local => [local])))
    .then(candidatos => {
      const local = (Array.isArray(candidatos) ? candidatos : [])
        .filter(c => c && (c.dirty || c.pending) && typeof c.text === 'string')
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0] || null;
      if (local) {
        const mismatch = local.titularRef !== state.titularRef;
        // Uma resposta perdida pode explicar a versão diferente. Somente o retry
        // exato do UUID no servidor resolve isso; nunca usar last-write-wins.
        const versionChanged = local.version !== state.version && !local.pending;
        savedText = local.savedText ?? savedText;
        savedStatus = local.savedStatus ?? savedStatus;
        savedSupport = local.savedSupport || savedSupport;
        pending = local.pending || null;
        emit({ text: local.text, status: local.status, support: local.support || 'digital', version: local.version, titularRef: local.titularRef, dirty: true, localSaved: true,
          conflict: mismatch || versionChanged,
          error: mismatch || versionChanged ? 'Há um rascunho local de outra versão ou titular. Copie-o para revisão; ele não será aplicado automaticamente.' : '' });
        // A cópia escolhida passa a viver na chave desta aba; a original de outra
        // aba permanece até o servidor aceitar o texto (autoridade do Base44).
        return storage.write({ ...local, updatedAt: new Date().toISOString() }).catch(() => {});
      }
    })
    .then(() => { emit({ ready: true }); schedule(); })
    .catch(() => { emit({ ready: true, localError: 'A cópia local está indisponível. O salvamento no servidor continua disponível.' }); }) : Promise.resolve();

  async function flush(requestedStatus, requestedRevision) {
    await ready;
    if (state.conflict) throw Object.assign(new Error(state.error), { status: 409 });
    if (requestedStatus && requestedRevision === revision) emit({ status: requestedStatus, dirty: state.text !== savedText || requestedStatus !== savedStatus || state.support !== savedSupport });
    // Enquanto offline, finalizações aguardam o servidor: não contam para impressão/metas.
    if (!online()) { emit({ offline: true }); await localCopy(); return null; }
    emit({ saving: true, offline: false });
    try {
      // Uma tentativa com resposta incerta é sempre resolvida primeiro, sem alterar seu corpo.
      if (!pending) {
        if (!state.dirty) return record;
        const status = state.status === 'pendente' ? 'em_elaboracao' : state.status;
        if (['pronta', 'entregue'].includes(status) && !state.text.trim() && state.support !== 'fisica') throw Object.assign(new Error('Texto vazio.'), { status: 422 });
        pending = { inscricao_id: record.id, texto: state.text, status, versao: state.version, titular_ref: state.titularRef, id_transacao: uuid(), suporte: state.support, ...(state.support === 'fisica' && ['pronta', 'entregue'].includes(status) ? { confirmar_fisica: true } : {}) };
      }
      await localCopy();
      const sent = pending;
      const updated = await save(sent);
      if (!updated || updated.id !== record.id || !Number.isSafeInteger(updated.cartinha_versao) || typeof updated.cartinha_texto !== 'string') throw new Error('Resposta de salvamento inválida.');
      record = updated; savedText = updated.cartinha_texto; savedStatus = updated.cartinha_status; savedSupport = updated.cartinha_suporte || 'digital';
      pending = null;
      const newerText = state.text !== sent.texto || state.support !== (sent.suporte || 'digital');
      const status = newerText && ['pronta', 'entregue'].includes(savedStatus) ? 'revisar_cartinha' : newerText ? state.status : savedStatus;
      // Nome/assinatura inseridos pelo servidor não são uma nova edição local.
      // Uma edição feita durante o envio, porém, nunca é substituída.
      const text = newerText ? state.text : savedText;
      emit({ text, status, version: updated.cartinha_versao, titularRef: updated.titular_ref, dirty: text !== savedText || status !== savedStatus || state.support !== savedSupport, error: '', offline: false });
      await localCopy();
      // Servidor aceitou: cópias de outras abas desta inscrição ficam aposentadas.
      // Não apagar rascunhos de outras abas: podem conter texto novo ainda não enviado.
      onSaved?.(updated);
      if (state.dirty) schedule();
      return updated;
    } catch (error) {
      const code = cartinhasErrorStatus(error);
      if (code === 409) emit({ conflict: true });
      // 422 rejeitou definitivamente a requisição; o texto continua local para correção.
      if (code === 422) {
        pending = null;
        const aviso = error?.response?.data?.error || error?.message || '';
        if (/^Confirme a destinatária/.test(aviso)) {
          // A conclusão foi recusada, não o texto: manter o próximo salvamento
          // como rascunho/revisão, sem insistir indefinidamente em "pronta".
          const status = ['pronta', 'entregue'].includes(savedStatus) ? 'revisar_cartinha' : 'em_elaboracao';
          emit({ status, dirty: state.text !== savedText || status !== savedStatus });
        }
      }
      emit({ error: cartinhasErrorMessage(error), offline: !online() });
      await localCopy();
      throw error;
    } finally { emit({ saving: false }); }
  }
  function persist(requestedStatus) {
    cancelTimer();
    const requestedRevision = revision;
    const task = queue.then(async () => {
      // Resolve um envio antigo antes da conclusão explícita, conservando seu UUID.
      if (requestedStatus && pending) await flush();
      const updated = await flush(requestedStatus, requestedRevision);
      // A confirmação foi feita sobre o texto visível. Se o backend exigiu revisão
      // porque a versão anterior estava pronta, confirme esta versão sem outro clique.
      if (requestedStatus === 'pronta' && revision === requestedRevision && !state.dirty && state.status === 'revisar_cartinha')
        return flush(requestedStatus, requestedRevision);
      return updated;
    });
    queue = task.catch(() => {});
    return task;
  }
  return {
    ready,
    getSnapshot: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    edit(value) {
      if (disposed || !state.ready) return;
      const text = typeof value === 'function' ? value(state.text) : value;
      if (typeof text !== 'string' || text.length > 50000) return;
      revision++;
      const status = ['pronta', 'entregue'].includes(state.status) ? 'revisar_cartinha' : state.status;
      emit({ text, status, dirty: text !== savedText || status !== savedStatus || state.support !== savedSupport, localSaved: false, error: state.conflict ? state.error : '' });
      localCopy(); schedule();
    },
    setSupport(support) {
      if (disposed || !state.ready || !['digital', 'fisica'].includes(support) || support === state.support) return;
      revision++;
      const status = ['pronta', 'entregue'].includes(state.status) ? 'revisar_cartinha' : state.status;
      emit({ support, status, dirty: true, localSaved: false });
      localCopy(); schedule();
    },
    save: persist,
    reconnect() { emit({ offline: !online() }); return state.conflict ? Promise.resolve(null) : persist(); },
    setOffline() { emit({ offline: true }); cancelTimer(); return localCopy(); },
    canLeave(confirm) { return !(state.dirty || state.saving) || confirm(state.localSaved ? 'Há texto salvo só neste dispositivo. Ele será retomado nesta aba. Sair do editor?' : 'Há texto ainda não salvo. Copie-o antes de sair. Sair mesmo assim?'); },
    dispose() { cancelTimer(); localCopy(); disposed = true; listeners.clear(); },
  };
}