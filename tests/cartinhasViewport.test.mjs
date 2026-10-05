import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { medirViewportEditor, montarViewportEditor } from '../src/components/m31/cartinhas/cartinhaViewport.js';

// DOM/teclado sintéticos: sem banco, cartas reais, credenciais ou chamadas de rede.
function target(extra = {}) {
  const listeners = new Map();
  return { ...extra,
    addEventListener(k, fn) { if (!listeners.has(k)) listeners.set(k, new Set()); listeners.get(k).add(fn); },
    removeEventListener(k, fn) { listeners.get(k)?.delete(fn); },
    dispatch(k, event = {}) { for (const fn of listeners.get(k) || []) fn(event); },
    total() { return [...listeners.values()].reduce((n, s) => n + s.size, 0); },
  };
}
function element(extra = {}) {
  const values = new Map(), classes = new Set();
  let writes = 0;
  return target({ ...extra, dataset: {},
    classList: { contains: k => classes.has(k), add: k => classes.add(k), remove: k => classes.delete(k) },
    style: {
      getPropertyValue: k => values.get(k)?.[0] || '', getPropertyPriority: k => values.get(k)?.[1] || '',
      setProperty(k, v, p = '') { writes++; values.set(k, [v, p]); }, removeProperty: k => values.delete(k),
    }, writes: () => writes,
  });
}
function fixture() {
  const body = element(), html = element({ clientWidth: 390 });
  const background = element({ inert: false, contains: () => false });
  const textarea = { value: 'Texto sintético com acentos.', matches: () => true };
  const previous = { isConnected: true, focus: options => { previous.focusOptions = options; } };
  const doc = target({ body, documentElement: html, activeElement: previous, getElementById: () => background });
  const first = { focus: options => { doc.activeElement = first; first.options = options; }, matches: () => false };
  const root = element({ contains: node => node === textarea || node === first,
    querySelector: () => first, querySelectorAll: () => [] });
  let content = 'width=device-width, initial-scale=1, user-scalable=no, maximum-scale=1';
  const meta = { getAttribute: () => content, setAttribute: (k, v) => { content = v; }, removeAttribute: () => { content = null; } };
  doc.querySelector = () => meta;
  const frames = new Map(); let seq = 0;
  const vv = target({ height: 844, offsetTop: 0, scale: 1 });
  const win = target({ scrollX: 0, scrollY: 620, innerWidth: 390, innerHeight: 844, visualViewport: vv,
    getComputedStyle: () => ({ paddingRight: '0' }),
    requestAnimationFrame(fn) { frames.set(++seq, fn); return seq; },
    cancelAnimationFrame(id) { frames.delete(id); },
    scrollTo(value) { win.restored = value; },
  });
  const frame = () => { const jobs = [...frames.values()]; frames.clear(); jobs.forEach(fn => fn()); };
  return { root, win, vv, doc, body, background, textarea, previous, first, meta, frame, frames };
}

