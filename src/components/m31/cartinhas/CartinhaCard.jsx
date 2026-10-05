import { useState } from 'react';
import { Check, PenLine, Sparkles, RotateCcw } from 'lucide-react';
import { titleCase } from './cartinhaUtils';

const ROTULOS = { pendente: 'A escrever', em_elaboracao: 'Rascunho', revisar_cartinha: 'Revisar cartinha', pronta: 'Pronta', entregue: 'Entregue' };

/** Cartão autoral: identidade primeiro; os detalhes ficam no editor, sem apagar dados. */
export default function CartinhaCard({ inscricao: i, onAbrir, onConcluir, onDesmarcar, concluindo }) {
  const status = i.cartinha_status || 'pendente';
  const feita = ['pronta', 'entregue'].includes(status);
  const [confirmarDesmarcar, setConfirmarDesmarcar] = useState(false);
  const contexto = [i.caravana_nome ? `Caravana ${titleCase(i.caravana_nome)}` : null, i.cidade ? titleCase(i.cidade) : null].filter(Boolean).join(' · ');
  return <article className="m31-carta-card">
    <button type="button" className="m31-carta-card__nome" onClick={() => onAbrir(i)}>{titleCase(i.nome)}</button>
    <div className="m31-carta-card__situacao">
      <span data-pronta={feita}>{feita && <Check size={20} aria-hidden="true" />}{i.cartinha_conferir_destinataria ? 'Revisar destinatária' : ROTULOS[status] || 'Revisar cartinha'}</span>
      {i.ja_participou_m31 === false && <span className="m31-carta-card__primeiro"><Sparkles size={18} aria-hidden="true" />PRIMEIRO M31</span>}
      {i.cartinha_suporte === 'fisica' && <span>Carta física</span>}
    </div>
    {contexto && <p className="m31-carta-card__origem">{contexto}</p>}
    {i.presenteado_por_id && i.abencoada_por_nome && <p className="m31-carta-card__origem">Abençoada por {i.abencoada_por_nome}</p>}
    {confirmarDesmarcar ? <div className="m31-carta-card__confirmacao">
      <p>Voltar esta cartinha para a escrita?</p>
      <div className="m31-carta-card__acoes">
        <button type="button" className="m31-escrita-botao" onClick={() => setConfirmarDesmarcar(false)} disabled={concluindo}>Cancelar</button>
        <button type="button" className="m31-escrita-botao m31-escrita-botao--principal" onClick={() => { onDesmarcar(i); setConfirmarDesmarcar(false); }} disabled={concluindo}>Desmarcar</button>
      </div>
    </div> : <div className="m31-carta-card__acoes">
      <button type="button" className={`m31-escrita-botao ${feita ? '' : 'm31-escrita-botao--principal'}`} onClick={() => onAbrir(i)}><PenLine size={22} aria-hidden="true" />{feita ? 'Abrir carta' : 'Escrever'}</button>
      <button type="button" className="m31-escrita-botao" onClick={() => feita ? setConfirmarDesmarcar(true) : onConcluir(i)} disabled={concluindo || (!feita && i.cartinha_conferir_destinataria === true)} aria-label={feita ? `Desmarcar carta de ${i.nome}` : `Concluir carta de ${i.nome}`}>
        {feita ? <RotateCcw size={22} aria-hidden="true" /> : <Check size={22} aria-hidden="true" />}{concluindo ? 'Salvando…' : feita ? 'Desmarcar' : 'Concluir'}
      </button>
    </div>}
  </article>;
}
