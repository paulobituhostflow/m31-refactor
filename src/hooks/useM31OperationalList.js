import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export function useM31OperationalList(sessionId, operacao, view, search = '', enabled = true) {
  const queryClient = useQueryClient();
  const queryKey = ['m31-operational-list', sessionId, operacao, view, search];
  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam = 0 }) => {
      const response = await base44.functions.invoke('m31ResumoOperacional', { session_id: sessionId, operacao, view, search, cursor: pageParam, limit: 25 });
      return response?.data || response;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage?.next_cursor ?? undefined,
    enabled: enabled && Boolean(sessionId),
    staleTime: 30_000,
    retry: 1,
  });
  const mutation = useMutation({
    mutationFn: async (payload) => {
      const response = await base44.functions.invoke('m31ResumoOperacional', { session_id: sessionId, operacao, ...payload });
      return response?.data || response;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['m31-operational-list', sessionId, operacao] }),
  });
  return { ...query, items: query.data?.pages?.flatMap((page) => page.items || []) || [], total: query.data?.pages?.[0]?.total ?? 0, mutateOperation: mutation };
}

