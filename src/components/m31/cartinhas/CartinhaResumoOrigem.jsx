import { Church, Bus, MapPin, Hash, User, Gift, Sparkles, UsersRound } from 'lucide-react';
import { titleCase } from './cartinhaUtils';

function Linha({ icon: Icon, rotulo, valor }) {
  if (!valor) return null;
  return <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 0' }}>
    <Icon size={24} color="#5B0E2D" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 16, color: '#705C65', marginBottom: 5 }}>{rotulo}</div>
      <div style={{ fontSize: 19, fontWeight: 600, color: '#30232A', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{valor}</div>
    </div>
  </div>;
}

/** Apenas contexto confirmado e útil à escrita, sem campos vazios ou contatos operacionais. */
export default function CartinhaResumoOrigem({ inscricao: i }) {
  return <div>
    <Linha icon={User} rotulo="Nome completo" valor={titleCase(i.nome)} />
    <Linha icon={Church} rotulo="Igreja" valor={i.nome_igreja?.trim() ? titleCase(i.nome_igreja) : null} />
    <Linha icon={Bus} rotulo="Caravana" valor={i.caravana_nome?.trim() ? titleCase(i.caravana_nome) : null} />
    <Linha icon={MapPin} rotulo="Cidade" valor={i.cidade ? `${titleCase(i.cidade)}${i.estado ? ` / ${i.estado.toUpperCase()}` : ''}` : null} />
    {i.ja_participou_m31 === false && <Linha icon={Sparkles} rotulo="Participação" valor="PRIMEIRO M31" />}
    {i.ja_participou_m31 === true && <p style={{ fontSize: 18 }}>Já participou de M31 anteriormente.</p>}
    {i.como_conheceu === 'Comunidade Mulheres de Fé' && <Linha icon={UsersRound} rotulo="Como conheceu" valor="Comunidade Mulheres de Fé" />}
    {i.presenteado_por_id && <Linha icon={Gift} rotulo="Abençoada por" valor={i.abencoada_por_nome || 'Nome a confirmar'} />}
    {i.observacoes && <p style={{ fontSize: 18, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{i.observacoes}</p>}
    <Linha icon={Hash} rotulo="Identificação da cartinha" valor={i.codigo_inscricao} />
  </div>;
}
