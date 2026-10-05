/** Controle de viewport do editor WEB. Não altera texto, sessão, dados ou autosave.
 * A viewport visual acompanha teclado/barras do navegador. Não usamos altura do
 * conteúdo, scrollIntoView, temporizadores por tecla ou zoom desabilitado.
 */
export function medirViewportEditor(win) {
  const vv = win.visualViewport;
  // Durante pinch-to-zoom não reposicionar o modal: preserve o zoom/pan do usuário.
  if (vv && Number.isFinite(vv.scale) && Math.abs(vv.scale - 1) > 0.02) return null;
  const height = Number.isFinite(vv?.height) && vv.height > 0 ? vv.height : win.innerHeight;
  if (!Number.isFinite(height) || height <= 0) return null;
  return { height: Math.round(height), top: Math.max(0, Math.round(vv?.offsetTop || 0)) };
}

function aplicarEstilos(element, values) {
  const previous = Object.keys(values).map(key => [key, element.style.getPropertyValue(key), element.style.getPropertyPriority(key)]);
  for (const [key, value] of Object.entries(values)) element.style.setProperty(key, value);
  return () => {
    for (const [key, value, priority] of previous) {
      // Não remover estilos que outro componente tenha alterado depois.
      if (element.style.getPropertyValue(key) !== values[key]) continue;
      if (value) element.style.setProperty(key, value, priority);
      else element.style.removeProperty(key);
    }
  };
}

export function montarViewportEditor(element, win = window, doc = document) {
  const x = win.scrollX || 0, y = win.scrollY || 0;
  const anterior = doc.activeElement;
  const background = doc.getElementById('root');
  const anteriorInert = background?.inert;
  let frame = null, disposed = false;
  const events = [];
  const ouvir = (target, event, fn, options) => {
    target?.addEventListener(event, fn, options);
    events.push(() => target?.removeEventListener(event, fn, options));
  };
  const gutter = Math.max(0, win.innerWidth - doc.documentElement.clientWidth);
  const padding = parseFloat(win.getComputedStyle(doc.body).paddingRight) || 0;
  const restaurarHtml = aplicarEstilos(doc.documentElement, { overflow: 'hidden', 'scroll-behavior': 'auto' });
  const restaurarBody = aplicarEstilos(doc.body, {
    position: 'fixed', top: `${-y}px`, left: `${-x}px`, width: '100%',
    overflow: 'hidden', 'box-sizing': 'border-box',
    ...(gutter ? { 'padding-right': `${padding + gutter}px` } : {}),
  });
  // O editor fica em portal fora de #root: o fundo não recebe foco nem toque.
  if (background && !background.contains(element)) background.inert = true;
  const tinhaClasse = doc.body.classList.contains('m31-editor-page-locked');
  doc.body.classList.add('m31-editor-page-locked');

  const meta = doc.querySelector('meta[name="viewport"]');
  const metaAnterior = meta?.getAttribute('content');
  let metaEditor;
  if (meta) {
    metaEditor = (metaAnterior || 'width=device-width, initial-scale=1').split(',')
      .map(s => s.trim()).filter(s => !/^(?:maximum-scale|minimum-scale|user-scalable|interactive-widget)\s*=/i.test(s))
      .concat('interactive-widget=resizes-visual').join(', ');
    meta.setAttribute('content', metaEditor);
  }

  function atualizar() {
    frame = null;
    if (disposed) return;
    const active = doc.activeElement;
    element.dataset.typing = String(element.contains(active) && active?.matches?.('textarea, input:not([type="checkbox"]):not([type="radio"]), [contenteditable="true"]') === true);
    const size = medirViewportEditor(win);
    if (!size) return;
    for (const [key, value] of [['--m31-editor-height', `${size.height}px`], ['--m31-editor-top', `${size.top}px`]]) {
      if (element.style.getPropertyValue(key) !== value) element.style.setProperty(key, value);
    }
  }
  function agendar() { if (!disposed && frame === null) frame = win.requestAnimationFrame(atualizar); }
  function foco() {
    const active = doc.activeElement;
    element.dataset.typing = String(element.contains(active) && active?.matches?.('textarea, input:not([type="checkbox"]):not([type="radio"]), [contenteditable="true"]') === true);
    agendar();
  }
  function teclado(event) {
    if (event.key !== 'Tab') return;
    const items = [...element.querySelectorAll('button:not(:disabled), a[href], textarea:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')]
      .filter(el => !el.closest('[hidden]') && el.getClientRects().length > 0);
    if (!items.length) { event.preventDefault(); return; }
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && (doc.activeElement === first || !element.contains(doc.activeElement))) {
      event.preventDefault(); last.focus({ preventScroll: true });
    } else if (!event.shiftKey && (doc.activeElement === last || !element.contains(doc.activeElement))) {
      event.preventDefault(); first.focus({ preventScroll: true });
    }
  }
  atualizar();
  ouvir(win.visualViewport, 'resize', agendar, { passive: true });
  ouvir(win.visualViewport, 'scroll', agendar, { passive: true });
  ouvir(win, 'resize', agendar, { passive: true });
  ouvir(doc, 'focusin', foco);
  ouvir(doc, 'focusout', agendar);
  ouvir(element, 'keydown', teclado);
  const primeiro = element.querySelector('[data-editor-initial-focus]');
  primeiro?.focus({ preventScroll: true }); // não abrir o teclado sem gesto da autora

  return () => {
    disposed = true;
    if (frame !== null) win.cancelAnimationFrame(frame);
    events.forEach(remove => remove());
    restaurarBody();
    // Restaurar a posição sem smooth-scroll e sem alterar o cursor de outra tela.
    win.scrollTo({ left: x, top: y, behavior: 'instant' });
    restaurarHtml();
    if (background && !background.contains(element)) background.inert = anteriorInert;
    if (!tinhaClasse) doc.body.classList.remove('m31-editor-page-locked');
    if (meta && meta.getAttribute('content') === metaEditor) {
      if (metaAnterior === null) meta.removeAttribute('content'); else meta.setAttribute('content', metaAnterior);
    }
    if (anterior?.isConnected) anterior.focus?.({ preventScroll: true });
    element.style.removeProperty('--m31-editor-height');
    element.style.removeProperty('--m31-editor-top');
  };
}
