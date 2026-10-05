import { health } from "./health";
import { guestEntities } from "./guest";
import { handlers } from "../registry";
import { UnitOfWork } from "./entities";
import { functionPermission } from "./permissions";
import { coreIntegration, downloadFile } from "./integrations";
import {
  configValue,
  providerFetch,
  googleConnection,
  rewrite,
} from "./providers";
import {
  ApiError,
  type LegacyClient,
  type SessionContext,
  type JsonRecord,
  type HandlerContext,
} from "./types";
import { sha256 } from "./vault";
export async function invokeHandler(
  name: string,
  body: JsonRecord,
  session: SessionContext,
  work: UnitOfWork,
  depth = 0,
): Promise<Response> {
  if (!Object.hasOwn(handlers, name))
    throw new ApiError(404, "Função não encontrada.");
  if (depth > 12)
    throw new ApiError(500, "Limite de chamadas internas excedido.");
  functionPermission(name, session.user, body, session.internal);
  if (
    session.env.APP_ENV === "production" &&
    /Simular|Teste|DiagnosticoSendMedia/.test(name)
  )
    throw new ApiError(
      403,
      "Rotina de teste disponível apenas em ambiente de homologação.",
    );
  if (session.internal && !session.user)
    session = {
      ...session,
      user: {
        id: "system:jobs",
        auth_id: "system:jobs",
        email: "jobs@m31.invalid",
        full_name: "M31 automations",
        role: "admin",
      },
    };
  const config = (key: string) => {
    const found = configValue(session.env, key);
    if (found !== undefined) return found;
    if (
      session.env.PROVIDER_MODE === "mock" &&
      [
        "ASAAS_API_KEY",
        "BREVO_API_KEY",
        "UAZAPI_TOKEN",
        "UAZAPI_INSTANCE_TOKEN",
      ].includes(key)
    )
      return "LOCAL_MOCK";
    if (key === "UAZAPI_BASE")
      return configValue(session.env, "UAZAPI_BASE_URL");
    return undefined;
  };
  const provider = providerFetch(session);
  const scopedEntities = guestEntities(work, session);
  const trackedEntities = new Proxy(
    {},
    {
      get: (_target, name) =>
        new Proxy(scopedEntities[String(name)], {
          get: (entity, key) =>
            typeof entity[key as keyof typeof entity] === "function"
              ? (...args: unknown[]) =>
                  work.track(
                    (
                      entity[key as keyof typeof entity] as (
                        ...input: unknown[]
                      ) => Promise<unknown>
                    )(...args),
                  )
              : entity[key as keyof typeof entity],
        }),
    },
  ) as LegacyClient["entities"];
  const client: LegacyClient = {
    entities: trackedEntities,
    auth: {
      me: async () => {
        if (!session.user) throw new ApiError(401, "Entre com sua conta.");
        return session.user;
      },
      updateMe: async () => {
        throw new ApiError(403, "Use o perfil autenticado.");
      },
    },
    functions: {
      invoke: (next, args = {}) =>
        work.track(
          (async () => {
            const response = await invokeHandler(
              next,
              args,
              { ...session, internal: true },
              work,
              depth + 1,
            );
            const data = await response.json();
            if (!response.ok) {
              const error = new ApiError(
                response.status,
                "Falha na função interna.",
              );
              Object.assign(error, {
                response: { status: response.status, data },
              });
              throw error;
            }
            return { data, status: response.status };
          })(),
        ),
    },
    integrations: {
      Core: new Proxy(
        {},
        {
          get: (_target, name) => (args: JsonRecord) =>
            work.track(coreIntegration(String(name), args, session)),
        },
      ),
    },
    connectors: {
      getConnection: async (name) => {
        if (name !== "googledrive")
          throw new ApiError(404, "Conector indisponível.");
        if (session.env.PROVIDER_MODE === "mock")
          return { accessToken: "LOCAL_MOCK" };
        return googleConnection(session.env);
      },
    },
    get asServiceRole() {
      return this;
    },
  };
  const safeLog = (level: string) => () => {
    console.log(
      JSON.stringify({
        level,
        event: "domain_log",
        function: name,
        request_id: session.requestId,
      }),
    );
  };
  const context: HandlerContext = {
    client,
    config,
    health: () => health(session, work),
    logger: {
      log: safeLog("info"),
      info: safeLog("info"),
      debug: safeLog("debug"),
      warn: safeLog("warn"),
      error: safeLog("error"),
    },
    fetch: async (input, init) => {
      const url = new URL(
        rewrite(
          input instanceof Request ? input.url : String(input),
          session.env,
        ),
      );
      if (
        url.origin === new URL(session.env.APP_ORIGIN).origin &&
        url.pathname.startsWith("/api/files/")
      )
        return downloadFile(session, url.pathname.split("/").at(-1)!);
      return provider(input, init);
    },
  };
  const handler = handlers[name as keyof typeof handlers];
  return handler(
    new Request(`${session.env.APP_ORIGIN}/api/functions/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    context,
  );
}
export async function runFunction(
  name: string,
  body: JsonRecord,
  session: SessionContext,
  work: UnitOfWork,
  idempotencyKey?: string,
) {
  work.setSession(session);
  const lockOwner = session.requestId;
  let operationKey: string | undefined;
  let lockScope: string | undefined;
  try {
    if (
      /Payment$|m31CreatePayment|m31RegistrarIntencao|m31-caravana-(flow|v2)|m31ConcluirTransferencia|m31ConcluirCadastroConvidada|m31Checkin|m31OperarParticipante|m31CamisasOperacional/.test(
        name,
      )
    ) {
      const identity =
        body.pedido_token ||
        body.token ||
        body.inscricao_id ||
        body.codigo_inscricao ||
        body.qrcode_token ||
        body.cpf ||
        body.whatsapp;
      if (identity) {
        lockScope = await sha256(`domain:${name}:${identity}`);
        const { data, error } = await session.db.rpc("m31_acquire_lock", {
          lock_scope: lockScope,
          lock_owner: session.requestId,
        });
        if (error || !data)
          throw new ApiError(
            409,
            "Outra operação está sendo concluída. Aguarde e tente novamente.",
            "operation_in_progress",
          );
      }
    }
    if (idempotencyKey) {
      if (idempotencyKey.length > 200)
        throw new ApiError(400, "Chave idempotente inválida.");
      const scope = session.user?.auth_id || session.guestHash || "public";
      operationKey = await sha256(`${scope}:${name}:${idempotencyKey}`);
      const inputHash = await sha256(JSON.stringify(body));
      const { data: existing } = await session.db
        .from("m31_operations")
        .select("*")
        .eq("key", operationKey)
        .maybeSingle();
      if (existing) {
        if (existing.input_hash !== inputHash)
          throw new ApiError(409, "Chave já usada para outro conteúdo.");
        if (existing.status === "completed")
          return Response.json(existing.response.body, {
            status: existing.response.status,
          });
        throw new ApiError(
          409,
          "Operação em andamento ou pendente de conferência.",
          "operation_pending",
        );
      }
      const { error } = await session.db
        .from("m31_operations")
        .insert({ key: operationKey, scope, input_hash: inputHash });
      if (error) throw new ApiError(409, "Operação já iniciada.");
      session = { ...session, requestId: operationKey };
    }
    const response = await invokeHandler(name, body, session, work);
    const result = await response.json();
    await work.commit();
    const normalized = JSON.parse(
      rewrite(
        JSON.stringify(result, (key, value) =>
          key.startsWith("_guest_") ||
          (!session.user && key.startsWith("cartinha_")) ||
          (name !== "m31Cartinhas" &&
            /^cartinha_(texto|historico|rascunho|audio|transcricao|estilo_exemplos)/.test(
              key,
            ))
            ? undefined
            : value,
        ),
        session.env,
      ),
    );
    if (operationKey)
      await session.db
        .from("m31_operations")
        .update({
          status: "completed",
          response: { body: normalized, status: response.status },
          updated_at: new Date().toISOString(),
        })
        .eq("key", operationKey);
    return Response.json(normalized, {
      status: response.status,
      headers: response.headers,
    });
  } catch (error) {
    if (operationKey)
      await session.db
        .from("m31_operations")
        .update({ status: "review", updated_at: new Date().toISOString() })
        .eq("key", operationKey);
    throw error;
  } finally {
    if (lockScope)
      await session.db
        .from("m31_locks")
        .delete()
        .eq("scope", lockScope)
        .eq("owner", lockOwner);
  }
}
