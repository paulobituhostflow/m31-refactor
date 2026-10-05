import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export function useM31OperationalSummary(sessionId) {
  return useQuery({
    queryKey: ['m31-operational-summary', sessionId],
    queryFn: async () => {
      const response = await base44.functions.invoke('m31ResumoOperacional', { session_id: sessionId });
      return response?.data || response;
    },
    enabled: Boolean(sessionId),
    staleTime: 30_000,
    retry: 1,
  });
}

