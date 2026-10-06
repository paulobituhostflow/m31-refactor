import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { UnitOfWork, matches } from "../worker/runtime/entities.ts";
import { sealTokens, openTokens } from "../worker/runtime/vault.ts";
import {
  entityPermission,
  functionPermission,
  publicView,
  scopedFilter,
} from "../worker/runtime/permissions.ts";
import { nextRun } from "../worker/runtime/jobs.ts";
const secret = "VALIDACAO_LOCAL_ENCRYPTION_KEY_000000000000";
let db;
async function start() {
  if (db) return db;
  db = new PGlite();
  await db.exec(
    "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE SQL AS $$ SELECT NULL::uuid $$; CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint); CREATE PUBLICATION supabase_realtime;",
  );
  for (const name of [
    "20261005000100_m31.sql",
    "20261005000200_jobs.sql",
    "20261005000300_locks.sql",
    "20261005000400_files_realtime.sql",
    "20261005000500_webhooks_recovery.sql",
    "20261005000600_scopes_relations.sql",
    "20261005000700_realtime_delete_scope.sql",
    "20261006000100_legacy_duplicate_keys.sql",
  ]) {
    const sql = (
      await readFile(
        new URL("../supabase/migrations/" + name, import.meta.url),
        "utf8",
      )
    ).replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", "");
    await db.exec(sql);
  }
  return db;
}
async function commit(changes) {
  const pg = await start();
  return pg.query("SELECT public.m31_commit($1::jsonb,true)", [
    JSON.stringify(changes),
  ]);
}
const registration = (id, patch = {}) => ({
  entity: "EventoM31Inscricao",
  id,
  expected: null,
  data: {
    id,
    nome: "VALIDACAO",
    status_pagamento: "aprovado",
    payment_id: "VALIDACAO_PAY",
    codigo_inscricao: id,
    ...patch,
  },
});
test("all SQL migrations apply to PostgreSQL and domain schemas retain unknown historical fields", async () => {
  const pg = await start();
  assert.equal(
    (await pg.query("SELECT count(*)::int AS n FROM m31_entity_catalog"))
      .rows[0].n,
    69,
  );
  await commit([
    registration("sql-preserve", { campo_historico: { valor: 42 } }),
  ]);
  const row = (
    await pg.query(
      "SELECT payload FROM m31_evento_m31_inscricao WHERE id='sql-preserve'",
    )
  ).rows[0].payload;
  assert.deepEqual(row.campo_historico, { valor: 42 });
});
test("compare-and-swap rejects a concurrent change and rolls back the complete batch", async () => {
  const pg = await start();
  await commit([registration("sql-concurrent"), registration("sql-other")]);
  await commit([
    {
      entity: "EventoM31Inscricao",
      id: "sql-concurrent",
      expected: 1,
      data: { ...registration("sql-concurrent").data, nome: "FIRST" },
    },
  ]);
  await assert.rejects(
    commit([
      {
        entity: "EventoM31Inscricao",
        id: "sql-other",
        expected: 1,
        data: { ...registration("sql-other").data, nome: "SHOULD_ROLL_BACK" },
      },
      {
        entity: "EventoM31Inscricao",
        id: "sql-concurrent",
        expected: 1,
        data: { ...registration("sql-concurrent").data, nome: "SECOND" },
      },
    ]),
    (error) => error.code === "40001",
  );
  assert.equal(
    (
      await pg.query(
        "SELECT payload->>'nome' AS nome FROM m31_evento_m31_inscricao WHERE id='sql-other'",
      )
    ).rows[0].nome,
    "VALIDACAO",
  );
});
test("critical locks serialize concurrent checkout operations", async () => {
  const pg = await start();
  assert.equal(
    (
      await pg.query(
        "SELECT m31_acquire_lock('VALIDACAO_CHECKOUT','first') AS acquired",
      )
    ).rows[0].acquired,
    true,
  );
  assert.equal(
    (
      await pg.query(
        "SELECT m31_acquire_lock('VALIDACAO_CHECKOUT','second') AS acquired",
      )
    ).rows[0].acquired,
    false,
  );
});
test("duplicate webhook event IDs are rejected by a real unique constraint", async () => {
  const change = (id) => ({
    entity: "M31AsaasWebhookEvento",
    id,
    expected: null,
    data: { id, event_id: "VALIDACAO_EVENT" },
  });
  await commit([change("event-one")]);
  await assert.rejects(
    commit([change("event-two")]),
    (error) => error.code === "23505",
  );
});
test("transfer consumes the token and preserves payment and QR in one transaction", async () => {
  const pg = await start();
  await commit([
    registration("sql-transfer"),
    {
      entity: "M31TransferenciaInscricao",
      id: "transfer-one",
      expected: null,
      data: {
        id: "transfer-one",
        status: "pendente",
        inscricao_id: "sql-transfer",
      },
    },
  ]);
  await commit([
    {
      entity: "EventoM31Inscricao",
      id: "sql-transfer",
      expected: 1,
      data: { ...registration("sql-transfer").data, nome: "NOVO TITULAR" },
    },
    {
      entity: "M31TransferenciaInscricao",
      id: "transfer-one",
      expected: 1,
      data: {
        id: "transfer-one",
        status: "concluida",
        inscricao_id: "sql-transfer",
      },
    },
  ]);
  const row = (
    await pg.query(
      "SELECT payload FROM m31_evento_m31_inscricao WHERE id='sql-transfer'",
    )
  ).rows[0].payload;
  assert.equal(row.payment_id, "VALIDACAO_PAY");
  assert.equal(row.codigo_inscricao, "sql-transfer");
  assert.equal(row.nome, "NOVO TITULAR");
});
test("tokens are hashed at rest, encrypted for controlled reconstruction and never appear in public entity views", async () => {
  const original = {
    id: "token-fixture",
    token: "VALIDACAO_BEARER_TOKEN",
    pedido_token: "VALIDACAO_ORDER_TOKEN",
  };
  const sealed = await sealTokens(original, secret);
  assert.match(sealed.token, /^sha256:/);
  assert.ok(!JSON.stringify(sealed).includes(original.token));
  assert.deepEqual(await openTokens(sealed, secret), original);
  assert.equal(
    publicView("M31TransferenciaInscricao", sealed, null).token,
    undefined,
  );
  assert.equal(
    publicView("M31TransferenciaInscricao", sealed, null)._sealed_tokens,
    undefined,
  );
  await assert.rejects(
    openTokens(sealed, "WRONG_KEY_000000000000000000000000000"),
  );
});
test("author endpoint requires authentication and generic reads never expose letters, even to admins", () => {
  assert.throws(
    () => functionPermission("m31Cartinhas", null, {}),
    (error) => error.status === 401,
  );
  assert.equal(
    publicView(
      "EventoM31Inscricao",
      { id: "i", cartinha_texto: "PRIVATE", cartinha_historico: ["PRIVATE"] },
      { role: "admin" },
    ).cartinha_texto,
    undefined,
  );
  assert.throws(
    () => entityPermission("EventoM31Inscricao", "list", null),
    (error) => error.status === 401,
  );
});
test("read-only members cannot write and sector leaders are scoped to their configured sector", () => {
  const user = {
    id: "u",
    email: "VALIDACAO@example.invalid",
    role: "user",
    membro: { ativo: true, perfil: "visualizacao" },
  };
  assert.throws(
    () => entityPermission("EventoM31Tarefa", "update", user),
    (error) => error.status === 403,
  );
  const leader = {
    ...user,
    membro: { ativo: true, perfil: "lider_setor", setor: "A" },
  };
  const filter = scopedFilter("EventoM31Tarefa", {}, leader);
  assert.equal(matches({ setor: "A" }, filter), true);
  assert.equal(matches({ setor: "B" }, filter), false);
});
test("filters preserve null, exists, in and nested OR semantics", () => {
  assert.equal(
    matches(
      { id: "a", n: 2 },
      { n: { $gte: 2 }, $or: [{ id: "a" }, { id: "b" }] },
    ),
    true,
  );
  assert.equal(matches({ n: 3 }, { n: { $in: [1, 2] } }), false);
  assert.equal(matches({ n: 0 }, { absent: { $exists: false } }), true);
});
test("timezone and exported intervals override misleading workflow titles", () => {
  assert.equal(
    nextRun(
      {
        trigger_type: "scheduled",
        schedule_mode: "recurring",
        cron_expression: "0 9 * * *",
        timezone: "America/Recife",
      },
      new Date("2026-10-05T10:00:00Z"),
    ).toISOString(),
    "2026-10-05T12:00:00.000Z",
  );
  assert.equal(
    nextRun(
      {
        trigger_type: "scheduled",
        schedule_mode: "interval",
        interval_value: 60,
        interval_unit: "minutes",
        interval_anchor: "2026-10-05T10:05:00",
      },
      new Date("2026-10-05T10:10:00Z"),
    ).toISOString(),
    "2026-10-05T11:05:00.000Z",
  );
});

