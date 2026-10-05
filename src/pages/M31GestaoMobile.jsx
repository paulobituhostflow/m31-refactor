import { useState } from 'react';
import { CircleCheckBig, QrCode } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import M31OperationalHome from '@/components/m31/operacional/M31OperationalHome';
import M31CamisasMobile from '@/components/m31/operacional/M31CamisasMobile';
import M31InscritasOperational from '@/components/m31/operacional/inscritas/M31InscritasOperational';
import M31VoluntariasOperational from '@/components/m31/operacional/voluntarias/M31VoluntariasOperational';
import M31CaravanasOperational from '@/components/m31/operacional/caravanas/M31CaravanasOperational';
import M31OperationalShell from '@/components/m31/operacional/M31OperationalShell';
import M31SkeletonList from '@/components/m31/operacional/M31SkeletonList';
import { useM31OperationalSummary } from '@/hooks/useM31OperationalSummary';
import { useM31OperationalShirts } from '@/hooks/useM31OperationalShirts';
import { useM31PullToRefresh } from '@/hooks/useM31PullToRefresh';
import { useM31UsageTracker } from '@/hooks/useM31UsageTracker';
import { useM31Auth } from '@/lib/m31Auth';

const OPERATOR_STORAGE_KEY = 'm31_operador_atual';
const PREVIEW_SUMMARY = {
  counts: { oficiais_conciliadas: null, em_conciliacao: null },
  operations: {
    inscritas: { aguardando_pagamento: null },
    voluntarias: { ativas: null, acao: null },
    caravanas: { regularizadas: null, acao: null },
    camisas: { pagas: 6, acao: 68 },
  },
};

function readOperator() {
  try {
    const stored = JSON.parse(localStorage.getItem(OPERATOR_STORAGE_KEY) || 'null');
    return stored?.nome && stored?.session_id && Number(stored.expires_at) > Date.now() ? stored : null;
  } catch {
    return null;
  }
}

function LoadingScreen() {
  return (
    <main className="min-h-dvh bg-m31-canvas px-4 py-6 font-m31">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 h-8 w-40 animate-pulse rounded bg-stone-200" />
        <M31SkeletonList />
      </div>
    </main>
  );
}

function MoreView({ pode }) {
  return (
    <section className="space-y-4">
      <header>
        <p className="text-sm font-medium text-m31-text-muted">Ferramentas de apoio</p>
        <h1 className="mt-1 text-2xl font-bold text-m31-ink">Mais</h1>
      </header>
      {pode?.fazerCheckin && (
        <button type="button" className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-m31-border bg-m31-surface p-4 text-left active:bg-m31-surface-warm">
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-m31-primary-tint text-m31-primary">
            <QrCode aria-hidden="true" className="h-6 w-6" />
          </span>
          <span>
            <span className="block font-bold text-m31-ink">Check-in</span>
            <span className="mt-1 block text-sm text-m31-text-muted">Acesso secundário para o dia do evento.</span>
          </span>
        </button>
      )}
      <div className="rounded-xl border border-m31-border bg-m31-surface p-4">
        <CircleCheckBig aria-hidden="true" className="h-6 w-6 text-m31-success" />
        <p className="mt-3 font-bold text-m31-ink">Painel focado na operação</p>
        <p className="mt-1 text-sm leading-5 text-m31-text-muted">
          Importações, relatórios e configurações técnicas continuam separados da rotina da equipe.
        </p>
      </div>
    </section>
  );
}

