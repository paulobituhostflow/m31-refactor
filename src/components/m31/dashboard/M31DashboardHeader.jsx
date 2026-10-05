/**
 * M31DashboardHeader — Header executivo SaaS
 * Mostra: Nome do evento, status, ambiente, usuário, última sincronização
 */

import M31Button from '../executive/M31ExecutiveButton';

export default function M31DashboardHeader({ eventName = 'M31 Filhas 2026', eventStatus = 'ativo', user, onLogout }) {
  return (
    <div className="bg-card border-b border-border sticky top-0 z-40 shadow-m31-sm">
      <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        {/* Esquerda: Nome do evento + status */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-grad-brand flex items-center justify-center flex-shrink-0 shadow-m31-sm">
            <span className="text-white font-bold text-sm">M</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-heading font-bold text-foreground text-sm sm:text-base truncate">{eventName}</h1>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success flex-shrink-0">
                <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
                Ativo
              </span>
            </div>
            <p className="text-xs text-muted-foreground hidden sm:block">Produção · Imersão 2026</p>
          </div>
        </div>

        {/* Direita: Usuário + Logout */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs sm:text-sm font-semibold text-foreground">
              {user?.full_name || 'Usuário'}
            </p>
            <p className="text-xs text-muted-foreground">
              {user?.role === 'admin' ? 'Admin' : 'Coordenador'}
            </p>
          </div>
          <M31Button variant="ghost" size="sm" onClick={onLogout}>
            Sair
          </M31Button>
        </div>
      </div>
    </div>
  );
}