/**
 * M31GestaoHome — Página de entrada da gestão
 * Rota: / (raiz do domínio)
 * 
 * - Se já logado: redireciona automaticamente para a área correta
 * - Se não logado: exibe tela de acesso limpa para a equipe
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';

const M31_LOGO = "/assets/a22f06b49_LOGOM31FILHAS1.png";

export default function M31GestaoHome() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [isAuth, setIsAuth] = useState(false);

  useEffect(() => {
    base44.auth.isAuthenticated().then(auth => {
      setIsAuth(auth);
      setChecking(false);
      if (auth) {
        // já logado → portal resolve o perfil
        navigate('/portal', { replace: true });
      }
    }).catch(() => setChecking(false));
  }, [navigate]);

  if (checking) {
    return (
      <div style={styles.root}>
        <div style={styles.spinner} />
      </div>
    );
  }

  // não autenticado → tela de acesso
  return (
    <div style={styles.root}>
      {/* Glow sutil de fundo */}
      <div style={styles.glow} />

      <div style={styles.card}>
        {/* Logo */}
        <img src={M31_LOGO} alt="M31 Filhas" style={styles.logo} />

        {/* Título */}
        <div style={styles.titleGroup}>
          <h1 style={styles.title}>Central de Gestão M31</h1>
          <p style={styles.subtitle}>
            Acesso restrito para equipe, coordenação e gestão do evento.
          </p>
        </div>

        {/* Divisor */}
        <div style={styles.divider} />

        {/* Botão de acesso */}
        <button
          style={styles.btnPrimary}
          onClick={() => base44.auth.redirectToLogin('/portal')}
          onMouseEnter={e => e.target.style.background = '#C8405C'}
          onMouseLeave={e => e.target.style.background = '#8B1A2B'}
        >
          Entrar no painel
        </button>

        {/* Nota */}
        <p style={styles.note}>
          Apenas membros autorizados da equipe possuem acesso.
        </p>

        {/* Link discreto para inscrições públicas */}
        <a href="/m31" style={styles.publicLink}>
          Acessar página de inscrições →
        </a>
      </div>

      {/* Footer mínimo */}
      <p style={styles.footer}>M31 Filhas · Recife-PE · 2026</p>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

const styles = {
  root: {
    minHeight: '100vh',
    background: '#F7F5F2',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    fontFamily: "'Inter', system-ui, sans-serif",
    position: 'relative',
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: '30%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '500px',
    height: '300px',
    background: 'radial-gradient(ellipse, rgba(168,52,74,0.08) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  card: {
    position: 'relative',
    zIndex: 1,
    background: '#FFFFFF',
    border: '1px solid #EAE7E2',
    borderRadius: '20px',
    padding: '48px 40px',
    width: '100%',
    maxWidth: '400px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '20px',
    animation: 'fadeIn 0.6s ease-out both',
    boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
  },
  logo: {
    height: '72px',
    objectFit: 'contain',
  },
  titleGroup: {
    textAlign: 'center',
  },
  title: {
    color: '#2D2D2D',
    fontSize: '20px',
    fontWeight: '600',
    margin: '0 0 6px 0',
    letterSpacing: '-0.3px',
    fontFamily: "'Inter', sans-serif",
  },
  subtitle: {
    color: '#6B7280',
    fontSize: '13px',
    margin: 0,
    lineHeight: '1.5',
  },
  divider: {
    width: '100%',
    height: '1px',
    background: '#EAE7E2',
  },
  btnPrimary: {
    width: '100%',
    padding: '14px',
    background: '#8B1A2B',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s',
    letterSpacing: '0.2px',
  },
  note: {
    color: '#B0ADA8',
    fontSize: '11px',
    textAlign: 'center',
    margin: '0',
    lineHeight: '1.5',
  },
  publicLink: {
    color: '#B0ADA8',
    fontSize: '11px',
    textDecoration: 'none',
    marginTop: '-8px',
    transition: 'color 0.2s',
  },
  footer: {
    position: 'absolute',
    bottom: '20px',
    color: '#D4D0CA',
    fontSize: '11px',
  },
  spinner: {
    width: '28px',
    height: '28px',
    border: '3px solid #EAE7E2',
    borderTop: '3px solid #8B1A2B',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};