import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cartinhasApi, CARTINHAS_VOLUNTARIAS_QUERY_KEY, cartinhaImprimivel } from '@/lib/m31CartinhasApi';
import CartinhaEditor from './CartinhaEditor';
import { ordenarAlfabetico } from './cartinhaUtils';
import { normalizarBuscaCartinha } from './cartinhaMetas';
import { sincronizarRascunhos } from './cartinhaSincronizacao';

const statusNome = { pendente: 'A escrever', em_elaboracao: 'Rascunho', revisar_cartinha: 'Revisar', pronta: 'Pronta', entregue: 'Entregue' };
const btn = { minHeight: 56, border: '1px solid #EADFE3', borderRadius: 18, padding: '14px 18px', background: '#FFF', color: '#5B0E2D', fontSize: 18, cursor: 'pointer' };

/** Área nominal secundária. Não importa metas, sorteio ou escrita em lote. */
export default function CartinhaVoluntarias({ autoraId, onClose }) {
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState(null);
  const ultimo = useRef(0);
  const { data, error, refetch } = useQuery({
    queryKey: CARTINHAS_VOLUNTARIAS_QUERY_KEY, queryFn: cartinhasApi.listarVoluntarias,
    retry: false, enabled: !editando, notifyOnChangeProps: editando ? [] : undefined,
    refetchOnWindowFocus: !editando, refetchOnReconnect: !editando,
    refetchInterval: editando ? false : 60000, refetchIntervalInBackground: false,
  });
  const voluntarias = useMemo(() => ordenarAlfabetico((data?.inscricoes || []).filter(i => i.tipo === 'voluntario')), [data]);
  const filtradas = useMemo(() => voluntarias.filter(i => normalizarBuscaCartinha(`${i.nome} ${i.cidade} ${i.nome_igreja}`).includes(normalizarBuscaCartinha(busca))), [voluntarias, busca]);
  const receberSalva = useCallback(updated => {
    if (updated?.tipo !== 'voluntario') return;
    qc.setQueryData(CARTINHAS_VOLUNTARIAS_QUERY_KEY, atual => atual ? {
      ...atual, inscricoes: atual.inscricoes.map(i => i.id === updated.id ? { ...i, ...updated } : i),
    } : atual);
  }, [qc]);
  useEffect(() => {
    if (!data || editando || Date.now() - ultimo.current < 60000) return;
    ultimo.current = Date.now();
    let ativo = true;
    sincronizarRascunhos({ autoraId, inscricoes: voluntarias, salvar: cartinhasApi.salvar, escopo: 'voluntarias' })
      .then(result => { if (ativo && result.sincronizados) qc.invalidateQueries({ queryKey: CARTINHAS_VOLUNTARIAS_QUERY_KEY }); })
      .catch(() => { /* o editor mantém seu próprio aviso de salvamento */ });
    return () => { ativo = false; };
  }, [data, editando, autoraId, voluntarias, qc]);

  return <>
    <section role="dialog" aria-modal="true" aria-labelledby="cartinhas-voluntarias-titulo" style={{ position: 'fixed', inset: 0, zIndex: 350, background: '#FBF8F5', overflowY: 'auto', fontFamily: 'Inter, Arial, sans-serif' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 20px 56px' }}>
        <button type="button" onClick={onClose} style={btn}>← Voltar às inscritas</button>
        <h1 id="cartinhas-voluntarias-titulo" style={{ fontSize: 30, lineHeight: 1.25, color: '#5B0E2D', margin: '22px 0 6px' }}>Escrever para Voluntária</h1>
        <p style={{ fontSize: 17, color: '#705C65', margin: '0 0 20px' }}>Equipe · fora da meta</p>
        {!data ? <p role={error ? 'alert' : 'status'}>{error ? 'Não foi possível carregar as voluntárias.' : 'Carregando voluntárias…'}</p> : <>
          <input aria-label="Buscar voluntária" placeholder="Buscar voluntária" value={busca} onChange={e => setBusca(e.target.value)} style={{ width: '100%', minHeight: 60, boxSizing: 'border-box', padding: 18, fontSize: 18, border: '1px solid #EADFE3', borderRadius: 18 }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, margin: '24px 0' }}>
            <span>Cartinhas da equipe</span>
            <a href="/cartinhas-imprimir?lista=voluntarias" target="_blank" rel="noopener noreferrer" style={{ ...btn, textDecoration: 'none' }}>Imprimir ({voluntarias.filter(cartinhaImprimivel).length})</a>
          </div>
          <div style={{ display: 'grid', gap: 18 }}>
            {filtradas.map(i => <button key={i.id} type="button" onClick={() => setEditando(i)} style={{ ...btn, minHeight: 120, borderRadius: 24, padding: 22, textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
              <span style={{ minWidth: 0 }}><strong style={{ display: 'block', fontSize: 23, lineHeight: 1.35, overflowWrap: 'anywhere' }}>{i.nome}</strong><span style={{ display: 'block', marginTop: 10, color: '#705C65', fontSize: 17 }}>{statusNome[i.cartinha_status || 'pendente'] || 'Revisar'}</span></span>
              <span style={{ color: '#5B0E2D', fontSize: 18 }}>Escrever</span>
            </button>)}
            {!filtradas.length && <p>Nenhuma voluntária neste filtro.</p>}
          </div>
        </>}
        {error && <button type="button" onClick={() => refetch()} style={{ ...btn, marginTop: 16 }}>Tentar novamente</button>}
      </div>
    </section>
    {editando && <CartinhaEditor key={editando.id} inscricao={editando} onSaved={receberSalva} onClose={() => setEditando(null)} />}
  </>;
}
