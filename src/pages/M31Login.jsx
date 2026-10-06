import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { M31Logo } from '@/components/M31Logo';

const AFTER_LOGIN = '/portal';

export default function M31Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(null); // 'google' | 'email' | 'reset' | null
  const [erro, setErro] = useState(null);
  const [info, setInfo] = useState(null);

  const limpaEstados = () => {
    setErro(null);
    setInfo(null);
  };

  // 1) Entrar com Google
  const handleGoogle = async () => {
    limpaEstados();
    localStorage.setItem('m31_login_provider', 'google');
    setLoading('google');
    try {
      await base44.auth.loginWithProvider('google', AFTER_LOGIN);
    } catch (e) {
      setLoading(null);
      setErro('Não foi possível iniciar o login com Google. Tente novamente.');
    }
  };

  // 2) Login com e-mail e senha
  const handleEmailSenha = async (e) => {
    e.preventDefault();
    limpaEstados();
    if (!email || !senha) {
      setErro('Informe e-mail e senha.');
      return;
    }
    setLoading('email');
    try {
      localStorage.setItem('m31_login_provider', 'email');
      await base44.auth.loginViaEmailPassword(email, senha);
      window.location.href = AFTER_LOGIN;
    } catch (err) {
      setLoading(null);
      const msg = err?.message || err?.error || '';
      if (err?.status === 401 || /credenciais|senha|invalid/i.test(msg)) {
        setErro('E-mail ou senha incorretos.');
      } else if (err?.status === 403 || /not registered|verif/i.test(msg)) {
        setErro('Conta não verificada ou sem acesso ao M31.');
      } else {
        setErro(msg || 'Falha ao entrar. Tente novamente.');
      }
    }
  };

  // 3) Esqueci minha senha
  const handleEsqueciSenha = async (e) => {
    e.preventDefault();
    limpaEstados();
    if (!email) {
      setErro('Informe seu e-mail para receber o link de redefinição.');
      return;
    }
    setLoading('reset');
    try {
      await base44.auth.resetPasswordRequest(email);
      setInfo('Se o e-mail existir, você receberá um link de redefinição em instantes.');
    } catch (err) {
      setLoading(null);
      const msg = err?.message || err?.error || '';
      setErro(msg || 'Não foi possível enviar o link. Tente novamente.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div style={styles.bg}>
      <div style={styles.card}>
        {/* Identidade M31 */}
        <div style={styles.header}>
          <M31Logo size="2xl" />
          <h1 style={styles.titulo}>Entrar no M31</h1>
          <p style={styles.subtitulo}>Acesse a área autorizada para sua conta.</p>
        </div>

        <a href="/gestao" style={{ ...styles.btnPrimario, textDecoration: 'none', marginBottom: '20px' }}>Gestão operacional da equipe</a>

        {/* 1. Google */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading !== null}
          style={styles.btnGoogle}
        >
          {loading === 'google' ? (
            <Spinner />
          ) : (
            <GoogleIcon />
          )}
          <span>Entrar com Google</span>
        </button>

        {/* Divisor */}
        <div style={styles.divisor}>
          <span>ou entre com e-mail</span>
        </div>

        {/* 2. E-mail + Senha */}
        <form onSubmit={handleEmailSenha} style={styles.form}>
          <input
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={styles.input}
            autoComplete="email"
            disabled={loading !== null}
          />
          <input
            type="password"
            placeholder="Senha"
            value={senha}
            onChange={e => setSenha(e.target.value)}
            style={styles.input}
            autoComplete="current-password"
            disabled={loading !== null}
          />

          {erro && <div style={styles.erro}>{erro}</div>}
          {info && <div style={styles.info}>{info}</div>}

          <button
            type="submit"
            disabled={loading !== null}
            style={{
              ...styles.btnPrimario,
              opacity: loading === 'email' ? 0.7 : 1,
            }}
          >
            {loading === 'email' ? <Spinner /> : 'Entrar'}
          </button>
        </form>

        {/* 3. Esqueci minha senha */}
        <button
          type="button"
          onClick={handleEsqueciSenha}
          disabled={loading !== null || !email}
          style={styles.linkSecundario}
        >
          {loading === 'reset' ? 'Enviando…' : 'Esqueci minha senha'}
        </button>

        <p style={styles.rodape}>
          Ao continuar, você concorda com os termos de uso da plataforma M31.
        </p>
      </div>
    </div>
  );
}

/* ── Componentes auxiliares ─────────────────────────────── */

function Spinner() {
  return (
    <span style={styles.spinner} aria-label="Carregando" />
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
    </svg>
  );
}

/* ── Estilos ────────────────────────────────────────────── */

const WINE = '#8B1A2B';
const WINE_DARK = '#7D2637';
const BG_DARK = '#0D0D0D';
const SURFACE = '#161616';
const BORDER = '#2A2A2A';
const TEXT = '#F5F5F0';
const MUTED = '#999999';

const styles = {
  bg: {
    minHeight: '100vh',
    background: `radial-gradient(ellipse at top, ${WINE}22 0%, ${BG_DARK} 60%)`,
    color: TEXT,
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  },
  card: {
    width: '100%',
    maxWidth: '400px',
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: '16px',
    padding: '36px 28px',
    boxShadow: `0 24px 60px -20px rgba(0,0,0,0.6), 0 0 0 1px ${WINE}11`,
  },
  header: {
    textAlign: 'center',
    marginBottom: '28px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  titulo: {
    fontSize: '20px',
    fontWeight: '700',
    margin: '8px 0 0 0',
    letterSpacing: '-0.02em',
  },
  subtitulo: {
    fontSize: '12px',
    color: MUTED,
    margin: 0,
  },
  btnGoogle: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '12px 16px',
    background: '#FFFFFF',
    color: '#1A1A1A',
    border: 'none',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'transform 0.15s ease, box-shadow 0.2s ease',
  },
  divisor: {
    display: 'flex',
    alignItems: 'center',
    textAlign: 'center',
    margin: '20px 0',
    color: MUTED,
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    gap: '12px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    background: '#0D0D0D',
    border: `1px solid ${BORDER}`,
    borderRadius: '10px',
    color: TEXT,
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.15s ease',
  },
  btnPrimario: {
    width: '100%',
    padding: '12px 16px',
    background: `linear-gradient(135deg, ${WINE} 0%, ${WINE_DARK} 100%)`,
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginTop: '4px',
  },
  linkSecundario: {
    width: '100%',
    background: 'none',
    border: 'none',
    color: MUTED,
    fontSize: '12px',
    cursor: 'pointer',
    padding: '10px',
    marginTop: '8px',
    transition: 'color 0.15s ease',
  },
  erro: {
    background: 'rgba(239,68,68,0.08)',
    border: '1px solid rgba(239,68,68,0.25)',
    color: '#F87171',
    padding: '10px 12px',
    borderRadius: '8px',
    fontSize: '12px',
    lineHeight: 1.4,
  },
  info: {
    background: 'rgba(16,185,129,0.08)',
    border: '1px solid rgba(16,185,129,0.25)',
    color: '#34D399',
    padding: '10px 12px',
    borderRadius: '8px',
    fontSize: '12px',
    lineHeight: 1.4,
  },
  rodape: {
    fontSize: '10px',
    color: MUTED,
    textAlign: 'center',
    marginTop: '20px',
    lineHeight: 1.4,
  },
  spinner: {
    display: 'inline-block',
    width: '16px',
    height: '16px',
    border: '2px solid currentColor',
    borderTopColor: 'transparent',
    borderRadius: '50%',
    animation: 'm31spin 0.7s linear infinite',
  },
};
