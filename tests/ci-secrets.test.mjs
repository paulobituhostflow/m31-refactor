import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve("scripts/ci-secrets.mjs");
const required = {
  SUPABASE_URL: "https://VALIDACAO.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "VALIDACAO_PUBLIC",
  SUPABASE_SERVICE_ROLE_KEY: "VALIDACAO_SERVICE_ONLY",
  TOKEN_ENCRYPTION_KEY: "VALIDACAO_CI_ENCRYPTION_KEY_000000000000000",
  APP_ORIGIN: "https://VALIDACAO.example.invalid",
  CLOUDFLARE_ACCOUNT_ID: "VALIDACAO_ACCOUNT",
  CLOUDFLARE_API_TOKEN: "VALIDACAO_DEPLOY_TOKEN",
  DEPLOY_ENV: "staging",
};

async function prepare(extra, check, existing) {
  const dir = await mkdtemp(join(tmpdir(), "m31-ci-secrets-"));
  try {
    if (existing) await writeFile(join(dir, ".ci-secrets.json"), existing);
    const result = spawnSync(process.execPath, [script], {
      cwd: dir,
      env: { ...required, ...extra },
      encoding: "utf8",
    });
    await check(result, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("CI uploads configured providers privately and excludes Auth/admin credentials", async () => {
  const extras = {
    UAZAPI_TOKEN: "VALIDACAO_INSTANCE_SECRET",
    BREVO_API_KEY: "VALIDACAO_EMAIL_SECRET",
    GOOGLE_CLIENT_SECRET: "VALIDACAO_GOOGLE_SECRET",
    WHATSAPP_GROUP_INVITE: "https://example.invalid/VALIDACAO_GROUP",
    SUPABASE_AUTH_SMTP_PASSWORD: "VALIDACAO_AUTH_ONLY",
    EXPORT_ENCRYPTION_KEY: "VALIDACAO_EXPORT_ONLY",
  };
  await prepare(extras, async (result, dir) => {
    assert.equal(result.status, 0);
    const filename = join(dir, ".ci-secrets.json");
    const data = JSON.parse(await readFile(filename, "utf8"));
    assert.equal(data.UAZAPI_TOKEN, extras.UAZAPI_TOKEN);
    assert.equal(data.BREVO_API_KEY, extras.BREVO_API_KEY);
    assert.equal(data.GOOGLE_CLIENT_SECRET, extras.GOOGLE_CLIENT_SECRET);
    assert.equal(data.WHATSAPP_GROUP_INVITE, extras.WHATSAPP_GROUP_INVITE);
    for (const key of ["SUPABASE_AUTH_SMTP_PASSWORD", "EXPORT_ENCRYPTION_KEY", "CLOUDFLARE_API_TOKEN"])
      assert.equal(Object.hasOwn(data, key), false);
    assert.equal((await stat(filename)).mode & 0o777, 0o600);
    for (const value of Object.values(extras))
      assert.equal((result.stdout + result.stderr).includes(value), false);
  });
});

test("CI omits absent optional values instead of overwriting existing Worker secrets", async () => {
  await prepare({ UAZAPI_TOKEN: "", GOOGLE_REFRESH_TOKEN: "   " }, async (result, dir) => {
    assert.equal(result.status, 0);
    const data = JSON.parse(await readFile(join(dir, ".ci-secrets.json"), "utf8"));
    assert.deepEqual(Object.keys(data).sort(), ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "TOKEN_ENCRYPTION_KEY"].sort());
  });
});

test("CI rejects incomplete infrastructure before creating a secrets file", async () => {
  await prepare({ SUPABASE_SERVICE_ROLE_KEY: "" }, async (result, dir) => {
    assert.notEqual(result.status, 0);
    await assert.rejects(stat(join(dir, ".ci-secrets.json")), { code: "ENOENT" });
  });
});

test("CI rejects a privileged key in the public frontend slot", async () => {
  await prepare({ SUPABASE_PUBLISHABLE_KEY: "sb_secret_VALIDACAO" }, async (result, dir) => {
    assert.notEqual(result.status, 0);
    await assert.rejects(stat(join(dir, ".ci-secrets.json")), { code: "ENOENT" });
  });
});

test("CI refuses to overwrite an existing temporary secrets file", async () => {
  await prepare({}, async (result, dir) => {
    assert.notEqual(result.status, 0);
    assert.equal(await readFile(join(dir, ".ci-secrets.json"), "utf8"), "VALIDACAO_EXISTING");
  }, "VALIDACAO_EXISTING");
});
