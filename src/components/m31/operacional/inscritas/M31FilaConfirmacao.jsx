import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { apresentacaoCanal, textoConfirmacao } from './confirmacaoResultado';

function horario(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString('pt-BR', { timeZone: 'America/Recife' });
}

export default function M31FilaConfirmacao({ inscricao, sessionId }) {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState('');
  const requestVersion = useRef(0);
  const consultar = useCallback(async () => {
    if (!inscricao?.id) return;
    const version = ++requestVersion.current;
    setLoading(true); setErro('');
    try {
      const res = await base44.functions.invoke('m31VincularPagamentoManual', {
        action: 'consultar_confirmacao', inscricao_id: inscricao.id, session_id: sessionId,
      });
      const data = res?.data ?? res;
      if (!data?.ok) throw new Error('Não foi possível consultar as confirmações.');
      if (version === requestVersion.current) setResultado({ inscricaoId: inscricao.id, ...data.confirmacao });
    } catch (error) {
      if (version === requestVersion.current) setErro(error?.response?.status === 403
        ? 'Sua conta não tem permissão para consultar este histórico.' : 'Não foi possível consultar o histórico. Tente atualizar.');
    } finally { if (version === requestVersion.current) setLoading(false); }
  }, [inscricao?.id, sessionId]);

  useEffect(() => {
    setResultado(null);
    consultar();
    return () => { requestVersion.current++; };
  }, [consultar]);

  const atual = resultado?.inscricaoId === inscricao?.id ? resultado : null;
  const items = Array.isArray(atual?.items) ? atual.items : [];
  return (
    <section className="min-w-0 rounded-xl border border-m31-border bg-white p-4 text-left" aria-label="Histórico de confirmação">
      <h3 className="text-sm font-bold text-m31-ink">Confirmação da participante</h3>
      <p className="mt-1 text-xs leading-5 text-m31-text-muted">Pagamento, fila e entrega são acompanhados separadamente por canal.</p>
      <button type="button" disabled={loading} onClick={consultar} className="mt-3 min-h-12 w-full rounded-xl border border-m31-border bg-white px-3 font-bold text-m31-primary disabled:opacity-40">
        {loading ? 'Consultando…' : 'Atualizar histórico da confirmação'}
      </button>
      {atual && (
        <div role="status" className="mt-3 min-w-0 space-y-3 text-sm leading-6 text-m31-ink">
          {!items.length && <p>Nenhuma confirmação persistida foi encontrada para esta inscrição.</p>}
          {items.map((item, index) => {
            const estado = apresentacaoCanal(item);
            const acceptedAt = horario(item.accepted_at || item.provider_accepted_at);
            return (
              <article key={`${item.canal}:${item.fila_id || item.id || index}`} className="min-w-0 rounded-lg border border-m31-border p-3">
                <h4 className="break-words font-bold">{estado.canal}</h4>
                <p className={`mt-1 break-words font-semibold ${estado.tom === 'attention' ? 'text-amber-800' : 'text-m31-ink'}`}>{estado.titulo}</p>
                <p className="mt-1 break-words text-xs leading-5 text-m31-text-muted">{estado.detalhe}</p>
                {(item.provider_message_id || item.fila_id || item.id || item.motivo) && (
                  <details className="mt-2 min-w-0 text-xs text-m31-text-muted">
                    <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-m31-primary">Ver comprovante e detalhes</summary>
                    <dl className="min-w-0 space-y-1 pb-1">
                      {item.provider_name && <div><dt className="font-semibold">Provedor</dt><dd className="break-words">{item.provider_name}</dd></div>}
                      {item.provider_message_id && <div><dt className="font-semibold">ID do provedor</dt><dd className="select-text break-all">{item.provider_message_id}</dd></div>}
                      {acceptedAt && <div><dt className="font-semibold">Aceite registrado em</dt><dd className="break-words">{acceptedAt}</dd></div>}
                      {(item.fila_id || item.id) && <div><dt className="font-semibold">Solicitação</dt><dd className="select-text break-all">{item.fila_id || item.id}</dd></div>}
                      {item.motivo && <div><dt className="font-semibold">Detalhe registrado</dt><dd className="break-words">{item.motivo}</dd></div>}
                    </dl>
                  </details>
                )}
              </article>
            );
          })}
          {atual.status !== 'consulta' && <p className="text-xs text-m31-text-muted">{textoConfirmacao(atual)}</p>}
          <p className="text-xs leading-5 text-m31-text-muted">Pendências históricas precisam de revisão individual. Consultar este histórico não solicita reenvio.</p>
        </div>
      )}
      {erro && <p role="alert" className="mt-3 text-sm text-red-700">{erro}</p>}
    </section>
  );
}