test('viewport visual acomoda teclado sem usar altura do texto', () => {
  assert.deepEqual(medirViewportEditor({ innerHeight: 844, visualViewport: { height: 452.4, offsetTop: 16.2, scale: 1 } }), { height: 452, top: 16 });
});
test('fallback sem visualViewport e métricas inválidas', () => {
  assert.deepEqual(medirViewportEditor({ innerHeight: 700 }), { height: 700, top: 0 });
  assert.equal(medirViewportEditor({ innerHeight: 0 }), null);
});
test('zoom do usuário não é tratado como teclado', () => {
  assert.equal(medirViewportEditor({ innerHeight: 844, visualViewport: { height: 300, offsetTop: 80, scale: 2 } }), null);
});
test('abertura guarda rolagem e não dá foco automático ao textarea', () => {
  const f = fixture(); const dispose = montarViewportEditor(f.root, f.win, f.doc);
  assert.equal(f.body.style.getPropertyValue('top'), '-620px');
  assert.equal(f.background.inert, true);
  assert.equal(f.doc.activeElement, f.first); assert.deepEqual(f.first.options, { preventScroll: true });
  assert.equal(f.root.style.getPropertyValue('--m31-editor-height'), '844px'); dispose();
});
test('vários eventos do teclado são consolidados em um quadro', () => {
  const f = fixture(); const dispose = montarViewportEditor(f.root, f.win, f.doc);
  f.vv.height = 460; f.vv.offsetTop = 37;
  for (let n = 0; n < 12; n++) { f.vv.dispatch('resize'); f.vv.dispatch('scroll'); }
  assert.equal(f.frames.size, 1); f.frame();
  assert.equal(f.root.style.getPropertyValue('--m31-editor-height'), '460px');
  assert.equal(f.root.style.getPropertyValue('--m31-editor-top'), '37px');
  assert.equal(f.textarea.value, 'Texto sintético com acentos.'); dispose();
});
test('eventos sem mudança real não reescrevem geometria', () => {
  const f = fixture(); const dispose = montarViewportEditor(f.root, f.win, f.doc); const before = f.root.writes();
  f.vv.dispatch('resize'); f.frame(); assert.equal(f.root.writes(), before); dispose();
});
test('foco pausa animações e blur volta ao estado normal sem alterar texto', () => {
  const f = fixture(); const dispose = montarViewportEditor(f.root, f.win, f.doc);
  f.doc.activeElement = f.textarea; f.doc.dispatch('focusin'); f.frame(); assert.equal(f.root.dataset.typing, 'true');
  f.doc.activeElement = f.first; f.doc.dispatch('focusout'); f.frame(); assert.equal(f.root.dataset.typing, 'false'); dispose();
});
test('fechar restaura rolagem, fundo, meta e remove listeners', () => {
  const f = fixture(); const before = f.meta.getAttribute(); const dispose = montarViewportEditor(f.root, f.win, f.doc);
  assert.ok(!f.meta.getAttribute().includes('user-scalable=no'));
  f.vv.dispatch('resize'); dispose();
  assert.equal(f.frames.size, 0); assert.equal(f.vv.total() + f.win.total() + f.doc.total() + f.root.total(), 0);
  assert.equal(f.background.inert, false); assert.equal(f.body.style.getPropertyValue('position'), '');
  assert.deepEqual(f.win.restored, { left: 0, top: 620, behavior: 'instant' });
  assert.equal(f.meta.getAttribute(), before); assert.deepEqual(f.previous.focusOptions, { preventScroll: true });
});
test('pinch durante edição preserva as últimas dimensões estáveis', () => {
  const f = fixture(); const dispose = montarViewportEditor(f.root, f.win, f.doc);
  f.vv.scale = 1.8; f.vv.height = 260; f.vv.dispatch('resize'); f.frame();
  assert.equal(f.root.style.getPropertyValue('--m31-editor-height'), '844px'); dispose();
});
test('campo fixo, feedback reservado e painéis não participam do fluxo do texto', () => {
  const css = readFileSync(new URL('../src/components/m31/cartinhas/cartinhaEditor.css', import.meta.url), 'utf8');
  assert.ok(css.includes('grid-template-rows: minmax(0, 1fr) 48px'));
  assert.ok(css.includes('resize: none')); assert.ok(css.includes('font-size: 18px'));
  assert.match(css, /\.m31-editor__panel\s*\{\s*position: absolute/);
  assert.ok(css.includes('prefers-reduced-motion'));
});
test('editor tem portal e um único textarea sem autofocus ou auto-grow', () => {
  const source = readFileSync(new URL('../src/components/m31/cartinhas/CartinhaEditor.jsx', import.meta.url), 'utf8');
  assert.equal((source.match(/<textarea\b/g) || []).length, 1);
  assert.ok(source.includes('return createPortal(')); assert.ok(source.includes('document.body'));
  assert.ok(!source.includes('scrollHeight')); assert.ok(!source.includes('autoFocus'));
  assert.ok(source.includes('onChange={e => setTexto(e.target.value)}'));
});
test('listas pausam em segundo plano sem desativar autosave nem travas', () => {
  const page = readFileSync(new URL('../src/pages/M31Cartinhas.jsx', import.meta.url), 'utf8');
  const hook = readFileSync(new URL('../src/components/m31/cartinhas/useCartinhaAutosave.js', import.meta.url), 'utf8');
  assert.ok(page.includes('enabled: !escritaAberta'));
  assert.ok(page.includes('notifyOnChangeProps: escritaAberta ? [] : undefined'));
  assert.ok(page.includes('cartinha_lote_liberado === true'));
  assert.ok(hook.includes('controller.reconnect()')); assert.ok(hook.includes('save: cartinhasApi.salvar'));
});
