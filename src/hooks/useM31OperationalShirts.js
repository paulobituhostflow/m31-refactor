import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export function useM31OperationalShirts(sessionId, { enabled = true } = {}) {
  const queryClient = useQueryClient();
  const queryKey = ['m31-operational-shirts', sessionId];
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await base44.functions.invoke('m31CamisasOperacional', { action: 'listar', session_id: sessionId });
      return response?.data || response;
    },
    enabled: enabled && Boolean(sessionId),
    staleTime: 30_000,
    retry: 1,
  });

  const mutation = useMutation({
    mutationFn: async (payload) => {
      const response = await base44.functions.invoke('m31CamisasOperacional', { ...payload, session_id: sessionId });
      return response?.data || response;
    },
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ['m31-camisa-historico'] }),
    ]),
  });

  return { ...query, updateShirt: mutation };
}


