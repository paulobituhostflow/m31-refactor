import test from "node:test";
import assert from "node:assert/strict";
import { postgresApi } from "./support/postgres-api.mjs";
import { app } from "../worker/index.ts";
const fixture = await postgresApi(),
  originalFetch = globalThis.fetch;
globalThis.fetch = fixture.transport;
const env = {
  APP_ENV: "local",
  APP_ORIGIN: "http://127.0.0.1:5173",
  PROVIDER_MODE: "mock",
  EXTERNAL_SIDE_EFFECTS: "false",
  AUTOMATIONS_ENABLED: "false",
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: "VALIDACAO_SERVICE_ONLY",
  SUPABASE_PUBLISHABLE_KEY: "VALIDACAO_PUBLIC",
  TOKEN_ENCRYPTION_KEY: "VALIDACAO_API_ENCRYPTION_KEY_000000000",
  ASAAS_WEBHOOK_TOKEN: "VALIDACAO_WEBHOOK",
  ASSETS: {
    fetch: () =>
      new Response("<html>SPA</html>", {
        headers: { "Content-Type": "text/html" },
      }),
  },
};
async function commit(entity, id, data) {
  await fixture.pg.query("SELECT m31_commit($1::jsonb,true)", [
    JSON.stringify([{ entity, id, expected: null, data: { id, ...data } }]),
  ]);
}
for (const [index, profile] of [
  "super_admin",
  "gestao_operacional",
  "visualizacao",
  "lider_setor",
  "cartinhas",
].entries()) {
  const id = `00000000-0000-4000-a000-00000000000${index}`,
    email = `VALIDACAO.${profile}@example.invalid`;
  fixture.users.set(profile, {
    id,
    email,
    user_metadata: { full_name: "VALIDACAO" },
  });
  await fixture.pg.query("INSERT INTO auth.users(id) VALUES($1)", [id]);
  await fixture.pg.query(
    "INSERT INTO m31_identities(auth_id,legacy_user_id,email,member_id,active) VALUES($1,$2,$3,$4,true)",
    [id, "LEGACY_" + profile, email, "MEMBER_" + profile],
  );
  await commit("EventoM31Membro", "MEMBER_" + profile, {
    user_email: email,
    perfil: profile,
    ativo: true,
    operacoes_permitidas: profile === "visualizacao" ? ["inscritas"] : [],
    setor: profile === "lider_setor" ? "A" : null,
  });
}
await commit("EventoM31Config", "CONFIG", {
  cartinha_autora_user_id: "LEGACY_cartinhas",
  cartinha_lote_liberado: true,
});
await commit("EventoM31Inscricao", "PAID", {
  nome: "VALIDACAO Participante",
  status_pagamento: "aprovado",
  tipo: "publico_geral",
  payment_id: "VALIDACAO_PAY",
  codigo_inscricao: "VALIDACAO_QR",
  cartinha_texto: "VALIDACAO PRIVATE",
  cartinha_versao: 1,
  cartinha_status: "pronta",
});
await commit("EventoM31Tarefa", "TASK_A", { titulo: "VALIDACAO A", area: "A" });
await commit("EventoM31Tarefa", "TASK_B", { titulo: "VALIDACAO B", area: "B" });
async function call(path, body = {}, user, extra = {}) {
  const response = await app.request(
    "/api" + path,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(user ? { Authorization: "Bearer " + user } : {}),
        ...extra,
      },
      body: JSON.stringify(body),
    },
    env,
  );
  return { response, data: await response.json() };
}
test.after(async () => {
  globalThis.fetch = originalFetch;
  await fixture.pg.close();
});
test("HTTP API denies anonymous entity reads and returns JSON for unknown endpoints", async () => {
  assert.equal(
    (await call("/entities/EventoM31Inscricao", { action: "list" })).response
      .status,
    401,
  );
  const unknown = await call("/unknown");
  assert.equal(unknown.response.status, 404);
  assert.match(
    unknown.response.headers.get("Content-Type"),
    /application\/json/,
  );
});
test("HTTP API protects financial and pastoral fields and scopes sector leaders", async () => {
  const admin = await call(
    "/entities/EventoM31Inscricao",
    { action: "get", id: "PAID" },
    "super_admin",
  );
  assert.equal(admin.data.payment_id, "VALIDACAO_PAY");
  assert.equal(admin.data.cartinha_texto, undefined);
  const ops = await call(
    "/entities/EventoM31Inscricao",
    { action: "get", id: "PAID" },
    "gestao_operacional",
  );
  assert.equal(ops.data.payment_id, undefined);
  const tasks = await call(
    "/entities/EventoM31Tarefa",
    { action: "list" },
    "lider_setor",
  );
  assert.deepEqual(
    tasks.data.map((row) => row.id),
    ["TASK_A"],
  );
  assert.equal(
    (
      await call(
        "/entities/EventoM31Tarefa",
        { action: "update", id: "TASK_B", data: { status: "concluido" } },
        "lider_setor",
      )
    ).response.status,
    403,
  );
  assert.equal(
    (
      await call(
        "/entities/EventoM31Tarefa",
        { action: "update", id: "TASK_A", data: { status: "concluido" } },
        "visualizacao",
      )
    ).response.status,
    403,
  );
});
test("cookie-only POST keeps the request body readable and enforces management permissions", async () => {
  const read = await call('/entities/EventoM31Inscricao', { action: 'get', id: 'PAID' }, undefined, { Cookie: 'm31_session=gestao_operacional' });
  assert.equal(read.response.status, 200); assert.equal(read.data.id, 'PAID');
  const financial = await call('/entities/M31TransacaoFinanceira', { action: 'list' }, undefined, { Cookie: 'm31_session=gestao_operacional' });
  assert.equal(financial.response.status, 403);
});
test("Read-only operators can open a session without widening scope or allowing participant mutations", async () => {
  const opened = await call(
    "/functions/m31AbrirSessaoOperacional",
    { nome: "Paulo", whatsapp: "5581999990000" },
    "visualizacao",
  );
  assert.equal(opened.response.status, 200);
  assert.ok(opened.data.session_id);
  assert.deepEqual(opened.data.operacoes_permitidas, ["inscritas"]);
  assert.equal(
    (await call("/functions/m31OperarParticipante", {
      session_id: opened.data.session_id,
      action: "update",
      inscricao_id: "PAID",
      data: { nome: "Changed" },
    }, "visualizacao")).response.status,
    403,
  );
});
test('management defaults preserve imported empty scopes, shared names only restrict, and explicit scopes remain authoritative', async () => {
  const fixtureUser = fixture.users.get('gestao_operacional'), originalEmail = fixtureUser.email;
  const sharedEmail = 'paulobituadv+gestaom31@gmail.com';
  fixtureUser.email = sharedEmail;
  await fixture.pg.query("UPDATE m31_identities SET email=$1 WHERE legacy_user_id='LEGACY_gestao_operacional'", [sharedEmail]);
  await fixture.pg.query("UPDATE m31_evento_m31_membro SET payload=jsonb_set(payload,'{user_email}',to_jsonb($1::text)) WHERE id='MEMBER_gestao_operacional'", [sharedEmail]);
  try {
    const open = nome => call('/functions/m31AbrirSessaoOperacional', { nome, whatsapp: '81999990000' }, 'gestao_operacional');
    const paulo = await open('Paulo'); assert.equal(paulo.response.status, 200);
    assert.deepEqual(paulo.data.operacoes_permitidas, ['inscritas','voluntarias','caravanas','camisas']);
    const dulce = await open('Dulce'); assert.equal(dulce.response.status, 200); assert.deepEqual(dulce.data.operacoes_permitidas, ['camisas']);
    assert.equal((await open('VALIDACAO Desconhecida')).response.status, 403);
    await fixture.pg.exec(`UPDATE m31_evento_m31_membro SET payload=jsonb_set(payload,'{operacoes_permitidas}','["camisas"]') WHERE id='MEMBER_gestao_operacional'`);
    assert.deepEqual((await open('Paulo')).data.operacoes_permitidas, ['camisas']);
    assert.equal((await open('Thaysa Videres')).response.status, 403);
    await fixture.pg.exec(`UPDATE m31_evento_m31_membro SET payload=jsonb_set(payload,'{operacoes_permitidas}','["UNKNOWN"]') WHERE id='MEMBER_gestao_operacional'`);
    assert.equal((await open('Paulo')).response.status, 403);
  } finally {
    fixtureUser.email = originalEmail;
    await fixture.pg.query("UPDATE m31_identities SET email=$1 WHERE legacy_user_id='LEGACY_gestao_operacional'", [originalEmail]);
    await fixture.pg.query("UPDATE m31_evento_m31_membro SET payload=jsonb_set(jsonb_set(payload,'{user_email}',to_jsonb($1::text)),'{operacoes_permitidas}','[]') WHERE id='MEMBER_gestao_operacional'", [originalEmail]);
  }
});
test("HTTP API revocation takes effect before executing a business function", async () => {
  await fixture.pg.query(
    "UPDATE m31_identities SET active=false WHERE legacy_user_id='LEGACY_visualizacao'",
  );
  assert.equal(
    (await call("/functions/m31HealthCheck", {}, "visualizacao")).response
      .status,
    403,
  );
});
test("HTTP API invokes the migrated registration handler and commits through PostgreSQL", async () => {
  const body = {
    nome: "VALIDACAO Nova",
    whatsapp: "5581999990010",
    cpf: "12345678909",
  };
  const first = await call("/functions/m31RegistrarIntencao", body, undefined, {
    "Idempotency-Key": "VALIDACAO_CREATE",
  });
  assert.equal(first.response.status, 200);
  const repeated = await call(
    "/functions/m31RegistrarIntencao",
    body,
    undefined,
    {
      "Idempotency-Key": "VALIDACAO_CREATE",
      Cookie: first.response.headers.get("set-cookie").split(";")[0],
    },
  );
  assert.deepEqual(repeated.data, first.data);
  assert.equal(
    (
      await fixture.pg.query(
        "SELECT count(*)::int AS n FROM m31_evento_m31_inscricao WHERE payload->>'whatsapp'='5581999990010'",
      )
    ).rows[0].n,
    1,
  );
});
test("HTTP author authorization uses legacy identity association and hides letters from another profile", async () => {
  const author = await call(
    "/functions/m31Cartinhas",
    { action: "acesso" },
    "cartinhas",
  );
  assert.equal(author.response.status, 200);
  assert.equal(author.data.user.id, "LEGACY_cartinhas");
  const denied = await call(
    "/functions/m31Cartinhas",
    { action: "listar" },
    "super_admin",
  );
  assert.equal(denied.response.status, 403);
});
test("HTTP webhook checks credentials and repeated delivery persists one receipt and one job", async () => {
  const payload = {
    id: "VALIDACAO_HTTP_EVENT",
    event: "PAYMENT_RECEIVED",
    payment: { id: "VALIDACAO_PAY" },
  };
  assert.equal((await call("/webhooks/asaas", payload)).response.status, 401);
  const headers = { "asaas-access-token": "VALIDACAO_WEBHOOK" };
  assert.equal(
    (await call("/webhooks/asaas", payload, undefined, headers)).response
      .status,
    200,
  );
  assert.equal(
    (await call("/webhooks/asaas", payload, undefined, headers)).data.duplicate,
    true,
  );
  assert.equal(
    (
      await fixture.pg.query(
        "SELECT count(*)::int AS n FROM m31_outbox WHERE dedup_key='asaas:VALIDACAO_HTTP_EVENT'",
      )
    ).rows[0].n,
    1,
  );
});

