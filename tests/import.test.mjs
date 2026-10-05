import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importSnapshot } from "../tools/migration/import-service.ts";
import { openTokens } from "../worker/runtime/vault.ts";
const key = "VALIDACAO_IMPORT_ENCRYPTION_KEY_0000000000";
async function database() {
  const pg = new PGlite();
  await pg.exec(
    "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE SQL AS $$ SELECT NULL::uuid $$;CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint);CREATE PUBLICATION supabase_realtime;",
  );
  for (const path of [
    "20261005000100_m31.sql",
    "20261005000200_jobs.sql",
    "20261005000300_locks.sql",
    "20261005000400_files_realtime.sql",
    "20261005000500_webhooks_recovery.sql",
    "20261005000600_scopes_relations.sql",
      "20261005000700_realtime_delete_scope.sql",
  ])
    await pg.exec(
      (await readFile("supabase/migrations/" + path, "utf8")).replace(
        "CREATE EXTENSION IF NOT EXISTS pgcrypto;",
        "",
      ),
    );
  const adapter = {
    from(table) {
      return {
        select() {
          return {
            eq: async () => ({ data: [], error: null }),
            in: async (_field, ids) => ({
              data: (
                await pg.query(
                  `SELECT id,payload,revision FROM ${table} WHERE id=ANY($1::text[])`,
                  [ids],
                )
              ).rows,
              error: null,
            }),
          };
        },
      };
    },
    rpc: async (name, args) => {
      assert.equal(name, "m31_commit");
      assert.equal(args.suppress_events, true);
      await pg.query("SELECT m31_commit($1::jsonb,true)", [
        JSON.stringify(args.changes),
      ]);
      return { error: null };
    },
  };
  return { pg, adapter };
}
const rows = Array.from({ length: 207 }, (_, i) => ({
  id: `VALIDACAO_IMPORT_${i}`,
  payment_id: `VALIDACAO_PAY_${i}`,
  codigo_inscricao: `VALIDACAO_QR_${i}`,
  token: `VALIDACAO_TOKEN_${i}`,
  created_date: "2026-10-01T00:00:00Z",
  campo_extra: { unknown: i },
}));
test("importação interrompida retoma, reexecução não duplica e não cria jobs ou eventos", async () => {
  const { pg, adapter } = await database();
  const folder = await mkdtemp(join(tmpdir(), "m31-import-"));
  const snapshot = {
    manifest: { files: [] },
    entities: { EventoM31Inscricao: rows },
  };
  const options = {
    secret: key,
    tokenKey: key,
    origin: "http://127.0.0.1:5173",
  };
  try {
    await assert.rejects(
      importSnapshot(adapter, folder, snapshot, {
        ...options,
        stopAfterBatches: 1,
      }),
      /interruption/,
    );
    const resumed = await importSnapshot(adapter, folder, snapshot, options);
    assert.equal(resumed.imported, 107);
    assert.equal(resumed.unchanged, 100);
    const again = await importSnapshot(adapter, folder, snapshot, options);
    assert.equal(again.imported, 0);
    assert.equal(again.unchanged, 207);
    const imported = (
      await pg.query("SELECT payload FROM m31_evento_m31_inscricao ORDER BY id")
    ).rows;
    assert.equal(imported.length, 207);
    for (const item of imported) {
      const restored = await openTokens(item.payload, key);
      delete restored._migration_source_hash;
      assert.deepEqual(
        restored,
        rows.find((row) => row.id === restored.id),
      );
    }
    assert.equal(
      (await pg.query("SELECT count(*)::int AS n FROM m31_outbox")).rows[0].n,
      0,
    );
    assert.equal(
      (await pg.query("SELECT count(*)::int AS n FROM m31_changes")).rows[0].n,
      0,
    );
    const changed = structuredClone(snapshot);
    changed.entities.EventoM31Inscricao[0].nome = "UPDATED SOURCE";
    assert.equal(
      (await importSnapshot(adapter, folder, changed, options)).imported,
      1,
    );
    await pg.query(
      "UPDATE m31_evento_m31_inscricao SET payload=payload||'{\"nome\":\"LOCAL CHANGE\"}'::jsonb WHERE id='VALIDACAO_IMPORT_0'",
    );
    changed.entities.EventoM31Inscricao[0].nome = "NEW SOURCE";
    await assert.rejects(
      importSnapshot(adapter, folder, changed, options),
      /reconciliação/,
    );
  } finally {
    await pg.close();
    await rm(folder, { recursive: true, force: true });
  }
});
