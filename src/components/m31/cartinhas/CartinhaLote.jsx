import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search, ClipboardPaste } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cartinhasApi } from '@/lib/m31CartinhasApi';
import { guardarLoteCartinhas, lerLotesCartinhas, removerLoteCartinhas } from './cartinhaDispositivo';
import { prepararEnviosLote, executarEnviosLote } from './cartinhaLoteClient';

const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const novoLote = () => ({ id: crypto.randomUUID(), texto: '', cartas: [], participantes: [], envios: [], dirty: false });
const btn = { minHeight: 56, padding: '10px 16px', border: '1px solid #E2D7DA', borderRadius: 12, fontSize: 18, fontWeight: 650, cursor: 'pointer', background: '#FFF', color: '#5B0E2D' };

export default function CartinhaLote({ autoraId, onClose, onSaved, loteLiberado = false }) {
  const [job, setJob] = useState(novoLote);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [localError, setLocalError] = useState('');
  const [escolhendo, setEscolhendo] = useState(null);
  const [busca, setBusca] = useState('');
  const running = useRef(false);
  const localQueue = useRef(Promise.resolve());
  const alive = useRef(true);

  function persist(value) {
    const task = localQueue.current.catch(() => {}).then(() => guardarLoteCartinhas(autoraId, value));
    localQueue.current = task;
    return task;
  }
  useEffect(() => {
    alive.current = true;
    lerLotesCartinhas(autoraId).then(rows => {
      if (!alive.current) return;
      const saved = rows.find(r => r.dirty && typeof r.texto === 'string' && Array.isArray(r.cartas) && Array.isArray(r.envios));
      if (saved) setJob(saved);
    }).catch(() => { if (alive.current) setLocalError('Não foi possível recuperar a colagem neste dispositivo.'); })
      .finally(() => { if (alive.current) setReady(true); });
    return () => { alive.current = false; };
  }, [autoraId]);
  useEffect(() => {
    if (!ready || busy || !job.texto) return;
    const timer = setTimeout(() => { persist(job).then(() => setLocalError('')).catch(() => setLocalError('A colagem ainda não foi salva no dispositivo. Mantenha esta janela aberta.')); }, 500);
    return () => clearTimeout(timer);
  }, [job, ready, busy]);
  useEffect(() => {
    const guard = event => { if (job.dirty || busy) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [job.dirty, busy]);

  async function fechar() {
    if (running.current) return;
    try { if (job.texto) await persist(job); }
    catch { if (!window.confirm('A colagem não está salva neste dispositivo. Copie o texto antes de fechar. Fechar mesmo assim?')) return; }
    onClose();
  }
  async function identificar() {
    if (running.current || !job.texto.trim()) return;
    running.current = true; setBusy('analisar'); setError('');
    try {
      await persist(job);
      const result = await cartinhasApi.analisarLote(job.texto);
      if (!Array.isArray(result.cartas) || !Array.isArray(result.participantes) || result.cartas.map(c => c.texto).join('') !== job.texto) throw new Error('A identificação não preservou todo o texto. Nenhuma cartinha foi salva.');
      const next = { ...job, cartas: result.cartas, participantes: result.participantes, envios: [], dirty: true };
      await persist(next); setJob(next);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Não foi possível identificar. O texto continua nesta janela.');
    } finally { running.current = false; setBusy(''); }
  }
  function mudarCarta(indice, patch) {
    if (running.current || job.envios.length) return;
    setJob(current => ({ ...current, dirty: true, cartas: current.cartas.map(c => c.indice === indice ? { ...c, ...patch } : c) }));
  }
  async function processar(status) {
    if (running.current) return;
    if (!loteLiberado && (status === 'pronta' || job.envios.some(e => ['aguardando', 'incerto'].includes(e.estado) && ['pronta', 'entregue'].includes(e.payload?.status)))) {
      setError('Conclusão em lote em conferência. Guarde os textos como rascunhos.');
      return;
    }
    running.current = true; setBusy('salvar'); setError('');
    try {
      const envios = job.envios.length ? job.envios : prepararEnviosLote({ cartas: job.cartas, participantes: job.participantes, status, loteId: job.id });
      const next = { ...job, envios, dirty: true };
      await persist(next); setJob(next);
      await executarEnviosLote({
        envios, salvar: cartinhasApi.salvar, continuar: () => alive.current,
        persistir: rows => persist({ ...next, envios: rows, dirty: rows.some(r => r.estado !== 'salvo') }),
        onSaved,
        onProgress: rows => { if (alive.current) setJob({ ...next, envios: rows, dirty: rows.some(r => r.estado !== 'salvo') }); },
      });
    } catch (e) { setError(e?.message || 'O lote foi interrompido. Os itens não confirmados permanecem aqui.'); }
    finally { running.current = false; if (alive.current) setBusy(''); }
  }
  async function recomecar() {
    if (running.current) return;
    if (job.dirty && !window.confirm('Iniciar outra colagem? Copie antes os trechos ainda não importados. As cartinhas já salvas não serão apagadas.')) return;
    try { await localQueue.current.catch(() => {}); await removerLoteCartinhas(autoraId, job.id); }
    catch { setError('Não foi possível encerrar este lote no dispositivo.'); return; }
    setJob(novoLote()); setError(''); setEscolhendo(null);
  }

  const selecionadas = job.cartas.filter(c => c.selecionar).length;
  const salvas = job.envios.filter(e => e.estado === 'salvo').length;
  const repetidos = useMemo(() => {
    const counts = new Map();
    job.cartas.filter(c => c.selecionar && c.inscricao_id).forEach(c => counts.set(c.inscricao_id, (counts.get(c.inscricao_id) || 0) + 1));
    return new Set([...counts].filter(([, n]) => n > 1).map(([id]) => id));
  }, [job.cartas]);
  const cartaEscolha = job.cartas.find(c => c.indice === escolhendo);
  const candidatas = job.participantes.filter(p => busca.trim() ? norm(`${p.nome} ${p.codigo_inscricao} ${p.caravana_nome} ${p.cidade}`).includes(norm(busca)) : !cartaEscolha?.candidatos_ids?.length || cartaEscolha.candidatos_ids.includes(p.id)).slice(0, 30);

  return <Dialog open onOpenChange={open => { if (!open) fechar(); }}>
    <DialogContent className="max-w-3xl w-[calc(100%-24px)] max-h-[92dvh] overflow-y-auto rounded-3xl" onPointerDownOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (running.current) event.preventDefault(); }}>
      <DialogTitle style={{ fontSize: 25, lineHeight: 1.2, color: '#5B0E2D', paddingRight: 24 }}>Colar cartinhas em lote</DialogTitle>
      <DialogDescription style={{ fontSize: 15 }}>Cole todas as mensagens. Confira as destinatárias e salve de uma vez.</DialogDescription>
      {!ready ? <p role="status">Recuperando colagem…</p> : !job.cartas.length ? <>
        <textarea aria-label="Texto com todas as cartinhas" value={job.texto} disabled={!!busy} rows={15}
          placeholder={'Querida Maria da Silva,\nSua primeira cartinha…\n\nQuerida Ana Souza,\nSua segunda cartinha…'}
          onChange={event => { if (event.target.value.length <= 120000) setJob({ ...job, texto: event.target.value, dirty: true }); else setError('Divida este texto em lotes de até 120 mil caracteres.'); }}
          onPaste={event => { const el = event.currentTarget; if (job.texto.length - (el.selectionEnd - el.selectionStart) + event.clipboardData.getData('text/plain').length > 120000) { event.preventDefault(); setError('O lote excede 120 mil caracteres. Cole em duas partes; nenhum conteúdo foi cortado.'); } }}
          style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #D9CDD3', borderRadius: 12, padding: 16, fontSize: 18, lineHeight: 1.65, minHeight: 300 }} />
        <button type="button" onClick={identificar} disabled={!!busy || !job.texto.trim()} style={{ ...btn, background: '#5B0E2D', color: '#FFF', opacity: busy || !job.texto.trim() ? 0.6 : 1 }}><ClipboardPaste size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />{busy === 'analisar' ? 'Identificando…' : 'Identificar cartinhas'}</button>
      </> : <>
        <div role="status" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 15 }}>
          <strong>{job.envios.length ? `${salvas} de ${job.envios.length} salvas` : `${job.cartas.length} mensagens · ${selecionadas} selecionadas`}</strong>
          {!busy && <button type="button" onClick={recomecar} style={{ border: 0, background: 'none', color: '#5B0E2D', textDecoration: 'underline' }}>Nova colagem</button>}
        </div>
        {job.cartas.map(c => {
          const p = job.participantes.find(p => p.id === c.inscricao_id);
          const envio = job.envios.find(e => e.indice === c.indice);
          const bloqueada = p?.tem_texto || ['pronta', 'entregue'].includes(p?.cartinha_status) || !c.texto.trim() || c.texto.length > 50000;
          return <section key={c.indice} style={{ border: '1px solid #E7DEE1', borderRadius: 12, padding: 14, background: envio?.estado === 'salvo' ? '#FBF5E8' : '#FFF' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <input aria-label={`Selecionar cartinha ${c.indice + 1}`} type="checkbox" checked={!!c.selecionar} disabled={!!busy || !!job.envios.length || !p || bloqueada} onChange={e => mudarCarta(c.indice, { selecionar: e.target.checked })} style={{ width: 20, height: 20, marginTop: 4 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: 'block', color: '#5B0E2D', fontSize: 19, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{p?.nome || c.nome_detectado || 'Destinatária não identificada'}</strong>
                {p && <span style={{ fontSize: 16, color: '#685D64' }}>{[p.caravana_nome, p.cidade, p.codigo_inscricao].filter(Boolean).join(' · ')}</span>}
                {!job.envios.length && <button type="button" disabled={!!busy} onClick={() => { setEscolhendo(escolhendo === c.indice ? null : c.indice); setBusca(''); }} style={{ display: 'block', minHeight: 40, border: 0, background: 'none', color: '#5B0E2D', fontSize: 16, textDecoration: 'underline' }}>{p ? 'Trocar destinatária' : 'Escolher participante'}</button>}
              </div>
              {envio?.estado === 'salvo' && <Check size={24} aria-label="Salva" color="#5B0E2D" />}
            </div>
            {escolhendo === c.indice && !job.envios.length && <div style={{ background: '#FAF7F8', padding: 12, borderRadius: 10, marginTop: 8 }}>
              <label><Search size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />Buscar participante
                <input autoFocus value={busca} onChange={e => setBusca(e.target.value)} style={{ display: 'block', width: '100%', minHeight: 44, border: '1px solid #D9CDD3', borderRadius: 8, padding: 10, marginTop: 6, boxSizing: 'border-box', fontSize: 16 }} />
              </label>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>{candidatas.map(pessoa => <button type="button" key={pessoa.id} onClick={() => { mudarCarta(c.indice, { inscricao_id: pessoa.id, selecionar: !pessoa.tem_texto && !['pronta', 'entregue'].includes(pessoa.cartinha_status) }); setEscolhendo(null); }} style={{ display: 'block', width: '100%', textAlign: 'left', minHeight: 48, background: 'none', border: 0, borderBottom: '1px solid #E7DEE1', padding: '10px 4px' }}><strong>{pessoa.nome}</strong><br /><span style={{ fontSize: 13 }}>{[pessoa.cidade, pessoa.caravana_nome, pessoa.codigo_inscricao].filter(Boolean).join(' · ')}</span></button>)}</div>
            </div>}
            {(c.aviso || bloqueada || repetidos.has(c.inscricao_id) || envio?.erro) && <p role="status" style={{ color: '#5B0E2D', fontSize: 16, marginBottom: 0 }}>{envio?.erro || (repetidos.has(c.inscricao_id) ? 'Duas mensagens selecionadas para esta participante. Desmarque uma delas.' : p?.tem_texto || ['pronta', 'entregue'].includes(p?.cartinha_status) ? 'Já possui cartinha. O lote não substituirá o texto existente.' : c.aviso)}</p>}
            <details style={{ marginTop: 10 }}><summary style={{ cursor: 'pointer', minHeight: 40, color: '#57434C', fontSize: 15 }}>Ver cartinha</summary><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 16, lineHeight: 1.6 }}>{c.texto}</p></details>
          </section>;
        })}
        {!job.envios.length ? <div style={{ position: 'sticky', bottom: -24, background: '#FFF', padding: '14px 0', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button type="button" onClick={() => processar('em_elaboracao')} disabled={!!busy || !selecionadas || repetidos.size > 0} style={{ ...btn, flex: 1 }}>Salvar rascunhos</button>
          <button type="button" onClick={() => processar('pronta')} disabled={!loteLiberado || !!busy || !selecionadas || repetidos.size > 0} style={{ ...btn, flex: 1, background: '#5B0E2D', color: '#FFF', opacity: loteLiberado ? 1 : 0.6 }}>{loteLiberado ? `✓ Concluir ${selecionadas} cartinhas` : 'Conclusão em conferência'}</button>
        </div> : <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {job.envios.some(e => ['incerto', 'aguardando'].includes(e.estado)) && <button type="button" onClick={() => processar()} disabled={!!busy} style={{ ...btn, background: '#5B0E2D', color: '#FFF' }}>{busy ? 'Salvando…' : 'Continuar lote'}</button>}
          {!busy && <button type="button" onClick={fechar} style={btn}>Voltar à lista</button>}
        </div>}
      </>}
      {(error || localError) && <p role="alert" style={{ color: '#5B0E2D', fontSize: 15 }}>{error || localError}</p>}
    </DialogContent>
  </Dialog>;
}
