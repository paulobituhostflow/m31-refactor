import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * Rastreia o tempo de uso ativo do membro.
 * Incrementa 1 minuto a cada 60s enquanto a aba está visível.
 * Persiste a cada 5 minutos e ao trocar de aba / fechar a janela.
 *
 * Usa $inc atômico para evitar perda por dados stale.
 */
export function useM31UsageTracker(membro) {
  const accumulatedMin = useRef(0);
  const membroRef = useRef(membro);

  useEffect(() => { membroRef.current = membro; }, [membro]);

  useEffect(() => {
    if (!membro?.id) return;

    const flush = () => {
      const m = membroRef.current;
      if (!m?.id || accumulatedMin.current === 0) return;
      const mins = accumulatedMin.current;
      accumulatedMin.current = 0;
      base44.entities.EventoM31Membro.updateMany(
        { user_email: m.user_email, ativo: true },
        { $inc: { tempo_total_uso_minutos: mins } }
      ).catch(() => {});
    };

    const tick = setInterval(() => {
      if (document.hidden) return;
      accumulatedMin.current += 1;
      if (accumulatedMin.current >= 5) flush();
    }, 60000);

    const onVisibility = () => { if (document.hidden) flush(); };
    const onUnload = () => flush();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onUnload);

    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onUnload);
      flush();
    };
  }, [membro?.id]);
}

export function fmtTempoUso(minutos) {
  const m = minutos || 0;
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest > 0 ? `${h}h ${rest}min` : `${h}h`;
}