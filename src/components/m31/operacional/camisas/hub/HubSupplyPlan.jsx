import { useState } from 'react';
import { buildShirtSupplyPlan, formatShirtReplenishment } from '@/lib/shirtSupplyPlan';
import './HubSupplyPlan.css';

const number = value => new Intl.NumberFormat('pt-BR').format(value);
const sum = (row, field) => Object.values(row.tamanhos).reduce((total, size) => total + size[field], 0);

function SupplyIcon({ name, ...props }) {
  const paths = {
    box: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="M3 8v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5" /></>,
    truck: <><path d="M3 5h12v12H3zM15 9h3l3 4v4h-6" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>,
    bag: <><path d="M5 7h14l1 14H4L5 7Z" /><path d="M9 7V5a3 3 0 0 1 6 0v2" /></>,
    alert: <><path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v5M12 17h.01" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V3H3v13h5" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    table: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 10v10M15 10v10" /></>,
    search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] || paths.box}</svg>;
}

function ShirtSymbol({ row }) {
  const variant = row.modelo === 'jesus' ? row.cor : row.modelo;
  return <span className={`m31-supply-shirt m31-supply-shirt--${variant}`} aria-hidden="true"><svg viewBox="0 0 84 84" fill="none"><path className="m31-supply-shirt__fabric" d="m26 14-19 11 9 19 10-5v32h32V39l10 5 9-19-19-11c-3 9-29 9-32 0Z" strokeWidth="1.5" strokeLinejoin="round" /><path d="M31 17c2 7 20 7 22 0" stroke="currentColor" strokeWidth="1.2" opacity=".4" /><text x="42" y="47" textAnchor="middle" className="m31-supply-shirt__print">{row.modelo === 'jesus' ? 'JESUS' : row.modelo === 'filhas' ? 'FILHAS' : 'MILAGRES'}</text><path d="M35 52h14" stroke="currentColor" opacity=".55" /></svg></span>;
}

function Metric({ icon, value, label, detail, accent = false, warning = false }) {
  return <div className={`m31-supply-metric${accent ? ' m31-supply-metric--accent' : ''}${warning ? ' m31-supply-metric--warning' : ''}`}><div className="m31-supply-metric__top"><span>{label}</span><SupplyIcon name={icon} /></div><strong className="m31-supply-metric__number">{number(value)}<span>peças</span></strong><p>{detail}</p></div>;
}

function ModelCard({ row, sizes, incomplete }) {
  const missing = sum(row, 'complementar');
  const demand = sum(row, 'demanda');
  const covered = Object.values(row.tamanhos).reduce((total, size) => total + Math.min(size.demanda, size.aReceber + size.recebido), 0);
  const percent = demand ? Math.round(covered / demand * 100) : 0;
  const status = incomplete ? 'A conferir' : missing ? `Faltam ${number(missing)} peças` : demand ? 'Demanda coberta' : 'Sem vendas confirmadas';
  return <article className={`m31-supply-model${missing ? ' m31-supply-model--attention' : ''}`} aria-label={row.nome}>
    <header className="m31-supply-model__header"><ShirtSymbol row={row} /><div className="m31-supply-model__identity"><span className="m31-supply-eyebrow">{row.modelo === 'jesus' ? `Jesus · ${row.cor}` : 'Coleção M31'}</span><h3>{row.nome}</h3><span className={`m31-supply-badge${incomplete || !demand ? ' m31-supply-badge--neutral' : missing ? ' m31-supply-badge--attention' : ''}`}><SupplyIcon name={incomplete ? 'box' : missing ? 'alert' : demand ? 'check' : 'box'} />{status}</span></div></header>
    <div className="m31-supply-model__numbers"><div><span>A receber</span><strong>{number(sum(row, 'aReceber'))}</strong></div><div><span>Vendidas</span><strong>{number(demand)}</strong></div><div><span>Recebidas</span><strong>{number(sum(row, 'recebido'))}</strong></div></div>
    <div className="m31-supply-coverage"><span>Cobertura prevista da demanda</span><strong>{incomplete ? 'Parcial' : demand ? `${percent}%` : '—'}</strong></div><div className={`m31-supply-progress${incomplete ? ' m31-supply-progress--neutral' : missing ? ' m31-supply-progress--attention' : ''}`} aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
    <div className="m31-supply-size-label"><strong>Grade de tamanhos</strong><span>A receber / vendidas</span></div>
    <dl className="m31-supply-sizes">{sizes.map(size => { const item = row.tamanhos[size]; return <div key={size} className={`m31-supply-size${item.complementar ? ' m31-supply-size--missing' : ''}`}><dt>{size}</dt><dd><strong>{number(item.aReceber)}</strong><span> / {number(item.demanda)}</span></dd><span className="m31-supply-size__state">{incomplete ? 'A conferir' : item.complementar ? `Pedir +${item.complementar}` : 'Sem falta'}</span></div>; })}</dl>
  </article>;
}

