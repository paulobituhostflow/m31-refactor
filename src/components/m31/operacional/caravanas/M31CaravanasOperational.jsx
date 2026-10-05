import { useEffect, useMemo, useState } from 'react';
import { Bus, MessageCircle, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import M31BottomSheet from '../M31BottomSheet';
import M31InscricaoDrawer from '../../inscricao-drawer/M31InscricaoDrawer';
import M31OperationalListHeader from '../M31OperationalListHeader';
import M31SkeletonList from '../M31SkeletonList';
import { useM31OperationalList } from '@/hooks/useM31OperationalList';

function LeaderForm({ caravan, mutation }) {
  const draftKey = `m31:draft:leader:${caravan.id}`;
  const saved = JSON.parse(localStorage.getItem(draftKey) || 'null');
  const [name, setName] = useState(saved?.name || caravan.lider_nome || '');
  const [phone, setPhone] = useState(saved?.phone || caravan.lider_whatsapp || '');
  useEffect(() => { localStorage.setItem(draftKey, JSON.stringify({ name, phone })); }, [draftKey, name, phone]);
  async function save(event) {
    event.preventDefault();
    try {
      await mutation.mutateAsync({ action: 'atualizar_lider', caravana_id: caravan.id, lider_nome: name, lider_whatsapp: phone });
      localStorage.removeItem(draftKey); toast.success('Contato da líder atualizado.');
    } catch { toast.error('Confira o nome e informe um WhatsApp celular válido.'); }
  }
  return <form onSubmit={save} className="space-y-3">
    <label className="relative block"><span className="absolute left-3 top-1 text-[10px] font-bold uppercase text-m31-text-muted">Nome da líder</span><input value={name} onChange={(e) => setName(e.target.value)} className="h-14 w-full rounded-xl border border-m31-border px-3 pt-4 outline-none focus:border-m31-primary" /></label>
    <label className="relative block"><span className="absolute left-3 top-1 text-[10px] font-bold uppercase text-m31-text-muted">WhatsApp da líder</span><input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-14 w-full rounded-xl border border-m31-border px-3 pt-4 outline-none focus:border-m31-primary" /></label>
    <button type="submit" disabled={mutation.isPending} className="min-h-12 w-full rounded-xl bg-m31-primary px-4 font-bold text-white disabled:opacity-50">Salvar contato</button>
  </form>;
}

export default function M31CaravanasOperational({ sessionId, onBack }) {
  const [view, setView] = useState('acao'); const [search, setSearch] = useState(''); const [selected, setSelected] = useState(null); const [selectedParticipant, setSelectedParticipant] = useState(null);
  const query = useM31OperationalList(sessionId, 'caravanas', view, search);
  const next = useMemo(() => query.items.find((item) => item.status === 'acao'), [query.items]);
  return <section className="space-y-4">
    <M31OperationalListHeader title="Caravanas" description="Líder, contato e participantes pendentes." view={view} onView={setView} search={search} onSearch={setSearch} onBack={onBack} total={query.total} />
    {query.isLoading ? <M31SkeletonList /> : <div className="space-y-2">{query.items.map((row) => <button key={row.id} type="button" onClick={() => setSelected(row)} className="min-h-24 w-full rounded-xl border border-m31-border bg-white p-4 text-left"><span className="flex gap-3"><Bus className="mt-0.5 h-5 w-5 shrink-0 text-m31-primary" /><span className="min-w-0 flex-1"><strong className="block truncate text-m31-ink">{row.nome}</strong><span className="mt-1 block text-sm text-m31-text-muted">{row.lider_nome || '⚠ Contato da líder ausente'}</span><span className="block text-sm text-m31-text-muted">{row.lider_whatsapp || 'WhatsApp não informado'}</span><span className="mt-2 block text-sm font-bold text-m31-ink">{row.confirmadas} confirmadas · {row.pendentes} pendentes</span><span className={row.status === 'regularizada' ? 'mt-2 inline-block rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700' : 'mt-2 inline-block rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800'}>{row.motivo}</span></span></span></button>)}</div>}
    {query.hasNextPage && <button type="button" onClick={() => query.fetchNextPage()} className="min-h-12 w-full rounded-xl border bg-white font-bold text-m31-primary">Carregar mais</button>}
    {view === 'acao' && next && <button type="button" onClick={() => setSelected(next)} aria-label="Regularizar próxima caravana" className="fixed bottom-20 right-4 z-20 flex h-14 items-center gap-2 rounded-full bg-m31-primary px-5 font-bold text-white"><Plus className="h-5 w-5" />Regularizar</button>}
     <M31BottomSheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)} title={selected?.nome}><div className="space-y-5">{selected && <LeaderForm caravan={selected} mutation={query.mutateOperation} />}{selected?.lider_whatsapp && <a href={`https://wa.me/${selected.lider_whatsapp}`} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-emerald-300 font-bold text-emerald-700"><MessageCircle className="h-5 w-5" />Falar com a líder</a>}<div><h3 className="font-bold text-m31-ink">Participantes pendentes</h3>{selected?.participantes_pendentes?.length ? <div className="mt-2 divide-y divide-m31-border rounded-xl border border-m31-border">{selected.participantes_pendentes.map((person) => <button type="button" key={person.id} className="block w-full p-3 text-left active:bg-stone-50" onClick={async () => { try { setSelectedParticipant(await base44.entities.EventoM31Inscricao.get(person.id)); } catch { toast.error('Não foi possível abrir esta participante.'); } }}><strong className="block text-sm">{person.nome}</strong><span className="mt-1 block text-xs text-m31-text-muted">{person.motivo} · Toque para abrir o cadastro</span></button>)}</div> : <p className="mt-2 text-sm text-emerald-700">Nenhuma participante pendente.</p>}</div></div></M31BottomSheet>
    <M31InscricaoDrawer inscricao={selectedParticipant} onClose={() => setSelectedParticipant(null)} />
  </section>;
}

