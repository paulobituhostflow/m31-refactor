import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { computeM31Metrics } from '@/lib/m31Metrics';

/**
 * Fonte única de estatísticas de inscrições para o frontend.
 *
 * NÃO classifica nada: apenas lê as inscrições e delega a contagem a
 * computeM31Metrics, que soma o campo `estado_canonico` decidido no backend
 * por m31ConciliacaoCanonica. Assim Home, Dashboard, Inscritas e Saúde
 * respondem SEMPRE o mesmo número.
 *
 * Leitura em '-created_date' (descendente): a paginação ascendente é instável
 * no banco — repetia e perdia registros, e era a causa raiz dos números que
 * não fechavam entre telas.
 */
export function useM31InscricaoStats() {
  const queryClient = useQueryClient();

  const { data: inscricoes = [], isLoading } = useQuery({
    queryKey: ['m31_stats_inscricoes'],
    queryFn: () => base44.entities.EventoM31Inscricao.list('-created_date', 5000),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  useEffect(() => {
    const unsubscribe = base44.entities.EventoM31Inscricao.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['m31_stats_inscricoes'] });
    });
    return unsubscribe;
  }, [queryClient]);

  const metrics = useMemo(() => computeM31Metrics(inscricoes), [inscricoes]);

  return {
    ...metrics,
    // aliases históricos: nomes explícitos para não confundir headcount com financeiro.
    reconhecidas: metrics.inscritasReconhecidas,
    confirmadas: metrics.confirmadasFinanceiramente,
    pendentesCobranca: metrics.cobrancasPendentes,
    checkins: inscricoes.filter((i) => i.checkin_realizado).length,
    inscricoes,
    isLoading,
  };
}