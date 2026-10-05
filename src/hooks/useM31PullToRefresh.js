import { useCallback, useRef, useState } from 'react';

export function shouldTriggerPull({ startY, currentY, scrollTop, threshold = 72 }) {
  return scrollTop === 0 && currentY - startY >= threshold;
}

export function useM31PullToRefresh({ onRefresh, threshold = 72 }) {
  const startY = useRef(null);
  const currentY = useRef(null);
  const [pullReady, setPullReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onTouchStart = useCallback((event) => {
    if (window.scrollY !== 0) return;
    startY.current = event.touches[0]?.clientY ?? null;
    currentY.current = startY.current;
  }, []);

  const onTouchMove = useCallback((event) => {
    if (startY.current === null) return;
    currentY.current = event.touches[0]?.clientY ?? startY.current;
    setPullReady(shouldTriggerPull({
      startY: startY.current,
      currentY: currentY.current,
      scrollTop: window.scrollY,
      threshold,
    }));
  }, [threshold]);

  const reset = useCallback(() => {
    startY.current = null;
    currentY.current = null;
    setPullReady(false);
  }, []);

  const onTouchEnd = useCallback(async () => {
    const trigger = startY.current !== null && shouldTriggerPull({
      startY: startY.current,
      currentY: currentY.current ?? startY.current,
      scrollTop: window.scrollY,
      threshold,
    });
    reset();
    if (!trigger || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh, refreshing, reset, threshold]);

  return {
    pullReady,
    refreshing,
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: reset },
  };
}

