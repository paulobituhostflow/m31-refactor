import test from 'node:test';
import assert from 'node:assert/strict';
import { canOpenM31Panel } from '../src/lib/m31PanelAccess.js';
import { resolvePasswordRecovery } from '../src/lib/m31PasswordRecovery.js';

test('operational panel admits existing profiles while retaining sector and author separation', () => {
  for (const profile of ['gestao_operacional', 'coordenador', 'coordenadora_geral', 'gestora_inscricoes', 'coordenacao_participantes', 'visualizacao']) {
    assert.equal(canOpenM31Panel({ role: 'user', membro: { ativo: true, perfil: profile } }, 'management'), true);
  }
  for (const profile of ['lider_setor', 'checkin', 'voluntario']) {
    const user = { role: 'user', membro: { ativo: true, perfil: profile } };
    assert.equal(canOpenM31Panel(user, 'management'), false);
    assert.equal(canOpenM31Panel(user, 'coordination'), true);
  }
  assert.equal(canOpenM31Panel({ role: 'admin' }, 'management'), true);
  assert.equal(canOpenM31Panel({ role: 'admin' }, 'unknown'), false);
  assert.equal(canOpenM31Panel(null, 'management'), false);
  assert.equal(canOpenM31Panel({ role: 'user', membro: { ativo: false, perfil: 'gestao_operacional' } }, 'management'), false);
  assert.equal(canOpenM31Panel({ role: 'user', user_metadata: { role: 'admin' }, membro: { ativo: true, perfil: 'cartinhas' } }, 'management'), false);
});

test('private migration recovery link works without a PKCE verifier and is removed before verification', async () => {
  const calls = [];
  const email = await resolvePasswordRecovery({ verifyOtp: async args => {
    calls.push(args);
    return { data: { session: { user: { email: 'VALIDACAO@example.invalid' } } } };
  } }, 'https://example.invalid/m31-reset-password#token_hash=VALIDACAO_HASH&type=recovery', address => {
    assert.equal(address, '/m31-reset-password');
    calls.push('cleared');
  });
  assert.deepEqual(calls, ['cleared', { token_hash: 'VALIDACAO_HASH', type: 'recovery' }]);
  assert.equal(email, 'VALIDACAO@example.invalid');
});

test('expired and non-recovery links never fall back to a different existing session', async () => {
  let verifications = 0;
  const auth = { getSession: async () => { throw new Error('Must not reuse an unrelated session'); }, verifyOtp: async () => { verifications++; return { data: {}, error: new Error('expired') }; } };
  await assert.rejects(resolvePasswordRecovery(auth, 'https://example.invalid/reset?token_hash=VALIDACAO&type=recovery', () => {}), /expirado/);
  await assert.rejects(resolvePasswordRecovery(auth, 'https://example.invalid/reset#token_hash=VALIDACAO&type=signup', () => {}), /inválido/);
  assert.equal(verifications, 1);
});

test('normal PKCE reset and already authenticated password change continue working', async () => {
  let cleared;
  const session = { user: { email: 'VALIDACAO@example.invalid' } };
  assert.equal(await resolvePasswordRecovery({ getSession: async () => ({ data: {} }), exchangeCodeForSession: async code => { assert.equal(code, 'VALIDACAO_CODE'); return { data: { session } }; } }, 'https://example.invalid/reset?code=VALIDACAO_CODE', address => { cleared = address; }), session.user.email);
  assert.equal(cleared, '/reset');
  assert.equal(await resolvePasswordRecovery({ getSession: async () => ({ data: { session } }) }, 'https://example.invalid/reset', () => {}), session.user.email);
  await assert.rejects(resolvePasswordRecovery({ getSession: async () => ({ data: {} }) }, 'https://example.invalid/reset', () => {}), /link de definição/);
});
