import { createClient } from '@supabase/supabase-js';
import { loginWithMigratedPassword } from '@/lib/m31PasswordLogin';
let singleton;
export function getSupabase() {
  if (!singleton) {
    const url = import.meta.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!key) throw new Error('Configure VITE_SUPABASE_PUBLISHABLE_KEY no ambiente local.');
    singleton = createClient(url, key, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  }
  return singleton;
}
export async function request(path, body, options = {}) {
  const { data } = await getSupabase().auth.getSession();
  const headers = new Headers(options.headers);
  if (data.session?.access_token) headers.set('Authorization', `Bearer ${data.session.access_token}`);
  if (!(body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(`/api${path}`, { ...options, method: options.method || 'POST', credentials: 'same-origin', headers, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) {
    const error = Object.assign(new Error(result.error || 'Não foi possível concluir a operação.'), { status: response.status, response: { status: response.status, data: result }, code: result.code });
    throw error;
  }
  return { data: result, status: response.status };
}
function safeReturnTo(value = '/portal') { const url = new URL(value, window.location.origin); return url.origin === window.location.origin ? url.pathname + url.search : '/portal'; }
const domainNames=new Set(['EventoM31Inscricao','EventoM31Voluntario','EventoM31Caravana','EventoM31CamisaPedido','EventoM31CamisaEstoque','ContaPagar','ContaReceber','FinancialSupplier','FinancialTransaction','SupplierContract','SupplierPayment','M31TransacaoFinanceira','M31PendenciaConciliacao','EventoM31Config']);
function mutationPath(name){return `/${domainNames.has(String(name))?'domain':'entities'}/${name}`;}
export const base44 = {
  entities: new Proxy({}, { get: (_target, name) => ({
    list: (sort = '-id', limit = 500, offset = 0) => request(`/entities/${name}`, { action: 'list', sort, limit, offset }).then(r => r.data),
    filter: (filter = {}, sort = '-id', limit = 500, offset = 0) => request(`/entities/${name}`, { action: 'filter', filter, sort, limit, offset }).then(r => r.data),
    get: id => request(`/entities/${name}`, { action: 'get', id }).then(r => r.data),
    create: data => request(mutationPath(name), { action: 'create', data }).then(r => r.data),
    update: (id, data) => request(mutationPath(name), { action: 'update', id, data }).then(r => r.data),
    delete: id => request(mutationPath(name), { action: 'delete', id }).then(r => r.data),
    bulkCreate: data => request(mutationPath(name), { action: 'bulkCreate', data }).then(r => r.data),
    bulkUpdate: data => request(mutationPath(name), { action: 'bulkUpdate', data }).then(r => r.data),
    updateMany: (filter, data) => request(mutationPath(name), { action: 'updateMany', filter, data }).then(r => r.data),
    subscribe: callback => {
      const channel = getSupabase().channel(`m31:${String(name)}:${crypto.randomUUID()}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'm31_changes', filter: `entity=eq.${String(name)}` }, event => callback({ type: event.new.operation, id: event.new.record_id })).subscribe();
      return () => { getSupabase().removeChannel(channel); };
    },
  }) }),
  functions: { invoke: (name, body = {}) => request(`/functions/${name}`, body, { headers: { 'Idempotency-Key': body._request_id || crypto.randomUUID() } }) },
  auth: {
    me: () => request('/auth/me', undefined, { method: 'GET' }).then(r => r.data),
    isAuthenticated: async () => !!(await getSupabase().auth.getSession()).data.session,
    loginViaEmailPassword: async (email, password) => {
      const data = await loginWithMigratedPassword(getSupabase().auth, { email: email.trim().toLowerCase(), password }, async credentials => {
        const response = await fetch('/api/auth/legacy-password', { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
        const result = await response.json();
        if (!response.ok) throw Object.assign(new Error(result.error || 'Não foi possível verificar seu acesso.'), { status: response.status, code: result.code });
      });
      return { ...data.session, user:data.user, session:data.session };
    },
    setToken: async token=>{const {data}=await getSupabase().auth.getSession();if(!data.session||data.session.access_token!==token)throw new Error("Conclua o login para registrar uma sessão válida.");return true;},
    loginWithProvider: async (_provider, returnTo) => { sessionStorage.setItem('m31_return_to', safeReturnTo(returnTo)); const r = await getSupabase().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/m31-auth-callback` } }); if (r.error) throw r.error; },
    resetPasswordRequest: async email => { const r = await getSupabase().auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/m31-reset-password` }); if (r.error) throw r.error; },
    logout: async returnTo => { await request('/auth/logout', {}); await getSupabase().auth.signOut(); if (returnTo) location.assign('/m31-login'); },
    redirectToLogin: returnTo => { sessionStorage.setItem('m31_return_to', safeReturnTo(returnTo)); location.assign('/m31-login'); },
    trackAccess:()=>request('/auth/access',{}).then(r=>r.data),
    updateMe: data => request('/auth/profile', data).then(r => r.data),
  },
  integrations: { Core: new Proxy({}, { get: (_target, name) => async args => {
    if (args?.file instanceof Blob) { const form = new FormData(); form.set('file', args.file, args.file.name || 'arquivo'); form.set('private', String(args.public !== true)); form.set('purpose', args.purpose || 'tasks'); return request('/files/upload', form).then(r => r.data); }
    return request(`/integrations/${String(name)}`, args).then(r => r.data);
  } }) },
};
