import { ExternalLink } from 'lucide-react';

// Bloco de destaque: a planilha é a ação principal da operação —
// visível sem rolagem. Lojinha e exportação ficam discretas abaixo.
export default function HubDestaque({ planilhaUrl, onExportar, pending }) {
  return (
    <section className="border-t border-m31-border pt-2" aria-label="Atalhos da operação">
      <div className="flex items-center justify-between gap-3">
        <a href={planilhaUrl || '#'} target="_blank" rel="noreferrer" className="flex min-h-11 items-center gap-2 text-sm font-bold text-m31-primary">
          Planilha de vendas <ExternalLink aria-hidden="true" className="h-4 w-4" />
        </a>
        <span className="text-xs text-m31-text-muted">Apoio operacional</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <a href="/m31-camisas" target="_blank" rel="noreferrer" className="flex min-h-12 items-center rounded-xl px-1 text-sm font-bold text-m31-primary active:opacity-70">Ver lojinha</a>
        <button type="button" onClick={onExportar} disabled={pending} className="flex min-h-12 items-center rounded-xl px-1 text-sm font-semibold text-m31-text-muted active:opacity-70 disabled:opacity-50">
          Exportar pedidos ⋯
        </button>
      </div>
    </section>
  );
}