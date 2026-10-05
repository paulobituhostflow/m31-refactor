import { Ellipsis, Home, LogOut } from 'lucide-react';

const LOGO = '/assets/a22f06b49_LOGOM31FILHAS1.png';

export default function M31OperationalShell({ operatorName, activeView, pullHandlers, onHome, onMore, onLogout, children }) {
  return (
    <div className="min-h-dvh bg-m31-canvas font-m31 text-m31-ink" {...pullHandlers}>
      <header className="sticky top-0 z-20 border-b border-m31-border bg-m31-surface">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
          <img src={LOGO} alt="M31 Filhas" className="h-8 w-auto object-contain" />
          <div className="flex items-center gap-2">
            <span className="max-w-32 truncate text-sm font-semibold text-m31-text-muted">{operatorName}</span>
            <button type="button" onClick={onLogout} aria-label="Sair do painel" className="flex h-12 w-12 items-center justify-center rounded-lg text-m31-text-muted active:bg-m31-surface-warm">
              <LogOut aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl px-4 pb-24 pt-5">{children}</main>

      <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-30 border-t border-m31-border bg-m31-surface">
        <div className="mx-auto flex h-16 max-w-xl">
          <button type="button" onClick={onHome} className={activeView === 'inicio' ? 'flex min-h-12 flex-1 flex-col items-center justify-center gap-1 text-m31-primary' : 'flex min-h-12 flex-1 flex-col items-center justify-center gap-1 text-m31-text-muted'}>
            <Home aria-hidden="true" className="h-5 w-5" />
            <span className="text-xs font-semibold">Início</span>
          </button>
          <button type="button" onClick={onMore} className={activeView === 'mais' ? 'flex min-h-12 flex-1 flex-col items-center justify-center gap-1 text-m31-primary' : 'flex min-h-12 flex-1 flex-col items-center justify-center gap-1 text-m31-text-muted'}>
            <Ellipsis aria-hidden="true" className="h-5 w-5" />
            <span className="text-xs font-semibold">Mais</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

