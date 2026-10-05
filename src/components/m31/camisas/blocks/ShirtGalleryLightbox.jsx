// Carrossel em tela cheia com as imagens ampliadas da camisa.
// Abre ao tocar na foto ou em "Ver detalhes". Fecha no X, no fundo ou no Esc.
import { useEffect, useState } from 'react';

const CHEVRON = { background: 'rgba(255,255,255,.12)', border: 'none', color: '#FFF', width: 42, height: 42, borderRadius: '50%', fontSize: 22, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };

export default function ShirtGalleryLightbox({ modelo, onClose }) {
  const imagens = ((modelo.galeria && modelo.galeria.length) ? modelo.galeria : [modelo.foto]).filter(Boolean);
  const [idx, setIdx] = useState(0);
  const [touchX, setTouchX] = useState(null);

  const ir = (delta) => setIdx((i) => (i + delta + imagens.length) % imagens.length);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') ir(1);
      if (e.key === 'ArrowLeft') ir(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [imagens.length, onClose]);

  if (!imagens.length) return null;

  return (
    <div
      role="dialog" aria-modal="true" aria-label={`Detalhes — Camisa ${modelo.nome}`}
      onClick={onClose}
      onTouchStart={(e) => setTouchX(e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        if (touchX == null) return;
        const delta = (e.changedTouches[0]?.clientX ?? 0) - touchX;
        if (Math.abs(delta) > 40) ir(delta < 0 ? 1 : -1);
        setTouchX(null);
      }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(24,10,12,.95)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 18 }}
    >
      <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: '#FFF', fontSize: 14, fontWeight: 700 }}>{modelo.nome}</span>
        <button type="button" onClick={onClose} aria-label="Fechar detalhes" style={{ ...CHEVRON, fontSize: 17 }}>✕</button>
      </div>

      <img
        src={imagens[idx]} alt={`Camisa ${modelo.nome} — imagem ${idx + 1}`}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '94%', maxHeight: '72vh', objectFit: 'contain', borderRadius: 14 }}
      />

      {imagens.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }} onClick={(e) => e.stopPropagation()}>
          <button type="button" style={CHEVRON} onClick={() => ir(-1)} aria-label="Imagem anterior">‹</button>
          <div style={{ display: 'flex', gap: 7 }}>
            {imagens.map((_, i) => (
              <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: i === idx ? '#FFF' : 'rgba(255,255,255,.35)' }} />
            ))}
          </div>
          <button type="button" style={CHEVRON} onClick={() => ir(1)} aria-label="Próxima imagem">›</button>
        </div>
      )}
    </div>
  );
}