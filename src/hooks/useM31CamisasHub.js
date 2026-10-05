import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

async function invokeCamisas(sessionId, payload) {
  const response = await base44.functions.invoke('m31CamisasOperacional', { ...payload, session_id: sessionId });
  return response?.data || response;
}

// Dados e mutações do hub da Central da Dulce: catálogo de produtos,
// clientes, recebimento de estoque e Chat IA — mesma função operacional.
export function useM31CamisasHub(sessionId, { enabled = true } = {}) {
  const queryClient = useQueryClient();
  const produtos = useQuery({
    queryKey: ['m31-hub-produtos', sessionId],
    queryFn: () => invokeCamisas(sessionId, { action: 'listar_produtos' }),
    enabled: enabled && Boolean(sessionId),
    staleTime: 60_000,
    retry: 1,
  });
  const clientes = useQuery({
    queryKey: ['m31-hub-clientes', sessionId],
    queryFn: () => invokeCamisas(sessionId, { action: 'listar_clientes' }),
    enabled: enabled && Boolean(sessionId),
    staleTime: 60_000,
    retry: 1,
  });
  const mutation = useMutation({
    mutationFn: (payload) => invokeCamisas(sessionId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['m31-operational-shirts', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['m31-hub-produtos', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['m31-hub-clientes', sessionId] });
    },
  });
  return { produtos, clientes, mutateHub: mutation };
}