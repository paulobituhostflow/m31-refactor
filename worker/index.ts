import type { StatusCode } from "hono/utils/http-status";
import { domainMutation } from "./runtime/domain";
import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import {
  database,
  authenticate,
  requireUser,
  superAdmin,
} from "./runtime/auth";
import { UnitOfWork, entityNames, matches } from "./runtime/entities";
import {
  ApiError,
  type RuntimeEnv,
  type SessionContext,
  type JsonRecord,
} from "./runtime/types";
import {
  entityPermission,
  entityWriteFields,
  publicView,
  scopedFilter,
  scopedQuery,
  functionPermission,
} from "./runtime/permissions";
import { runFunction } from "./runtime/dispatcher";
import {
  coreIntegration,
  uploadFile,
  downloadFile,
} from "./runtime/integrations";
import { configValue } from "./runtime/providers";
import { secureEqual, sha256 } from "./runtime/vault";
import { health } from "./runtime/health";
import { tick, consume, initializeWorkflows } from "./runtime/jobs";
import { migrateLegacyPassword, readLoginBody } from "./runtime/legacy-password";
type Bindings = {
  Bindings: RuntimeEnv;
  Variables: { session: SessionContext; work: UnitOfWork };
};
export const app = new Hono<Bindings>();
app.onError((error, c) => {
  const status = error instanceof ApiError ? error.status : 500;
  const code = error instanceof ApiError ? error.code : "internal_error";
  console.error(
    JSON.stringify({
      event: "api_error",
      code,
      status,
      path: c.req.path,
      request_id: c.get("session")?.requestId,
    }),
  );
  return c.json(
    {
      error:
        error instanceof ApiError
          ? error.message
          : "Não foi possível concluir a operação.",
      code,
    },
    status as 400,
  );
});
app.get("/api/public-settings", (c) =>
  c.json({
    id: "m31-independent",
    public_settings: { name: "M31", auth_required: false },
  }),
);
app.get("/api/health", async (c) => {
  const db = database(c.env);
  const { error } = await db.from("m31_entity_catalog").select("name").limit(1);
  return c.json(
    {
      status: error ? "unavailable" : "ok",
      environment: c.env.APP_ENV,
      integrations: c.env.PROVIDER_MODE,
      automations: c.env.AUTOMATIONS_ENABLED === "true",
    },
    error ? 503 : 200,
  );
});
app.use("/api/*", async (c, next) => {
  const origin = c.req.header("Origin");
  if (
    !["GET", "HEAD"].includes(c.req.method) &&
    origin &&
    origin !== new URL(c.env.APP_ORIGIN).origin &&
    origin !== new URL(c.req.url).origin
  )
    throw new ApiError(403, "Origem não autorizada.");
  const length = Number(c.req.header("Content-Length") || 0);
  if (length > 26 * 1024 * 1024)
    throw new ApiError(413, "Requisição muito grande.");
  const db = database(c.env);
  const work = new UnitOfWork(
    db,
    false,
    configValue(c.env, "TOKEN_ENCRYPTION_KEY"),
  );
  let authHeaders = c.req.raw.headers;
  const cookie = getCookie(c, "m31_session");
  if (!authHeaders.has("Authorization") && cookie) {
    authHeaders = new Headers(authHeaders);
    authHeaders.set("Authorization", `Bearer ${cookie}`);
  }
  let user = null;
  if (!c.req.path.startsWith("/api/webhooks/")) {
    try {
      user = await authenticate({ headers: authHeaders }, db, work);
    } catch (error) {
      if (cookie && !c.req.raw.headers.has("Authorization"))
        deleteCookie(c, "m31_session", { path: "/api" });
      else throw error;
    }
  }
  let guest = getCookie(c, "m31_guest");
  if (!guest || !/^[a-f0-9]{64}$/.test(guest)) {
    guest = [...crypto.getRandomValues(new Uint8Array(32))]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
    setCookie(c, "m31_guest", guest, {
      httpOnly: true,
      secure: c.env.APP_ENV !== "local",
      sameSite: "Strict",
      path: "/api",
      maxAge: 604800,
    });
  }
  const session: SessionContext = {
    env: c.env,
    db,
    user,
    internal: false,
    requestId: crypto.randomUUID(),
    guestHash: user ? undefined : await sha256(guest),
  };
  work.setSession(session);
  c.set("session", session);
  c.set("work", work);
  if (!user) {
    const ip = c.req.header("CF-Connecting-IP") || "local";
    const { data: allowed, error } = await db.rpc("m31_rate_limit", {
      bucket: await sha256(`${ip}:${c.req.path}`),
      maximum: c.req.path.includes("Checkin") ? 10 : 60,
      seconds: 60,
    });
    if (error) throw new ApiError(503, "Proteção de requisições indisponível.");
    if (!allowed)
      throw new ApiError(429, "Muitas tentativas. Aguarde um minuto.");
  }
  const bearer = c.req.header("Authorization");
  if (user && bearer?.startsWith("Bearer "))
    setCookie(c, "m31_session", bearer.slice(7), {
      httpOnly: true,
      secure: c.env.APP_ENV !== "local",
      sameSite: "Strict",
      path: "/api",
      maxAge: 3600,
    });
  c.header("Cache-Control", "no-store, private");
  await next();
});
app.get("/api/auth/me", (c) => {
  const session = c.get("session");
  requireUser(session.user);
  return c.json(session.user);
});
app.post("/api/auth/legacy-password", async (c) => {
  await migrateLegacyPassword(c.get("session"), await readLoginBody(c.req.raw), c.req.header("CF-Connecting-IP") || "local");
  return c.json({ success: true });
});
app.post("/api/auth/logout", (c) => {
  deleteCookie(c, "m31_session", { path: "/api" });
  return c.json({ success: true });
});
app.post("/api/auth/access", async (c) => {
  const session = c.get("session");
  requireUser(session.user);
  const member = session.user.membro;
  if (!member?.ativo) throw new ApiError(403, "Membro sem acesso.");
  await c
    .get("work")
    .entity("EventoM31Membro")
    .update(member.id, {
      ultimo_acesso: new Date().toISOString(),
      total_acessos: Number(member.total_acessos || 0) + 1,
    });
  await c.get("work").commit();
  return c.json({ success: true });
});
app.post("/api/auth/profile", async (c) => {
  const session = c.get("session");
  requireUser(session.user);
  const body = await c.req.json();
  if (Object.keys(body).some((k) => !["full_name"].includes(k)))
    throw new ApiError(403, "Campo protegido.");
  await session.db
    .from("m31_identities")
    .update({ full_name: String(body.full_name || "").slice(0, 160) })
    .eq("auth_id", session.user.auth_id);
  return c.json({ ...session.user, full_name: body.full_name });
});
app.post("/api/entities/:entity", async (c) => {
  const name = c.req.param("entity");
  if (!entityNames.includes(name))
    throw new ApiError(404, "Entidade indisponível.");
  const body = (await c.req.json()) as JsonRecord;
  const session = c.get("session");
  const work = c.get("work");
  entityPermission(name, body.action, session.user);
  if (name === "EventoM31ActionLog" && body.action === "create") {
    body.data = {
      ...body.data,
      user_email: session.user?.email,
      user_perfil: session.user?.membro?.perfil,
    };
    delete body.data.impersonado_por;
  }
  if (name === "TarefaComentario" && body.action === "create")
    body.data = {
      ...body.data,
      autor_email: session.user?.email,
      autor_nome: session.user?.full_name,
    };
  const entity = work.entity(name);
  const reading = ["list", "filter", "get"].includes(body.action);
  if (reading) {
    const filter = body.action === "get" ? { id: body.id } : body.filter || {};
    const query = await scopedQuery(name, filter, session.user, work);
    const rows = await entity.filter(
      query,
      body.sort || "-id",
      Math.min(body.action === "get" ? 1 : (body.limit ?? 500), 1000),
      body.offset || 0,
    );
    if (body.action === "get" && !rows[0])
      throw new ApiError(404, "Registro não encontrado.");
    const result = rows.map((r) => publicView(name, r, session.user));
    return c.json(body.action === "get" ? result[0] : result);
  }
  requireUser(session.user);
  if (
    ["lider_setor", "voluntario"].includes(session.user.membro?.perfil) &&
    body.action !== "create" &&
    Object.keys(body.data || {}).some(
      (key) =>
        ![
          "status",
          "observacoes",
          "observacao",
          "observacao_conclusao",
          "concluido_em",
          "concluido_por_nome",
          "concluido_por_email",
          "presente",
          "data_presenca",
        ].includes(key),
    )
  )
    throw new ApiError(
      403,
      "O líder pode atualizar somente presença, status e observações.",
    );
  entityWriteFields(name, body.data || {});
  if (["bulkCreate", "bulkUpdate"].includes(body.action)) {
    if (!Array.isArray(body.data) || body.data.length > 100)
      throw new ApiError(400, "Lote inválido.");
    for (const row of body.data) {
      entityWriteFields(name, row.data || row);
      if (
        body.action === "bulkCreate" &&
        !matches(row, scopedFilter(name, {}, session.user))
      )
        throw new ApiError(403, "Registro fora do seu setor.");
      if (
        body.action === "bulkUpdate" &&
        !(await entity.filter(scopedFilter(name, { id: row.id }, session.user)))
          .length
      )
        throw new ApiError(403, "Registro fora do seu escopo.");
    }
    const result =
      body.action === "bulkCreate"
        ? await entity.bulkCreate(body.data)
        : await entity.bulkUpdate(body.data);
    await work.commit();
    return c.json(result.map((r) => publicView(name, r, session.user)));
  }
  if (body.action === "updateMany") {
    entityWriteFields(name, body.data?.$set || body.data);
    const result = await entity.updateMany(
      await scopedQuery(name, body.filter || {}, session.user, work),
      body.data,
    );
    await work.commit();
    return c.json(result);
  }
  if (body.action === "update" || body.action === "delete") {
    const row = await entity.get(body.id);
    const filter = await scopedQuery(name, { id: body.id }, session.user, work);
    if (!(await entity.filter(filter)).length)
      throw new ApiError(403, "Registro fora do seu escopo.");
    if (
      session.user.membro?.perfil === "lider_setor" &&
      body.data?.area &&
      body.data.area !== row.area
    )
      throw new ApiError(403, "Não é permitido trocar o setor.");
  }
  if (
    body.action === "create" &&
    !matches(body.data, await scopedQuery(name, {}, session.user, work))
  )
    throw new ApiError(403, "Registro fora do seu setor.");
  const result =
    body.action === "create"
      ? await entity.create(body.data)
      : body.action === "update"
        ? await entity.update(body.id, body.data)
        : body.action === "delete"
          ? await entity.delete(body.id)
          : null;
  if (!result) throw new ApiError(400, "Operação inválida.");
  await work.commit();
  return c.json(publicView(name, result, session.user));
});
app.post("/api/domain/:entity", async (c) =>
  c.json(
    await domainMutation(
      c.req.param("entity"),
      await c.req.json(),
      c.get("session"),
      c.get("work"),
    ),
  ),
);
app.post("/api/functions/:name", async (c) => {
  const name = c.req.param("name");
  const body = (await c.req.json()) as JsonRecord;
  const session = c.get("session");
  const work = c.get("work");
  session.guestBody = body;
  functionPermission(name, session.user, body);
  if (
    [
      "m31HealthCheck",
      "m31ListarAutomacoes",
      "m31DiagnosticarWebhook",
    ].includes(name)
  ) {
    requireUser(session.user);
    const result = await health(session, work);
    return c.json(name === "m31ListarAutomacoes" ? result.automations : result);
  }
  const response = await runFunction(
    name,
    body,
    session,
    work,
    c.req.header("Idempotency-Key"),
  );
  return c.newResponse(response.body, {
    status: response.status as StatusCode,
    headers: response.headers,
  });
});
app.post("/api/integrations/:name", async (c) => {
  const session = c.get("session");
  requireUser(session.user);
  if (!session.user.membro?.ativo)
    throw new ApiError(403, "Conta sem acesso às integrações.");
  return c.json(
    await coreIntegration(c.req.param("name"), await c.req.json(), session),
  );
});
app.post("/api/files/upload", async (c) => {
  const session = c.get("session");
  requireUser(session.user);
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "Arquivo obrigatório.");
  return c.json(
    await uploadFile(
      session,
      file,
      file.name,
      String(form.get("purpose") || "tasks"),
      form.get("private") === "false",
    ),
  );
});
app.get("/api/files/:id", async (c) => {
  const response = await downloadFile(c.get("session"), c.req.param("id"));
  return c.newResponse(response.body, {
    status: response.status as StatusCode,
    headers: response.headers,
  });
});
app.post("/api/admin/workflows/initialize", async (c) => {
  if (!superAdmin(c.get("session").user))
    throw new ApiError(403, "Gestão restrita.");
  await initializeWorkflows(c.env);
  return c.json({ success: true });
});
app.post("/api/admin/workflows/:id", async (c) => {
  const session = c.get("session");
  if (!superAdmin(session.user)) throw new ApiError(403, "Gestão restrita.");
  const { enabled } = await c.req.json();
  if (typeof enabled !== "boolean") throw new ApiError(400, "Estado inválido.");
  if (enabled && c.env.AUTOMATIONS_ENABLED !== "true")
    throw new ApiError(
      409,
      "Ative AUTOMATIONS_ENABLED no ambiente antes de habilitar jobs.",
    );
  const { error } = await session.db
    .from("m31_workflows")
    .update({ enabled })
    .eq("id", c.req.param("id"));
  if (error) throw new ApiError(503, "Não foi possível alterar job.");
  return c.json({ success: true });
});
app.post("/api/webhooks/:provider", async (c) => {
  const session = c.get("session");
  const provider = c.req.param("provider");
  const body = (await c.req.json()) as JsonRecord;
  const work = c.get("work");
  if (provider === "asaas") {
    const expected = configValue(c.env, "ASAAS_WEBHOOK_TOKEN") || "";
    if (
      !expected ||
      !(await secureEqual(c.req.header("asaas-access-token") || "", expected))
    )
      throw new ApiError(401, "Webhook não autorizado.");
    if (!body.id) throw new ApiError(400, "ID do evento obrigatório.");
    const allowed = [
      "PAYMENT_CONFIRMED",
      "PAYMENT_RECEIVED",
      "PAYMENT_OVERDUE",
      "PAYMENT_REFUNDED",
      "PAYMENT_DELETED",
    ];
    const payload = {
      id: crypto.randomUUID(),
      event_id: body.id,
      event_type: body.event,
      payment_id: body.payment?.id || null,
      external_reference: body.payment?.externalReference || null,
      payload_json: JSON.stringify(body),
      status:
        body.payment && allowed.includes(body.event) ? "recebido" : "ignorado",
      recebido_em: new Date().toISOString(),
      tentativas: 0,
    };
    const { data: duplicate, error } = await session.db.rpc(
      "m31_receive_asaas_event",
      { event_payload: payload },
    );
    if (error) throw new ApiError(503, "Falha ao persistir evento e fila.");
    return c.json({ received: true, event_id: body.id, duplicate });
  }
  if (provider === "uazapi") {
    const expected = configValue(c.env, "UAZAPI_WEBHOOK_TOKEN") || "";
    if (
      !expected ||
      !(await secureEqual(c.req.header("x-webhook-token") || "", expected))
    )
      throw new ApiError(401, "Webhook não autorizado.");
    const id = body.messageid || body.id || body.message?.id;
    if (!id) throw new ApiError(400, "ID da mensagem obrigatório.");
    const { error } = await session.db
      .from("m31_outbox")
      .upsert(
        {
          dedup_key: `uazapi:${id}:${body.event || body.status || "message"}`,
          function_name: "m31ReceberWebhookUazapi",
          args: body,
        },
        { onConflict: "dedup_key", ignoreDuplicates: true },
      );
    if (error) throw new ApiError(503, "Falha ao persistir mensagem.");
    return c.json({ received: true });
  }
  throw new ApiError(404, "Webhook inexistente.");
});
app.all("/api/*", (c) => c.json({ error: "Endpoint não encontrado." }, 404));
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));
export default {
  fetch: app.fetch,
  scheduled: async (
    _event: ScheduledController,
    env: RuntimeEnv,
    ctx: ExecutionContext,
  ) => {
    ctx.waitUntil(tick(env));
  },
  queue: async (batch: MessageBatch<{ id: string }>, env: RuntimeEnv) => {
    for (const message of batch.messages) await consume(env, message);
  },
};
