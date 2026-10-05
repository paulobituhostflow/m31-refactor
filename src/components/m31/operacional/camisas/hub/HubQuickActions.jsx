import { Plus } from 'lucide-react';

export default function HubQuickActions({ onNovoPedido, onNovoCliente }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <button type="button" onClick={onNovoPedido} className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-m31-primary text-base font-bold text-white active:opacity-80">
        <Plus aria-hidden="true" className="h-5 w-5" />
        Novo pedido
      </button>
      <button type="button" onClick={onNovoCliente} className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-m31-border bg-white text-base font-bold text-m31-primary active:bg-m31-primary-tint">
        <Plus aria-hidden="true" className="h-5 w-5" />
        Novo cliente
      </button>
    </div>
  );
}