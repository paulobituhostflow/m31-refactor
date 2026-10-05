import { ChevronRight } from 'lucide-react';
import { groupShirtRows } from '@/lib/groupShirtRows';

const STATUS = {
  pagamento_pendente: ['Pendente', 'bg-stone-100 text-stone-600'],
  revisar_pagamento: ['Revisar', 'bg-amber-50 text-amber-800'],
  sem_tamanho: ['Sem tamanho', 'bg-amber-50 text-amber-800'],
  a_entregar: ['A entregar', 'bg-m31-primary-tint text-m31-primary'],
  entregue: ['Entregue', 'bg-emerald-50 text-emerald-700'],
};

// Lista curta: últimos pedidos com tag de status — pendências à vista.
export default function HubUltimosPedidos({ rows, onVerTodos, onOpenOrder, somentePagos = false, limite = 5 }) {
  const base = somentePagos ? (rows || []).filter(row => row.pagamento_status === 'pago') : (rows || []);
  const recentes = groupShirtRows(base).slice(0, limite);
  return (
    <section aria-label="Últimos pedidos">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-m31-ink">{somentePagos ? 'Últimos pagamentos' : 'Últimos pedidos'}</h2>
        <button type="button" onClick={onVerTodos} className="flex min-h-12 items-center gap-1 text-sm font-bold text-m31-primary">
          Ver todos
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 overflow-hidden rounded-xl border border-m31-border bg-white">
        {recentes.length === 0 && <p className="p-4 text-sm text-m31-text-muted">Nenhum pedido registrado ainda.</p>}
        {recentes.map((row) => {
          const [label, cls] = STATUS[row.situacao] || ['—', 'bg-stone-100 text-stone-600'];
          return (
            <button type="button" onClick={() => onOpenOrder?.(row)} key={row.row_id} className="flex min-h-16 w-full items-center justify-between gap-3 border-b border-m31-border px-4 py-3 text-left last:border-b-0 active:bg-m31-surface-warm">
              <span className="min-w-0">
                <strong className="block truncate text-sm text-m31-ink">{row.nome}</strong>
                <span className="block text-xs font-semibold text-m31-text-muted">{row.quantidade} camisa{row.quantidade === 1 ? '' : 's'}</span>
                <span className="block text-xs text-m31-text-muted">{row.resumo_itens.split(' / ').map((item, index) => <span key={`${item}-${index}`} className="mr-2 inline-block">{item}</span>)}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${somentePagos ? 'bg-emerald-50 text-emerald-700' : cls}`}>{somentePagos ? 'Pago' : label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
