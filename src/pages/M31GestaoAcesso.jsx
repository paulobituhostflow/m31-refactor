import { useEffect, useState } from 'react';
import { Eye, EyeOff, LockKeyhole, Phone, UserRound } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { canOpenM31Panel } from '@/lib/m31PanelAccess';

export const OPERATIONAL_ACCOUNT_EMAIL = 'paulobituadv+gestaom31@gmail.com';
export const OPERATOR_STORAGE_KEY = 'm31_operador_atual';

const LOGO = '/assets/a22f06b49_LOGOM31FILHAS1.png';
const PRESELECTED_OPERATORS = ['Thaysa Videres', 'Thalita', 'Dulce', 'Edilândia', 'Paulo'];

function nationalPhoneDigits(raw = '') {
  const digits = String(raw).replace(/\D/g, '');
  return (digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits).slice(0, 11);
}

function isValidBrazilianMobileNational(raw = '') {
  const digits = nationalPhoneDigits(raw);
  return digits.length === 11 && digits[2] === '9';
}

function maskBrazilianMobile(raw = '') {
  const digits = nationalPhoneDigits(raw);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function readStoredOperator() {
  try {
    const stored = JSON.parse(localStorage.getItem(OPERATOR_STORAGE_KEY) || 'null');
    if (!stored?.nome || !stored?.whatsapp || Number(stored.expires_at) <= Date.now()) return null;
    return stored;
  } catch {
    return null;
  }
}

export default function M31GestaoAcesso() {
  const previous = readStoredOperator();
  const [nome, setNome] = useState(previous?.nome || '');
  const [operadorPreselecionado, setOperadorPreselecionado] = useState(
    PRESELECTED_OPERATORS.includes(previous?.nome) ? previous.nome : (previous?.nome ? 'outro' : ''),
  );
  const [whatsapp, setWhatsapp] = useState(previous?.whatsapp_nacional || '');
  const [senha, setSenha] = useState('');
  const email = OPERATIONAL_ACCOUNT_EMAIL;
  const [contaAtual, setContaAtual] = useState(null);
  useEffect(() => { let cancelled = false; base44.auth.me().then(user => { if (!cancelled && user?.email) setContaAtual(user); }).catch(() => {}); return () => { cancelled = true; }; }, []);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  async function entrar(event, usarContaAtual = false) {
    event.preventDefault();
    setErro('');

    const nomeLimpo = nome.trim().replace(/\s+/g, ' ');
    const telefoneNacional = nationalPhoneDigits(whatsapp);
    if (nomeLimpo.length < 3) {
      setErro('Informe seu nome para identificarmos quem está operando.');
      return;
    }
    if (!isValidBrazilianMobileNational(telefoneNacional)) {
      setErro('Informe um WhatsApp válido com DDD e o nono dígito.');
      return;
    }
    if (!usarContaAtual && !senha) {
      setErro('Informe a senha da equipe.');
      return;
    }

    setLoading(true);
    try {
      if (!usarContaAtual) {
      const { access_token } = await base44.auth.loginViaEmailPassword(email.trim().toLowerCase(), senha);
      if (!access_token) {
        const error = new Error('Token de acesso não retornado');
        error.code = 'auth_token_missing';
        throw error;
      }
      await base44.auth.setToken(access_token);
      setSenha('');
      }

      const user = await base44.auth.me();
      if (!canOpenM31Panel(user, 'management')) {
        throw Object.assign(new Error('Esta conta não possui perfil de gestão.'), { code: 'management_required' });
      }

      const sessionResponse = await base44.functions.invoke('m31AbrirSessaoOperacional', {
        nome: nomeLimpo,
        whatsapp: telefoneNacional,
      });
      const session = sessionResponse?.data || sessionResponse;
      if (!session?.session_id || !session?.expires_at) {
        throw new Error('Sessão operacional não retornada');
      }

      const operator = {
        nome: session.operador_nome,
        whatsapp: session.operador_whatsapp,
        whatsapp_nacional: telefoneNacional,
        session_id: session.session_id,
        operacoes_permitidas: session.operacoes_permitidas || [],
        caravana_ids_permitidas: session.caravana_ids_permitidas || [],
        identificado_em: session.aberta_em,
        expires_at: Date.parse(session.expires_at),
      };
      localStorage.setItem(OPERATOR_STORAGE_KEY, JSON.stringify(operator));

      window.location.replace('/m31-gestao-mobile');
    } catch (error) {
      const code = error?.code || error?.response?.data?.error || error?.data?.error || error?.message || '';
      if (code === 'management_required') {
        setErro('Esta conta não possui perfil de gestão. Entre pelo acesso geral para abrir sua área.');
      } else if (['auth_failed', 'auth_token_missing', 'invalid_credentials'].includes(code)) {
        setErro('Não foi possível autenticar a conta da equipe. Verifique a senha e tente novamente.');
      } else if (code === 'legacy_auth_unavailable' || error?.status === 429) {
        setErro(error.message);
      } else if (String(code).includes('operator_not_registered') || String(code).includes('forbidden') || String(code).includes('scope')) {
        setErro('Seu operador está identificado, mas ainda não possui acesso à área liberada para ele.');
      } else {
        setErro('Não foi possível abrir sua sessão operacional. Tente novamente.');
      }
      setLoading(false);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <img src={LOGO} alt="M31 Filhas" style={styles.logo} />
        <div style={styles.heading}>
          <h1 style={styles.title}>Gestão Operacional</h1>
          <p style={styles.subtitle}>Identifique-se e entre com a senha da equipe.</p>
        </div>

        <form onSubmit={entrar} style={styles.form}>
          <Field label="Seu nome" icon={<UserRound size={18} />}>
            <select
              name="operador_preselecionado"
              value={operadorPreselecionado}
              onChange={(event) => {
                const value = event.target.value;
                setOperadorPreselecionado(value);
                setNome(value === 'outro' ? '' : value);
              }}
              style={styles.input}
            >
              <option value="" disabled>Selecione seu nome</option>
              {PRESELECTED_OPERATORS.map((operatorName) => <option key={operatorName} value={operatorName}>{operatorName}</option>)}
              <option value="outro">Líder de caravana ou outro nome</option>
            </select>
          </Field>

          {operadorPreselecionado === 'outro' && (
            <Field label="Digite seu nome completo" icon={<UserRound size={18} />}>
              <input
                name="nome"
                value={nome}
                onChange={(event) => setNome(event.target.value)}
                placeholder="Nome da líder"
                autoComplete="name"
                style={styles.input}
              />
            </Field>
          )}

          <Field label="Seu WhatsApp" icon={<Phone size={18} />}>
            <input
              name="whatsapp"
              value={maskBrazilianMobile(whatsapp)}
              onChange={(event) => setWhatsapp(event.target.value)}
              placeholder="(81) 9 9999-9999"
              inputMode="tel"
              autoComplete="tel"
              style={styles.input}
            />
          </Field>

          {contaAtual && <button type="button" disabled={loading} onClick={event => entrar(event, true)} style={styles.submit}>Continuar com {contaAtual.full_name || 'minha conta'}</button>}
          <Field label="Senha da equipe" icon={<LockKeyhole size={18} />}>
            <input
              name="senha"
              type={mostrarSenha ? 'text' : 'password'}
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              placeholder="Digite a senha (M31FILHAS)"
              autoComplete="current-password"
              style={{ ...styles.input, paddingRight: '44px' }}
            />
            <button
              type="button"
              onClick={() => setMostrarSenha((value) => !value)}
              aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
              style={styles.eyeButton}
            >
              {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </Field>

          {erro && <div role="alert" style={styles.error}>{erro}</div>}

          <button type="submit" disabled={loading} style={{ ...styles.submit, opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Entrando…' : 'Entrar no painel'}
          </button>
        </form>

        <p style={styles.note}>Todas as responsáveis utilizam a senha da equipe (M31FILHAS).</p>
        <a href="/m31-login" style={{ ...styles.note, display: 'block', textAlign: 'center' }}>Acesso geral às outras áreas</a>
      </section>
    </main>
  );
}

function Field({ label, icon, children }) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      <span style={styles.inputShell}>
        <span style={styles.icon}>{icon}</span>
        {children}
      </span>
    </label>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#F7F3F0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    fontFamily: 'Helvetica Now Display, Arial, sans-serif',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    background: '#FFFFFF',
    border: '1px solid #E8DED8',
    borderRadius: '18px',
    padding: '28px 22px',
  },
  logo: { display: 'block', height: '64px', maxWidth: '180px', objectFit: 'contain', margin: '0 auto 20px' },
  heading: { textAlign: 'center', marginBottom: '24px' },
  title: { margin: 0, color: '#1A1A1A', fontSize: '24px', fontWeight: 700 },
  subtitle: { margin: '6px 0 0', color: '#756B66', fontSize: '14px' },
  form: { display: 'flex', flexDirection: 'column', gap: '16px' },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { color: '#514A46', fontSize: '13px', fontWeight: 600 },
  inputShell: { position: 'relative', display: 'flex', alignItems: 'center' },
  icon: { position: 'absolute', left: '13px', color: '#8B1A2B', display: 'flex', pointerEvents: 'none' },
  input: {
    width: '100%',
    minHeight: '50px',
    boxSizing: 'border-box',
    border: '1px solid #D9CFCA',
    borderRadius: '10px',
    padding: '0 14px 0 42px',
    background: '#FFFFFF',
    color: '#1A1A1A',
    fontSize: '16px',
    outlineColor: '#8B1A2B',
  },
  eyeButton: {
    position: 'absolute',
    right: '6px',
    width: '38px',
    height: '38px',
    border: 0,
    background: 'transparent',
    color: '#756B66',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  error: {
    background: '#FFF1F2',
    border: '1px solid #FECDD3',
    borderRadius: '9px',
    color: '#9F1239',
    padding: '11px 12px',
    fontSize: '13px',
    lineHeight: 1.4,
  },
  submit: {
    width: '100%',
    minHeight: '50px',
    border: 0,
    borderRadius: '10px',
    background: '#8B1A2B',
    color: '#FFFFFF',
    fontSize: '16px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  note: { margin: '16px 0 0', textAlign: 'center', color: '#8B817C', fontSize: '12px' },
};
