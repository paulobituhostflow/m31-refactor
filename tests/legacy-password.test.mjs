import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateLegacyPassword, readLoginBody } from '../worker/runtime/legacy-password.ts';
import { loginWithMigratedPassword } from '../src/lib/m31PasswordLogin.js';
import { getM31HomeRoute } from '../src/lib/m31PanelAccess.js';

const app = '69d51b279da069f623e291a6';
const credentials = { email: 'validacao@example.invalid', password: 'VALIDACAO_ONLY' };
const account = { auth_id: '00000000-0000-4000-a000-000000000099', legacy_user_id: 'VALIDACAO_ID', email: credentials.email };
const proof = () => ({ access_token: 'VALIDACAO_SOURCE_TOKEN', user: { id: account.legacy_user_id, email: account.email, app_id: app, is_verified: true, disabled: false, is_service: false, role: 'admin' } });
function fixture(options = {}) {
  const calls = [], requests = [];
  const session = { env: { LEGACY_PASSWORD_MIGRATION_ENABLED: 'true', LEGACY_BASE44_APP_ID: app }, db: { rpc: async (name, args) => {
    calls.push({ name, args });
    return { data: name === 'm31_rate_limit' ? options.allowed !== false : name === 'm31_legacy_password_candidate' ? (options.candidate === false ? [] : [account]) : options.commit !== false, error: null };
  } } };
  const send = async (url, init) => { requests.push({ url, init }); if (options.networkError) throw new Error('source unavailable'); return new Response(JSON.stringify(options.proof === undefined ? proof() : options.proof), { status: options.status || 200 }); };
  return { session, send, calls, requests };
}
test('valid legacy proof hashes the same password once without importing source privileges or tokens', async () => {
  const f = fixture(); await migrateLegacyPassword(f.session, credentials, '127.0.0.1', f.send);
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0].url, `https://base44.app/api/apps/${app}/auth/login`);
  assert.equal(f.requests[0].init.redirect, 'error'); assert.deepEqual(JSON.parse(f.requests[0].init.body), credentials);
  assert.deepEqual(f.calls.at(-1), { name: 'm31_commit_legacy_password', args: { candidate_auth_id: account.auth_id, expected_legacy_id: account.legacy_user_id, expected_email: account.email, source_app: app, verified_password: credentials.password } });
  for (const call of f.calls.slice(0, 2)) assert.match(call.args.bucket, /^[a-f0-9]{64}$/);
});
test('unknown, inactive, pending and already-passworded accounts never call the source provider', async () => {
  const f = fixture({ candidate: false }); await assert.rejects(migrateLegacyPassword(f.session, credentials, 'local', f.send), { status: 401 }); assert.equal(f.requests.length, 0);
  f.session.env.LEGACY_PASSWORD_MIGRATION_ENABLED = 'false'; f.calls.length = 0;
  await assert.rejects(migrateLegacyPassword(f.session, credentials, 'local', f.send), { status: 401 }); assert.equal(f.calls.length, 0);
});
test('limits and source failures do not write destination passwords', async () => {
  for (const options of [{ allowed: false }, { status: 400 }, { status: 429 }, { status: 503 }, { networkError: true }]) {
    const f = fixture(options); await assert.rejects(migrateLegacyPassword(f.session, credentials, 'local', f.send));
    assert.equal(f.calls.some(call => call.name === 'm31_commit_legacy_password'), false);
  }
});
test('provider identity, source app, verification and disabled status must match the archived account', async () => {
  for (const patch of [{ id: 'other' }, { email: 'other@example.invalid' }, { app_id: 'other' }, { is_verified: false }, { disabled: true }, { is_service: true }]) {
    const p = proof(); Object.assign(p.user, patch); const f = fixture({ proof: p });
    await assert.rejects(migrateLegacyPassword(f.session, credentials, 'local', f.send), { status: 401 });
    assert.equal(f.calls.some(call => call.name === 'm31_commit_legacy_password'), false);
  }
  for (const p of [null, {}, { user: proof().user }, { access_token: 123, user: proof().user }, { ...proof(), excess: 'x'.repeat(65536) }]) {
    const f = fixture({ proof: p }); await assert.rejects(migrateLegacyPassword(f.session, credentials, 'local', f.send), { status: 401 });
    assert.equal(f.calls.some(call => call.name === 'm31_commit_legacy_password'), false);
  }
});
test('a destination change during provider verification fails closed', async () => {
  const f = fixture({ commit: false }); await assert.rejects(migrateLegacyPassword(f.session, credentials, 'local', f.send), { status: 401 });
});
test('login request preserves password bytes and rejects truncation and oversized bodies', async () => {
  const read = body => readLoginBody(new Request('https://example.invalid', { method: 'POST', body: JSON.stringify(body) }));
  assert.deepEqual(await read({ email: ' VALIDACAO@EXAMPLE.INVALID ', password: '  VALIDACAO  ' }), { email: credentials.email, password: '  VALIDACAO  ' });
  for (const password of ['', 'x'.repeat(73), 'é'.repeat(37), 'a\0b']) await assert.rejects(read({ ...credentials, password }), { status: 401 });
  await assert.rejects(read({ ...credentials, extra: 'x'.repeat(4096) }), { status: 413 });
});
test('Supabase success skips migration; invalid credentials migrate and retry once; other failures do not fallback', async () => {
  let logins = 0, migrations = 0;
  const data = { session: { access_token: 'VALIDACAO' } };
  const auth = { signInWithPassword: async c => { assert.deepEqual(c, credentials); return ++logins === 1 ? { error: { code: 'invalid_credentials' } } : { data }; } };
  assert.equal(await loginWithMigratedPassword(auth, credentials, async c => { assert.deepEqual(c, credentials); migrations++; }), data);
  assert.equal(logins, 2); assert.equal(migrations, 1);
  await loginWithMigratedPassword({ signInWithPassword: async () => ({ data }) }, credentials, () => { throw new Error('unexpected migration'); });
  for (const code of ['over_request_rate_limit', 'user_banned', 'email_not_confirmed', 'unexpected_failure']) await assert.rejects(loginWithMigratedPassword({ signInWithPassword: async () => ({ error: Object.assign(new Error(code), { code }) }) }, credentials, () => { throw new Error('unexpected migration'); }), new RegExp(code));
});
test('home route separates management, administrator, sector and author; unknown/inactive profiles have no access', () => {
  const user = perfil => ({ role: 'user', membro: { ativo: true, perfil } });
  assert.equal(getM31HomeRoute(user('gestao_operacional')), '/m31-admin');
  assert.equal(getM31HomeRoute(user('intercessao_operacional')), '/m31-admin');
  assert.equal(getM31HomeRoute(user('visualizacao')), '/m31-gestao-mobile');
  assert.equal(getM31HomeRoute(user('gestora_inscricoes')), '/m31-gestao-mobile');
  assert.equal(getM31HomeRoute({ role: 'admin' }), '/admin');
  assert.equal(getM31HomeRoute(user('cartinhas')), '/cartinhas');
  assert.equal(getM31HomeRoute(user('voluntario')), '/m31-coordenador');
  assert.equal(getM31HomeRoute(user('unknown')), '/m31-sem-acesso');
  assert.equal(getM31HomeRoute({ ...user('gestao_operacional'), membro: { ativo: false, perfil: 'gestao_operacional' } }), '/m31-sem-acesso');
  assert.equal(getM31HomeRoute({ role: 'user', user_metadata: { role: 'admin' } }), '/m31-sem-acesso');
});
