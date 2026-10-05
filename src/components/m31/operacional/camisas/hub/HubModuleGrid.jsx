import { Boxes, ClipboardList, MessageCircle, Shirt, Store, UsersRound } from 'lucide-react';

const MODULES = [
  { id: 'produtos', label: 'Produtos', Icon: Shirt },
  { id: 'estoque', label: 'Estoque', Icon: Boxes },
  { id: 'pedidos', label: 'Pedidos', Icon: ClipboardList },
  { id: 'clientes', label: 'Clientes', Icon: UsersRound },
  { id: 'lojinha', label: 'Lojinha', Icon: Store },
  { id: 'chat', label: 'Chat IA', Icon: MessageCircle },
];

// Grade de módulos do hub — os acessos da Central visíveis na própria tela.
export default function HubModuleGrid({ onOpen, badges = {} }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {MODULES.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onOpen(id)}
          className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-m31-border bg-white active:bg-m31-surface-warm"
        >
          <span className="relative flex h-11 w-11 items-center justify-center rounded-lg bg-m31-primary-tint text-m31-primary">
            <Icon aria-hidden="true" className="h-5 w-5" />
            {badges[id] ? <span className="absolute -right-1 -top-1 rounded-full bg-amber-500 px-1.5 text-[10px] font-bold leading-4 text-white">{badges[id]}</span> : null}
          </span>
          <span className="text-sm font-semibold text-m31-ink">{label}</span>
        </button>
      ))}
    </div>
  );
}