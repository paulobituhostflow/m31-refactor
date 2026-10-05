import { useState } from 'react';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { cartinhasApi, CARTINHAS_QUERY_KEY, cartinhasErrorStatus } from '@/lib/m31CartinhasApi';
import { CARTINHAS_AUTHOR_EMAIL, CARTINHAS_HOME, entrarNasCartinhas } from './cartinhasRouteAccess';

export default function CartinhaAcesso() {
  const qc = useQueryClient();
  const [senha, setSenha] = useState('');
  const [visivel, setVisivel] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [recuperando, setRecuperando] = useState(false);
  const [recuperacaoSolicitada, setRecuperacaoSolicitada] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  async function entrar(event) {
    event.preventDefault();
    if (ocupado || !senha) return;
    setOcupado(true); setErro(''); setAviso('');
    try {
      await entrarNasCartinhas({
        auth: base44.auth,
        acesso: cartinhasApi.acesso,
        senha,
        // Compatibilidade com app-params.js; armazena somente o token nativo, nunca a senha.
      });
      setSenha('');
      qc.removeQueries({ queryKey: CARTINHAS_QUERY_KEY });
      window.location.replace(window.location.pathname === '/cartinhas-imprimir' ? '/cartinhas-imprimir' : CARTINHAS_HOME);
    } catch (error) {
      setSenha('');
      setErro(cartinhasErrorStatus(error) === 429
        ? 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.'
        : 'Não foi possível entrar. Confira a senha da Juliana ou use a recuperação abaixo.');
      setOcupado(false);
    }
  }

  async function recuperar() {
    if (recuperando || recuperacaoSolicitada) return;
    setRecuperando(true); setErro(''); setAviso('');
    try {
      // Só envia quando a própria usuária pede; usa a recuperação nativa do Base44.
      await base44.auth.resetPasswordRequest(CARTINHAS_AUTHOR_EMAIL);
      setRecuperacaoSolicitada(true);
      setAviso('Se a conta permitir recuperação, as instruções chegarão ao e-mail cadastrado da Juliana. Depois de definir a senha, volte a esta página.');
    } catch {
      setErro('Não foi possível solicitar a recuperação agora. Aguarde e tente novamente.');
    } finally { setRecuperando(false); }
  }

  return <main style={s.page}>
    <section style={s.card} aria-labelledby="cartinhas-acesso-titulo">
      <LockKeyhole size={30} style={{ color: '#5B0E2D', marginBottom: 14 }} aria-hidden="true" />
      <h1 id="cartinhas-acesso-titulo" style={s.title}>Cartinhas da Ju</h1>
      <p style={s.subtitle}>Seu espaço de escrita, Juliana.</p>
      <form onSubmit={entrar} style={{ display: 'grid', gap: 16 }}>
        <input type="text" name="username" autoComplete="username" value={CARTINHAS_AUTHOR_EMAIL} readOnly hidden />
        <label htmlFor="cartinhas-senha" style={s.label}>Senha da Juliana</label>
        <div style={{ position: 'relative' }}>
          <input id="cartinhas-senha" name="password" type={visivel ? 'text' : 'password'}
            autoComplete="current-password" required value={senha} disabled={ocupado}
            onChange={event => setSenha(event.target.value)} placeholder="Digite sua senha"
            style={s.input} />
          <button type="button" onClick={() => setVisivel(value => !value)}
            aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'} style={s.eye}>
            {visivel ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
        {erro && <p role="alert" style={s.error}>{erro}</p>}
        {aviso && <p role="status" style={s.notice}>{aviso}</p>}
        <button type="submit" disabled={ocupado || !senha} style={{ ...s.submit, opacity: ocupado || !senha ? 0.65 : 1 }}>
          {ocupado ? 'Entrando…' : 'Entrar nas Cartinhas'}
        </button>
      </form>
      <button type="button" onClick={recuperar} disabled={ocupado || recuperando || recuperacaoSolicitada} style={s.recover}>
        {recuperando ? 'Solicitando…' : recuperacaoSolicitada ? 'Recuperação solicitada' : 'Definir ou recuperar senha'}
      </button>
      <p style={s.footer}>Acesso exclusivo da autora. A senha da equipe não é utilizada aqui.</p>
    </section>
  </main>;
}
const s = {
  page: { minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px 16px', background: '#F7F3F0', fontFamily: 'Inter, Arial, sans-serif', boxSizing: 'border-box' },
  card: { width: '100%', maxWidth: 420, border: '1px solid #E8DED8', borderRadius: 20, background: '#FFFFFF', padding: '32px 24px', boxSizing: 'border-box' },
  title: { fontSize: 27, color: '#30262A', margin: '0 0 8px', fontWeight: 750 },
  subtitle: { color: '#776971', margin: '0 0 28px', lineHeight: 1.5 },
  label: { fontWeight: 650, fontSize: 14, color: '#483B43', marginBottom: -8 },
  input: { width: '100%', minHeight: 52, borderRadius: 12, border: '1px solid #D9CDD3', padding: '12px 48px 12px 14px', fontSize: 16, boxSizing: 'border-box' },
  eye: { position: 'absolute', right: 0, top: 0, width: 48, minHeight: 52, border: 0, background: 'none', color: '#776971', display: 'grid', placeItems: 'center', cursor: 'pointer' },
  submit: { minHeight: 52, border: 0, borderRadius: 12, background: '#5B0E2D', color: '#FFF', fontSize: 16, fontWeight: 700, cursor: 'pointer' },
  recover: { minHeight: 48, width: '100%', border: 0, background: 'none', color: '#5B0E2D', textDecoration: 'underline', cursor: 'pointer', marginTop: 8 },
  error: { color: '#5B0E2D', fontSize: 14, margin: 0, lineHeight: 1.5 },
  notice: { color: '#5B0E2D', fontSize: 14, margin: 0, lineHeight: 1.5 },
  footer: { color: '#81757B', fontSize: 12, textAlign: 'center', lineHeight: 1.5, margin: '16px 0 0' },
};
