import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import M31SkeletonList from '@/components/m31/operacional/M31SkeletonList';

// Clientes da lojinha — cadastro simples (nome + WhatsApp) pela própria
// Central, sem vínculo com inscrições do evento.
export default function HubClientes({ clientes, loading, preview, onNovo }) {
  const [search, setSearch] = useState('');
  const visiveis = useMemo(() => {
    const termo = search.trim().toLowerCase();
    return (clientes || []).filter((c) => !termo || `${c.nome || ''} ${c.whatsapp || ''} ${c.email || ''}`.toLowerCase().includes(termo));
  }, [clientes, search]);

  return (
    <section className="space-y-4">
      <button type="button" onClick={onNovo} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-m31-primary text-base font-bold text-white active:opacity-80">
        <Plus aria-hidden="true" className="h-5 w-5" />
        Novo cliente
      </button>

      <label className="flex min-h-12 items-center gap-3 rounded-xl border border-m31-border bg-white px-4 focus-within:border-m31-primary">
        <Search aria-hidden="true" className="h-5 w-5 text-m31-text-muted" />
        <span className="sr-only">Buscar cliente</span>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome ou WhatsApp" className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-stone-400" />
      </label>

      {loading ? <M31SkeletonList /> : (
        <div className="overflow-hidden rounded-xl border border-m31-border bg-white">
          {visiveis.length === 0 && <p className="p-6 text-center text-sm text-m31-text-muted">Nenhuma cliente encontrada.</p>}
          {visiveis.map((cliente) => (
            <div key={cliente.id} className="border-b border-m31-border px-4 py-3 last:border-b-0">
              <strong className="block truncate text-sm text-m31-ink">{cliente.nome}</strong>
              <span className="block truncate text-xs text-m31-text-muted">
                {cliente.whatsapp || 'sem WhatsApp'}{cliente.email ? ` · ${cliente.email}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
      {preview && <p className="text-xs text-m31-text-muted">Prévia: nenhuma cliente real é alterada.</p>}
    </section>
  );
}