import { useEffect, useRef, useState } from 'react';
import { cartinhasApi } from '@/lib/m31CartinhasApi';
import { createCartinhaAutosave } from './cartinhaAutosave';
import { copiaCartinha, abaCartinhas, marcarEditorAberto, limparEditorAberto } from './cartinhaDispositivo';
import { useCartinhasAutora } from './CartinhasSessao';

export default function useCartinhaAutosave(inscricao, onSaved) {
  const controllerRef = useRef(null);
  const autora = useCartinhasAutora();
  const tabId = useRef(null);
  if (!tabId.current) tabId.current = abaCartinhas();
  const inputRef = useRef(inscricao);
  inputRef.current = inscricao;
  const callbackRef = useRef(onSaved);
  callbackRef.current = onSaved;
  const [state, setState] = useState({ text: inscricao?.cartinha_texto || '', status: inscricao?.cartinha_status || 'pendente', version: inscricao?.cartinha_versao || 0, dirty: false, saving: false, error: '', conflict: false });

  useEffect(() => {
    if (!inputRef.current) return;
    const storage = autora?.id ? copiaCartinha(autora.id, inputRef.current.id, tabId.current) : undefined;
    const controller = createCartinhaAutosave({ inscricao: inputRef.current, save: cartinhasApi.salvar, storage, onSaved: updated => callbackRef.current?.(updated) });
    controllerRef.current = controller;
    setState(controller.getSnapshot());
    const unsubscribe = controller.subscribe(setState);
    const beforeUnload = event => {
      const snapshot = controller.getSnapshot();
      if (!snapshot.dirty && !snapshot.saving) return;
      event.preventDefault();
      event.returnValue = '';
    };
    // Presença: sinaliza editor ativo para a sincronização de fundo não concorrer.
    const inscricaoId = inputRef.current?.id;
    marcarEditorAberto(inscricaoId, tabId.current);
    const heartbeat = window.setInterval(() => marcarEditorAberto(inscricaoId, tabId.current), 60000);
    const reconnect = () => { if (!document.hidden) controller.reconnect().catch(() => {}); };
    const offline = () => { controller.setOffline(); };
    const retry = window.setInterval(reconnect, 30000);
    window.addEventListener('online', reconnect);
    window.addEventListener('offline', offline);
    window.addEventListener('focus', reconnect);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.clearInterval(retry);
      window.clearInterval(heartbeat);
      window.removeEventListener('online', reconnect);
      window.removeEventListener('offline', offline);
      window.removeEventListener('focus', reconnect);
      window.removeEventListener('beforeunload', beforeUnload);
      limparEditorAberto(inscricaoId, tabId.current);
      unsubscribe();
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [inscricao?.id, autora?.id]);

  return {
    ...state,
    setText: value => controllerRef.current?.edit(value),
    save: status => controllerRef.current?.save(status),
    setSupport: value => controllerRef.current?.setSupport(value),
    getSnapshot: () => controllerRef.current?.getSnapshot(),
    close: onClose => {
      if (!controllerRef.current || controllerRef.current.canLeave(message => window.confirm(message))) onClose();
    },
  };
}