export default function HubSupplyPlan({ inventory = [], encomendas = [], syncedAt, incomplete = false, refreshing = false, initialView = 'cards' }) {
  const plan = buildShirtSupplyPlan(inventory, encomendas);
  const [view, setView] = useState(initialView);
  const [search, setSearch] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [copyFailed, setCopyFailed] = useState(false);
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const rows = plan.rows.filter(row => normalize(row.nome).includes(normalize(search.trim())) && (!onlyMissing || sum(row, 'complementar') > 0));
  const missingModels = plan.rows.filter(row => sum(row, 'complementar') > 0).length;
  const formattedDate = syncedAt && Number.isFinite(Date.parse(syncedAt)) ? new Date(syncedAt).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza', dateStyle: 'short', timeStyle: 'short' }) : null;

  async function copy() {
    if (incomplete) return;
    try { await navigator.clipboard.writeText(formatShirtReplenishment(plan.faltas)); setCopyFailed(false); setCopyStatus('Solicitação copiada. Nenhuma mensagem foi enviada.'); }
    catch { setCopyFailed(true); setCopyStatus('Não foi possível copiar. Selecione o texto da solicitação abaixo.'); }
  }

  return <section aria-labelledby="shirt-supply-title" className="m31-supply">
    <header className="m31-supply-header"><div><span className="m31-supply-eyebrow">Planejamento de camisas</span><h2 id="shirt-supply-title">Pedido ao fornecedor<span>.</span></h2><p>Veja o que está a caminho, o que já foi vendido e onde precisa complementar.</p></div><span className="m31-supply-sync" role="status"><SupplyIcon name="clock" />{refreshing ? 'Conferindo…' : 'Atualização automática · até 30 s'}</span></header>
    <div className="m31-supply-metrics" aria-label="Resumo da encomenda"><Metric icon="truck" value={plan.aReceber} label="A receber" detail="Encomenda ainda no fornecedor" accent /><Metric icon="box" value={plan.recebido} label="Recebidas" detail="Recebimento registrado no sistema" /><Metric icon="bag" value={plan.demanda} label="Vendidas" detail="Comprometidas por vendas confirmadas" /><Metric icon="alert" value={plan.complementar} label="Complemento necessário" detail={incomplete ? 'Conferência incompleta' : missingModels ? `Em ${missingModels} ${missingModels === 1 ? 'modelo' : 'modelos'} · confira os tamanhos` : 'Para a demanda conferida'} warning={plan.complementar > 0} /></div>
    {incomplete && <div role="alert" className="m31-supply-incomplete"><SupplyIcon name="alert" /><div><strong>Conferência incompleta.</strong><p>Os números não garantem a cobertura de toda a demanda. Confira a sincronização antes de solicitar complemento.</p></div></div>}
    {plan.faltas.length > 0 && <aside className="m31-supply-alert" aria-labelledby="shirt-supply-alert-title"><span className="m31-supply-alert__icon"><SupplyIcon name="alert" /></span><div className="m31-supply-alert__content"><span className="m31-supply-eyebrow">Atenção à grade</span><h3 id="shirt-supply-alert-title">{number(plan.complementar)} peças precisam de complemento</h3><p>Dulce, confira estes tamanhos antes de falar com o fornecedor. Sobras em outros tamanhos não cobrem estas faltas.</p><ul>{plan.faltas.map(item => <li key={`${item.nome}:${item.tamanho}`}><span>{item.nome}</span><strong>{item.tamanho} <span>+{item.quantidade}</span></strong></li>)}</ul></div><div className="m31-supply-alert__action"><button type="button" className="m31-supply-button m31-supply-button--primary" onClick={copy} disabled={incomplete}><SupplyIcon name="copy" />Copiar solicitação de complemento</button><span>Só copia o texto. Não envia mensagem.</span></div></aside>}
    {copyStatus && <p className="m31-supply-copy-status" role="status">{copyStatus}</p>}{copyFailed && <textarea className="m31-supply-copy-fallback" aria-label="Solicitação de complemento para copiar manualmente" readOnly value={formatShirtReplenishment(plan.faltas)} onFocus={event => event.target.select()} />}
    <div className="m31-supply-workspace"><div className="m31-supply-toolbar"><div><h3>Encomenda por modelo</h3><p>{plan.rows.length} modelos · acompanhe cada tamanho separadamente</p></div><div className="m31-supply-view" aria-label="Visualização da encomenda"><button type="button" aria-pressed={view === 'cards'} onClick={() => setView('cards')}><SupplyIcon name="grid" />Cards</button><button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}><SupplyIcon name="table" />Tabela</button></div></div>
      <div className="m31-supply-filters"><label className="m31-supply-search"><SupplyIcon name="search" /><span className="m31-supply-sr-only">Buscar modelo ou cor</span><input type="search" placeholder="Buscar modelo ou cor" value={search} onChange={event => setSearch(event.target.value)} /></label><button type="button" className="m31-supply-filter" aria-pressed={onlyMissing} onClick={() => setOnlyMissing(!onlyMissing)}><SupplyIcon name="alert" />Somente faltas <span>{missingModels}</span></button><span className="m31-supply-result-count" role="status">{rows.length} de {plan.rows.length} modelos</span></div>
      {rows.length === 0 ? <div className="m31-supply-empty"><SupplyIcon name="search" /><h4>Nenhum modelo neste filtro</h4><p>Limpe a busca ou veja todos os modelos da encomenda.</p><button type="button" className="m31-supply-button" onClick={() => { setSearch(''); setOnlyMissing(false); }}>Limpar filtros</button></div> : view === 'cards' ? <div className="m31-supply-models">{rows.map(row => <ModelCard key={row.id} row={row} sizes={plan.tamanhos} incomplete={incomplete} />)}</div> : <div className="m31-supply-table-wrap" tabIndex={0} role="region" aria-label="Encomenda por modelo e tamanho"><table className="m31-supply-table"><caption>Cada célula mostra a receber / vendidas. Faltas não são compensadas entre tamanhos.</caption><thead><tr><th scope="col">Modelo</th>{plan.tamanhos.map(size => <th scope="col" key={size}>{size}</th>)}<th scope="col">A receber</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><th scope="row">{row.nome}</th>{plan.tamanhos.map(size => { const item = row.tamanhos[size]; return <td key={size} className={item.complementar ? 'm31-supply-table__missing' : ''}><strong>{item.aReceber}</strong><span> / {item.demanda}</span>{item.complementar > 0 && <small>Pedir +{item.complementar}</small>}</td>; })}<td><strong>{number(sum(row, 'aReceber'))}</strong></td></tr>)}</tbody></table></div>}
    </div>
    <footer className="m31-supply-footer"><p><SupplyIcon name="box" /><span><strong>Encomendado não é estoque recebido.</strong> As vendas continuam liberadas. A cobertura é prevista, por modelo e tamanho.</span></p>{!incomplete && plan.complementar === 0 && <p>Sem complemento necessário para a demanda conferida. Isso não indica recebimento físico.</p>}{formattedDate && <span>Última conferência: {formattedDate} · Fortaleza</span>}</footer>
  </section>;
}
