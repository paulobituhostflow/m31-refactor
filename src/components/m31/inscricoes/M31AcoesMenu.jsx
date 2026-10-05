import { useState, useRef, useEffect } from 'react';

// Menu ⋮ com posicionamento fixed (não é cortado pelo overflow da tabela)
export default function M31AcoesMenu({ itens }) {
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    document.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [pos]);

  function toggle(e) {
    e.stopPropagation();
    if (pos) { setPos(null); return; }
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title="Mais ações"
        style={{
          width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#f2f1f0', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '5px',
          color: '#6b7280', cursor: 'pointer', fontSize: '15px', fontWeight: '700', lineHeight: 1,
          flexShrink: 0, fontFamily: 'Inter,sans-serif',
        }}
      >⋮</button>
      {pos && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed', top: pos.top, right: pos.right, zIndex: 500,
            background: '#fff', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: '210px', padding: '4px',
            fontFamily: 'Inter,sans-serif',
          }}
        >
          {itens.map((it, idx) => (
            <button
              key={idx}
              disabled={it.disabled}
              onClick={() => { if (!it.disabled) { it.onClick(); setPos(null); } }}
              onMouseEnter={e => { if (!it.disabled) e.currentTarget.style.background = '#f5f5f5'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '9px 10px',
                background: 'none', border: 'none', borderRadius: '6px', fontSize: '12.5px',
                color: it.disabled ? '#9ca3af' : '#2d2d2d',
                cursor: it.disabled ? 'not-allowed' : 'pointer',
                fontFamily: 'Inter,sans-serif',
              }}
            >{it.label}</button>
          ))}
        </div>
      )}
    </>
  );
}