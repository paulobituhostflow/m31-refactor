import { useState, useCallback } from 'react';

const KEY = 'm31_gestao_expansion_v1';

/** Estado de expansão de áreas/pacotes persistido durante a sessão. */
export function useExpansionState() {
  const [state, setState] = useState(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : { areas: {}, frentes: {}, pacotes: {} };
    } catch {
      return { areas: {}, frentes: {}, pacotes: {} };
    }
  });

  const persist = useCallback((next) => {
    setState(next);
    try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);

  const toggleArea = useCallback((k) => {
    setState(prev => {
      const cur = prev.areas[k] ?? true; // áreas nascem abertas
      const next = { ...prev, areas: { ...prev.areas, [k]: !cur } };
      try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const togglePacote = useCallback((id) => {
    setState(prev => {
      const cur = prev.pacotes[id] ?? false; // pacotes nascem recolhidos
      const next = { ...prev, pacotes: { ...prev.pacotes, [id]: !cur } };
      try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const toggleFrente = useCallback((k) => {
    setState(prev => {
      const cur = prev.frentes?.[k] ?? false; // frentes nascem recolhidas (revelação progressiva)
      const next = { ...prev, frentes: { ...(prev.frentes || {}), [k]: !cur } };
      try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return { state, toggleArea, toggleFrente, togglePacote };
}