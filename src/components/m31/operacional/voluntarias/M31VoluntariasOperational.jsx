import { useState } from 'react';
import { CircleAlert, MessageCircle, Shirt } from 'lucide-react';
import M31BottomSheet from '../M31BottomSheet';
import M31OperationalListHeader from '../M31OperationalListHeader';
import M31SkeletonList from '../M31SkeletonList';
import { useM31OperationalList } from '@/hooks/useM31OperationalList';

export default function M31VoluntariasOperational({ sessionId, onBack }) {
  const [view, setView] = useState('acao'); const [search, setSearch] = useState(''); const [selected, setSelected] = useState(null);
  const query = useM31OperationalList(sessionId, 'voluntarias', view, search);
  return <section className="space-y-4">
    <M31OperationalListHeader title="Voluntárias" description="Cadastro, pagamento e camisa. Sem grupos e disparos." view={view} onView={setView} search={search} onSearch={setSearch} onBack={onBack} total={query.total} />
    {query.isLoading ? <M31SkeletonList /> : <div className="space-y-2">{query.items.map((row) => <button key={row.id} type="button" onClick={() => setSelected(row)} className="min-h-20 w-full rounded-xl border border-m31-border bg-white p-4 text-left"><span className="flex items-start gap-3"><Shirt className="mt-0.5 h-5 w-5 shrink-0 text-m31-primary" /><span className="min-w-0 flex-1"><strong className="block truncate">{row.nome}</strong><span className="mt-1 block text-sm text-m31-text-muted">{row.whatsapp || 'WhatsApp ausente'} · {row.setor}</span><span className="mt-2 flex flex-wrap gap-2 text-xs font-bold"><span className={row.pagamento === 'pago' ? 'rounded-full bg-emerald-50 px-2 py-1 text-emerald-700' : 'rounded-full bg-amber-50 px-2 py-1 text-amber-800'}>{row.pagamento === 'pago' ? 'Pago' : 'Pendente'}</span><span className="rounded-full bg-stone-100 px-2 py-1">Camisa {row.tamanho || 'não informada'}</span></span>{view === 'acao' && <span className="mt-2 flex gap-1 text-sm text-amber-800"><CircleAlert className="h-4 w-4" />{row.motivo}</span>}</span></span></button>)}</div>}
    {query.hasNextPage && <button type="button" onClick={() => query.fetchNextPage()} className="min-h-12 w-full rounded-xl border bg-white font-bold text-m31-primary">Carregar mais</button>}
    <M31BottomSheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)} title={selected?.nome}><div className="space-y-4"><p>{selected?.motivo}</p><p className="text-sm text-m31-text-muted">Pagamento: {selected?.pagamento} · Camisa: {selected?.tamanho || 'não informada'}</p>{selected?.whatsapp && <a href={`https://wa.me/${selected.whatsapp}`} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 font-bold text-white"><MessageCircle className="h-5 w-5" />Abrir WhatsApp</a>}</div></M31BottomSheet>
  </section>;
}

