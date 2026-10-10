export async function resolvePasswordRecovery(auth, address, clearAddress) {
  const url = new URL(address);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const tokenHash = url.searchParams.get('token_hash') || fragment.get('token_hash');
  const type = url.searchParams.get('type') || fragment.get('type');
  const code = url.searchParams.get('code');
  if (tokenHash) {
    url.searchParams.delete('token_hash');
    url.searchParams.delete('type');
    fragment.delete('token_hash');
    fragment.delete('type');
    url.hash = fragment.toString();
    clearAddress(url.pathname + url.search + url.hash);
    if (type !== 'recovery') throw new Error('Link de recuperação inválido.');
    const { data, error } = await auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
    if (error || !data.session) throw new Error('Link expirado ou inválido.');
    return data.session.user?.email || data.user?.email || '';
  }
  const { data: current, error: sessionError } = await auth.getSession();
  if (sessionError) throw sessionError;
  if (code && !current.session) {
    const { data, error } = await auth.exchangeCodeForSession(code);
    if (error || !data.session) throw new Error('Link expirado ou inválido.');
    url.searchParams.delete('code');
    clearAddress(url.pathname + url.search + url.hash);
    return data.session.user?.email || data.user?.email || '';
  }
  if (!current.session) throw new Error('Abra o link de definição de senha da sua conta.');
  return current.session.user?.email || '';
}
