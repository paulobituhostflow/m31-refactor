// Preview mobile com suporte a blocos V2 e config plana antiga
import React, { useState } from 'react';
import { M31Logo } from '@/components/M31Logo';
import { ensureV2 } from './blocksConfig';

function PreviewField({ field }) {
  const baseInput = {
    width: '100%', padding: '10px 12px', border: '1.5px solid #E5D6D6',
    borderRadius: 10, fontSize: 14, color: '#2F2A2A', background: '#fff', outline: 'none',
    fontFamily: 'Inter, sans-serif', boxSizing: 'border-box',
  };
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(26,26,26,0.7)', marginBottom: 5 }}>
        {field.label || field.name}
        {field.required && <span style={{ color: '#8B1A2B', marginLeft: 2 }}>*</span>}
      </label>
      {(field.type === 'text' || field.type === 'email' || field.type === 'phone' || field.type === 'cpf') && (
        <input disabled style={baseInput} placeholder={field.placeholder || field.label} />
      )}
      {field.type === 'textarea' && (
        <textarea disabled style={{ ...baseInput, height: 80, resize: 'none' }} placeholder={field.placeholder} />
      )}
      {field.type === 'select' && (
        <select disabled style={baseInput}><option>{field.placeholder || 'Selecione...'}</option>{(field.options || []).map((o, i) => <option key={i}>{o}</option>)}</select>
      )}
      {field.type === 'toggle' && (
        <div style={{ display: 'flex', gap: 8 }}>
          {['Sim', 'Não'].map(opt => <button key={opt} disabled style={{ flex: 1, padding: '10px', background: '#fff', border: '1.5px solid #E5D6D6', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#2F2A2A', cursor: 'default' }}>{opt}</button>)}
        </div>
      )}
      {field.helper && <p style={{ fontSize: 11, color: 'rgba(26,26,26,0.5)', marginTop: 4 }}>{field.helper}</p>}
    </div>
  );
}

// ── Block Renderers ───────────────────────────────────────────────────────
function RenderCamisasHero({ data }) {
  const banner = data.banner_url || '/assets/d8b6b1f1a_E7FBA259-1F2F-4DEC-8DD3-C4ED91F9CAF9.png';
  return (
    <section style={{ padding: '16px 16px 8px', background: '#F5F0E8' }}>
      <img src={banner} alt="Banner Camisas M31" style={{ width: '100%', display: 'block', borderRadius: 16, border: '1px solid #E8E0D4' }} />
      {data.subtitle && <p style={{ textAlign: 'center', fontSize: 12, color: '#5C5148', margin: '10px 0 4px' }}>{data.subtitle}</p>}
    </section>
  );
}

function RenderPurchaseFlow({ data }) {
  return (
    <div style={{ margin: '0 16px 12px', padding: '24px 16px', textAlign: 'center', border: '1.5px dashed #D6C7B8', borderRadius: 16, color: '#9A8B7D', fontSize: 12, background: '#FDFCF9' }}>
      🛒 Fluxo de compra da Lojinha<br />
      <span style={{ fontSize: 10 }}>Modelo e tamanho → dados → Pix (renderizado ao vivo na página publicada)</span>
      {data.note ? <div style={{ marginTop: 6, fontSize: 10, color: '#B3A698' }}>{data.note}</div> : null}
    </div>
  );
}

function RenderHero({ data, brand, bg, textColor }) {
  return (
    <div style={{ padding: '28px 16px 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <M31Logo size="sm" />
      </div>
      {data.badge && (
        <div style={{ textAlign: 'center', marginBottom: 10 }}>
          <span style={{ display: 'inline-block', background: `${brand}18`, border: `1px solid ${brand}44`, borderRadius: 100, padding: '4px 12px', fontSize: 10, fontWeight: 700, color: brand, letterSpacing: '0.08em' }}>
            {data.badge}
          </span>
        </div>
      )}
      {data.hero_image && (
        <div style={{ margin: '0 -16px 14px', height: 150, overflow: 'hidden' }}>
          <img src={data.hero_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => e.target.style.display = 'none'} />
        </div>
      )}
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: textColor, lineHeight: 1.25, margin: 0 }}>{data.title || 'Título'}</h1>
      </div>
      {data.subtitle && <p style={{ textAlign: 'center', fontSize: 12, color: `${textColor}99`, lineHeight: 1.6, marginBottom: 14 }}>{data.subtitle}</p>}
      {data.cta_text && (
        <button disabled style={{ width: '100%', background: `linear-gradient(135deg, ${brand}, #6B1220)`, color: '#fff', border: 'none', borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 700, cursor: 'default', marginBottom: 8 }}>
          {data.cta_text}
        </button>
      )}
    </div>
  );
}

function RenderInfoCard({ data, brand, card, textColor }) {
  if (!data.date && !data.location && !data.price_display) return null;
  return (
    <div style={{ padding: '0 16px 16px' }}>
      <div style={{ background: card, border: '1px solid rgba(0,0,0,0.06)', borderRadius: 12, display: 'flex', overflow: 'hidden' }}>
        {[['📅', data.date || '—'], ['📍', data.location || '—'], ['💰', data.price_display || '—']].map(([icon, val], i) => (
          <div key={i} style={{ flex: 1, padding: '10px 4px', textAlign: 'center', borderRight: i < 2 ? '1px solid rgba(0,0,0,0.06)' : 'none' }}>
            <div style={{ fontSize: 13 }}>{icon}</div>
            <div style={{ fontSize: 10, color: `${textColor}99`, marginTop: 2, fontWeight: 500 }}>{val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RenderVerse({ data, brand, textColor }) {
  if (!data.text) return null;
  return (
    <div style={{ padding: '0 16px 16px' }}>
      <div style={{ background: `${brand}10`, borderLeft: `3px solid ${brand}`, borderRadius: 8, padding: '10px 12px', fontSize: 11, fontStyle: 'italic', color: `${textColor}99`, lineHeight: 1.6 }}>
        "{data.text}"
        {data.reference && <span style={{ display: 'block', fontStyle: 'normal', fontWeight: 700, fontSize: 9, color: brand, marginTop: 4 }}>{data.reference}</span>}
      </div>
    </div>
  );
}

function RenderCTASection({ data, brand }) {
  if (!data.button_text) return null;
  return (
    <div style={{
      padding: '18px 16px',
      background: data.background === 'brand' ? `linear-gradient(135deg, ${brand}, #6B1220)` : '#1A1A1A',
    }}>
      {data.title && <p style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{data.title}</p>}
      {data.subtitle && <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 12 }}>{data.subtitle}</p>}
      <button disabled style={{ width: '100%', background: '#fff', color: brand, border: 'none', borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 700, cursor: 'default' }}>
        {data.button_text}
      </button>
    </div>
  );
}

function RenderFeatures({ data, brand, textColor, card }) {
  if (!data.items?.length) return null;
  const cols = data.columns || 3;
  return (
    <div style={{ padding: '0 16px 16px' }}>
      {data.title && <div style={{ fontSize: 14, fontWeight: 700, color: textColor, textAlign: 'center', marginBottom: 10 }}>{data.title}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 }}>
        {data.items.map((item, i) => (
          <div key={i} style={{ background: card, border: '1px solid rgba(0,0,0,0.06)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{item.icon || '✨'}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: textColor, marginBottom: 2 }}>{item.title}</div>
            <div style={{ fontSize: 9, color: `${textColor}88` }}>{item.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RenderTestimonials({ data, brand, textColor, card }) {
  if (!data.items?.length) return null;
  return (
    <div style={{ padding: '0 16px 16px' }}>
      {data.title && <div style={{ fontSize: 14, fontWeight: 700, color: textColor, textAlign: 'center', marginBottom: 10 }}>{data.title}</div>}
      {data.items.map((item, i) => (
        <div key={i} style={{ background: card, border: '1px solid rgba(0,0,0,0.06)', borderRadius: 10, padding: '12px', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: `${brand}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: brand }}>
              {item.photo ? <img src={item.photo} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; e.target.parentElement.textContent = item.name?.[0] || '?'; }} /> : item.name?.[0] || '?'}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: textColor }}>{item.name}</div>
              <div style={{ fontSize: 10, color: `${textColor}88`, lineHeight: 1.4, marginTop: 2 }}>{item.text}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RenderVideo({ data, brand, textColor }) {
  if (!data.embed_url) return null;
  return (
    <div style={{ padding: '0 16px 16px' }}>
      {data.title && <div style={{ fontSize: 14, fontWeight: 700, color: textColor, textAlign: 'center', marginBottom: 8 }}>{data.title}</div>}
      <div style={{ background: '#000', borderRadius: 10, overflow: 'hidden', position: 'relative', paddingBottom: data.aspect_ratio === '9:16' ? '177%' : '56.25%' }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>▶</div>
        </div>
      </div>
      {data.delay_seconds > 0 && (
        <div style={{ marginTop: 8, textAlign: 'center' }}>
          <span style={{ fontSize: 10, color: `${textColor}66` }}>Botão aparece após {data.delay_seconds}s</span>
          <button disabled style={{ display: 'block', width: '100%', marginTop: 4, background: `linear-gradient(135deg, ${brand}, #6B1220)`, color: '#fff', border: 'none', borderRadius: 10, padding: '11px', fontSize: 13, fontWeight: 700, cursor: 'default', opacity: 0.5 }}>
            {data.delay_cta_text || 'CTA após delay'}
          </button>
        </div>
      )}
    </div>
  );
}

function RenderFooter({ data, brand, textColor }) {
  return (
    <div style={{ padding: '0 16px 20px', textAlign: 'center' }}>
      {data.security_text && <p style={{ fontSize: 10, color: `${textColor}66` }}>🔒 {data.security_text}</p>}
      {data.footer_text && <p style={{ fontSize: 9, color: `${textColor}44`, marginTop: 4 }}>{data.footer_text}</p>}
    </div>
  );
}

function RenderDivider({ data }) {
  return (
    <div style={{ padding: '4px 16px' }}>
      <div style={{ height: 1, background: data.color || '#E5E7EB' }} />
    </div>
  );
}

function RenderCustomHTML({ data }) {
  if (!data.html) return null;
  return <div style={{ padding: '0 16px 8px' }} dangerouslySetInnerHTML={{ __html: data.html }} />;
}

// ── Main Preview ──────────────────────────────────────────────────────────
export default function BuilderPreview({ activeTab, landingConfig, formConfig }) {
  const [previewStep, setPreviewStep] = useState(0);
  const fc = formConfig || {};
  const steps = fc.steps || [];
  const step = steps[previewStep] || null;

  const parsed = ensureV2(landingConfig || {});
  const colors = parsed.colors || {};
  const brand = colors.primary || '#8B1A2B';
  const bg = colors.bg || '#F2D4BD';
  const card = colors.card || '#FFFFFF';
  const textColor = colors.text || '#1A1A1A';
  const gold = colors.gold || '#C4A265';
  const blocks = parsed.blocks || [];

  const renderBlock = (block) => {
    const d = block.data || {};
    switch (block.type) {
      case 'hero':         return <RenderHero data={d} brand={brand} bg={bg} textColor={textColor} />;
      case 'info_card':    return <RenderInfoCard data={d} brand={brand} card={card} textColor={textColor} />;
      case 'verse':        return <RenderVerse data={d} brand={brand} textColor={textColor} />;
      case 'cta_section':  return <RenderCTASection data={d} brand={brand} />;
      case 'features':     return <RenderFeatures data={d} brand={brand} textColor={textColor} card={card} />;
      case 'testimonials': return <RenderTestimonials data={d} brand={brand} textColor={textColor} card={card} />;
      case 'video':        return <RenderVideo data={d} brand={brand} textColor={textColor} />;
      case 'footer':       return <RenderFooter data={d} brand={brand} textColor={textColor} />;
      case 'divider':      return <RenderDivider data={d} />;
      case 'custom_html':  return <RenderCustomHTML data={d} />;
      case 'camisas_hero': return <RenderCamisasHero data={d} />;
      case 'purchase_flow': return <RenderPurchaseFlow data={d} />;
      default:             return null;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 12px', background: '#F3F4F6', minHeight: '100%' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
        Preview Mobile · 375px
      </div>

      <div style={{
        width: 375, maxWidth: '100%', background: bg, borderRadius: 24,
        boxShadow: '0 20px 60px rgba(0,0,0,0.20), 0 2px 8px rgba(0,0,0,0.10)',
        overflow: 'hidden', border: '1px solid rgba(0,0,0,0.08)',
        fontFamily: 'Inter, sans-serif', minHeight: 640, color: textColor,
      }}>
        {activeTab === 'landing' && (
          <div>
            {blocks.length > 0 ? blocks.map(block => (
              <React.Fragment key={block.id}>{renderBlock(block)}</React.Fragment>
            )) : (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9CA3AF', fontSize: 13 }}>
                Adicione blocos no editor ao lado
              </div>
            )}
          </div>
        )}

        {activeTab === 'form' && (
          <div>
            <div style={{ background: bg, padding: '24px 20px 16px', textAlign: 'center' }}>
              <M31Logo size="sm" />
            </div>
            {steps.length > 0 && (
              <div style={{ padding: '0 20px 16px' }}>
                <div style={{ height: 3, background: 'rgba(0,0,0,0.08)', borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
                  <div style={{ height: '100%', background: `linear-gradient(90deg, ${brand}, ${gold})`, borderRadius: 4, width: `${((previewStep + 1) / steps.length) * 100}%` }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: `${textColor}66` }}>
                  <span>Etapa <strong style={{ color: brand }}>{previewStep + 1}</strong> de {steps.length}</span>
                  <span>{Math.round(((previewStep + 1) / steps.length) * 100)}% concluído</span>
                </div>
              </div>
            )}
            {steps.length > 1 && (
              <div style={{ display: 'flex', gap: 6, padding: '0 20px 12px', justifyContent: 'center' }}>
                {steps.map((_, i) => (
                  <button key={i} onClick={() => setPreviewStep(i)} style={{
                    width: 28, height: 28, borderRadius: '50%', border: `2px solid ${i === previewStep ? brand : '#E5D6D6'}`,
                    background: i === previewStep ? brand : '#fff', color: i === previewStep ? '#fff' : '#9CA3AF',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  }}>{i + 1}</button>
                ))}
              </div>
            )}
            {step && (
              <div style={{ background: card, margin: '0 12px 20px', borderRadius: 16, border: '1px solid rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px 0', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: brand, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>Etapa {previewStep + 1} de {steps.length}</div>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 700, color: textColor, paddingBottom: 12 }}>{step.title}</div>
                </div>
                <div style={{ padding: '16px 16px 20px' }}>
                  {(step.fields || []).map((f, fi) => <PreviewField key={fi} field={f} />)}
                  <button disabled style={{ width: '100%', background: `linear-gradient(135deg, ${brand}, #6B1220)`, color: '#fff', border: 'none', borderRadius: 12, padding: '14px', fontSize: 14, fontWeight: 700, cursor: 'default', marginTop: 8 }}>
                    {previewStep < steps.length - 1 ? 'Próximo passo →' : 'Confirmar →'}
                  </button>
                </div>
              </div>
            )}
            {steps.length === 0 && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Adicione etapas e campos no editor ao lado</div>
            )}
          </div>
        )}

        {activeTab === 'funil' && (
          <div style={{ padding: '16px' }}>
            <div style={{ textAlign: 'center', marginBottom: 14 }}>
              <span style={{ display: 'inline-block', background: `${brand}18`, border: `1px solid ${brand}44`, borderRadius: 100, padding: '4px 12px', fontSize: 10, fontWeight: 700, color: brand, letterSpacing: '0.08em' }}>
                FUNIL DE VENDAS
              </span>
            </div>
            {['Captura', 'Lead', 'Checkout', 'Confirmação', 'Pós-Venda'].map((label, i) => (
              <div key={i}>
                <div style={{
                  background: card, border: `1.5px solid ${i === 0 ? brand + '44' : 'rgba(0,0,0,0.06)'}`,
                  borderLeft: `4px solid ${['#8B1A2B','#C8405C','#D4748B','#059669','#2563EB'][i]}`,
                  borderRadius: 10, padding: '10px 12px', marginBottom: i < 4 ? 0 : 8,
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', background: `${brand}14`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color: brand,
                  }}>{i + 1}</div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: textColor }}>{label}</span>
                </div>
                {i < 4 && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0' }}>
                    <div style={{ width: 1, height: 12, background: '#E5E7EB' }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 12, textAlign: 'center' }}>Preview visual · Não interativo</p>
    </div>
  );
}