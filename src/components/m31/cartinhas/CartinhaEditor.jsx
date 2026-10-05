import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { montarViewportEditor } from './cartinhaViewport';
import './cartinhaEditor.css';
import { SpellCheck, WandSparkles, Check, X, CheckCheck, Undo2, Info, Sparkles } from 'lucide-react';
import { titleCase } from './cartinhaUtils';
import { copilotoCorrigir, copilotoComplementar, solicitarSugestao, ocorreUmaVez } from './cartinhaIA';
import CartinhaResumoOrigem from './CartinhaResumoOrigem';
import useCartinhaAutosave from './useCartinhaAutosave';
import { cartinhasApi } from '@/lib/m31CartinhasApi';

const C = { text: '#1a1a2e', sec: '#6b7280', border: '#e8ecf3', brand: '#5B0E2D', success: '#5B0E2D', ghost: '#7c8494' };
const ERRO_PADRAO = 'Não foi possível gerar uma sugestão válida. Tente novamente.';

export default function CartinhaEditor({ inscricao, onClose, onSaved, onAdvance }) {
  const autosave = useCartinhaAutosave(inscricao, onSaved);
  const texto = autosave.text;
  const setTexto = autosave.setText;
  const [saving, setSaving] = useState(null);
  const salvandoRef = useRef(false);
  const [acaoRodando, setAcaoRodando] = useState(null);
  const [erroIA, setErroIA] = useState('');
  const [avisoIA, setAvisoIA] = useState('');
  const [resumoAberto, setResumoAberto] = useState(false);
  const [copilotoAberto, setCopilotoAberto] = useState(false);
  const [acoesAberto, setAcoesAberto] = useState(false);
  const editorRef = useRef(null);
  useLayoutEffect(() => montarViewportEditor(editorRef.current), []);
  const [historico, setHistorico] = useState(null);
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [erroHistorico, setErroHistorico] = useState('');

  // ── Copiloto inline (sem segunda tela) ──
  const [sugestoes, setSugestoes] = useState([]);   // correções {id, trecho_original, trecho_corrigido, motivo, status}
  const [ghost, setGhost] = useState(null);          // { texto, pos, base } — continuação sugerida
  const [undoStack, setUndoStack] = useState([]);

  const textareaRef = useRef(null);
  const textoRef = useRef(texto);
  useEffect(() => { textoRef.current = texto; }, [texto]);

  const pendentes = sugestoes.filter(s => s.status === 'pendente' && ocorreUmaVez(texto, s.trecho_original));

  const nomeFmt = titleCase(inscricao.nome);
  const primeiroNome = nomeFmt.split(' ')[0];

  function limparMensagens() { setErroIA(''); setAvisoIA(''); }

  // ── CORRIGIR: lista de correções exibida abaixo do editor (sem trocar de tela) ──
  async function rodarCorrigir() {
    if (acaoRodando || !texto.trim() || autosave.offline || !autosave.ready) return;
    setAcaoRodando('corrigir');
    limparMensagens();
    const textoBase = texto;
    try {
      if (autosave.dirty || autosave.saving) await autosave.save();
      const { sugestoes: novas } = await copilotoCorrigir({ texto: textoBase, inscricao, versao: autosave.getSnapshot().version, titular_ref:autosave.getSnapshot().titularRef });
      const validas = novas.filter(s => ocorreUmaVez(textoRef.current, s.trecho_original));
      if (novas.length === 0) {
        setAvisoIA('Nenhuma correção necessária ✓');
      } else if (validas.length === 0) {
        setAvisoIA('O texto foi alterado depois desta análise. Rode "Corrigir" de novo.');
      } else {
        if (validas.length < novas.length && textoRef.current !== textoBase) {
          setAvisoIA('O texto foi alterado depois desta análise. Revise antes de aplicar.');
        }
        // substitui a lista anterior pelas novas correções válidas
        setSugestoes(validas);
      }
    } catch {
      setErroIA(ERRO_PADRAO);
    } finally {
      setAcaoRodando(null);
    }
  }

  // ── COMPLEMENTAR: a continuação aparece como sugestão temporária abaixo do editor ──
  async function rodarComplementar() {
    if (acaoRodando || autosave.offline || !autosave.ready) return;
    setAcaoRodando('complementar');
    limparMensagens();
    const textoBase = texto;
    const pos = textareaRef.current?.selectionStart ?? textoBase.length;
    try {
      if (autosave.dirty || autosave.saving) await autosave.save();
      const cont = await copilotoComplementar({
        antes: textoBase.slice(0, pos),
        depois: textoBase.slice(pos),
        inscricao,
        versao: autosave.getSnapshot().version,
        titular_ref:autosave.getSnapshot().titularRef,
      });
      if (textoRef.current !== textoBase) {
        // texto mudou durante o processamento — inserção usa cursor atual
        setGhost({ texto: cont, pos: null, base: textoRef.current });
        setAvisoIA('O texto foi alterado. Posicione o cursor onde deseja inserir e toque em "Inserir".');
      } else {
        setGhost({ texto: cont, pos, base: textoBase });
      }
    } catch {
      setErroIA(ERRO_PADRAO);
    } finally {
      setAcaoRodando(null);
    }
  }

  async function rodarSugestao(modo) {
    if (acaoRodando || autosave.offline || !autosave.ready) return;
    setAcaoRodando(modo);
    limparMensagens();
    const base = texto;
    const start = textareaRef.current?.selectionStart ?? base.length;
    const end = textareaRef.current?.selectionEnd ?? start;
    const trecho = base.slice(start, end);
    if (modo === 'desenvolver' && !trecho.trim()) {
      setAvisoIA('Selecione no texto o trecho que deseja desenvolver.');
      setAcaoRodando(null);
      return;
    }
    try {
      if (autosave.dirty || autosave.saving) await autosave.save();
      const sugestao = await solicitarSugestao({ inscricao, texto: base, modo, trecho, versao: autosave.getSnapshot().version, titular_ref:autosave.getSnapshot().titularRef });
      if (textoRef.current !== base) {
        setAvisoIA('O texto mudou durante a análise. Solicite a sugestão novamente para não substituir suas alterações.');
        return;
      }
      setGhost({ texto: sugestao, pos: start, end, base, modo });
    } catch {
      setErroIA(ERRO_PADRAO);
    } finally {
      setAcaoRodando(null);
    }
  }

  async function verHistorico() {
    setHistoricoAberto(value => !value);
    if (historico) return;
    try {
      const result = await cartinhasApi.historico(inscricao.id);
      setHistorico(result.historico || []);
      setErroHistorico('');
    } catch { setErroHistorico('Não foi possível carregar o histórico.'); }
  }

  // ── Aplicações (sempre com versão anterior local para desfazer) ──
  function snapshot() { setUndoStack(u => [...u.slice(-19), texto]); }

  function aceitarSugestao(s) {
    if (!ocorreUmaVez(texto, s.trecho_original)) {
      setAvisoIA('O texto foi alterado depois desta análise. Revise antes de aplicar.');
      setSugestoes(prev => prev.map(x => x.id === s.id ? { ...x, status: 'recusada' } : x));
      return;
    }
    snapshot();
    setTexto(t => t.replace(s.trecho_original, s.trecho_corrigido));
    setSugestoes(prev => prev.map(x => x.id === s.id ? { ...x, status: 'aceita' } : x));
  }

  function recusarSugestao(s) {
    setSugestoes(prev => prev.map(x => x.id === s.id ? { ...x, status: 'recusada' } : x));
  }

  function aceitarTodas() {
    snapshot();
    setTexto(t => {
      let novo = t;
      for (const s of pendentes) {
        if (ocorreUmaVez(novo, s.trecho_original)) novo = novo.replace(s.trecho_original, s.trecho_corrigido);
      }
      return novo;
    });
    setSugestoes(prev => prev.map(x => x.status === 'pendente' ? { ...x, status: 'aceita' } : x));
  }

  function aceitarGhost() {
    if (!ghost) return;
    if (ghost.base !== textoRef.current && ['completa', 'desenvolver'].includes(ghost.modo)) {
      setAvisoIA('O texto mudou. Solicite uma nova sugestão antes de substituir o conteúdo.');
      return;
    }
    if (ghost.modo === 'completa' || ghost.modo === 'desenvolver') {
      snapshot();
      setTexto(ghost.modo === 'completa' ? ghost.texto : texto.slice(0, ghost.pos) + ghost.texto + texto.slice(ghost.end));
      setGhost(null);
      setAvisoIA('');
      return;
    }
    const cont = ghost.texto;
    // se o texto mudou ou não há pos salva, usa o cursor atual; senão usa o pos salvo
    const textoAtual = textoRef.current;
    const pos = (ghost.pos != null && ghost.base === textoAtual)
      ? Math.min(ghost.pos, textoAtual.length)
      : (textareaRef.current?.selectionStart ?? textoAtual.length);
    const antes = textoAtual.slice(0, pos);
    const sep = antes && !/\s$/.test(antes) ? ' ' : '';
    snapshot();
    setTexto(antes + sep + cont + textoAtual.slice(pos));
    setGhost(null);
    setAvisoIA('');
    const newPos = (antes + sep + cont).length;
    setTimeout(() => {
      const el = textareaRef.current;
      if (el) { el.focus({ preventScroll: true }); el.setSelectionRange(newPos, newPos); }
    }, 0);
  }

  function descartarGhost() {
    setGhost(null);
    setAvisoIA('');
  }

  function desfazer() {
    setUndoStack(u => {
      if (!u.length) return u;
      setTexto(u[u.length - 1]);
      return u.slice(0, -1);
    });
  }

  // ── Salvamento privado e serializado (autosave nunca regride o status) ──
  async function salvar(novoStatus, fechar, avancar = false) {
    if (salvandoRef.current) return;
    salvandoRef.current = true;
    setSaving(novoStatus || 'rascunho');
    try {
      const updated = await autosave.save(novoStatus);
      const snapshot = autosave.getSnapshot();
      if (updated && !snapshot?.dirty && (!novoStatus || snapshot.status === novoStatus)) {
        if (avancar && onAdvance) onAdvance(updated);
        else if (fechar) onClose();
      }
    } catch {
      // The controller retains the author's text and exposes a visible error.
    } finally {
      salvandoRef.current = false;
      setSaving(null);
    }
  }

  const totalPendencias = pendentes.length + (ghost ? 1 : 0);

  const mensagemSalvo = !autosave.ready ? 'Recuperando rascunho…'
    : autosave.saving ? 'Salvando…'
    : autosave.dirty ? (autosave.localSaved
      ? autosave.offline ? 'Salvo no dispositivo (offline)' : 'Salvo no dispositivo · aguardando envio'
      : autosave.localError ? 'Não salvo no dispositivo' : 'Salvando no dispositivo…')
    : 'Salvo no Base44 ✓';
  const feedback = autosave.localError || autosave.error || erroIA || avisoIA
    || (autosave.status === 'revisar_cartinha' ? `${mensagemSalvo} · Revisar a destinatária antes de concluir.` : mensagemSalvo);
  function fecharPaineis() { setResumoAberto(false); setCopilotoAberto(false); setAcoesAberto(false); }

  return createPortal(
    <section ref={editorRef} className="m31-editor" data-layout-version="keyboard-stable-v1"
      role="dialog" aria-modal="true" aria-labelledby="cartinha-destinataria">
      <header className="m31-editor__header">
        <div className="m31-editor__header-inner">
          <div className="m31-editor__identity">
            <button type="button" data-editor-initial-focus onClick={() => autosave.close(onClose)} aria-label="Voltar à lista"
              className="m31-editor__button" style={{ width: 44, flexShrink: 0, padding: 0, fontSize: 24 }}>←</button>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h1 id="cartinha-destinataria" className="m31-editor__name">{nomeFmt}</h1>
              {inscricao.ja_participou_m31 === false && <span style={{ display: 'inline-block', fontSize: 16, fontWeight: 700, marginTop: 4 }}><Sparkles size={18} aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 6 }} /> PRIMEIRO M31</span>}
            </div>
          </div>
          <div className="m31-editor__actions">
            <button type="button" onClick={() => { setResumoAberto(v => !v); setCopilotoAberto(false); setAcoesAberto(false); }}
              aria-expanded={resumoAberto} aria-controls="cartinha-mais-informacoes" className="m31-editor__button">
              <Info size={18} /> Mais informações
            </button>
            <button type="button" onClick={() => salvar('pronta', true, true)}
              disabled={!!saving || autosave.conflict || !autosave.ready || (!texto.trim() && autosave.support !== 'fisica')}
              className="m31-editor__button m31-editor__button--primary">
              <Check size={18} /> {saving === 'pronta' ? 'Concluindo…' : onAdvance ? 'Concluir e avançar' : 'Concluir cartinha'}
            </button>
          </div>
        </div>
      </header>

      <div className="m31-editor__workspace">
        {/* Mesmo textarea durante toda a edição. Crescimento do texto só altera a rolagem interna. */}
        <textarea ref={textareaRef} className="m31-editor__text" value={texto}
          onChange={e => setTexto(e.target.value)} disabled={!autosave.ready} maxLength={50000}
          aria-label={`Cartinha para ${nomeFmt}`} aria-describedby="cartinha-feedback"
          lang="pt-BR" autoCapitalize="sentences" spellCheck wrap="soft"
          onPaste={event => {
            const pasted = event.clipboardData.getData('text/plain');
            const el = event.currentTarget;
            if (texto.length - (el.selectionEnd - el.selectionStart) + pasted.length > 50000) {
              event.preventDefault(); setAvisoIA('Este texto excede 50 mil caracteres. A colagem foi interrompida sem cortar o conteúdo.');
            }
          }}
          placeholder={`Querida ${primeiroNome},\n\nEscreva aqui a cartinha...`} />
        <p id="cartinha-feedback" className="m31-editor__feedback" role="status" aria-live="polite"
          data-error={!!(autosave.error || autosave.localError || erroIA)}>{feedback}</p>

        <aside id="cartinha-mais-informacoes" className="m31-editor__panel" hidden={!resumoAberto} aria-label="Mais informações da destinatária">
          <div className="m31-editor__panel-header"><h2>Mais informações</h2><button type="button" className="m31-editor__button" onClick={fecharPaineis}>Voltar à escrita</button></div>
          <CartinhaResumoOrigem inscricao={inscricao} />
          <button type="button" onClick={verHistorico} className="m31-editor__button" style={{ marginTop: 12 }}>Ver histórico da cartinha</button>
          {historicoAberto && <div style={{ fontSize: 16, marginTop: 12 }}>
            {erroHistorico || (historico === null ? 'Carregando…' : historico.length === 0 ? 'Nenhuma versão anterior.' : historico.map((item, index) => <details key={index}>
              <summary>{item.nome || item.titular_nome || 'Versão anterior'} · {item.data || item.atualizada_em || item.criado_em || ''}</summary>
              <p style={{ whiteSpace: 'pre-wrap' }}>{item.texto}</p>
            </details>))}
          </div>}
        </aside>
        <aside className="m31-editor__panel" id="cartinha-copiloto" hidden={!copilotoAberto} aria-label="Copiloto da Ju">
          <div className="m31-editor__panel-header"><h2>Copiloto da Ju</h2><button type="button" className="m31-editor__button" onClick={fecharPaineis}>Voltar à escrita</button></div>
        {/* Sugestão de continuação (ghost) — card compacto em cinza/itálico, no mesmo editor */}
        {ghost && (
          <div style={{
            marginTop: '8px', border: `1.5px solid #d9c3c8`, borderRadius: '10px',
            background: 'rgba(139,26,43,0.04)', padding: '12px',
          }}>
            <div style={{ fontSize: '16px', fontWeight: '700', color: C.brand, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
              Sugestão para sua revisão
            </div>
            <em style={{
              display: 'block', color: C.ghost, fontStyle: 'italic',
              fontSize: '15px', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {ghost.texto}
            </em>
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <button onClick={aceitarGhost} style={{
                flex: 1, padding: '10px', background: C.brand, color: '#fff', border: 'none', borderRadius: '9px',
                fontSize: '16px', fontWeight: '700', cursor: 'pointer', fontFamily: 'Inter,sans-serif',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}><Check size={15} /> Aceitar sugestão</button>
              <button onClick={descartarGhost} style={{
                padding: '10px 14px', background: '#fff', color: C.sec, border: `1px solid ${C.border}`, borderRadius: '9px',
                fontSize: '16px', fontWeight: '700', cursor: 'pointer', fontFamily: 'Inter,sans-serif',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}><X size={15} /> Descartar</button>
            </div>
          </div>
        )}

        {/* Correções — lista compacta abaixo do editor, sem trocar de tela */}
        {pendentes.length > 0 && (
          <div style={{ marginTop: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ fontSize: '16px', fontWeight: '700', color: C.brand, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {pendentes.length} correç{pendentes.length === 1 ? 'ão' : 'ões'}
              </span>
              <div style={{ flex: 1 }} />
              {pendentes.length > 1 && (
                <button onClick={aceitarTodas} style={{
                  display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px',
                  background: '#fff', color: C.success, border: `1px solid ${C.border}`, borderRadius: '100px',
                  fontSize: '16px', fontWeight: '700', cursor: 'pointer', fontFamily: 'Inter,sans-serif',
                }}><CheckCheck size={13} /> Aceitar todas</button>
              )}
              {undoStack.length > 0 && (
                <button onClick={desfazer} style={{
                  display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px',
                  background: '#fff', color: C.sec, border: `1px solid ${C.border}`, borderRadius: '100px',
                  fontSize: '16px', fontWeight: '700', cursor: 'pointer', fontFamily: 'Inter,sans-serif',
                }}><Undo2 size={13} /> Desfazer</button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {pendentes.map(s => (
                <div key={s.id} style={{
                  background: '#fbfbfc', border: `1px solid ${C.border}`, borderRadius: '10px', padding: '10px 12px',
                }}>
                  <div style={{ fontSize: '14px', lineHeight: 1.5 }}>
                    <span style={{ textDecoration: 'line-through', color: '#b91c1c' }}>{s.trecho_original}</span>
                    <span style={{ color: C.sec }}> → </span>
                    <span style={{ color: C.success, fontWeight: '600' }}>{s.trecho_corrigido}</span>
                  </div>
                  {s.motivo && (
                    <div style={{ fontSize: '16px', color: C.sec, marginTop: '4px' }}>{s.motivo}</div>
                  )}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <button onClick={() => aceitarSugestao(s)} style={{
                      padding: '7px 12px', background: C.brand, color: '#fff', border: 'none', borderRadius: '8px',
                      fontSize: '16px', fontWeight: '700', cursor: 'pointer', fontFamily: 'Inter,sans-serif',
                      display: 'flex', alignItems: 'center', gap: '5px',
                    }}><Check size={14} /> Aceitar</button>
                    <button onClick={() => recusarSugestao(s)} style={{
                      padding: '7px 12px', background: '#fff', color: C.sec, border: `1px solid ${C.border}`, borderRadius: '8px',
                      fontSize: '16px', fontWeight: '700', cursor: 'pointer', fontFamily: 'Inter,sans-serif',
                      display: 'flex', alignItems: 'center', gap: '5px',
                    }}><X size={14} /> Recusar</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Copiloto — sempre visível, no mesmo editor */}
        <div style={{ margin: '10px 0 12px' }}>
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '7px' }}>
            Copiloto da Ju
          </div>
          <div style={{ display: 'flex', gap: '7px' }}>
            <BotaoAcao Icon={SpellCheck} label="Corrigir texto" rodando={acaoRodando === 'corrigir'} desabilitado={!!acaoRodando || !texto.trim()} onClick={rodarCorrigir} />
            <BotaoAcao Icon={WandSparkles} label="Complementar com IA" rodando={acaoRodando === 'complementar'} desabilitado={!!acaoRodando} onClick={rodarComplementar} />
          </div>
          <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', marginTop: '7px' }}>
            {[['completa', 'Gerar completa'], ['versiculo', 'Sugerir versículo'], ['frase', 'Sugerir frase'], ['desenvolver', 'Desenvolver trecho']].map(([modo, label]) =>
              <BotaoAcao key={modo} Icon={WandSparkles} label={label} rodando={acaoRodando === modo} desabilitado={!!acaoRodando || !!saving || autosave.conflict} onClick={() => rodarSugestao(modo)} />
            )}
          </div>

        </div>

        </aside>
        <aside className="m31-editor__panel" id="cartinha-acoes" hidden={!acoesAberto} aria-label="Ações da cartinha">
          <div className="m31-editor__panel-header"><h2>Ações da cartinha</h2><button type="button" className="m31-editor__button" onClick={fecharPaineis}>Voltar à escrita</button></div>
          <div className="m31-editor__extras">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, fontSize: 16 }}>
              <input type="checkbox" checked={autosave.support === 'fisica'} onChange={event => autosave.setSupport(event.target.checked ? 'fisica' : 'digital')}
                disabled={!autosave.ready || !!saving || autosave.conflict} style={{ width: 22, height: 22 }} />
              Carta física concluída (sem transcrição obrigatória)
            </label>
            <button type="button" onClick={() => salvar('entregue', true)}
              disabled={!!saving || (!texto.trim() && autosave.support !== 'fisica') || autosave.conflict || !autosave.ready || !['pronta', 'entregue'].includes(autosave.status)}
              className="m31-editor__button">{saving === 'entregue' ? 'Salvando…' : '✓ Marcar entregue'}</button>
          </div>
        </aside>
      </div>
      <footer className="m31-editor__footer">
        <button type="button" onClick={() => salvar(undefined, false)} disabled={!!saving || autosave.conflict || !autosave.ready}
          className="m31-editor__button">{saving === 'rascunho' ? 'Salvando…' : 'Salvar rascunho'}</button>
        <button type="button" onClick={() => { setCopilotoAberto(v => !v); setResumoAberto(false); setAcoesAberto(false); }}
          aria-expanded={copilotoAberto} aria-controls="cartinha-copiloto" className="m31-editor__button">
          Copiloto{totalPendencias > 0 ? ` (${totalPendencias})` : ''}
        </button>
        <button type="button" onClick={() => { setAcoesAberto(v => !v); setResumoAberto(false); setCopilotoAberto(false); }}
          aria-expanded={acoesAberto} aria-controls="cartinha-acoes" className="m31-editor__button">Mais ações</button>
      </footer>
    </section>, document.body
  );
}

function BotaoAcao({ Icon, label, rodando, desabilitado, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={desabilitado}
      style={{
        flex: 1, padding: '11px', background: rodando ? '#f3eef0' : '#fff',
        color: C.brand, border: `1.5px solid ${C.brand}`, borderRadius: '9px',
        fontSize: '16px', fontWeight: '700', cursor: desabilitado ? 'default' : 'pointer',
        fontFamily: 'Inter,sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
        opacity: desabilitado && !rodando ? 0.45 : 1, whiteSpace: 'nowrap',
      }}
    >
      {rodando ? (
        <span style={{ width: '13px', height: '13px', border: `2px solid rgba(139,26,43,0.3)`, borderTopColor: C.brand, borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
      ) : (
        <Icon size={14} />
      )}
      {label}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </button>
  );
}
