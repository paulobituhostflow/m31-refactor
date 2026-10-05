import { useState } from 'react';
import { Settings2, X } from 'lucide-react';
import { resumoMacroCartinhas } from './cartinhaMetas';
import './cartinhaPainel.css';

/** Inteligência visual: cadastro real e planejamento de 1.000 permanecem conceitualmente separados. */
export default function CartinhaHero({ stats, config, onSaveConfig, saving, dia, children }) {
  const [editMeta,setEditMeta]=useState(false);
  const [dataEvento,setDataEvento]=useState(config?.cartinha_data_evento||'');
  const totalConfirmado=Number.isSafeInteger(stats.total)?stats.total:null;
  const concluidas=Number.isSafeInteger(stats.concluidasAuditadas)?stats.concluidasAuditadas:null;
  const resumo=concluidas===null?null:resumoMacroCartinhas({concluidas,dataEvento:config?.cartinha_data_evento,dia});
  const dias=Number.isFinite(resumo?.diasRestantes)?resumo.diasRestantes:null;
  const meta=Number.isFinite(resumo?.metaDiaria)?resumo.metaDiaria:null;
  return <section className="m31-escrita-resumo" aria-label="Planejamento das cartinhas">
    <header className="m31-escrita-resumo__cabecalho">
      <div><h1>Cartinhas da Ju</h1><span className="m31-escrita-resumo__autora">Pastora Juliana Beltrão</span></div>
      <button type="button" className="m31-escrita-ajuste" aria-label="Ajustar prazo das cartinhas" aria-expanded={editMeta} onClick={()=>{if(!editMeta)setDataEvento(config?.cartinha_data_evento||'');setEditMeta(v=>!v)}}>{editMeta?<X size={24}/>:<Settings2 size={24}/>}</button>
    </header>

    <div className="m31-escrita-tempo">
      <strong>{dias ?? '—'}</strong><span>{dias===1?'dia para o M31':'dias para o M31'}</span>
    </div>

    <div className="m31-escrita-inteligencia">
      <div><strong>{totalConfirmado===null?'—':totalConfirmado.toLocaleString('pt-BR')}</strong><span>inscritas</span></div>
      <div><strong>{concluidas===null?'—':concluidas.toLocaleString('pt-BR')}</strong><span>cartinhas feitas</span></div>
      <div><strong>{resumo===null?'—':`${resumo.progresso.toLocaleString('pt-BR',{maximumFractionDigits:1})}%`}</strong><span>das 1.000</span></div>
    </div>

    <div className="m31-escrita-progresso" role="progressbar" aria-label="Progresso das 1000 cartinhas planejadas" aria-valuemin={0} aria-valuemax={1000} aria-valuenow={concluidas===null?undefined:Math.min(1000,concluidas)}><div style={{width:`${resumo?.progresso||0}%`}} /></div>

    <div className="m31-escrita-ritmo">
      <span>Meta de hoje</span><strong>{meta===null?'—':`${meta} cartinhas`}</strong>
    </div>

    {children}
    {editMeta&&<form className="m31-escrita-prazo" onSubmit={async e=>{e.preventDefault();const ok=await onSaveConfig({dataEvento});if(ok)setEditMeta(false)}}>
      <label htmlFor="cartinhas-data-prazo">Concluir até</label><div><input id="cartinhas-data-prazo" type="date" required value={dataEvento} disabled={saving} onChange={e=>setDataEvento(e.target.value)}/><button type="submit" disabled={saving||!dataEvento}>{saving?'Salvando…':'Salvar prazo'}</button></div>
    </form>}
  </section>;
}