test("webhook receipt and outbox commit atomically and duplicate delivery enqueues only one job", async () => {
  const pg = await start();
  const payload = {
    id: "atomic-event",
    event_id: "VALIDACAO_ATOMIC_EVENT",
    status: "recebido",
  };
  assert.equal(
    (
      await pg.query("SELECT m31_receive_asaas_event($1::jsonb) AS duplicate", [
        JSON.stringify(payload),
      ])
    ).rows[0].duplicate,
    false,
  );
  assert.equal(
    (
      await pg.query("SELECT m31_receive_asaas_event($1::jsonb) AS duplicate", [
        JSON.stringify({ ...payload, id: "other-event" }),
      ])
    ).rows[0].duplicate,
    true,
  );
  assert.equal(
    (
      await pg.query(
        "SELECT count(*)::int AS n FROM m31_outbox WHERE dedup_key='asaas:VALIDACAO_ATOMIC_EVENT'",
      )
    ).rows[0].n,
    1,
  );
});
test("crashed processing jobs are reclaimed after lease expiration", async () => {
  const pg = await start();
  await pg.query(
    "INSERT INTO m31_outbox(dedup_key,function_name,status,lease_until) VALUES('VALIDACAO_CRASH','m31HealthCheck','processing',now()-interval '1 minute')",
  );
  const reclaimed = await pg.query("SELECT * FROM m31_claim_jobs(25)");
  assert.ok(reclaimed.rows.some((row) => row.dedup_key === "VALIDACAO_CRASH"));
});

