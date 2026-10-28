import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { gestaoOperation, gestaoRequest } from '@/lib/m31GestaoApi';

export function useM31Gestao() {
  const sessionRef = useRef(null);
  return useQuery({
    queryKey: ['m31-gestao-context'],
    queryFn: async () => {
      let stored = null;
      try {
        stored = JSON.parse(localStorage.getItem('m31_operador_atual') || 'null');
      } catch {
        stored = null;
      }
      if (!sessionRef.current && stored?.session_id && stored.expires_at > Date.now()) {
        sessionRef.current = stored.session_id;
      }
      const data = await gestaoRequest('m31AbrirSessaoOperacional', sessionRef.current
        ? { session_id: sessionRef.current }
        : { nome: stored?.nome, whatsapp: stored?.whatsapp_nacional });
      sessionRef.current = data.session_id;
      return data;
    },
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
  });
}

export function useM31GestaoList(sessionId, filtro, search, cursor, caravanaId = '', tipoIngresso = '') {
  const refreshToken = useRef(0);
  const query = useQuery({
    queryKey: ['m31-gestao-list', sessionId, filtro, search, cursor, caravanaId, tipoIngresso],
    queryFn: () => gestaoOperation(sessionId, 'listar', {
      filtro,
      search,
      cursor,
      caravana_id: caravanaId,
      tipo_ingresso: tipoIngresso,
      limit: 25,
      refresh_token: refreshToken.current
    }),
    enabled: Boolean(sessionId),
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
  });
  return {
    ...query,
    refetch: (...args) => {
      refreshToken.current += 1;
      return query.refetch(...args);
    }
  };
}

export function useM31GestaoDetail(sessionId, id) {
  return useQuery({
    queryKey: ['m31-gestao-detail', sessionId, id],
    queryFn: () => gestaoOperation(sessionId, 'detalhe', { id }),
    enabled: Boolean(sessionId && id),
    staleTime: Infinity,
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
  });
}
