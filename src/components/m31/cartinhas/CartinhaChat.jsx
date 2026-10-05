import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Mic, RotateCcw, Send, UsersRound, X } from 'lucide-react';
import { cartinhasApi, CARTINHAS_QUERY_KEY } from '@/lib/m31CartinhasApi';
import { useQueryClient } from '@tanstack/react-query';
import './cartinhaChat.css';

const CINCO_MIN = 5 * 60 * 1000;
const hora = value => {
  const d = new Date(value || Date.now());
  return Number.isFinite(d.getTime()) ? d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Recife'}) : '';
};
const keyLocal = autoraId => `m31-cartinhas-chat:${autoraId}`;
function lerLocal(autoraId) {
  try { const v=JSON.parse(localStorage.getItem(keyLocal(autoraId))||'[]'); return Array.isArray(v)?v:[]; } catch { return []; }
}
function gravarLocal(autoraId, rows) {
  try { localStorage.setItem(keyLocal(autoraId),JSON.stringify(rows.slice(-100))); return true; } catch { return false; }
}
function podeRedirecionar(msg, now=Date.now()) {
  return msg.status==='enviado' && !msg.redirecionada && msg.pode_redirecionar_ate && now <= Date.parse(msg.pode_redirecionar_ate);
}

export default function CartinhaChat({ autoraId, loteLiberado, onClose, onVoluntarias }) {
  const qc=useQueryClient();
  const [texto,setTexto]=useState('');
  const [mensagens,setMensagens]=useState(()=>lerLocal(autoraId));
  const [filtros,setFiltros]=useState({excluir_comunidade:false,excluir_caravanas:false});
  const [filtroAberto,setFiltroAberto]=useState(false);
  const [gravando,setGravando]=useState(false);
  const [erro,setErro]=useState('');
  const [agora,setAgora]=useState(Date.now());
  const fimRef=useRef(null);
  const recognitionRef=useRef(null);

  useEffect(()=>{ let ativo=true; cartinhasApi.chatListar().then(r=>{
    if(!ativo) return;
    const server=(r.mensagens||[]).map(m=>({...m,id:m.id_transacao,status:'enviado'}));
    const locais=lerLocal(autoraId).filter(l=>!server.some(s=>s.id===l.id));
    setMensagens([...server,...locais].slice(-100));
  }).catch(()=>{}); return()=>{ativo=false;};},[autoraId]);
  useEffect(()=>{gravarLocal(autoraId,mensagens); requestAnimationFrame(()=>fimRef.current?.scrollIntoView({behavior:'instant',block:'end'}));},[mensagens,autoraId]);
  useEffect(()=>{const t=setInterval(()=>setAgora(Date.now()),10000);return()=>clearInterval(t);},[]);
  useEffect(()=>()=>{try{recognitionRef.current?.stop();}catch{}},[]);
  useEffect(()=>{
    const html=document.documentElement, body=document.body;
    const prev={htmlOverflow:html.style.overflow,bodyOverflow:body.style.overflow,bodyPosition:body.style.position,bodyWidth:body.style.width};
    html.style.overflow='hidden'; body.style.overflow='hidden'; body.style.position='fixed'; body.style.width='100%';
    return()=>{html.style.overflow=prev.htmlOverflow;body.style.overflow=prev.bodyOverflow;body.style.position=prev.bodyPosition;body.style.width=prev.bodyWidth;};
  },[]);

  const filtroLabel=useMemo(()=>{
    if(filtros.excluir_comunidade&&filtros.excluir_caravanas) return 'Sem comunidade e caravanas';
    if(filtros.excluir_comunidade) return 'Fora da comunidade';
    if(filtros.excluir_caravanas) return 'Fora das caravanas';
    return 'Todas elegíveis';
  },[filtros]);

  async function enviarExistente(msg) {
    setErro('');
    setMensagens(rows=>rows.map(m=>m.id===msg.id?{...m,status:'enviando',erro:''}:m));
    try {
      const r=await cartinhasApi.chatEnviar({texto:msg.texto,id_transacao:msg.id,filtros:msg.filtros});
      setMensagens(rows=>rows.map(m=>m.id===msg.id?{...m,...r.mensagem,id:msg.id,status:'enviado'}:m));
      qc.invalidateQueries({queryKey:CARTINHAS_QUERY_KEY});
    } catch(e) {
      const aviso=e?.message||e?.response?.data?.error||'Não foi possível enviar.';
      setMensagens(rows=>rows.map(m=>m.id===msg.id?{...m,status:'falhou',erro:aviso}:m));
    }
  }
  function enviar() {
    const value=texto.trim();
    if(!value) return;
    if(!loteLiberado){setErro('A distribuição ainda está em conferência. Sua palavra permanece no campo.');return;}
    const msg={id:crypto.randomUUID(),texto:value,status:'enviando',criada_em:new Date().toISOString(),filtros:{...filtros}};
    setTexto('');
    setMensagens(rows=>[...rows,msg]);
    enviarExistente(msg);
  }
  async function redirecionar(msg) {
    if(!podeRedirecionar(msg)) return;
    setMensagens(rows=>rows.map(m=>m.id===msg.id?{...m,status:'redirecionando'}:m));
    try{
      const r=await cartinhasApi.chatRedirecionar({entrada_id:msg.entrada_id,id_transacao:crypto.randomUUID()});
      setMensagens(rows=>rows.map(m=>m.id===msg.id?{...m,...r.mensagem,id:msg.id,status:'enviado'}:m));
      qc.invalidateQueries({queryKey:CARTINHAS_QUERY_KEY});
    }catch(e){
      setMensagens(rows=>rows.map(m=>m.id===msg.id?{...m,status:'enviado',erro:e?.message||'Não foi possível redirecionar.'}:m));
    }
  }
  function ditar() {
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){setErro('O ditado do navegador não está disponível neste aparelho. Use o microfone do teclado ou digite normalmente.');return;}
    if(gravando){recognitionRef.current?.stop();return;}
    const r=new SR(); recognitionRef.current=r; r.lang='pt-BR'; r.interimResults=true; r.continuous=true;
    let base=texto;
    r.onstart=()=>setGravando(true);
    r.onend=()=>setGravando(false);
    r.onerror=()=>{setGravando(false);setErro('O ditado foi interrompido. O texto reconhecido foi preservado.');};
    r.onresult=e=>{let final='',temp='';for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0]?.transcript||'';if(e.results[i].isFinal)final+=t;else temp+=t;} setTexto([base,final,temp].filter(Boolean).join(base?' ':'').trimStart()); if(final){base=[base,final].filter(Boolean).join(base?' ':'');}};
    r.start();
  }

  return <section className="m31-chat" aria-label="Soltar a Palavra">
    <header className="m31-chat__header">
      <button type="button" className="m31-chat__icon" onClick={onClose} aria-label="Voltar"><ArrowLeft size={25}/></button>
      <div className="m31-chat__title"><strong>Soltar a Palavra</strong><span>{loteLiberado?'Distribuição ativa':'Em conferência'}</span></div>
      <button type="button" className="m31-chat__filter" onClick={()=>setFiltroAberto(v=>!v)} aria-expanded={filtroAberto}>{filtroLabel}<ChevronDown size={18}/></button>
    </header>
    {filtroAberto&&<div className="m31-chat__menu">
      <label><input type="checkbox" checked={filtros.excluir_comunidade} onChange={e=>setFiltros(f=>({...f,excluir_comunidade:e.target.checked}))}/>Excluir Comunidade Mulheres de Fé</label>
      <label><input type="checkbox" checked={filtros.excluir_caravanas} onChange={e=>setFiltros(f=>({...f,excluir_caravanas:e.target.checked}))}/>Excluir caravanas</label>
      <button type="button" onClick={onVoluntarias}><UsersRound size={19}/>Voluntárias</button>
    </div>}
    <main className="m31-chat__history">
      {!mensagens.length&&<div className="m31-chat__empty"><strong>Escreva livremente.</strong><span>Envie como uma mensagem.</span></div>}
      {mensagens.map(msg=><article key={msg.id} className={`m31-chat__row ${msg.redirecionada?'is-redirected':''}`}>
        <div className="m31-chat__bubble" onClick={()=>msg.status==='falhou'&&enviarExistente(msg)} role={msg.status==='falhou'?'button':undefined} tabIndex={msg.status==='falhou'?0:undefined}>
          <p>{msg.texto}</p>
          <div className="m31-chat__meta">
            {msg.status==='enviando'&&<span>Enviando…</span>}
            {msg.status==='falhou'&&<span>⚠️ Não enviado · tocar para tentar novamente</span>}
            {msg.status==='redirecionando'&&<span>Redirecionando…</span>}
            {msg.status==='enviado'&&<span>{msg.redirecionada&&msg.destinataria_anterior?<><s>{msg.destinataria_anterior}</s> → </>:null}✨ Para: {msg.destinataria} · {hora(msg.enviada_em)}</span>}
            {msg.status==='enviado'&&<Check size={15}/>}
          </div>
        </div>
        {podeRedirecionar(msg,agora)&&<button type="button" className="m31-chat__undo" onClick={()=>redirecionar(msg)}><RotateCcw size={16}/>Conheço ela</button>}
        {msg.erro&&msg.status==='enviado'&&<span className="m31-chat__inline-error">{msg.erro}</span>}
      </article>)}
      <div ref={fimRef}/>
    </main>
    {erro&&<div className="m31-chat__error" role="alert"><span>{erro}</span><button onClick={()=>setErro('')} aria-label="Fechar"><X size={18}/></button></div>}
    <footer className="m31-chat__composer">
      <textarea rows={1} value={texto} onChange={e=>setTexto(e.target.value.slice(0,50000))} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();enviar();}}}
        placeholder="Escreva uma palavra…" aria-label="Escrever palavra profética"/>
      <button type="button" className={`m31-chat__send ${texto.trim()?'has-text':''} ${gravando?'is-recording':''}`} onClick={texto.trim()?enviar:ditar}
        aria-label={texto.trim()?'Enviar palavra':gravando?'Parar ditado':'Ditar palavra'}>
        {texto.trim()?<Send size={23}/>:<Mic size={24}/>}
      </button>
    </footer>
  </section>;
}
