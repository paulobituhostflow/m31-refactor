// Login simplificado sobre a autenticação nativa já usada na Gestão.
// O e-mail identifica a conta; NÃO é um segredo. A senha nunca é persistida aqui.
// A autorização final permanece no backend, pelo cartinha_autora_user_id.
export const CARTINHAS_AUTHOR_EMAIL = 'julibeltrao@gmail.com';
export const CARTINHAS_HOME = '/cartinhas';
export const isCartinhasRoute = pathname => ['/cartinhas', '/cartinhas-imprimir'].includes(String(pathname).replace(/\/+$/, ''));

export async function entrarNasCartinhas({ auth, acesso, senha, persistToken }) {
  if (typeof senha !== 'string' || !senha.length) throw new Error('Informe a senha.');
  const session = await auth.loginViaEmailPassword(CARTINHAS_AUTHOR_EMAIL, senha);
  if (!session?.access_token) throw new Error('Não foi possível iniciar a sessão.');
  // Não basta autenticar: a mesma regra privada de listar/salvar/imprimir autoriza a conta.
  const authorized = await acesso();
  if (!authorized?.user?.id) throw new Error('Acesso não autorizado.');
  persistToken?.(session.access_token);
  return authorized;
}
