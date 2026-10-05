import { useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { filterOperationalShirts } from '@/lib/m31ShirtOperational';
import { groupShirtRows } from '@/lib/groupShirtRows';

const FILTERS = [
  ['todas', 'Todas'],
  ['precisa_acao', 'Atenção'],
  ['pagas', 'Pagas'],
  ['a_entregar', 'A entregar'],
  ['entregues', 'Entregues'],
  ['sem_tamanho', 'Sem tamanho'],
];

// Pedidos: a principal área de trabalho da Central — busca, filtros e
// as ações operacionais (conferir pagamento, tamanho, entrega, comprovante).
export default function HubPedidos({ rows, onRefetch, onOpenOrder }) {
  const [filter, setFilter] = useState('todas');
  const [search, setSearch] = useState('');
  const visibleRows = useMemo(() => filterOperationalShirts(rows, { filter, search }), [rows, filter, search]);
  const visibleOrders = useMemo(() => {
    const matchingIds = new Set(visibleRows.map((row) => row.row_id));
    return groupShirtRows(rows).filter((order) => order.itens.some((item) => matchingIds.has(item.row_id)));
  }, [rows, visibleRows]);
  const totalCamisas = rows.reduce((total, row) => total + Number(row.quantidade_item || row.quantidade || 1), 0);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-m31-text-muted">{groupShirtRows(rows).length} pedidos · {totalCamisas} camisas</p>
        <button type="button" onClick={onRefetch} className="flex min-h-12 items-center gap-2 rounded-xl border border-m31-border bg-white px-3 text-sm font-bold text-m31-primary active:bg-m31-primary-tint">
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          Atualizar
        </button>
      </div>

      <label className="flex min-h-12 items-center gap-3 rounded-xl border border-m31-border bg-white px-4 focus-within:border-m31-primary">
        <Search aria-hidden="true" className="h-5 w-5 text-m31-text-muted" />
        <span className="sr-only">Buscar por nome ou WhatsApp</span>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome, WhatsApp ou pedido" className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-stone-400" />
      </label>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none" aria-label="Filtros de pedidos">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={filter === value
              ? 'min-h-12 shrink-0 rounded-full bg-m31-primary px-4 text-sm font-bold text-white'
              : 'min-h-12 shrink-0 rounded-full border border-m31-border bg-white px-4 text-sm font-semibold text-m31-text-muted'}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-m31-border bg-white">
        {visibleOrders.length === 0 && <p className="p-6 text-center text-sm text-m31-text-muted">Nenhum pedido encontrado neste filtro.</p>}
        {visibleOrders.map((row) => (
          <button key={row.row_id} type="button" onClick={() => onOpenOrder?.(row)} className="w-full border-b border-m31-border p-4 text-left last:border-b-0 active:bg-m31-surface-warm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-bold text-m31-ink">{row.numero_pedido != null && <span className="text-m31-primary">#M31{String(row.numero_pedido).padStart(3, '0')} · </span>}{row.nome}</h2>
                <p className="mt-1 text-sm text-m31-text-muted">{row.whatsapp || 'Sem WhatsApp'} · {row.quantidade} camisa{row.quantidade === 1 ? '' : 's'}</p>
                <p className="mt-2 text-sm font-semibold text-m31-ink">{row.resumo_itens}</p>
              </div>
              <span className={row.pagamento_status === 'pago' ? 'shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700' : 'shrink-0 rounded-full bg-stone-100 px-2 py-1 text-xs font-bold text-stone-600'}>{row.pagamento_status === 'pago' ? 'Pago' : 'Pendente'}</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs font-bold text-m31-primary"><span>{row.todos_entregues ? 'Pedido entregue · ver itens' : 'Ver pedido e editar itens'}</span><span>→</span></div>
          </button>
        ))}
      </div>
    </section>
  );
}
