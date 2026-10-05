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
  assert.equal(Object.keys(handlers).length, 203);
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
