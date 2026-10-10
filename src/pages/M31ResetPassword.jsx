import { useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/api/base44Client';
import { resolvePasswordRecovery } from '@/lib/m31PasswordRecovery';

export default function M31ResetPassword() {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('Validando acesso…');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [email, setEmail] = useState('');
  const recovery = useRef(null);
  useEffect(() => {
    let active = true;
    recovery.current ||= resolvePasswordRecovery(getSupabase().auth, location.href, address => history.replaceState(null, '', address));
    recovery.current
      .then(accountEmail => { if (active) { setEmail(accountEmail); setReady(true); setMessage('Escolha uma senha com pelo menos 12 caracteres.'); } })
      .catch(() => { if (active) setMessage('Link expirado ou inválido. Solicite um novo link de definição de senha.'); });
    return () => { active = false; };
  }, []);
  async function save(event) {
    event.preventDefault();
    if (!ready || saving || password.length < 12) return;
    setSaving(true);
    try {
      const { error } = await getSupabase().auth.updateUser({ password });
      if (error) throw error;
      setPassword(''); setSaved(true); setReady(false);
      setMessage('Senha atualizada. Você já pode entrar no painel.');
    } catch { setMessage('Não foi possível atualizar a senha. Tente novamente.'); }
    finally { setSaving(false); }
  }
  return <main className="max-w-md mx-auto p-8"><form onSubmit={save}>
    <h1 className="text-xl mb-4">Definir senha</h1>
    {email && <p className="mb-4">Conta: {email}</p>}
    {!saved && <><input aria-label="Nova senha" className="border p-3 w-full" type="password" minLength={12} required disabled={!ready || saving} value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" />
      <button className="mt-4 border p-3" type="submit" disabled={!ready || saving}>{saving ? 'Salvando…' : 'Salvar senha'}</button></>}
    <p role="status">{message}</p>
    {saved && <a className="inline-block mt-4 underline" href="/portal">Entrar no painel</a>}
  </form></main>;
}
