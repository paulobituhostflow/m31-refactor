import { ArrowLeft, Search } from 'lucide-react';

export default function M31OperationalListHeader({ title, description, view, onView, search, onSearch, onBack, total, hideViews = false }) {
  return <>
    <header className="flex items-start gap-3">
      <button type="button" onClick={onBack} aria-label="Voltar" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-m31-primary active:bg-m31-primary-tint"><ArrowLeft className="h-5 w-5" /></button>
      <div><p className="text-sm font-semibold text-m31-primary">Minha operação</p><h1 className="text-3xl font-bold tracking-tight text-m31-ink">{title}</h1><p className="mt-1 text-sm text-m31-text-muted">{description}</p></div>
    </header>
    {!hideViews && (
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onView('acao')} className={view === 'acao' ? 'min-h-12 rounded-xl bg-m31-primary px-3 font-bold text-white' : 'min-h-12 rounded-xl border border-m31-border bg-white px-3 font-semibold text-m31-text-muted'}>Precisam de ação</button>
        <button type="button" onClick={() => onView('oficiais')} className={view === 'oficiais' ? 'min-h-12 rounded-xl bg-m31-primary px-3 font-bold text-white' : 'min-h-12 rounded-xl border border-m31-border bg-white px-3 font-semibold text-m31-text-muted'}>Regularizadas</button>
      </div>
    )}
    <label className="flex min-h-12 items-center gap-3 rounded-xl border border-m31-border bg-white px-4 focus-within:border-m31-primary"><Search className="h-5 w-5 text-m31-text-muted" /><span className="sr-only">Buscar</span><input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Buscar nome ou WhatsApp" className="h-12 min-w-0 flex-1 bg-transparent outline-none" /></label>
    <p className="text-sm font-semibold text-m31-text-muted">{total} resultados nesta visão</p>
  </>;
}