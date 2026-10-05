import { Search } from 'lucide-react';
import { groupShirtRows } from '@/lib/groupShirtRows';

const dinheiro = (valor) => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function HubDashboard({ rows = [], summary = {}, search, onSearch, onOpenPedidos, onOpenOrder }) {
  const pedidosAgrupados = groupShirtRows(rows);
  const pedidos = summary?.pedidos ?? pedidosAgrupados.length;
  const pendentes = summary?.aguardando_pagamento ?? rows.filter(r => r.pagamento_status !== 'pago' && r.pagamento_status !== 'substituido').length;
  const camisasVendidas = summary?.camisas_vendidas ?? rows.reduce((total, row) => total + Number(row.quantidade_item || 1), 0);
  const valorPago = summary?.vendas_pagas ?? groupShirtRows(rows.filter(r => r.pagamento_status === 'pago')).reduce((s, r) => s + Number(r.valor || 0), 0);
  const encontrados = search.trim() ? pedidosAgrupados.filter(order => order.itens.some(r => {
    const q = search.toLowerCase().replace(/\D/g, '');
    const texto = [r.nome, r.whatsapp, r.numero_pedido, r.modelo, r.cor, r.tamanho].join(' ').toLowerCase();
    return texto.includes(search.toLowerCase()) || (q && String(r.whatsapp || '').replace(/\D/g, '').includes(q));
  })) : [];

  return <div className="space-y-3">
    <div className="grid grid-cols-3 gap-2" aria-label="Resumo de vendas">
      <button type="button" onClick={onOpenPedidos} className="min-h-24 rounded-2xl border border-m31-border bg-white p-4 text-left active:bg-m31-surface-warm">
        <div className="text-3xl font-black tracking-tight text-m31-ink">{pedidos}</div><div className="mt-1 text-xs font-semibold text-m31-text-muted">Pedidos</div>
      </button>
      <button type="button" onClick={onOpenPedidos} className="min-h-24 rounded-2xl border border-m31-border bg-white p-4 text-left active:bg-m31-surface-warm">
        <div className="text-3xl font-black tracking-tight text-m31-ink">{camisasVendidas}</div><div className="mt-1 text-xs font-semibold text-m31-text-muted">Camisas vendidas</div>
      </button>
      <div className="min-h-24 rounded-2xl border border-m31-border bg-white p-4">
        <div className="text-xl font-black leading-8 tracking-tight text-m31-primary">{dinheiro(valorPago)}</div><div className="mt-1 text-xs font-semibold text-m31-text-muted">Vendas pagas</div>
      </div>
    </div>
    <button type="button" onClick={onOpenPedidos} className="text-left text-xs font-bold text-amber-700">{pendentes} pedidos pendentes de atenção</button>

    <label className="flex min-h-14 items-center gap-3 rounded-2xl border border-m31-border bg-white px-4 focus-within:border-m31-primary">
      <Search className="h-5 w-5 text-m31-primary" aria-hidden="true" />
      <input value={search} onChange={e => onSearch(e.target.value)} placeholder="Buscar cliente, WhatsApp ou pedido" className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-stone-400" />
    </label>

    {search.trim() && <div className="overflow-hidden rounded-2xl border border-m31-border bg-white">
      <div className="flex items-center justify-between border-b border-m31-border px-4 py-3"><strong className="text-sm">Resultados</strong><span className="text-xs text-m31-text-muted">{encontrados.length}</span></div>
      {encontrados.length === 0 ? <p className="p-4 text-sm text-m31-text-muted">Nenhum pedido encontrado.</p> : encontrados.slice(0, 5).map(r => (
        <div key={r.row_id} className="flex min-h-14 items-center gap-3 border-b border-m31-border px-4 py-2 last:border-b-0">
          <button type="button" onClick={() => onOpenOrder(r)} className="min-w-0 flex-1 text-left">
            <span className="block truncate font-semibold text-m31-ink">{r.nome}</span>
            <span className="block truncate text-xs text-m31-text-muted">{r.quantidade} camisa(s) · {r.resumo_itens}</span>
          </button>
          <div className="text-right"><span className={r.pagamento_status === 'pago' ? 'block text-xs font-bold text-emerald-700' : 'block text-xs font-bold text-amber-700'}>{r.pagamento_status === 'pago' ? 'Pago' : 'Pendente'}</span><button type="button" onClick={() => onOpenOrder(r)} className="mt-1 min-h-11 rounded-xl border border-m31-border px-3 text-sm font-bold text-m31-primary">Modificar</button></div>
        </div>
      ))}
    </div>}
  </div>;
}
