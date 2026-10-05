import { useState } from 'react';
import { PackagePlus, Search } from 'lucide-react';
import M31BottomSheet from '@/components/m31/operacional/M31BottomSheet';
import ShirtStockSection from '@/components/m31/operacional/camisas/ShirtStockSection';
import { formatStockMovement } from '@/lib/stockMovement';

const MODELOS = [
  { id: 'jesus', nome: 'Jesus' },
  { id: 'milagres', nome: 'Milagres' },
  { id: 'filhas', nome: 'Filhas' },
];
const TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'XGG'];
const INITIAL = { modelo: 'filhas', cor: '', tamanho: 'M', quantidade: '', valor_total: '', fornecedor: '' };

const inputClass = 'h-12 w-full rounded-xl border border-m31-border bg-white px-3 text-base text-m31-ink outline-none focus:border-m31-primary';
const labelClass = 'block text-sm font-semibold text-m31-ink';

// Estoque: recebimento em lote (com histórico de compra) + ajuste por
// modelo/cor/tamanho na grade já existente.
export default function HubEstoque({ inventory, grade = [], movimentos = [], pending, preview, onUpdateEstoque, onReceber }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(INITIAL);
  function set(campo, valor) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  const demandaConfirmada = grade.reduce((total, item) => total + Number(item.total || 0), 0);
  const recebidas = inventory.reduce((total, item) => total + Number(item.recebidas || 0), 0);
  const reservadas = inventory.reduce((total, item) => total + Number(item.reservadas || 0), 0);
  const disponivel = inventory.reduce((total, item) => total + Number(item.disponivel || 0), 0);
  const necessidadeCompra = Math.max(0, demandaConfirmada - recebidas);

  async function submit(event) {
    event.preventDefault();
    const ok = await onReceber({
      itens: [{
        modelo: form.modelo,
        cor: form.modelo === 'jesus' ? form.cor : '',
        tamanho: form.tamanho,
        quantidade: Math.max(0, Math.floor(Number(form.quantidade) || 0)),
      }],
      valor_total: Number(String(form.valor_total).replace(',', '.')) || 0,
      fornecedor: form.fornecedor,
    });
    if (ok) {
      setOpen(false);
      setForm(INITIAL);
    }
  }

  return (
    <section className="space-y-4">
      <section className="space-y-2">
        <h2 className="text-lg font-bold text-m31-ink">Demanda e planejamento</h2>
        <p className="text-xs text-m31-text-muted">A demanda confirmada vem dos pedidos pagos; o estoque físico é atualizado por recebimentos.</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <div className="rounded-xl border border-m31-border bg-white p-3"><span className="block text-[11px] font-bold uppercase text-m31-text-muted">Demanda confirmada</span><strong className="mt-1 block text-2xl text-m31-ink">{demandaConfirmada}</strong><span className="text-xs text-m31-text-muted">peças pagas</span></div>
          <div className="rounded-xl border border-m31-border bg-white p-3"><span className="block text-[11px] font-bold uppercase text-m31-text-muted">Recebidas</span><strong className="mt-1 block text-2xl text-m31-ink">{recebidas}</strong><span className="text-xs text-m31-text-muted">no estoque</span></div>
          <div className="rounded-xl border border-m31-border bg-white p-3"><span className="block text-[11px] font-bold uppercase text-m31-text-muted">Reservadas</span><strong className="mt-1 block text-2xl text-m31-ink">{reservadas}</strong><span className="text-xs text-m31-text-muted">pagas e não entregues</span></div>
          <div className="rounded-xl border border-m31-border bg-white p-3"><span className="block text-[11px] font-bold uppercase text-m31-text-muted">Disponível</span><strong className="mt-1 block text-2xl text-m31-ink">{disponivel}</strong><span className="text-xs text-m31-text-muted">livre para novos pedidos</span></div>
          <div className={`rounded-xl border p-3 ${necessidadeCompra ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}><span className="block text-[11px] font-bold uppercase text-m31-text-muted">Necessidade de compra</span><strong className="mt-1 block text-2xl text-m31-ink">{necessidadeCompra}</strong><span className="text-xs text-m31-text-muted">peças para cobrir a demanda</span></div>
        </div>
        <div className="overflow-hidden rounded-xl border border-m31-border bg-white">
          {(inventory || []).filter((item) => item.demanda || item.recebidas).map((item) => <div key={item.id} className="border-b border-m31-border p-3 last:border-b-0">
            <div className="flex items-center justify-between"><strong>{item.nome}</strong><span className="text-sm font-bold text-m31-primary">{item.demanda || 0} peças demandadas</span></div>
            <div className="mt-2 grid gap-2">{TAMANHOS.filter(t => item.tamanhos?.[t]?.demanda || item.tamanhos?.[t]?.recebido).map(t => { const info = item.tamanhos[t]; return <div key={t} className="rounded-lg border border-m31-border bg-white px-2 py-2 text-xs text-m31-text-muted"><strong className="mr-2 text-m31-ink">{t}</strong><span>Demanda {info.demanda || 0} · Recebido {info.recebido || 0} · Reservado {info.reservadas || 0} · Disponível {info.disponivel || 0} · Falta {info.falta_comprar || 0}</span></div>; })}</div>
          </div>)}
          {!(inventory || []).some((item) => item.demanda || item.recebidas) && <p className="p-4 text-sm text-m31-text-muted">Nenhuma demanda ou entrada registrada.</p>}
        </div>
      </section>

      <label className="flex min-h-12 items-center gap-3 rounded-xl border border-m31-border bg-white px-4 focus-within:border-m31-primary">
        <Search className="h-5 w-5 text-m31-primary" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filtrar estoque por modelo, cor ou tamanho" className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none" />
      </label>

      <button type="button" onClick={() => setOpen(true)} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-m31-primary text-base font-bold text-white active:opacity-80">
        <PackagePlus aria-hidden="true" className="h-5 w-5" />
        Receber estoque
      </button>
      <ShirtStockSection inventory={(inventory || []).filter(c => !search.trim() || [c.nome, c.modelo, c.cor, ...TAMANHOS.filter(t => c.tamanhos?.[t]?.cadastrado)].join(' ').toLowerCase().includes(search.trim().toLowerCase()))} disabled={pending} onUpdateEstoque={onUpdateEstoque} preview={preview} />

      <section className="space-y-2" aria-labelledby="stock-movements-title">
        <div className="flex items-end justify-between"><h2 id="stock-movements-title" className="text-lg font-bold text-m31-ink">Últimas movimentações</h2><span className="text-xs text-m31-text-muted">entradas e ajustes</span></div>
        <div className="overflow-hidden rounded-xl border border-m31-border bg-white">
          {movimentos.length === 0 ? <p className="p-4 text-sm text-m31-text-muted">Nenhuma movimentação registrada ainda.</p> : movimentos.map((movimento) => {
            const item = formatStockMovement(movimento);
            return <div key={movimento.id} className="border-b border-m31-border p-3 last:border-b-0">
              <div className="flex items-start justify-between gap-3"><strong className="text-sm text-m31-ink">{item.tipo}</strong><span className="shrink-0 text-[11px] text-m31-text-muted">{item.dataHora ? new Date(item.dataHora).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Data não informada'}</span></div>
              <p className="mt-1 text-sm font-semibold text-m31-ink">{item.produto}</p>
              <p className="mt-1 text-sm text-m31-text-muted">{item.movimento}</p>
              {item.motivo && <p className="mt-1 text-xs text-m31-text-muted">Motivo: {item.motivo}</p>}
              {item.fornecedor && <p className="mt-1 text-xs text-m31-text-muted">Fornecedor: {item.fornecedor}</p>}
              <p className="mt-1 text-xs font-semibold text-m31-text-muted">{item.responsavel}</p>
            </div>;
          })}
        </div>
      </section>

      <M31BottomSheet open={open} onOpenChange={setOpen} title="Receber estoque">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="receber-modelo">Modelo</label>
            <select id="receber-modelo" value={form.modelo} onChange={(event) => set('modelo', event.target.value)} className={inputClass}>
              {MODELOS.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </div>
          {form.modelo === 'jesus' && (
            <div>
              <label className={labelClass} htmlFor="receber-cor">Cor</label>
              <select id="receber-cor" value={form.cor} onChange={(event) => set('cor', event.target.value)} className={inputClass}>
                <option value="">Selecione</option>
                <option value="preta">Preta</option>
                <option value="cereja">Cereja</option>
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="receber-tamanho">Tamanho</label>
              <select id="receber-tamanho" value={form.tamanho} onChange={(event) => set('tamanho', event.target.value)} className={inputClass}>
                {TAMANHOS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="receber-qtd">Quantidade</label>
              <input id="receber-qtd" required inputMode="numeric" type="number" min="1" value={form.quantidade} onChange={(event) => set('quantidade', event.target.value)} className={inputClass} placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="receber-valor">Valor pago (opcional)</label>
              <input id="receber-valor" inputMode="decimal" value={form.valor_total} onChange={(event) => set('valor_total', event.target.value)} className={inputClass} placeholder="0,00" />
            </div>
            <div>
              <label className={labelClass} htmlFor="receber-fornecedor">Fornecedor (opcional)</label>
              <input id="receber-fornecedor" value={form.fornecedor} onChange={(event) => set('fornecedor', event.target.value)} className={inputClass} placeholder="Nome do fornecedor" />
            </div>
          </div>
          <button type="submit" disabled={pending} className="min-h-12 w-full rounded-xl bg-m31-primary font-bold text-white disabled:opacity-50">
            Registrar recebimento
          </button>
          <p className="text-xs text-m31-text-muted">O recebimento soma à quantidade já existente e fica no histórico de compras.</p>
        </form>
      </M31BottomSheet>
    </section>
  );
}
