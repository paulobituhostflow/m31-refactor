import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

test('password migration SQL preserves eligibility, writes once, and restricts execution to service role', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE SCHEMA extensions;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,encrypted_password text,raw_app_meta_data jsonb,email_confirmed_at timestamptz,updated_at timestamptz,banned_until timestamptz,last_sign_in_at timestamptz);
      CREATE TABLE public.m31_identities(auth_id uuid PRIMARY KEY,legacy_user_id text,email text,member_id text,active boolean);
      CREATE TABLE public.m31_evento_m31_membro(id text PRIMARY KEY,payload jsonb);
      -- Guard tests only. Actual pgcrypto hashing and sign-in are checked on staging.
      CREATE FUNCTION extensions.digest(text,text) RETURNS bytea LANGUAGE SQL AS $$ SELECT convert_to($1,'UTF8') $$;
      CREATE FUNCTION extensions.gen_salt(text,integer) RETURNS text LANGUAGE SQL AS $$ SELECT 'VALIDACAO_SALT'::text $$;
      CREATE FUNCTION extensions.crypt(text,text) RETURNS text LANGUAGE SQL AS $$ SELECT 'VALIDACAO_HASH:'||$1 $$;`);
    const id = '00000000-0000-4000-a000-000000000099', app = '69d51b279da069f623e291a6', email = 'validacao@example.invalid';
    await db.query("INSERT INTO auth.users VALUES($1,$2,'AUTO_GENERATED',$3,now(),now(),NULL,NULL)", [id, email, JSON.stringify({ m31_source: 'base44', m31_legacy_user_id: 'VALIDACAO', m31_migration: '20261006' })]);
    await db.query('INSERT INTO m31_identities VALUES($1,$2,$3,$2,true)', [id, 'VALIDACAO', email]);
    await db.query('INSERT INTO m31_evento_m31_membro VALUES($1,$2)', ['VALIDACAO', JSON.stringify({ ativo: true, user_email: email, perfil: 'gestao_operacional' })]);
    await db.exec(await readFile(new URL('../supabase/migrations/20261006000200_legacy_password_transition.sql', import.meta.url), 'utf8'));
    const candidate = async (source = app) => (await db.query('SELECT * FROM public.m31_legacy_password_candidate($1,$2)', [email, source])).rows;
    const commit = async (patch = {}) => (await db.query('SELECT public.m31_commit_legacy_password($1,$2,$3,$4,$5) AS saved', [patch.id || id, patch.legacy || 'VALIDACAO', patch.email || email, patch.app || app, patch.password || 'VALIDACAO_ONLY'])).rows[0].saved;
    assert.equal((await candidate()).length, 1);
    assert.equal((await candidate('other')).length, 0);
    for (const patch of [{ legacy: 'other' }, { email: 'other@example.invalid' }, { app: 'other' }, { password: 'x'.repeat(73) }]) assert.equal(await commit(patch), false);
    for (const [disable, restore] of [
      ['UPDATE m31_identities SET active=false', 'UPDATE m31_identities SET active=true'],
      [`UPDATE m31_evento_m31_membro SET payload=jsonb_set(payload,'{ativo}','false')`, `UPDATE m31_evento_m31_membro SET payload=jsonb_set(payload,'{ativo}','true')`],
      ['UPDATE auth.users SET last_sign_in_at=now()', 'UPDATE auth.users SET last_sign_in_at=NULL'],
      ['UPDATE auth.users SET email_confirmed_at=NULL', 'UPDATE auth.users SET email_confirmed_at=now()'],
      ["UPDATE auth.users SET banned_until=now()+interval '1 day'", 'UPDATE auth.users SET banned_until=NULL'],
      ["UPDATE auth.users SET encrypted_password='ALREADY_SET'", "UPDATE auth.users SET encrypted_password='AUTO_GENERATED'"],
      ["UPDATE auth.users SET raw_app_meta_data='{}'::jsonb", `UPDATE auth.users SET raw_app_meta_data='{"m31_source":"base44","m31_legacy_user_id":"VALIDACAO","m31_migration":"20261006"}'::jsonb`],
    ]) {
      await db.exec(disable); assert.equal((await candidate()).length, 0); assert.equal(await commit(), false); await db.exec(restore);
    }
    assert.equal(await commit(), true); assert.equal(await commit({ password: 'ANOTHER_PASSWORD' }), false); assert.equal((await candidate()).length, 0);
    const saved = (await db.query('SELECT encrypted_password,raw_app_meta_data FROM auth.users')).rows[0];
    assert.equal(saved.encrypted_password, 'VALIDACAO_HASH:VALIDACAO_ONLY');
    assert.ok(saved.raw_app_meta_data.m31_password_migrated_at); assert.equal(saved.raw_app_meta_data.role, undefined);
    assert.equal((await db.query("SELECT payload->>'perfil' AS perfil FROM m31_evento_m31_membro")).rows[0].perfil, 'gestao_operacional');
    for (const name of ['m31_legacy_password_candidate(text,text)', 'm31_commit_legacy_password(uuid,text,text,text,text)']) {
      for (const role of ['anon', 'authenticated', 'service_role']) assert.equal((await db.query('SELECT has_function_privilege($1,$2,$3) AS allowed', [role, 'public.' + name, 'EXECUTE'])).rows[0].allowed, role === 'service_role');
    }
  } finally { await db.close(); }
});