test("HTTP check-in repeats safely while retaining payment and QR evidence", async () => {
  const first = await call(
    "/functions/m31Checkin",
    { codigo_inscricao: "VALIDACAO_QR" },
    "super_admin",
  );
  assert.equal(first.response.status, 200);
  const second = await call(
    "/functions/m31Checkin",
    { codigo_inscricao: "VALIDACAO_QR" },
    "super_admin",
  );
  assert.equal(second.data.aviso, true);
  const row = (
    await fixture.pg.query(
      "SELECT payload,revision FROM m31_evento_m31_inscricao WHERE id='PAID'",
    )
  ).rows[0];
  assert.equal(row.payload.payment_id, "VALIDACAO_PAY");
  assert.equal(row.payload.codigo_inscricao, "VALIDACAO_QR");
  assert.equal(row.revision, 2);
});
test("HTTP pagination over 1000 equal timestamps has no missing or repeated IDs", async () => {
  const rows = Array.from({ length: 1006 }, (_, i) => ({
    entity: "EventoM31Inscricao",
    id: "PAGE_" + String(i).padStart(5, "0"),
    expected: null,
    data: {
      id: "PAGE_" + String(i).padStart(5, "0"),
      created_date: "2026-10-01T00:00:00Z",
      nome: "VALIDACAO PAGINATION",
    },
  }));
  await fixture.pg.query("SELECT m31_commit($1::jsonb,true)", [
    JSON.stringify(rows),
  ]);
  const a = await call(
    "/entities/EventoM31Inscricao",
    {
      action: "filter",
      filter: { nome: "VALIDACAO PAGINATION" },
      sort: "created_date,id",
      limit: 600,
      offset: 0,
    },
    "super_admin",
  );
  const b = await call(
    "/entities/EventoM31Inscricao",
    {
      action: "filter",
      filter: { nome: "VALIDACAO PAGINATION" },
      sort: "created_date,id",
      limit: 600,
      offset: 600,
    },
    "super_admin",
  );
  const ids = [...a.data, ...b.data].map((row) => row.id);
  assert.equal(ids.length, 1006);
  assert.equal(new Set(ids).size, 1006);
  assert.deepEqual(
    ids,
    rows.map((row) => row.id),
  );
});