export default function M31GestaoMobile() {
  const previewPersona = import.meta.env.DEV
    ? new URLSearchParams(window.location.search).get('preview')
    : null;
  const previewMode = ['thaysa', 'thalita', 'dulce', 'equipe'].includes(previewPersona);
  const { user, membro, loading, pode } = useM31Auth();
  useM31UsageTracker(membro);
  const [operator] = useState(readOperator);
  const previewNames = { thaysa: 'Thaysa', thalita: 'Thalita', dulce: 'Dulce', equipe: 'Prévia da equipe' };
  const previewOperations = {
    thaysa: ['inscritas', 'caravanas'],
    thalita: ['inscritas', 'voluntarias'],
    dulce: ['camisas'],
    equipe: ['inscritas', 'voluntarias', 'caravanas'],
  };
  const effectiveOperator = previewMode ? { nome: previewNames[previewPersona] } : operator;
  const camisasOnly = !previewMode && Array.isArray(operator?.operacoes_permitidas) && operator.operacoes_permitidas.length === 1 && operator.operacoes_permitidas[0] === 'camisas';
  const [activeView, setActiveView] = useState(previewPersona === 'dulce' ? 'camisas' : (camisasOnly ? 'camisas' : 'inicio'));
  const summaryQuery = useM31OperationalSummary(previewMode ? null : operator?.session_id);
  const shirtSummaryQuery = useM31OperationalShirts(operator?.session_id, { enabled: !previewMode && operator?.operacoes_permitidas?.includes('camisas') });
  const pull = useM31PullToRefresh({ onRefresh: summaryQuery.refetch });

  if (loading && !previewMode) return <LoadingScreen />;
  if (!previewMode && (!user || (!membro && user.role !== 'admin') || !operator)) {
    window.location.replace('/gestao');
    return null;
  }

  const hasOperationalAccess = Boolean(operator?.operacoes_permitidas?.length) || pode?.verInscricoes || pode?.verCaravanas || pode?.verVoluntarios || pode?.fazerCheckin;
  if (!previewMode && !hasOperationalAccess) {
    window.location.replace('/m31-sem-acesso');
    return null;
  }

  function logout() {
    localStorage.removeItem(OPERATOR_STORAGE_KEY);
    base44.auth.logout('/gestao');
  }

  const effectiveSummary = previewMode ? PREVIEW_SUMMARY : {
    ...(summaryQuery.data || {}),
    operations: {
      ...(summaryQuery.data?.operations || {}),
      ...(operator?.operacoes_permitidas?.includes('camisas') ? { camisas: { pagas: shirtSummaryQuery.data?.summary?.pagas, acao: shirtSummaryQuery.data?.summary?.precisam_acao } } : {}),
    },
  };

  return (
    <M31OperationalShell
      operatorName={effectiveOperator.nome}
      activeView={activeView === 'mais' ? 'mais' : 'inicio'}
      pullHandlers={pull.handlers}
      onHome={() => setActiveView(camisasOnly ? 'camisas' : 'inicio')}
      onMore={() => setActiveView('mais')}
      onLogout={logout}
    >
      {pull.pullReady && <p className="mb-3 text-center text-xs font-semibold text-m31-primary">Solte para atualizar</p>}
      {activeView === 'inicio' && (
        <M31OperationalHome
          operatorName={effectiveOperator.nome}
          summary={effectiveSummary}
          loading={previewMode ? false : summaryQuery.isLoading}
          error={previewMode ? null : summaryQuery.error}
          onOpen={setActiveView}
          visibleOperations={previewMode ? previewOperations[previewPersona] : operator.operacoes_permitidas}
        />
      )}
      {activeView === 'mais' && <MoreView pode={pode} />}
      {activeView === 'camisas' && <M31CamisasMobile sessionId={operator?.session_id} preview={previewMode} onBack={camisasOnly ? undefined : () => setActiveView('inicio')} />}
      {activeView === 'inscritas' && <M31InscritasOperational sessionId={operator?.session_id} onBack={() => setActiveView('inicio')} />}
      {activeView === 'voluntarias' && <M31VoluntariasOperational sessionId={operator?.session_id} onBack={() => setActiveView('inicio')} />}
      {activeView === 'caravanas' && <M31CaravanasOperational sessionId={operator?.session_id} onBack={() => setActiveView('inicio')} />}
    </M31OperationalShell>
  );
}
