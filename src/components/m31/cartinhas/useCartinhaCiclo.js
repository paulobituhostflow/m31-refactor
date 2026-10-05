import { useEffect, useState } from 'react';
import { diaCartinhas, proximaViradaCartinhas } from './cartinhaMetas';

/** Só atualiza o dia quando o ciclo muda: não renderiza a lista a cada segundo. */
export default function useCartinhaCiclo() {
  const [dia, setDia] = useState(() => diaCartinhas());
  useEffect(() => {
    let timer;
    function conferir() {
      window.clearTimeout(timer);
      const agora = new Date();
      setDia(atual => {
        const novo = diaCartinhas(agora);
        return novo && novo !== atual ? novo : atual;
      });
      const proxima = proximaViradaCartinhas(agora);
      if (proxima !== null) timer = window.setTimeout(conferir, Math.max(100, proxima - agora.getTime() + 50));
    }
    function aoRetornar() { if (!document.hidden) conferir(); }
    conferir();
    window.addEventListener('focus', aoRetornar);
    document.addEventListener('visibilitychange', aoRetornar);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', aoRetornar);
      document.removeEventListener('visibilitychange', aoRetornar);
    };
  }, []);
  return dia;
}
