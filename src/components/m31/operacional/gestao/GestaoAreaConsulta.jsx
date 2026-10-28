import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Search } from 'lucide-react';
import { gestaoError, gestaoRequest, gestaoStatus } from '@/lib/m31GestaoApi';
import M31SkeletonList from '../M31SkeletonList';

const LABELS = { voluntarias: 'Voluntárias', caravanas: 'Caravanas', camisas: 'Camisas' };

export default function GestaoAreaConsulta({ sessionId, area }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('todas');
  const [cursor, setCursor] = useState(0);
  useEffect(() => { setCursor(0); }, [search, filter]);
  const query = useQuery({
    queryKey: ['m31-gestao-consulta', sessionId, area, search, filter, cursor],
    queryFn: async () => {
      if (area === 'camisas') {
        const result = await gestaoRequest('m31CamisasOperacional', { session_id: sessionId, action: 'listar' });
        const filtered = (result.rows || []).filter((row) => {
          if (filter === 'oficiais' && row.pagamento_status !== 'pago') return false;
          if (filter === 'acao' && row.pagamento_status === 'pago' && row.entregue === true) return false;
          return `${row.nome || ''} ${row.whatsapp || ''}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'));
        });
        return { items: filtered.slice(cursor, cursor + 25), total: filtered.length, next_cursor: cursor + 25 < filtered.length ? cursor + 25 : null };
      }
      return gestaoRequest('m31ResumoOperacional', { session_id: sessionId, operacao: area, view: filter, search, cursor, limit: 25 });
    },
    enabled: Boolean(sessionId),
    retry: false,
  });
  const total = query.data?.total;
  const items = query.data?.items || [];
  return (
    <section className="m31-gestao-list-section">
      <header>
        <p className="m31-gestao-eyebrow">Somente consulta</p>
        <h1>{LABELS[area]}</h1>
      </header>
      <label className="m31-gestao-search">
        <Search size={19} aria-hidden="true" />
        <span className="sr-only">Buscar por nome ou WhatsApp</span>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou WhatsApp" type="search" />
      </label>
      <div className="m31-gestao-filters" role="group" aria-label="Filtrar lista">
        {[['todas', 'Todas'], ['oficiais', 'Regularizadas'], ['acao', 'Precisam de ação']].map(([key, label]) => (
          <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>
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
          <p className="m31-gestao-muted">{Number.isFinite(total) ? `${total} resultados` : 'Total não informado'}</p>
          {!items.length ? (
            <div className="m31-gestao-empty">
              <h2>Nenhum resultado encontrado</h2>
              <p>Tente outra busca ou filtro.</p>
            </div>
          ) : (
            <div className="m31-gestao-list">
              {items.map((row, index) => (
                <article className="m31-gestao-person" key={row.id || row.row_id || index}>
                  <strong>{row.nome || 'Nome não informado'}</strong>
                  <p className="m31-gestao-muted">{row.whatsapp || row.lider_whatsapp || 'WhatsApp não informado'}</p>
                  {row.lider_nome && <p className="m31-gestao-muted">Líder: {row.lider_nome}</p>}
                  {row.setor && <p className="m31-gestao-muted">{row.setor}</p>}
                  {area === 'camisas' && (
                    <p className="m31-gestao-person-note">
                      {row.modelo || 'Modelo não informado'} · {row.tamanho || 'Tamanho não informado'} · {gestaoStatus(row.pagamento_status)}
                    </p>
                  )}
                  {area === 'caravanas' && (
                    <p className="m31-gestao-person-note">
                      {Number.isFinite(row.confirmadas) ? `${row.confirmadas} confirmadas` : 'Confirmadas não informadas'} · {Number.isFinite(row.pendentes) ? `${row.pendentes} pendentes` : 'Pendentes não informadas'}
                    </p>
                  )}
                  {row.motivo && <p className="m31-gestao-person-note">{row.motivo}</p>}
                </article>
              ))}
            </div>
          )}
          {Number.isFinite(total) && total > 25 && (
            <div className="m31-gestao-pagination">
              <span>{cursor + 1}–{cursor + items.length} de {total}</span>
              <div>
                <button type="button" className="m31-gestao-btn" disabled={cursor === 0} onClick={() => setCursor(Math.max(0, cursor - 25))}>
                  <ArrowLeft size={17} />Anterior
                </button>
                <button type="button" className="m31-gestao-btn" disabled={query.data?.next_cursor == null} onClick={() => setCursor(query.data.next_cursor)}>
                  Próxima<ArrowRight size={17} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
