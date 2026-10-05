import { useSearchParams } from 'react-router-dom';
import { ehInscritaDaMeta } from '../../worker/functions/m31Cartinhas/cartinhaPadrao.js';
import { useQuery } from '@tanstack/react-query';
import { cartinhasApi, CARTINHAS_QUERY_KEY, CARTINHAS_VOLUNTARIAS_QUERY_KEY, cartinhaImprimivel, mesmoLoteCartinhas } from '@/lib/m31CartinhasApi';
import M31CartinhasPrint from '@/components/m31/cartinhas/M31CartinhasPrint';
import { ordenarAlfabetico } from '@/components/m31/cartinhas/cartinhaUtils';
import { copiasDaAutora } from '@/components/m31/cartinhas/cartinhaDispositivo';

export default function M31CartinhasPrintPage() {
  const [params] = useSearchParams();
  const equipe = params.get('lista') === 'voluntarias';
  const pertence = row => equipe ? row.tipo === 'voluntario' : ehInscritaDaMeta(row);
  const { data, dataUpdatedAt, isLoading, error, refetch } = useQuery({
    queryKey: equipe ? CARTINHAS_VOLUNTARIAS_QUERY_KEY : CARTINHAS_QUERY_KEY,
    queryFn: equipe ? cartinhasApi.listarVoluntarias : cartinhasApi.listar,
    retry: false,
  });
  const cartinhas = ordenarAlfabetico((data?.inscricoes || []).filter(pertence).filter(cartinhaImprimivel));

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e9e6e0' }}>
        <div style={{ width: '28px', height: '28px', border: '3px solid #d8d3ca', borderTopColor: '#8B1A2B', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (error) return <div role="alert" style={{ padding: '40px', textAlign: 'center' }}>Não foi possível carregar as Cartinhas. <button onClick={() => refetch()}>Tentar novamente</button></div>;
  if (data?.config?.cartinha_lote_liberado !== true) return <main role="status" style={{ padding: '40px 20px', textAlign: 'center' }}>
    <h1>Impressão em conferência</h1>
    <p>Os vínculos das destinatárias precisam ser conferidos antes da impressão em lote.</p>
    <a href="/cartinhas">Voltar às Cartinhas</a>
  </main>;
  async function conferirAntesDeImprimir() {
    // Não imprimir uma versão antiga se esta autora tem alterações locais não sincronizadas.
    const copies = await copiasDaAutora(data.user.id);
    const idsDaLista = new Set((data?.inscricoes || []).filter(pertence).map(i => i.id));
    if (copies.some(copy => idsDaLista.has(copy.inscricaoId) && (copy.dirty || copy.pending))) throw Object.assign(new Error('Há rascunhos neste dispositivo aguardando sincronização. Abra e salve as cartinhas antes de imprimir.'), { code: 'rascunhos_nao_sincronizados' });
    const fresh = await refetch();
    if (fresh.error || !fresh.data) throw new Error('Não foi possível conferir as inscrições. Tente novamente.');
    if (fresh.data.config?.cartinha_lote_liberado !== true) throw new Error('A impressão em lote voltou para conferência.');
    return mesmoLoteCartinhas(cartinhas,(fresh.data.inscricoes || []).filter(pertence));
  }
  return <M31CartinhasPrint escopo={equipe ? 'voluntarias' : 'inscritas'} cartinhas={cartinhas} onBeforePrint={conferirAntesDeImprimir} verificadoEm={dataUpdatedAt} />;
}