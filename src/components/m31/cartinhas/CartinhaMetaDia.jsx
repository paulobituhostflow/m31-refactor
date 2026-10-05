import { useEffect, useRef, useState } from 'react';
import { Trophy } from 'lucide-react';
import { diaCartinhas, podeCelebrar } from './cartinhaMetas';

/** A celebração nunca controla acesso ao editor, salvamento ou próxima carta. */
export default function CartinhaMetaDia({ escritasHoje, metaDiaria, total, autoraId, dia = diaCartinhas() }) {
  const [toast, setToast] = useState(false);
  const previous = useRef(null);
  const timer = useRef(null);
  const celebradas = useRef(new Set());
  const atingida = Number.isFinite(metaDiaria) && metaDiaria > 0 && escritasHoje >= metaDiaria;
  useEffect(() => {
    const key = `m31-meta-recife06-v1:${autoraId}:${dia}`;
    const antes = previous.current?.dia === dia ? previous.current.count : null;
    let celebrada = celebradas.current.has(key);
    try { celebrada ||= sessionStorage.getItem(key) === '1'; } catch { /* mantém controle em memória */ }
    if (previous.current?.dia !== dia) { clearTimeout(timer.current); setToast(false); }
    if (!celebrada && escritasHoje > (antes ?? escritasHoje) && podeCelebrar({ carregada: true, total, antes, agora: escritasHoje, meta: metaDiaria })) {
      celebradas.current.add(key);
      try { sessionStorage.setItem(key, '1'); } catch { /* não interfere na escrita */ }
      setToast(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(false), 4500);
    }
    previous.current = { dia, count: escritasHoje };
  }, [escritasHoje, metaDiaria, total, autoraId, dia]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return <>
    <section className="m31-escrita-meta" data-atingida={atingida} aria-label="Meta diária de escrita">
      <div className="m31-escrita-meta__linha">
        <span className="m31-escrita-meta__hoje">{escritasHoje} concluídas hoje</span>
      </div>
      {metaDiaria > 0 && <div className="m31-escrita-meta__barra" role="progressbar" aria-label="Progresso de hoje" aria-valuenow={Math.min(escritasHoje, metaDiaria)} aria-valuemax={metaDiaria} aria-valuemin={0}>
        <div style={{ width: `${Math.min(100, 100 * escritasHoje / metaDiaria)}%` }} />
      </div>}
      {atingida && <span className="m31-escrita-meta__trofeu"><Trophy size={22} aria-hidden="true" />Meta do dia batida!</span>}
    </section>
    {toast && <div role="status" aria-live="polite" className="m31-escrita-meta-toast"><Trophy size={24} aria-hidden="true" /><strong>Meta do dia batida!</strong></div>}
  </>;
}