test("runtime relationships reject a dangling timeline and roll back its creation", async () => {
  const pg = await start();
  await assert.rejects(
    pg.query("SELECT m31_commit($1::jsonb,false)", [
      JSON.stringify([
        {
          entity: "M31InscricaoTimeline",
          id: "VALIDACAO_DANGLING",
          expected: null,
          data: { id: "VALIDACAO_DANGLING", inscricao_id: "ABSENT" },
        },
      ]),
    ]),
    (error) => error.code === "23503",
  );
  assert.equal(
    (
      await pg.query(
        "SELECT count(*)::int AS n FROM m31_m31_inscricao_timeline WHERE id='VALIDACAO_DANGLING'",
      )
    ).rows[0].n,
    0,
  );
});

test("PostgreSQL RLS restricts Realtime IDs by sector and immediately applies revocation", async () => {
  const pg = await start();
  const uuid = "00000000-0000-4000-a000-000000000007";
  await pg.exec(
    "CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE SQL AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
  );
  await pg.query("INSERT INTO auth.users(id) VALUES($1)", [uuid]);
  await commit([
    {
      entity: "EventoM31Membro",
      id: "RLS_MEMBER",
      expected: null,
      data: {
        id: "RLS_MEMBER",
        user_email: "VALIDACAO_RLS@example.invalid",
        ativo: true,
        perfil: "lider_setor",
        setor: "A",
      },
    },
    {
      entity: "EventoM31Tarefa",
      id: "RLS_A",
      expected: null,
      data: { id: "RLS_A", area: "A" },
    },
    {
      entity: "EventoM31Tarefa",
      id: "RLS_B",
      expected: null,
      data: { id: "RLS_B", area: "B" },
    },
  ]);
  await pg.query(
    "INSERT INTO m31_identities(auth_id,legacy_user_id,email,member_id,active) VALUES($1,$2,$3,$4,true)",
    [uuid, "RLS_LEGACY", "VALIDACAO_RLS@example.invalid", "RLS_MEMBER"],
  );
  await pg.exec(
    "INSERT INTO m31_changes(entity,record_id,operation) VALUES('EventoM31Tarefa','RLS_A','update'),('EventoM31Tarefa','RLS_B','update');",
  );
  await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [uuid]);
  try {
    await pg.exec("SET ROLE authenticated");
    assert.deepEqual(
      (
        await pg.query(
          "SELECT record_id FROM m31_changes WHERE entity='EventoM31Tarefa'",
        )
      ).rows.map((row) => row.record_id),
      ["RLS_A"],
    );
    await pg.exec("RESET ROLE");
    await pg.query("SELECT m31_commit($1::jsonb,false)", [
      JSON.stringify([
        { entity: "EventoM31Tarefa", id: "RLS_A", expected: 1, data: null },
      ]),
    ]);
    await pg.exec("SET ROLE authenticated");
    assert.deepEqual(
      (
        await pg.query(
          "SELECT record_id,operation FROM m31_changes WHERE entity='EventoM31Tarefa'",
        )
      ).rows,
      [{ record_id: "RLS_A", operation: "delete" }],
    );
    await pg.exec("RESET ROLE");
    await pg.exec(
      "UPDATE m31_identities SET active=false WHERE legacy_user_id='RLS_LEGACY'",
    );
    await pg.exec("SET ROLE authenticated");
    assert.equal(
      (await pg.query("SELECT count(*)::int AS n FROM m31_changes")).rows[0].n,
      0,
    );
  } finally {
    await pg.exec("RESET ROLE");
  }
});
