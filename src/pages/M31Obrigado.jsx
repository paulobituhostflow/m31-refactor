import React from 'react';
import { M31Logo } from '@/components/M31Logo';
import { usePublicFormConfig } from '@/hooks/usePublicFormConfig';
import { themeVars } from '@/lib/m31VisualTheme';

export default function M31Obrigado() {
  const { T, config } = usePublicFormConfig('obrigado');

  // FORÇA BRUTA: Light mode no DOM
  React.useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const hadDark = html.classList.contains('dark');
    const prevDataTheme = html.getAttribute('data-theme');

    html.classList.remove('dark');
    html.classList.add('light');
    html.setAttribute('data-theme', 'light');
    body.classList.remove('dark');
    body.classList.add('light');
    body.style.backgroundColor = '#FFFFFF';
    body.style.color = '#1A1A1A';

    return () => {
      if (hadDark) {
        html.classList.add('dark');
        html.classList.remove('light');
        body.classList.add('dark');
        body.classList.remove('light');
      }
      if (prevDataTheme) {
        html.setAttribute('data-theme', prevDataTheme);
      } else {
        html.removeAttribute('data-theme');
      }
      body.style.backgroundColor = '';
      body.style.color = '';
    };
  }, []);

  return (
    <div style={{
      ...themeVars(config.cores),
      minHeight: '100vh',
      background: 'var(--pgt-fundo, #0D0D0D)',
      color: 'var(--pgt-texto, #F5F5F0)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        maxWidth: '400px',
        width: '100%',
        textAlign: 'center',
      }}>
        {/* Logo */}
        <div style={{
          width: '140px',
          marginBottom: '40px',
          display: 'block',
          marginLeft: 'auto',
          marginRight: 'auto',
        }}>
          <M31Logo size="lg" />
        </div>

        {/* Banner editável (opcional — substitui o ícone quando configurado) */}
        {config.banner?.url ? (
          <img src={config.banner.url} alt={config.banner.alt || ''} style={{ width: '100%', borderRadius: 16, marginBottom: 28, display: 'block' }} />
        ) : (
          <div style={{ fontSize: '48px', marginBottom: '24px' }}>{T('icone')}</div>
        )}

        {/* Title */}
        <h1 style={{
          fontSize: '24px',
          fontWeight: 'bold',
          color: 'var(--pgt-titulo, inherit)',
          marginBottom: '16px',
          letterSpacing: '-0.5px',
        }}>
          {T('titulo')}
        </h1>

        {/* Description */}
        <p style={{
          fontSize: '16px',
          lineHeight: '1.6',
          color: '#D0D0C8',
          marginBottom: '32px',
          whiteSpace: 'pre-line',
        }}>
          {T('texto')}
        </p>

        {/* Button */}
        <button
          onClick={() => window.open(T('cta_url'), '_blank')}
          style={{
            width: '100%',
            height: '56px',
            background: 'var(--pgt-botao, #8B1A2B)',
            color: '#FFF',
            border: 'none',
            borderRadius: '10px',
            fontSize: '15px',
            fontWeight: 'bold',
            letterSpacing: '0.5px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 4px 16px rgba(139, 26, 43, 0.3)',
          }}
          onMouseEnter={(e) => {
            e.target.style.transform = 'translateY(-2px)';
            e.target.style.boxShadow = '0 8px 24px rgba(139, 26, 43, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = '0 4px 16px rgba(139, 26, 43, 0.3)';
          }}
        >
          {T('cta_texto')}
        </button>

        {/* Footer */}
        <p style={{
          fontSize: '11px',
          color: 'var(--pgt-rodape, #808078)',
          marginTop: '32px',
          letterSpacing: '0.05em',
        }}>
          {T('footer')}
        </p>
      </div>
    </div>
  );
}