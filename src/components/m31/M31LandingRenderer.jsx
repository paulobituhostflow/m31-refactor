/**
 * M31LandingRenderer — renderiza blocos do EventPageConfig em modo LIVE
 * Mesma lógica do BuilderPreview mas sem simulação mobile — renderiza full-width real.
 */
import React, { useState } from 'react';
import { Play } from 'lucide-react';
import { ensureV2 } from '@/components/m31/builder/blocksConfig';
import { resolverDestinoInscricao } from '@/lib/m31LandingCta';

// ── Block Renderers ────────────────────────────────────────────────────────

function BlockHero({ data, brand, textColor }) {
  const M31_LOGO = "https://media.base44.com/images/public/69d51b279da069f623e291a6/a22f06b49_LOGOM31FILHAS1.png";

  return (
    <section
      style={{
        background: data.hero_image
          ? `linear-gradient(to bottom, rgba(13,3,7,0.7) 0%, rgba(13,3,7,0.5) 100%), url(${data.hero_image}) center/cover no-repeat`
          : 'linear-gradient(135deg, #0d0307 0%, #1a0610 100%)',
        padding: '80px 24px 60px',
        textAlign: 'center',
      }}
    >
      <img src={M31_LOGO} alt="M31 Filhas" style={{ height: 120, margin: '0 auto 24px', display: 'block', filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.5))' }} />

      {data.badge && (
        <div style={{ display: 'inline-block', background: `${brand}22`, border: `1px solid ${brand}55`, borderRadius: 100, padding: '6px 18px', fontSize: 12, fontWeight: 700, color: brand, letterSpacing: '0.08em', marginBottom: 20 }}>
          {data.badge}
        </div>
      )}

      <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 700, color: '#fff', lineHeight: 1.2, marginBottom: 16 }}>
        {data.title}
      </h1>

      {data.subtitle && (
        <p style={{ fontSize: 'clamp(14px, 2vw, 18px)', color: 'rgba(255,255,255,0.65)', maxWidth: 560, margin: '0 auto 32px', lineHeight: 1.7 }}>
          {data.subtitle}
        </p>
      )}

      {data.cta_text && data.cta_url && (
        <a href={resolverDestinoInscricao(data.cta_url)} target="_blank" rel="noreferrer" style={{ display: 'inline-block' }}>
          <button style={{
            background: `linear-gradient(135deg, ${brand}, #6B1220)`,
            color: '#fff', border: 'none', borderRadius: 16,
            padding: '18px 48px', fontSize: 16, fontWeight: 700,
            cursor: 'pointer', boxShadow: `0 12px 40px ${brand}60`,
            transition: 'all 0.2s',
          }}
            onMouseEnter={e => e.target.style.transform = 'scale(1.04)'}
            onMouseLeave={e => e.target.style.transform = 'scale(1)'}
          >
            {data.cta_text}
          </button>
        </a>
      )}
    </section>
  );
}

