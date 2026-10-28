import { useEffect, useState } from 'react';
import './M31InscritasOperational.css';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Bus, ChevronRight, Gift, MessageCircle, Plus, RefreshCw, Search, Sparkles, UsersRound, X } from 'lucide-react';
import GestaoLoteIA from '../gestao/GestaoLoteIA';
import { useM31GestaoList } from '@/hooks/useM31Gestao';
import { gestaoError, gestaoOperation, gestaoStatus, participacaoStatus, TIPOS_INGRESSO, tipoIngresso } from '@/lib/m31GestaoApi';
import M31SkeletonList from '../M31SkeletonList';
import GestaoDialog from '../gestao/GestaoDialog';
import GestaoInscricaoForm from '../gestao/GestaoInscricaoForm';
import GestaoInscricaoFicha from '../gestao/GestaoInscricaoFicha';
import { gestaoWhatsappLabel, gestaoWhatsappUrl } from '@/lib/m31GestaoContato';

const FILTERS = [{ key: 'todas', label: 'Todas' }, { key: 'confirmadas', label: 'Confirmadas' }, { key: 'aguardando_confirmacao', label: 'Aguardando confirmação' }];

function WhatsappLink({ row }) {
  const href = gestaoWhatsappUrl(row.whatsapp);
  return href ? <a href={href} className="m31-inscritas-phone" target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp de ${row.nome || 'participante'}`}><MessageCircle size={16} aria-hidden="true" /><span>{gestaoWhatsappLabel(row.whatsapp)}</span></a> : <span className="m31-inscritas-secondary">Não informado</span>;
}

function InscritaRow({ row, onOpen }) {
  const participation = row.participacao ?? participacaoStatus(row);
  const ticket = row.tipo_ingresso || tipoIngresso(row);
  const gifted = ticket === 'presenteada';
  const caravan = Boolean(row.caravana_id || row.tipo === 'caravana');
  const kind = TIPOS_INGRESSO[ticket] || 'Individual';
  const payment = ['aprovado', 'gratuito'].includes(row.status_pagamento) ? 'paid' : 'pending';
  const paymentLabel = { checkout_pendente: 'Pendente', checkout_abandonado: 'Abandonado' }[row.status_pagamento] || gestaoStatus(row.status_pagamento);
  return <tr>
    <td className="m31-inscritas-member-cell"><div className="m31-inscritas-member"><span className="m31-inscritas-avatar" aria-hidden="true">{(row.nome || '?').trim().charAt(0).toUpperCase()}</span><div className="m31-inscritas-member-data"><div className="m31-inscritas-name-line"><button type="button" className="m31-inscritas-name" onClick={onOpen} title={row.nome || 'Nome não informado'}>{row.nome || 'Nome não informado'}</button><span className="m31-inscritas-type-icons">{gifted && <span className="m31-inscritas-type-icon is-gift" role="img" aria-label="Inscrição presenteada" title="Inscrição presenteada"><Gift size={15} aria-hidden="true" /></span>}{caravan && <span className="m31-inscritas-type-icon is-caravan" role="img" aria-label="Participante de caravana" title={row.caravana_nome || 'Participante de caravana'}><Bus size={15} aria-hidden="true" /></span>}</span></div><span className="m31-inscritas-secondary m31-inscritas-reference" title={row.email || row.codigo_inscricao || ''}>{row.email || row.codigo_inscricao || 'Cadastro sem código'}</span><span className="m31-inscritas-mobile-phone"><WhatsappLink row={row} /></span></div></div></td>
    <td className="m31-inscritas-phone-cell"><WhatsappLink row={row} /></td>
    <td className="m31-inscritas-kind-cell"><span className="m31-inscritas-kind">{kind}</span></td>
    <td className="m31-inscritas-payment-cell"><span className="m31-inscritas-badge" data-tone={payment}>{paymentLabel}</span></td>
    <td className="m31-inscritas-participation-cell"><span className="m31-inscritas-badge" data-tone={participation.confirmed ? 'confirmed' : 'pending'} title={participation.manual ? 'Participação liberada manualmente pela equipe' : participation.label}>{participation.confirmed ? 'Confirmada' : participation.tone === 'inactive' ? 'Indisponível' : 'Aguardando'}</span>{row.busca_correspondencia?.possivel && <span className="m31-inscritas-match" title={row.busca_correspondencia.aviso}>Conferir cadastro</span>}</td>
    <td className="m31-inscritas-detail-cell"><button type="button" className="m31-inscritas-open" onClick={onOpen} aria-label={`Ver ficha de ${row.nome || 'participante'}`} title="Ver ficha"><ChevronRight size={18} aria-hidden="true" /></button></td>
  </tr>;
}

export default function M31InscritasOperational({ sessionId, canOperate = false }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('todas');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState(0);
  const [caravanaId, setCaravanaId] = useState('');
  const [ticketType, setTicketType] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [batch, setBatch] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const query = useM31GestaoList(sessionId, filter, search, cursor, caravanaId, ticketType);
  const caravanOptions = query.data?.filtros?.caravanas || [];
  const ticketOptions = query.data?.filtros?.tipos || [];
  const total = Number.isFinite(query.data?.total) ? query.data.total : null;
  const items = query.data?.items || [];
  const nextCursor = query.data?.next_cursor;

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput.trim()); setCursor(0); }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  async function create(payload) {
    if (pending || !canOperate) return;
    setPending(true); setError(null); setNotice('');
    try {
      const response = await gestaoOperation(sessionId, 'cadastrar', payload);
      setCreating(false); setSelectedId(response.inscricao?.id || null);
      const aviso = response.coincidencias?.length
        ? ` Atenção: ${[...new Set(response.coincidencias.flatMap(c => c.motivos))].join(' e ')} de outra inscrição (${response.coincidencias.map(c => c.nome || c.codigo_inscricao || 'sem nome').join(', ')}). ${response.conferencia?.encaminhada ? 'Enviado à conferência manual.' : 'Confira na conferência manual.'}`
        : '';
      setNotice((response.reused ? 'Esta solicitação já havia sido salva. A inscrição foi recuperada, sem criar uma segunda.' : `Inscrição salva${response.inscricao?.codigo_inscricao ? ` · ${response.inscricao.codigo_inscricao}` : ''}. Participação confirmada. Pagamento pendente.`) + aviso);
    } catch (failure) { setError(failure); setPending(false); return; }
    setPending(false);
    // Falha ao atualizar a lista não anula o cadastro já salvo.
    queryClient.invalidateQueries({ queryKey: ['m31-gestao-list', sessionId] }).catch(() => {});
  }

  return <section className="m31-gestao-list-section m31-gestao-inscritas">
    <header className="m31-gestao-section-heading"><div><p className="m31-gestao-eyebrow">Participantes</p><h1>Inscritas</h1></div>{canOperate && <button type="button" className="m31-gestao-btn m31-gestao-btn-primary" onClick={() => { setCreating(true); setError(null); }}><Plus size={19} aria-hidden="true" />Nova inscrição</button>}{canOperate && <button type="button" className="m31-gestao-btn" onClick={() => setBatch(true)}><Sparkles size={17} aria-hidden="true" />Cadastro em lote com IA</button>}</header>
    {batch && <GestaoDialog title="Cadastro em lote com IA" description="Cole os dados de várias mulheres, revise cada bloco e aprove." onClose={() => setBatch(false)}><GestaoLoteIA sessionId={sessionId} onEdit={setSelectedId} onClose={() => setBatch(false)} onCreated={() => queryClient.invalidateQueries({ queryKey: ['m31-gestao-list', sessionId] })} /></GestaoDialog>}
    {notice && <p className="m31-gestao-success" role="status">{notice}</p>}
    {query.error && query.data && <p className="m31-gestao-notice" role="status">A lista foi mantida. {gestaoError(query.error)}</p>}
    <div className="m31-gestao-list-tools">
      <label className="m31-gestao-search"><Search size={20} aria-hidden="true" /><span className="sr-only">Buscar por nome, WhatsApp, CPF, e-mail ou código da inscrição</span><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Nome, WhatsApp, CPF, e-mail ou código" type="search" /></label>
      <div className="m31-gestao-filters" role="group" aria-label="Filtrar inscrições">{FILTERS.map(({ key, label }) => <button type="button" key={key} aria-pressed={filter === key} onClick={() => { setFilter(key); setCursor(0); }}>{label}</button>)}</div>
      <div className="m31-inscritas-filter-fields"><label><span>Caravana</span><select value={caravanaId} onChange={event => { setCaravanaId(event.target.value); setCursor(0); }}><option value="">Todas as caravanas</option><option value="sem_caravana">Sem vínculo de caravana</option>{caravanaId && caravanaId !== 'sem_caravana' && !caravanOptions.some(item => item.id === caravanaId) && <option value={caravanaId}>Caravana selecionada</option>}{caravanOptions.map(item => <option value={item.id} key={item.id}>{item.nome}</option>)}</select></label>
        <label><span>Tipo de ingresso</span><select value={ticketType} onChange={event => { setTicketType(event.target.value); setCursor(0); }}><option value="">Todos os tipos</option>{ticketType && !ticketOptions.some(item => item.id === ticketType) && <option value={ticketType}>{TIPOS_INGRESSO[ticketType]}</option>}{ticketOptions.map(item => <option value={item.id} key={item.id}>{item.nome}</option>)}</select></label>
        {(caravanaId || ticketType) && <button type="button" className="m31-gestao-btn m31-gestao-btn-quiet" onClick={() => { setCaravanaId(''); setTicketType(''); setCursor(0); }}><X size={15} aria-hidden="true" />Limpar filtros</button>}
      </div>
    </div>
    <div className="m31-gestao-result-line"><p aria-live="polite">{query.isLoading ? 'Carregando inscrições…' : query.error && !query.data ? 'Total indisponível' : total === null ? 'Total não informado' : `${total} ${total === 1 ? 'inscrição encontrada' : 'inscrições encontradas'}`}</p><button type="button" className="m31-gestao-btn m31-gestao-btn-quiet" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw size={16} className={query.isFetching ? 'animate-spin' : ''} aria-hidden="true" />Atualizar</button></div>
    {query.isLoading ? <M31SkeletonList /> : query.error && !query.data ? <div className="m31-gestao-empty m31-gestao-error" role="alert"><h2>Não foi possível carregar as inscrições</h2><p>{gestaoError(query.error)}</p><button type="button" className="m31-gestao-btn" onClick={() => query.refetch()}>Tentar novamente</button></div> : !items.length ? <div className="m31-gestao-empty"><UsersRound size={32} aria-hidden="true" /><h2>Nenhuma inscrição encontrada</h2><p>Tente outro nome, WhatsApp, CPF, e-mail, código ou filtro.</p></div> : <div className="m31-inscritas-table-wrap"><table className="m31-inscritas-table" aria-label="Lista de inscritas"><colgroup><col className="m31-inscritas-col-member" /><col className="m31-inscritas-col-phone" /><col className="m31-inscritas-col-kind" /><col className="m31-inscritas-col-payment" /><col className="m31-inscritas-col-participation" /><col className="m31-inscritas-col-detail" /></colgroup><thead><tr><th scope="col">Participante</th><th scope="col" className="m31-inscritas-phone-cell">WhatsApp</th><th scope="col" className="m31-inscritas-kind-cell">Inscrição</th><th scope="col" className="m31-inscritas-payment-cell">Pagamento</th><th scope="col">Participação</th><th scope="col" className="m31-inscritas-detail-cell"><span className="m31-inscritas-detail-label">Detalhes</span></th></tr></thead><tbody>{items.map(row => <InscritaRow key={row.id} row={row} onOpen={() => setSelectedId(row.id)} />)}</tbody></table></div>}
    {(!query.error || query.data) && !query.isLoading && total !== null && total > 0 && <div className="m31-gestao-pagination"><span>{items.length ? `${cursor + 1}–${cursor + items.length} de ${total}` : `0 de ${total}`}</span><div><button type="button" className="m31-gestao-btn" disabled={cursor === 0 || query.isFetching} onClick={() => setCursor(Math.max(0, cursor - 25))}><ArrowLeft size={17} aria-hidden="true" />Anterior</button><button type="button" className="m31-gestao-btn" disabled={nextCursor === null || nextCursor === undefined || query.isFetching} onClick={() => setCursor(nextCursor)}>Próxima<ArrowRight size={17} aria-hidden="true" /></button></div></div>}
    {selectedId && <GestaoInscricaoFicha key={selectedId} sessionId={sessionId} id={selectedId} canOperate={canOperate} onClose={() => setSelectedId(null)} />}
    {creating && canOperate && <GestaoDialog title="Nova inscrição" description="Preencha os dados da participante e cadastre." onClose={() => !pending && setCreating(false)}><GestaoInscricaoForm sessionId={sessionId} mode="create" onSubmit={create} onCancel={() => setCreating(false)} onDraftChange={() => setError(null)} pending={pending} error={error} /></GestaoDialog>}
  </section>;
}