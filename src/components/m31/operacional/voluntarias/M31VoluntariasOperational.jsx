import { useState } from 'react';
import { CircleAlert, MessageCircle, RefreshCw, Shirt } from 'lucide-react';
import M31BottomSheet from '../M31BottomSheet';
import M31OperationalListHeader from '../M31OperationalListHeader';
import M31SkeletonList from '../M31SkeletonList';
import { useM31OperationalList } from '@/hooks/useM31OperationalList';

const PAYMENT_LABELS = { pago: 'Pago', isento: 'Isento', pendente: 'Pendente', cancelado: 'Cancelado', conferir: 'Conferir pagamento', nao_localizado: 'Pagamento não localizado' };
const VIEWS = [['todas', 'Todas'], ['acao', 'Precisam de ação'], ['oficiais', 'Regularizadas']];

export default function M31VoluntariasOperational({ sessionId, onBack }) {
  const [view, setView] = useState('todas'); const [search, setSearch] = useState(''); const [selected, setSelected] = useState(null);
  const query = useM31OperationalList(sessionId, 'voluntarias', view, search);
  const summary = query.data?.pages?.[0]?.summary;
  return <section className="space-y-4">
    <M31OperationalListHeader title="Voluntárias" description="Grupo de intercessão, cadastros e camisas conferidas." view={view} views={VIEWS} onView={setView} search={search} onSearch={setSearch} onBack={onBack} total={query.error || query.isLoading ? undefined : query.total} />
    {query.isLoading ? <M31SkeletonList /> : query.error ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950"><p>Não foi possível carregar as voluntárias. Seus cadastros continuam preservados.</p><button type="button" onClick={() => query.refetch()} className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-xl border bg-white px-4 font-semibold text-m31-primary"><RefreshCw size={18} aria-hidden="true" />Tentar novamente</button></div> : <>
      {summary && <p className="text-sm text-m31-text-muted">{summary.total} no grupo · {summary.camisas_confirmadas} camisas com tamanho conferido · {summary.inclusao_conferir} inclusões para conferir</p>}
      {!query.items.length ? <p className="rounded-xl border border-m31-border bg-white p-6 text-m31-text-muted">Nenhuma voluntária nesta visão. Confira a busca ou selecione Todas.</p> : <div className="space-y-2">{query.items.map((row) => <button key={row.id} type="button" onClick={() => setSelected(row)} className="min-h-20 w-full rounded-xl border border-m31-border bg-white p-4 text-left"><span className="flex items-start gap-3"><Shirt className="mt-0.5 h-5 w-5 shrink-0 text-m31-primary" aria-hidden="true" /><span className="min-w-0 flex-1"><strong className="block break-words">{row.nome}</strong><span className="mt-1 block text-sm text-m31-text-muted">{row.whatsapp || 'WhatsApp ausente'} · {row.setor}</span><span className="mt-2 flex flex-wrap gap-2 text-xs font-bold"><span className={['pago', 'isento'].includes(row.pagamento) ? 'rounded-full bg-emerald-50 px-2 py-1 text-emerald-700' : 'rounded-full bg-amber-50 px-2 py-1 text-amber-800'}>{PAYMENT_LABELS[row.pagamento] || 'Conferir pagamento'}</span><span className="rounded-full bg-stone-100 px-2 py-1">Camisa {row.tamanho || 'não informada'}{row.tamanho_confirmado ? ' · conferida' : ''}</span>{row.tamanho_divergente && <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-800">Conferir divergência</span>}</span>{row.pendencias?.length > 0 && <span className="mt-2 flex gap-2 text-sm text-amber-800"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{row.motivo}</span>}</span></span></button>)}</div>}
    </>}
    {query.hasNextPage && !query.error && <button type="button" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage} className="min-h-12 w-full rounded-xl border bg-white font-bold text-m31-primary disabled:opacity-50">{query.isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}</button>}
    <M31BottomSheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)} title={selected?.nome}><div className="space-y-4"><p>{selected?.motivo}</p><p className="text-sm text-m31-text-muted">{PAYMENT_LABELS[selected?.pagamento] || 'Conferir pagamento'} · Camisa: {selected?.tamanho || 'não informada'}{selected?.tamanho_confirmado ? ' (tamanho conferido)' : ''}</p>{selected?.whatsapp && <a href={`https://wa.me/${selected.whatsapp}`} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 font-bold text-white"><MessageCircle className="h-5 w-5" />Abrir WhatsApp</a>}</div></M31BottomSheet>
  </section>;
}
