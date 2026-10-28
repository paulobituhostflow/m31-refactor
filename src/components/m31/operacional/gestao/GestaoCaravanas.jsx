import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Plus, RefreshCw, Search } from 'lucide-react';
import CaravanaDashboard from '@/components/m31/caravanas/CaravanaDashboard';
import CaravanaRanking from '@/components/m31/caravanas/CaravanaRanking';
import { CaravanaGestaoCard } from '@/components/m31/caravanas/CaravanaCard';
import { gestaoError, gestaoRequest } from '@/lib/m31GestaoApi';
import M31SkeletonList from '../M31SkeletonList';
import GestaoNovaCaravana from './GestaoNovaCaravana';
import GestaoInscricaoFicha from './GestaoInscricaoFicha';
import GestaoCamisasCaravana from './GestaoCamisasCaravana';

export default function GestaoCaravanas({ sessionId, canOperate = false, canOperateInscritas = false }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('todas');
  const [cursor, setCursor] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const [highlightedId, setHighlightedId] = useState(null);
  const [form, setForm] = useState(null);
  const [participantId, setParticipantId] = useState(null);
  const [notice, setNotice] = useState('');
  const query = useQuery({
    queryKey: ['m31-gestao-caravanas-view', sessionId, search, filter, cursor],
    queryFn: () => gestaoRequest('m31GestaoCaravanas', { action: 'listar', session_id: sessionId, search, filtro: filter, cursor, limit: 25 }),
    enabled: Boolean(sessionId),
    retry: false,
  });
  const detail = useQuery({
    queryKey: ['m31-gestao-caravana-detail', sessionId, expandedId],
    queryFn: () => gestaoRequest('m31GestaoCaravanas', { action: 'detalhe', session_id: sessionId, id: expandedId }),
    enabled: Boolean(sessionId && expandedId),
    retry: false,
    refetchInterval: expandedId ? 30000 : false,
  });
  const response = query.data;
  const items = response?.items || [];
  const allowed = canOperate && response?.can_operate === true;
  const canViewFinance = response?.can_view_finance === true;
  const summary = response?.resumo;
  const highlighted = !items.some((item) => item.id === highlightedId) && response?.ranking?.find((item) => item.id === highlightedId);

  useEffect(() => {
    if (!highlightedId) return;
    document.getElementById(`gestao-caravana-${highlightedId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightedId]);

  function changeSearch(value) {
    setSearch(value);
    setCursor(0);
    setHighlightedId(null);
  }

  async function copyLink(item) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/m31-caravana?caravana_id=${encodeURIComponent(item.id)}`);
      setNotice('Link de inscrição da caravana copiado. Nenhum convite foi enviado.');
    } catch {
      setNotice('Não foi possível copiar o link neste navegador.');
    }
  }

  function card(item) {
    const displayed = detail.data?.caravana?.id === item.id ? detail.data.caravana : item;
    return (
      <CaravanaGestaoCard
        key={item.id}
        caravana={displayed}
        expanded={expandedId === item.id}
        highlighted={highlightedId === item.id}
        onToggle={() => setExpandedId((previous) => previous === item.id ? null : item.id)}
        onEdit={() => setForm(displayed)}
        canOperate={allowed}
        canViewFinance={canViewFinance}
        detail={expandedId === item.id ? detail.data : null}
        loading={expandedId === item.id && detail.isLoading}
        error={expandedId === item.id && detail.error}
        onRetry={() => detail.refetch()}
        onOpenParticipant={setParticipantId}
        onCopyLink={() => copyLink(item)}
      />
    );
  }

  return (
    <section className="m31-gestao-list-section m31-gestao-caravanas-view">
      <header className="m31-gestao-section-heading">
        <div>
          <p className="m31-gestao-eyebrow">M31 Filhas · Caravanas</p>
          <h1>Caravanas</h1>
          <p className="m31-gestao-muted">Líderes, participantes e situação de cada grupo.</p>
        </div>
        {allowed && response?.can_create === true && (
          <button type="button" className="m31-gestao-btn m31-gestao-btn-primary" onClick={() => setForm({})}>
            <Plus size={18} aria-hidden="true" />Nova caravana
          </button>
        )}
      </header>
      {notice && <p className="m31-gestao-success" role="status">{notice}</p>}
      <label className="m31-gestao-search">
        <Search size={19} aria-hidden="true" />
        <span className="sr-only">Buscar caravana por nome, líder ou cidade</span>
        <input value={search} onChange={(event) => changeSearch(event.target.value)} placeholder="Buscar por nome, líder ou cidade" type="search" />
      </label>
      <div className="m31-gestao-filters" role="group" aria-label="Filtrar caravanas">
        {[['todas', 'Todas'], ['regularizadas', 'Regularizadas'], ['acao', 'Precisam de ação']].map(([key, label]) => (
          <button type="button" key={key} aria-pressed={filter === key} onClick={() => { setFilter(key); setCursor(0); }}>{label}</button>
        ))}
      </div>
      {query.isLoading ? (
        <M31SkeletonList />
      ) : query.error ? (
        <div className="m31-gestao-error" role="alert">
          <p>{gestaoError(query.error)}</p>
          <button type="button" className="m31-gestao-btn" onClick={() => query.refetch()}>Tentar novamente</button>
        </div>
      ) : (
        <>
          {summary && (
            <CaravanaDashboard
              showFinance={canViewFinance}
              stats={{
                totalCaravanas: summary.total_caravanas,
                totalMembros: summary.total_participantes,
                confirmados: summary.confirmadas,
                pendentes: summary.pendentes,
                receita: canViewFinance ? summary.financeiro?.receita : undefined
              }}
            />
          )}
          {response?.ranking?.length > 0 && (
            <CaravanaRanking
              serverRanking={response.ranking}
              serverTotal={summary?.total_participantes}
              onSelect={(id) => { setExpandedId(id); setHighlightedId(id); }}
            />
          )}
          <div className="m31-gestao-result-line">
            <p>{Number.isFinite(response?.total) ? `${response.total} caravanas encontradas` : 'Total não informado'}</p>
            <button type="button" className="m31-gestao-btn m31-gestao-btn-quiet" onClick={() => query.refetch()} disabled={query.isFetching}>
              <RefreshCw size={16} aria-hidden="true" />Atualizar
            </button>
          </div>
          {highlighted && (
            <div>
              {card(highlighted)}
              {expandedId === highlighted.id && detail.data?.caravana?.id === highlighted.id && (
                <GestaoCamisasCaravana sessionId={sessionId} caravana={detail.data.caravana} data={detail.data.camisas} canSetPrice={allowed && canViewFinance} onRefresh={() => detail.refetch()} />
              )}
            </div>
          )}
          {items.length ? (
            <div className="m31-gestao-caravanas-cards">
              {items.map(item => (
                <div key={item.id}>
                  {card(item)}
                  {expandedId === item.id && detail.data?.caravana?.id === item.id && (
                    <GestaoCamisasCaravana sessionId={sessionId} caravana={detail.data.caravana} data={detail.data.camisas} canSetPrice={allowed && canViewFinance} onRefresh={() => detail.refetch()} />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="m31-gestao-empty">
              <h2>Nenhuma caravana encontrada</h2>
              <p>Tente outra busca ou filtro.</p>
            </div>
          )}
          {Number.isFinite(response?.total) && response.total > 25 && (
            <div className="m31-gestao-pagination">
              <span>{cursor + 1}–{cursor + items.length} de {response.total}</span>
              <div>
                <button type="button" className="m31-gestao-btn" disabled={cursor === 0 || query.isFetching} onClick={() => setCursor(Math.max(0, cursor - 25))}>
                  <ArrowLeft size={17} />Anterior
                </button>
                <button type="button" className="m31-gestao-btn" disabled={response.next_cursor == null || query.isFetching} onClick={() => setCursor(Number(response.next_cursor))}>
                  Próxima<ArrowRight size={17} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {form && allowed && (form.id || response?.can_create === true) && (
        <GestaoNovaCaravana
          key={form.id || 'new'}
          sessionId={sessionId}
          caravana={form.id ? form : undefined}
          onClose={() => setForm(null)}
          onSaved={() => setNotice(form.id ? 'Dados da caravana atualizados.' : 'Caravana cadastrada.')}
          canDelete={allowed && canViewFinance}
          onDeleted={() => setNotice('Caravana excluída. As inscrições e os pagamentos das participantes foram preservados.')}
        />
      )}
      {participantId && (
        <GestaoInscricaoFicha
          key={participantId}
          sessionId={sessionId}
          id={participantId}
          canOperate={canOperateInscritas}
          onClose={() => setParticipantId(null)}
        />
      )}
    </section>
  );
}
