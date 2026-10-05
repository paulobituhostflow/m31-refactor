import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { tableName } from "../../worker/runtime/entities.ts";
import { sealTokens, openTokens } from "../../worker/runtime/vault.ts";
import { importSnapshot } from "../../tools/migration/import-service.ts";
import { encrypt, digest } from "../../tools/migration/crypto.mjs";
const env = Object.fromEntries(
  (await readFile(".dev.vars", "utf8"))
    .split("\n")
    .filter((x) => x.includes("="))
    .map((x) => {
      const i = x.indexOf("=");
      return [x.slice(0, i), x.slice(i + 1)];
    }),
);
assert.equal(
  new URL(env.SUPABASE_URL).hostname,
  "127.0.0.1",
  "Testes reais limitados ao Supabase local",
);
assert.equal(env.PROVIDER_MODE, "mock");
assert.equal(env.EXTERNAL_SIDE_EFFECTS, "false");
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const credentials = JSON.parse(
  await readFile("reports/private/local-credentials.json", "utf8"),
);
const users = new Map(),
  records = [],
  files = [],
  run = "VALIDACAO_LIVE_" + Date.now();
async function api(path, body, user, extra = {}) {
  const headers = new Headers(extra.headers);
  if (user) headers.set("Authorization", "Bearer " + users.get(user).token);
  if (!(body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const response = await fetch("http://127.0.0.1:8787/api" + path, {
    ...extra,
    headers,
    method: extra.method || "POST",
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { response, status: response.status, data };
}
async function commit(entity, id, data) {
  const { data: prior, error: read } = await db
    .from(tableName(entity))
    .select("revision")
    .eq("id", id)
    .maybeSingle();
  assert.ifError(read);
  const { error } = await db.rpc("m31_commit", {
    changes: [
      {
        entity,
        id,
        expected: prior?.revision ?? null,
        data: await sealTokens(
          { id, created_date: new Date().toISOString(), ...data },
          env.TOKEN_ENCRYPTION_KEY,
        ),
      },
    ],
    suppress_events: true,
  });
  assert.ifError(error);
  records.push({ entity, id });
}
async function payload(entity, id) {
  const { data, error } = await db
    .from(tableName(entity))
    .select("payload")
    .eq("id", id)
    .single();
  assert.ifError(error);
  return openTokens(data.payload, env.TOKEN_ENCRYPTION_KEY);
}
async function until(fn, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Condição não atingida dentro do prazo de validação.");
}
test.before(async () => {
  const health = await api("/health", undefined, null, { method: "GET" });
  assert.equal(health.status, 200);
  assert.equal(health.data.environment, "local");
  assert.equal(health.data.integrations, "mock");
  assert.equal(health.data.automations, false);
  for (const profile of [
    "super_admin",
    "gestao_operacional",
    "lider_setor",
    "checkin",
    "visualizacao",
    "cartinhas",
  ]) {
    const account = credentials.find((c) => c.profile === profile),
      client = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    const { data, error } = await client.auth.signInWithPassword({
      email: account.email,
      password: account.password,
    });
    assert.ifError(error);
    assert.ok(data.session);
    users.set(profile, {
      client,
      token: data.session.access_token,
      id: data.user.id,
    });
  }
});
test.after(async () => {
  for (const file of files) {
    await db.from("m31_file_links").delete().eq("file_id", file.id);
    await db.from("m31_files").delete().eq("id", file.id);
    await db.storage.from(file.bucket).remove([file.path]);
  }
  for (const { entity, id } of [...records].reverse()) {
    const { data } = await db
      .from(tableName(entity))
      .select("revision")
      .eq("id", id)
      .maybeSingle();
    if (data)
      await db.rpc("m31_commit", {
        changes: [{ entity, id, expected: data.revision, delete: true }],
        suppress_events: true,
      });
  }
  for (const { client } of users.values()) {
    await client.removeAllChannels();
    await client.auth.signOut();
  }
});
test("Auth real associa UUID a ID legado e não permite CRUD anônimo ou tabela de negócio direta", async () => {
  const me = await api("/auth/me", undefined, "super_admin", { method: "GET" });
  assert.equal(me.status, 200);
  assert.equal(me.data.id, "VALIDACAO_USER_super_admin");
  assert.equal(me.data.auth_id, users.get("super_admin").id);
  const signup = await users.get("visualizacao").client.auth.signUp({
    email: "VALIDACAO.signup@example.invalid",
    password: randomBytes(24).toString("base64url"),
  });
  assert.ok(signup.error, "Cadastro público deve continuar bloqueado");
  assert.equal(
    (await api("/entities/EventoM31Inscricao", { action: "list" })).status,
    401,
  );
  assert.equal(
    (
      await api("/auth/me", undefined, null, {
        method: "GET",
        headers: { Authorization: "Bearer VALIDACAO_INVALID_SESSION" },
      })
    ).status,
    401,
  );
  const direct = await users
    .get("super_admin")
    .client.from(tableName("EventoM31Inscricao"))
    .select("id");
  assert.ok(direct.error || direct.data.length === 0);
  const catalog = await db.from("m31_workflows").select("enabled");
  assert.equal(catalog.data.length, 33);
  assert.ok(catalog.data.every((w) => w.enabled === false));
});
test("Inscrição e checkout persistem com PostgREST real e Asaas sintético", async () => {
  const input = {
    nome: "VALIDACAO Live Inscrição",
    cpf: "52998224725",
    whatsapp: "5581999990101",
    email: "inscricao.live@example.invalid",
    tipo: "publico_geral",
    payment_method: "PIX",
    installments: 1,
  };
  const key = run + "_checkout";
  const first = await api("/functions/m31CreatePayment", input, null, {
    headers: { "Idempotency-Key": key },
  });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.success, true);
  assert.ok(first.data.inscricao_id);
  records.push({ entity: "EventoM31Inscricao", id: first.data.inscricao_id });
  const cookies = first.response.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
  const again = await api("/functions/m31CreatePayment", input, null, {
    headers: { "Idempotency-Key": key, Cookie: cookies },
  });
  assert.equal(again.status, 200);
  assert.deepEqual(again.data, first.data);
  const row = await payload("EventoM31Inscricao", first.data.inscricao_id);
  assert.equal(row.nome, input.nome);
  assert.ok(row.codigo_inscricao);
  assert.ok(row.asaas_charge_url);
});
test("Caravana e Servir preservam seus contratos na stack real", async () => {
  const catalog = await api("/functions/m31-caravana-flow", {
    action: "catalogo",
  });
  assert.equal(catalog.status, 200);
  assert.ok(catalog.data.caravanas.some((x) => x.id === "VALIDACAO_CARAVANA"));
  const body = {
    action: "capturar_intencao",
    caravana_id: "VALIDACAO_CARAVANA",
    nome: "VALIDACAO Live Caravana",
    whatsapp: "5581999990102",
    cpf: "11144477735",
    email: "caravana.live@example.invalid",
  };
  const capture = await api("/functions/m31-caravana-flow", body);
  assert.equal(capture.status, 200, JSON.stringify(capture.data));
  assert.ok(capture.data.inscricao_id);
  records.push({ entity: "EventoM31Inscricao", id: capture.data.inscricao_id });
  assert.equal(
    (
      await api("/functions/m31-caravana-flow", {
        ...body,
        action: "checkout",
        payment_method: "CREDIT_CARD",
        installments: 2,
      })
    ).status,
    400,
  );
  const serving = await api("/functions/m31VoluntarioPayment", {
    nome: "VALIDACAO Live Servir",
    whatsapp: "5581999990103",
    cpf: "39053344705",
    email: "servir.live@example.invalid",
    setor: "VALIDACAO_AREA",
    tamanho_camisa: "M",
    modelo_camisa: "milagres",
  });
  assert.equal(serving.status, 200, JSON.stringify(serving.data));
  assert.equal(serving.data.success, true);
  assert.ok(serving.data.inscricao_id);
  records.push({ entity: "EventoM31Inscricao", id: serving.data.inscricao_id });
  const profiles = await db
    .from(tableName("EventoM31Voluntario"))
    .select("id")
    .eq("payload->>inscricao_id", serving.data.inscricao_id);
  for (const row of profiles.data || [])
    records.push({ entity: "EventoM31Voluntario", id: row.id });
});
test("Camisas agrupam duas peças em um pedido e uma cobrança", async () => {
  const token = randomUUID(),
    quote = await api("/functions/m31CamisaVendaPayment", {
      action: "quote",
      quantidade: 2,
      payment_method: "PIX",
      installments: 1,
    });
  assert.equal(quote.status, 200);
  const order = await api("/functions/m31CamisaVendaPayment", {
    action: "criar",
    pedido_token: token,
    nome: "VALIDACAO Live Camisas",
    whatsapp: "5581999990104",
    cpf: "12345678909",
    payment_method: "PIX",
    installments: 1,
    valor_esperado: quote.data.total,
    itens: [
      { modelo: "milagres", tamanho: "M" },
      { modelo: "filhas", tamanho: "G" },
    ],
  });
  assert.equal(order.status, 200, JSON.stringify(order.data));
  assert.equal(order.data.success, true);
  const { data, error } = await db
    .from(tableName("EventoM31CamisaPedido"))
    .select("id,payload")
    .eq("payload->>pedido_token", "sha256:" + digest(token));
  assert.ifError(error);
  assert.equal(data.length, 1);
  records.push({ entity: "EventoM31CamisaPedido", id: data[0].id });
  assert.equal(data[0].payload.quantidade, 2);
  assert.equal(data[0].payload.itens_cobrados.length, 2);
  assert.equal(data[0].payload.valor_cobrado, quote.data.total);
  const query = await api("/functions/m31CamisaVendaPayment", {
    action: "consultar",
    pedido_token: token,
  });
  assert.equal(query.status, 200);
  assert.equal(query.data.quantidade, 2);
});
test("Cartinhas reais conservam autoria e recusam autosave concorrente", async () => {
  const id = run + "_LETTER";
  await commit("EventoM31Inscricao", id, {
    nome: "VALIDACAO Live Carta",
    tipo: "publico_geral",
    status_pagamento: "aprovado",
    estado_canonico: "confirmada",
    codigo_inscricao: run + "_LETTER_QR",
    cartinha_status: "pendente",
    cartinha_versao: 0,
  });
  const listing = await api(
    "/functions/m31Cartinhas",
    { action: "listar" },
    "cartinhas",
  );
  assert.equal(listing.status, 200);
  const current = listing.data.inscricoes.find((x) => x.id === id);
  assert.ok(current);
  const body = {
    action: "salvar",
    inscricao_id: id,
    texto: "VALIDACAO palavra privada",
    status: "em_elaboracao",
    versao: 0,
    titular_ref: current.titular_ref,
    id_transacao: randomUUID(),
  };
  const responses = await Promise.all([
    api("/functions/m31Cartinhas", body, "cartinhas"),
    api(
      "/functions/m31Cartinhas",
      {
        ...body,
        texto: "VALIDACAO outro rascunho",
        id_transacao: randomUUID(),
      },
      "cartinhas",
    ),
  ]);
  assert.deepEqual(responses.map((x) => x.status).sort(), [200, 409]);
  const row = await payload("EventoM31Inscricao", id);
  assert.equal(row.cartinha_versao, 1);
  assert.equal(row.cartinha_historico.length, 1);
  assert.equal(row.cartinha_historico[0].autora_id, "VALIDACAO_USER_cartinhas");
  assert.equal(
    (
      await api(
        "/functions/m31Cartinhas",
        { action: "listar" },
        "gestao_operacional",
      )
    ).status,
    403,
  );
  const admin = await api(
    "/entities/EventoM31Inscricao",
    { action: "get", id },
    "super_admin",
  );
  assert.equal(admin.status, 200);
  assert.equal(admin.data.cartinha_texto, undefined);
});
test("Transferência mantém pagamento e QR e invalida token de uso único", async () => {
  const id = run + "_TRANSFER";
  await commit("EventoM31Inscricao", id, {
    nome: "VALIDACAO Titular",
    tipo: "publico_geral",
    status_pagamento: "aprovado",
    estado_canonico: "confirmada",
    payment_id: run + "_PAY",
    codigo_inscricao: run + "_QR",
    cpf: "12345678909",
    whatsapp: "5581999990105",
    cartinha_versao: 0,
  });
  const link = await api(
    "/functions/m31GerarLinkTransferencia",
    { inscricao_id: id },
    "super_admin",
  );
  assert.equal(link.status, 200, JSON.stringify(link.data));
  records.push({
    entity: "M31TransferenciaInscricao",
    id: link.data.transferencia_id,
  });
  const input = {
    token: link.data.token,
    nome: "VALIDACAO Nova Titular",
    cpf: "16899535009",
    whatsapp: "5581999990106",
    email: "titular.live@example.invalid",
    cidade: "Recife",
  };
  const change = await api("/functions/m31ConcluirTransferencia", input);
  assert.equal(change.status, 200, JSON.stringify(change.data));
  const row = await payload("EventoM31Inscricao", id);
  assert.equal(row.nome, input.nome);
  assert.equal(row.payment_id, run + "_PAY");
  assert.equal(row.codigo_inscricao, run + "_QR");
  assert.equal(
    (await api("/functions/m31ConcluirTransferencia", input)).status,
    409,
  );
});
test("Check-in repetido e perfil sem permissão são verificados com Auth real", async () => {
  const id = run + "_CHECKIN";
  await commit("EventoM31Inscricao", id, {
    nome: "VALIDACAO Entrada",
    tipo: "publico_geral",
    status_pagamento: "aprovado",
    codigo_inscricao: run + "_CHECKIN_QR",
    payment_id: run + "_CHECKIN_PAY",
  });
  const body = { codigo_inscricao: run + "_CHECKIN_QR" };
  assert.equal(
    (await api("/functions/m31Checkin", body, "visualizacao")).status,
    403,
  );
  const first = await api("/functions/m31Checkin", body, "checkin"),
    again = await api("/functions/m31Checkin", body, "checkin");
  assert.equal(first.status, 200);
  assert.equal(again.status, 200);
  assert.equal(again.data.aviso, true);
  const row = await payload("EventoM31Inscricao", id);
  assert.equal(row.checkin_realizado, true);
  assert.equal(row.payment_id, run + "_CHECKIN_PAY");
});
test("Storage real: arquivo pastoral, assinatura temporária e bloqueio de outro perfil", async () => {
  const form = new FormData();
  form.set(
    "file",
    new Blob(["VALIDACAO arquivo privado"], { type: "text/plain" }),
    "VALIDACAO.txt",
  );
  form.set("private", "true");
  form.set("purpose", "cartinhas");
  const upload = await api("/files/upload", form, "cartinhas");
  assert.equal(upload.status, 200, JSON.stringify(upload.data));
  const { data } = await db
    .from("m31_files")
    .select("*")
    .eq("id", upload.data.id)
    .single();
  files.push(data);
  const download = await api(
    "/files/" + upload.data.id,
    undefined,
    "cartinhas",
    { method: "GET" },
  );
  assert.equal(download.status, 200);
  assert.equal(download.data, "VALIDACAO arquivo privado");
  assert.equal(
    (
      await api("/files/" + upload.data.id, undefined, "super_admin", {
        method: "GET",
      })
    ).status,
    403,
  );
  assert.equal(
    (await api("/files/" + upload.data.id, undefined, null, { method: "GET" }))
      .status,
    401,
  );
  const signed = await api(
    "/integrations/CreateFileSignedUrl",
    { file_uri: upload.data.file_uri, expires_in: 1 },
    "cartinhas",
  );
  assert.equal(signed.status, 200);
  assert.equal((await fetch(signed.data.signed_url)).status, 200);
  await new Promise((r) => setTimeout(r, 2100));
  assert.notEqual((await fetch(signed.data.signed_url)).status, 200);
});
test("Realtime real entrega atualização autorizada e RLS filtra outro setor", async () => {
  const client = users.get("lider_setor").client,
    id = run + "_REALTIME";
  let received;
  let ready;
  const channel = client
    .channel(run)
    .on("system", {}, (event) => {
      if (event.extension === "postgres_changes" && event.status === "ok")
        ready = true;
    })
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "m31_changes",
        filter: "entity=eq.EventoM31Tarefa",
      },
      (event) => {
        if (event.new.record_id === id) received = event.new;
      },
    );
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Realtime não assinou o canal")),
      15000,
    );
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timer);
        resolve();
      } else if (status === "CHANNEL_ERROR") {
        clearTimeout(timer);
        reject(new Error("Realtime recusou o canal"));
      }
    });
  });
  await until(() => ready);
  const created = await api(
    "/entities/EventoM31Tarefa",
    {
      action: "create",
      data: { id, titulo: "VALIDACAO Realtime", area: "VALIDACAO_AREA" },
    },
    "super_admin",
  );
  assert.equal(created.status, 200, JSON.stringify(created.data));
  records.push({ entity: "EventoM31Tarefa", id });
  await until(() => received);
  assert.equal(received.record_id, id);
  assert.equal(received.payload, undefined);
  const foreign = run + "_FOREIGN";
  const other = await api(
    "/entities/EventoM31Tarefa",
    {
      action: "create",
      data: {
        id: foreign,
        titulo: "VALIDACAO Outro Setor",
        area: "OUTRO_SETOR",
      },
    },
    "super_admin",
  );
  assert.equal(other.status, 200);
  records.push({ entity: "EventoM31Tarefa", id: foreign });
  const rows = await client
    .from("m31_changes")
    .select("record_id")
    .in("record_id", [id, foreign]);
  assert.ifError(rows.error);
  assert.deepEqual(
    rows.data.map((x) => x.record_id),
    [id],
  );
  await client.removeChannel(channel);
});
test("Revogação de identidade impede API mesmo com sessão Auth válida", async () => {
  const id = users.get("visualizacao").id;
  await db.from("m31_identities").update({ active: false }).eq("auth_id", id);
  try {
    assert.equal(
      (await api("/auth/me", undefined, "visualizacao", { method: "GET" }))
        .status,
      403,
    );
  } finally {
    await db.from("m31_identities").update({ active: true }).eq("auth_id", id);
  }
});
test("Migração real de registros e arquivo é repetível e não produz jobs", async () => {
  const folder = await mkdtemp(join(tmpdir(), "m31-live-import-")),
    secret = randomBytes(32).toString("hex"),
    source = "https://fixture.invalid/VALIDACAO.pdf",
    bytes = Buffer.from("VALIDACAO migration file"),
    hash = digest(bytes),
    id = run + "_IMPORT";
  await mkdir(join(folder, "files"));
  await writeFile(join(folder, "files", hash + ".enc"), encrypt(bytes, secret));
  const snapshot = {
    manifest: {
      files: [
        {
          id: hash,
          source: encrypt(Buffer.from(source), secret).toString("base64"),
          path: "files/" + hash + ".enc",
          mime_type: "application/pdf",
          size: bytes.length,
        },
      ],
    },
    entities: {
      EventoM31Tarefa: [
        {
          id,
          titulo: "VALIDACAO Import",
          area: "VALIDACAO_AREA",
          arquivo_url: source,
          extra_historico: { preservar: true },
        },
      ],
    },
  };
  const before = await db
    .from("m31_outbox")
    .select("id", { count: "exact", head: true });
  try {
    const opts = {
      secret,
      tokenKey: env.TOKEN_ENCRYPTION_KEY,
      origin: env.APP_ORIGIN,
    };
    const first = await importSnapshot(db, folder, snapshot, opts),
      second = await importSnapshot(db, folder, snapshot, opts);
    assert.equal(first.imported, 1);
    assert.equal(second.unchanged, 1);
    records.push({ entity: "EventoM31Tarefa", id });
    const row = await payload("EventoM31Tarefa", id);
    assert.deepEqual(row.extra_historico, { preservar: true });
    assert.ok(row.arquivo_url.startsWith(env.APP_ORIGIN + "/api/files/"));
    const fileId = row.arquivo_url.split("/").at(-1),
      meta = await db.from("m31_files").select("*").eq("id", fileId).single();
    files.push(meta.data);
    assert.equal(
      (
        await api("/files/" + fileId, undefined, "lider_setor", {
          method: "GET",
        })
      ).status,
      200,
    );
    const after = await db
      .from("m31_outbox")
      .select("id", { count: "exact", head: true });
    assert.equal(after.count, before.count);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
test("Cron e Queues locais processam outbox persistido uma única vez", async () => {
  const dedup = run + "_JOB";
  const { data, error } = await db
    .from("m31_outbox")
    .insert({ dedup_key: dedup, function_name: "m31HealthCheck", args: {} })
    .select("id")
    .single();
  assert.ifError(error);
  assert.equal(
    (await fetch("http://127.0.0.1:8787/__scheduled?cron=*+*+*+*+*")).status,
    200,
  );
  await until(async () => {
    const { data: job } = await db
      .from("m31_outbox")
      .select("status,attempts")
      .eq("id", data.id)
      .single();
    return job?.status === "completed" && job;
  }, 20000);
  const job = await db
    .from("m31_outbox")
    .select("attempts")
    .eq("id", data.id)
    .single();
  assert.equal(job.data.attempts, 1);
  await db.from("m31_outbox").delete().eq("id", data.id);
});

test("PostgREST pagina 1.006 registros com timestamps iguais sem perdas ou duplicatas", async () => {
  const ids = Array.from(
    { length: 1006 },
    (_, i) => run + "_PAGE_" + String(i).padStart(4, "0"),
  );
  const inserted = [];
  try {
    for (let start = 0; start < ids.length; start += 100) {
      const chunk = ids.slice(start, start + 100);
      const { error } = await db.rpc("m31_commit", {
        changes: chunk.map((id) => ({
          entity: "EventoM31Tarefa",
          id,
          expected: null,
          data: {
            id,
            titulo: run + "_PAGINATION",
            area: "VALIDACAO_AREA",
            created_date: "2026-10-01T00:00:00Z",
          },
        })),
        suppress_events: true,
      });
      assert.ifError(error);
      inserted.push(...chunk);
    }
    const received = [];
    for (let offset = 0; offset < ids.length; offset += 200) {
      const page = await api(
        "/entities/EventoM31Tarefa",
        {
          action: "filter",
          filter: { titulo: run + "_PAGINATION" },
          sort: "created_date",
          limit: 200,
          offset,
        },
        "super_admin",
      );
      assert.equal(page.status, 200, JSON.stringify(page.data));
      received.push(...page.data.map((row) => row.id));
    }
    assert.equal(received.length, 1006);
    assert.equal(new Set(received).size, 1006);
    assert.deepEqual([...received].sort(), ids);
  } finally {
    for (let start = 0; start < inserted.length; start += 100) {
      const { data, error } = await db
        .from(tableName("EventoM31Tarefa"))
        .select("id,revision")
        .in("id", inserted.slice(start, start + 100));
      assert.ifError(error);
      const deleted = await db.rpc("m31_commit", {
        changes: data.map((row) => ({
          entity: "EventoM31Tarefa",
          id: row.id,
          expected: row.revision,
          delete: true,
        })),
        suppress_events: true,
      });
      assert.ifError(deleted.error);
    }
  }
});

test("Webhook real exige autenticação e persiste somente um recibo e job para evento repetido", async () => {
  const event = {
    id: run + "_WEBHOOK",
    event: "PAYMENT_CONFIRMED",
    payment: {
      id: run + "_UNMATCHED_PAYMENT",
      externalReference: run + "_UNMATCHED",
    },
  };
  assert.equal((await api("/webhooks/asaas", event)).status, 401);
  const headers = { "asaas-access-token": env.ASAAS_WEBHOOK_TOKEN };
  try {
    const first = await api("/webhooks/asaas", event, null, { headers });
    const second = await api("/webhooks/asaas", event, null, { headers });
    assert.equal(first.status, 200);
    assert.equal(first.data.duplicate, false);
    assert.equal(second.status, 200);
    assert.equal(second.data.duplicate, true);
    const receipts = await db
      .from(tableName("M31AsaasWebhookEvento"))
      .select("id")
      .eq("payload->>event_id", event.id);
    assert.ifError(receipts.error);
    assert.equal(receipts.data.length, 1);
    const jobs = await db
      .from("m31_outbox")
      .select("id")
      .eq("dedup_key", "asaas:" + event.id);
    assert.ifError(jobs.error);
    assert.equal(jobs.data.length, 1);
  } finally {
    await db
      .from("m31_outbox")
      .delete()
      .eq("dedup_key", "asaas:" + event.id);
    await db
      .from(tableName("M31AsaasWebhookEvento"))
      .delete()
      .eq("payload->>event_id", event.id);
  }
});

test("Queues locais limitam falhas a quatro tentativas e encerram job na fila de falhas", async () => {
  const { data, error } = await db
    .from("m31_outbox")
    .insert({
      dedup_key: run + "_FAILURE",
      function_name: "m31CreatePayment",
      args: { payment_method: "VALIDACAO_INVALID_PAYMENT_METHOD" },
    })
    .select("id")
    .single();
  assert.ifError(error);
  try {
    for (let attempt = 1; attempt <= 4; attempt++) {
      // Advance only this synthetic job's retry clock; no real workflow is enabled.
      await db
        .from("m31_outbox")
        .update({ available_at: new Date(0).toISOString() })
        .eq("id", data.id);
      assert.equal(
        (await fetch("http://127.0.0.1:8787/__scheduled?cron=*+*+*+*+*"))
          .status,
        200,
      );
      await until(async () => {
        const result = await db
          .from("m31_outbox")
          .select("status,attempts,error_code")
          .eq("id", data.id)
          .single();
        return (
          result.data?.attempts === attempt &&
          result.data.status === (attempt === 4 ? "failed" : "pending") &&
          result.data
        );
      }, 20000);
    }
    const final = await db
      .from("m31_outbox")
      .select("status,attempts,error_code")
      .eq("id", data.id)
      .single();
    assert.equal(final.data.status, "failed");
    assert.equal(final.data.attempts, 4);
    assert.ok(final.data.error_code);
    // A terminal job must not be claimed again by a subsequent scheduled tick.
    await fetch("http://127.0.0.1:8787/__scheduled?cron=*+*+*+*+*");
    assert.equal(
      (
        await db
          .from("m31_outbox")
          .select("attempts")
          .eq("id", data.id)
          .single()
      ).data.attempts,
      4,
    );
  } finally {
    await db.from("m31_outbox").delete().eq("id", data.id);
  }
});
