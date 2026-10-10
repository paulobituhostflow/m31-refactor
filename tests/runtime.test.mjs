import { workflowCatalog, workflowStep } from "../worker/runtime/jobs.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { providerFetch } from "../worker/runtime/providers.ts";
import { guestEntities } from "../worker/runtime/guest.ts";
import { handlers } from "../worker/registry.ts";
import { readdir, readFile } from "node:fs/promises";
const session = {
  env: {
    APP_ENV: "local",
    APP_ORIGIN: "http://127.0.0.1:5173",
    PROVIDER_MODE: "mock",
    EXTERNAL_SIDE_EFFECTS: "false",
  },
  requestId: "VALIDACAO_REQUEST",
  user: null,
  internal: false,
};
test("provider mocks are restricted to local environments and arbitrary external destinations are rejected", async () => {
  await assert.rejects(
    providerFetch({
      ...session,
      env: { ...session.env, APP_ENV: "production" },
    })("https://api.asaas.com/v3/payments", { method: "POST" }),
    (error) => error.status === 503,
  );
  await assert.rejects(
    providerFetch(session)("https://example.invalid/steal"),
    (error) => error.status === 403,
  );
  await assert.rejects(
    providerFetch({
      ...session,
      env: { ...session.env, PROVIDER_MODE: "live" },
    })("https://api.brevo.com/v3/smtp/email", { method: "POST" }),
    (error) => error.code === "external_side_effects_disabled",
  );
});
test("guest writes cannot modify a different registration merely by knowing its ID", async () => {
  const saved = {
    id: "foreign",
    cpf: "12345678909",
    whatsapp: "5581999990000",
    _guest_session_hash: "other",
  };
  let changed = false;
  const entity = {
    get: async () => saved,
    update: async () => {
      changed = true;
    },
    filter: async () => [saved],
  };
  const work = {
    entity: () => entity,
    entities: { EventoM31Inscricao: entity },
  };
  const scoped = guestEntities(work, {
    ...session,
    guestHash: "mine",
    guestBody: { inscricao_id: "foreign" },
  });
  await assert.rejects(
    scoped.EventoM31Inscricao.update("foreign", { nome: "WRONG" }),
    (error) => error.status === 403,
  );
  assert.equal(changed, false);
});
test("all M31 handlers are compiled callable modules without Deno or SDK runtime imports", async () => {
  assert.equal(Object.keys(handlers).length, 204);
  for (const [name, handler] of Object.entries(handlers)) {
    assert.equal(typeof handler, "function");
    const source = await readFile(
      new URL(`../worker/functions/${name}/entry.ts`, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(source, /Deno\.(serve|env)|npm:@base44|npm:undici/);
  }
});
test("deployment starts with paused workflows and no legacy Git remote or backend", async () => {
  const config = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
  for (const env of [config, ...Object.values(config.env)]) {
    assert.equal(env.vars.EXTERNAL_SIDE_EFFECTS, "false");
    assert.equal(env.vars.AUTOMATIONS_ENABLED, "false");
  }
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  assert.ok(!pkg.dependencies["@base44/sdk"]);
  assert.ok(!pkg.dependencies["@base44/vite-plugin"]);
  const client = await readFile("src/api/base44Client.js", "utf8");
  assert.doesNotMatch(client, /base44\.app|base44\.com/);
});

test("all exported workflow DSL step names resolve to a registered handler without losing arguments", () => {
  assert.equal(workflowCatalog.length, 33);
  for (const workflow of workflowCatalog) {
    assert.equal(typeof handlers[workflow.job.function_name], "function");
    assert.deepEqual(workflow.job, workflowStep(workflow));
  }
  assert.deepEqual(
    workflowCatalog.find((w) => w.name.includes("Espelho Privado")).job,
    { function_name: "m31CartinhasEspelho", args: { action: "processar" } },
  );
  assert.deepEqual(
    workflowCatalog.find((w) => w.name.includes("Follow-up Grupo")).job.args,
    { action: "executar" },
  );
});

test("transfer token authorizes only its linked registration, its conclusion handler and an unexpired pending transfer", async () => {
  let transfer = {
    id: "VALIDACAO_TRANSFER",
    inscricao_id: "VALIDACAO_TARGET",
    status: "pendente",
    token_expira_em: "2099-01-01T00:00:00Z",
  };
  const rows = {
    VALIDACAO_TARGET: { id: "VALIDACAO_TARGET" },
    VALIDACAO_OTHER: { id: "VALIDACAO_OTHER" },
  };
  const work = {
    entities: {},
    entity: (name) =>
      name === "M31TransferenciaInscricao"
        ? {
            filter: async (filter) =>
              transfer.status === filter.status &&
              transfer.inscricao_id === filter.inscricao_id
                ? [transfer]
                : [],
          }
        : {
            get: async (id) => rows[id],
            update: async (id, data) => ({ ...rows[id], ...data }),
            filter: async () => Object.values(rows),
          },
  };
  const caller = {
    ...session,
    guestHash: "VALIDACAO_GUEST",
    guestBody: { token: "VALIDACAO_TRANSFER_TOKEN" },
  };
  const scope = guestEntities(work, caller, "m31ConcluirTransferencia");
  assert.equal(
    (
      await scope.EventoM31Inscricao.update("VALIDACAO_TARGET", {
        nome: "VALIDACAO New",
      })
    ).nome,
    "VALIDACAO New",
  );
  await assert.rejects(
    scope.EventoM31Inscricao.update("VALIDACAO_OTHER", {}),
    (error) => error.status === 403,
  );
  await assert.rejects(
    guestEntities(work, caller, "m31CreatePayment").EventoM31Inscricao.update(
      "VALIDACAO_TARGET",
      {},
    ),
    (error) => error.status === 403,
  );
  transfer = { ...transfer, token_expira_em: "2000-01-01T00:00:00Z" };
  await assert.rejects(
    scope.EventoM31Inscricao.update("VALIDACAO_TARGET", {}),
    (error) => error.status === 403,
  );
  transfer = {
    ...transfer,
    token_expira_em: "2099-01-01T00:00:00Z",
    status: "concluida",
  };
  await assert.rejects(
    scope.EventoM31Inscricao.update("VALIDACAO_TARGET", {}),
    (error) => error.status === 403,
  );
});
test("Asaas fixture honors customer notification settings and the requested financial amount", async () => {
  const fetch = providerFetch(session),
    customer = await (
      await fetch("https://api-sandbox.asaas.com/v3/customers", {
        method: "POST",
        body: JSON.stringify({ notificationDisabled: true }),
      })
    ).json();
  const updated = await (
    await fetch("https://api-sandbox.asaas.com/v3/customers/" + customer.id, {
      method: "PUT",
      body: JSON.stringify({ notificationDisabled: true }),
    })
  ).json();
  assert.equal(updated.id, customer.id);
  assert.equal(updated.notificationDisabled, true);
  const payment = await (
    await fetch("https://api-sandbox.asaas.com/v3/payments", {
      method: "POST",
      body: JSON.stringify({
        value: 130,
        billingType: "PIX",
        externalReference: "VALIDACAO_ORDER",
      }),
    })
  ).json();
  assert.equal(payment.value, 130);
  assert.equal(payment.externalReference, "VALIDACAO_ORDER");
});