function BlockInfoCard({ data, brand, card }) {
  if (!data.date && !data.location && !data.price_display) return null;
  const items = [
    data.date && ['📅', 'Data', data.date],
    data.location && ['📍', 'Local', data.location],
    data.address && ['🏛️', 'Endereço', data.address],
    data.price_display && ['💰', 'Investimento', data.price_display],
  ].filter(Boolean);

  return (
    <section style={{ padding: '40px 24px', background: 'rgba(255,255,255,0.03)' }}>
      <div style={{ maxWidth: 800, margin: '0 auto', display: 'grid', gridTemplateColumns: `repeat(${Math.min(items.length, 4)}, 1fr)`, gap: 16 }}>
        {items.map(([icon, label, val], i) => (
          <div key={i} style={{ background: card || '#fff', borderRadius: 16, padding: '20px 16px', textAlign: 'center', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: brand, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>{val}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BlockVerse({ data, brand }) {
  if (!data.text) return null;
  return (
    <section style={{ padding: '48px 24px' }}>
      <div style={{ maxWidth: 700, margin: '0 auto', background: `${brand}12`, borderLeft: `4px solid ${brand}`, borderRadius: 16, padding: '32px 36px', textAlign: 'center' }}>
        <p style={{ fontSize: 'clamp(16px, 2.5vw, 22px)', fontStyle: 'italic', color: 'rgba(255,255,255,0.85)', lineHeight: 1.7, fontFamily: "'Cormorant Garamond', serif", marginBottom: data.reference ? 16 : 0 }}>
          "{data.text}"
        </p>
        {data.reference && (
          <span style={{ fontSize: 13, fontWeight: 700, color: brand, display: 'block' }}>{data.reference}</span>
        )}
      </div>
    </section>
  );
}

function BlockCTASection({ data, brand }) {
  if (!data.button_text) return null;
  const isDark = data.background === 'brand' || !data.background;
  return (
    <section style={{
      padding: '64px 24px',
      background: isDark ? `linear-gradient(135deg, ${brand}, #6B1220)` : '#1A1A1A',
      textAlign: 'center',
    }}>
      {data.title && <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(24px, 4vw, 40px)', fontWeight: 700, color: '#fff', marginBottom: 12 }}>{data.title}</h2>}
      {data.subtitle && <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.75)', marginBottom: 32 }}>{data.subtitle}</p>}
      <a href={resolverDestinoInscricao(data.button_url)} target="_blank" rel="noreferrer" style={{ display: 'inline-block' }}>
        <button style={{
          background: '#fff', color: brand, border: 'none', borderRadius: 16,
          padding: '18px 56px', fontSize: 16, fontWeight: 700, cursor: 'pointer',
          boxShadow: '0 8px 30px rgba(0,0,0,0.2)', transition: 'all 0.2s',
        }}
          onMouseEnter={e => e.target.style.transform = 'scale(1.04)'}
          onMouseLeave={e => e.target.style.transform = 'scale(1)'}
        >
          {data.button_text}
        </button>
      </a>
    </section>
  );
}

function BlockFeatures({ data, brand, card, textColor }) {
  if (!data.items?.length) return null;
  const cols = data.columns || 3;
  return (
    <section style={{ padding: '60px 24px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        {data.title && (
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(22px, 3vw, 36px)', fontWeight: 700, color: '#fff', textAlign: 'center', marginBottom: 36 }}>
            {data.title}
          </h2>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 20 }}>
          {data.items.map((item, i) => (
            <div key={i} style={{ background: card || 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '24px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>{item.icon || '✨'}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{item.title}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>{item.text}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BlockTestimonials({ data, brand, card }) {
  if (!data.items?.length) return null;
  return (
    <section style={{ padding: '60px 24px', background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {data.title && (
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(22px, 3vw, 36px)', fontWeight: 700, color: '#fff', textAlign: 'center', marginBottom: 36 }}>
            {data.title}
          </h2>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {data.items.map((item, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: `${brand}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: brand, overflow: 'hidden', flexShrink: 0 }}>
                  {item.photo
                    ? <img src={item.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                    : (item.name?.[0] || '?')}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{item.name}</div>
              </div>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6, fontStyle: 'italic' }}>"{item.text}"</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BlockVideo({ data, brand }) {
  const [showBtn, setShowBtn] = useState(data.delay_seconds === 0);
  const [open, setOpen] = useState(false);

  React.useEffect(() => {
    if (data.delay_seconds > 0) {
      const t = setTimeout(() => setShowBtn(true), data.delay_seconds * 1000);
      return () => clearTimeout(t);
    }
  }, [data.delay_seconds]);

  if (!data.embed_url) return null;

  // Extrair ID do YouTube para thumbnail
  const ytMatch = data.embed_url.match(/embed\/([^?&]+)/);
  const ytId = ytMatch ? ytMatch[1] : null;

  return (
    <section style={{ padding: '60px 24px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {data.title && (
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(20px, 3vw, 32px)', fontWeight: 700, color: '#fff', textAlign: 'center', marginBottom: 24 }}>
            {data.title}
          </h2>
        )}
        <div
          style={{ borderRadius: 20, overflow: 'hidden', position: 'relative', paddingBottom: '56.25%', background: '#000', cursor: 'pointer' }}
          onClick={() => setOpen(true)}
        >
          {ytId && !open && (
            <img src={`https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }} onError={e => { e.target.src = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`; }} />
          )}
          {open ? (
            <iframe src={`${data.embed_url}?autoplay=1`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }} allow="autoplay; encrypted-media" allowFullScreen />
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: brand, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 8px 40px ${brand}80` }}>
                <Play size={28} color="#fff" fill="#fff" style={{ marginLeft: 4 }} />
              </div>
            </div>
          )}
        </div>

        {showBtn && data.delay_cta_text && data.delay_cta_url && (
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <a href={resolverDestinoInscricao(data.delay_cta_url)} target="_blank" rel="noreferrer">
              <button style={{ background: `linear-gradient(135deg, ${brand}, #6B1220)`, color: '#fff', border: 'none', borderRadius: 14, padding: '16px 44px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                {data.delay_cta_text}
              </button>
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

function BlockFooter({ data, brand }) {
  const M31_LOGO = "https://media.base44.com/images/public/69d51b279da069f623e291a6/a22f06b49_LOGOM31FILHAS1.png";
  return (
    <footer style={{ borderTop: '1px solid rgba(255,255,255,0.1)', padding: '40px 24px', textAlign: 'center' }}>
      <img src={M31_LOGO} alt="M31 Filhas" style={{ height: 48, margin: '0 auto 16px', opacity: 0.6, display: 'block' }} />
      {data.security_text && <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>🔒 {data.security_text}</p>}
      {data.footer_text && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>{data.footer_text}</p>}
    </footer>
  );
}

function BlockDivider({ data }) {
  return (
    <div style={{ padding: '8px 24px' }}>
      <div style={{ height: 1, background: data.color || 'rgba(255,255,255,0.1)', maxWidth: 1000, margin: '0 auto' }} />
    </div>
  );
}

function BlockCustomHTML({ data }) {
  if (!data.html) return null;
  return <div dangerouslySetInnerHTML={{ __html: data.html }} />;
}

// ── Renderer principal ─────────────────────────────────────────────────────
export default function M31LandingRenderer({ landingConfig }) {
  const parsed = ensureV2(landingConfig || {});
  const colors = parsed.colors || {};
  const brand = colors.primary || '#8B1A2B';
  const bg = colors.bg || '#0d0307';
  const card = colors.card || 'rgba(255,255,255,0.07)';
  const textColor = colors.text || '#ffffff';
  const blocks = parsed.blocks || [];

  const renderBlock = (block) => {
    const d = block.data || {};
    switch (block.type) {
      case 'hero':         return <BlockHero data={d} brand={brand} textColor={textColor} />;
      case 'info_card':    return <BlockInfoCard data={d} brand={brand} card={card} />;
      case 'verse':        return <BlockVerse data={d} brand={brand} />;
      case 'cta_section':  return <BlockCTASection data={d} brand={brand} />;
      case 'features':     return <BlockFeatures data={d} brand={brand} card={card} textColor={textColor} />;
      case 'testimonials': return <BlockTestimonials data={d} brand={brand} card={card} />;
      case 'video':        return <BlockVideo data={d} brand={brand} />;
      case 'footer':       return <BlockFooter data={d} brand={brand} />;
      case 'divider':      return <BlockDivider data={d} />;
      case 'custom_html':  return <BlockCustomHTML data={d} />;
      default:             return null;
    }
  };

  return (
    <div style={{ background: bg, minHeight: '100vh', color: textColor, fontFamily: 'Inter, sans-serif', overflowX: 'hidden' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;700&display=swap');`}</style>
      {blocks.map((block) => (
        <React.Fragment key={block.id}>{renderBlock(block)}</React.Fragment>
      ))}
    </div>
  );
}