test("HTTP private uploads authorize the owner and deny a different sector before serving bytes", async () => {
  const form = new FormData();
  form.set(
    "file",
    new Blob(["VALIDACAO_PRIVATE_BYTES"], { type: "text/plain" }),
    "VALIDACAO.txt",
  );
  form.set("purpose", "tasks");
  const upload = await app.request(
    "/api/files/upload",
    {
      method: "POST",
      headers: { Authorization: "Bearer super_admin" },
      body: form,
    },
    env,
  );
  assert.equal(upload.status, 200);
  const file = await upload.json();
  const attached = await call(
    "/entities/EventoM31Tarefa",
    {
      action: "update",
      id: "TASK_B",
      data: { anexos: [{ url: file.file_url }] },
    },
    "super_admin",
  );
  assert.equal(attached.response.status, 200);
  const owner = await app.request(
    "/api/files/" + file.id,
    { headers: { Authorization: "Bearer super_admin" } },
    env,
  );
  assert.equal(owner.status, 200);
  assert.match(owner.headers.get("Cache-Control"), /private/);
  const outsider = await app.request(
    "/api/files/" + file.id,
    { headers: { Authorization: "Bearer lider_setor" } },
    env,
  );
  assert.equal(outsider.status, 403);
});

test("HTTP initializes all 33 workflows paused including custom-named DSL steps", async () => {
  const response = await call("/admin/workflows/initialize", {}, "super_admin");
  assert.equal(response.response.status, 200);
  const rows = (
    await fixture.pg.query("SELECT enabled,definition FROM m31_workflows")
  ).rows;
  assert.equal(rows.length, 33);
  assert.ok(
    rows.every(
      (row) => row.enabled === false && row.definition.job.function_name,
    ),
  );
});
