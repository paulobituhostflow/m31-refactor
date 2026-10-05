import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

const FALLBACK_LOGO = '/assets/042f1c542_logo_m31_sf_PB44_2_.png';

// ── CACHE SINGLETON (Ajuste #1) ──
let _brandCache = null;
let _brandCachePromise = null;

function fetchBrand() {
  if (_brandCache) return Promise.resolve(_brandCache);
  if (_brandCachePromise) return _brandCachePromise;
  
  _brandCachePromise = base44.entities.BrandSettings.list()
    .then(items => {
      _brandCache = items?.[0] || null;
      return _brandCache;
    })
    .catch(() => {
      _brandCache = null;
      return null;
    })
    .finally(() => { _brandCachePromise = null; });
  
  return _brandCachePromise;
}

export function invalidateBrandCache() {
  _brandCache = null;
}

// ── COMPONENTE ──
export function M31Logo({ size = 'md', variant = 'auto', className = '' }) {
  const [logoUrl, setLogoUrl] = useState(FALLBACK_LOGO);
  const [alt, setAlt] = useState('M31 Filhas');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchBrand()
      .then(settings => {
        if (settings) {
          const url = variant === 'dark' && settings.logo_dark_url
            ? settings.logo_dark_url
            : settings.logo_url || FALLBACK_LOGO;
          setLogoUrl(url);
          setAlt(settings.logo_alt || 'M31 Filhas');
        } else {
          setLogoUrl(FALLBACK_LOGO);
        }
      })
      .finally(() => setLoading(false));
  }, [variant]);

  // ── AJUSTE #5: Escuta evento de invalidação ──
  useEffect(() => {
    const handleBrandUpdate = (e) => {
      invalidateBrandCache();
      setLoading(true);
      fetchBrand().then(settings => {
        if (settings) {
          const url = variant === 'dark' && settings.logo_dark_url
            ? settings.logo_dark_url
            : settings.logo_url || FALLBACK_LOGO;
          setLogoUrl(url);
          setAlt(settings.logo_alt || 'M31 Filhas');
        }
        setLoading(false);
      });
    };
    
    window.addEventListener('m31-brand-updated', handleBrandUpdate);
    return () => window.removeEventListener('m31-brand-updated', handleBrandUpdate);
  }, [variant]);

  const sizes = {
    sm: { height: '32px' },
    md: { height: '56px' },
    lg: { height: '80px' },
    xl: { height: '120px' },
    '2xl': { height: '160px' },
  };

  if (loading) {
    return <div style={{ height: sizes[size].height, background: '#f0f0f0', borderRadius: '8px' }} />;
  }

  return (
    <img
      src={logoUrl}
      alt={alt}
      style={{ ...sizes[size], maxWidth: '100%', objectFit: 'contain' }}
      className={`m31-logo ${className}`}
      loading="eager"
      onError={() => setLogoUrl(FALLBACK_LOGO)}
    />
  );
}