import {
  ApiError,
  type RuntimeEnv,
  type JsonRecord,
  type SessionContext,
} from "./types";
import { sha256 } from "./vault";
export function configValue(env: RuntimeEnv, name: string) {
  return (env as unknown as Record<string, string | undefined>)[name];
}
export function rewrite(value: string, env: RuntimeEnv): string {
  return value
    .replaceAll(
      "__WHATSAPP_GROUP_INVITE__",
      configValue(env, "WHATSAPP_GROUP_INVITE") || "",
    )
    .replaceAll(
      "__ASAAS_API__",
      configValue(env, "ASAAS_BASE_URL") ||
        (env.APP_ENV === "production"
          ? "https://api.asaas.com/v3"
          : "https://api-sandbox.asaas.com/v3"),
    )
    .replaceAll(
      "__UAZAPI_API__",
      configValue(env, "UAZAPI_BASE_URL") || "https://uazapi.invalid",
    )
    .replaceAll("__BREVO_API__", "https://api.brevo.com/v3")
    .replaceAll("__APP_ORIGIN__", env.APP_ORIGIN || "http://127.0.0.1:5173");
}
function providerFor(url: URL, env: RuntimeEnv) {
  if (/(^|\.)asaas\.com$/.test(url.hostname)) return "asaas";
  if (url.hostname === "api.brevo.com") return "brevo";
  if (url.hostname === "api.openai.com") return "openai";
  if (
    url.hostname.endsWith(".googleapis.com") ||
    url.hostname === "oauth2.googleapis.com"
  )
    return "google";
  if (
    configValue(env, "UAZAPI_BASE_URL") &&
    url.origin === new URL(configValue(env, "UAZAPI_BASE_URL")!).origin
  )
    return "uazapi";
  if (url.hostname === "uazapi.invalid") return "uazapi";
  if (url.origin === new URL(env.APP_ORIGIN).origin) return "app";
  throw new ApiError(
    403,
    "Destino externo não autorizado.",
    "unapproved_provider",
  );
}
function mockResponse(
  provider: string,
  url: URL,
  init: RequestInit,
  requestId: string,
): Response {
  const id = `VALIDACAO_${requestId.slice(0, 12)}`;
  const path = url.pathname;
  if (provider === "asaas") {
    if (path.includes("/pixQrCode"))
      return Response.json({
        encodedImage: "",
        payload: `VALIDACAO_PIX_${id}`,
        expirationDate: "2099-01-01",
      });
    if (path.includes("/customers")) {
      if (init.method === "GET") return Response.json({ data: [] });
      const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
      return Response.json({
        ...body,
        id: path.endsWith("/customers")
          ? `cus_${id}`
          : decodeURIComponent(path.split("/").at(-1)!),
      });
    }
    if (path.includes("/checkouts"))
      return Response.json({
        id: `chk_${id}`,
        status: "ACTIVE",
        url: `http://127.0.0.1:5173/obrigado?mock=${id}`,
        checkoutUrl: `http://127.0.0.1:5173/obrigado?mock=${id}`,
        link: `http://127.0.0.1:5173/obrigado?mock=${id}`,
      });
    if (path.includes("/payments"))
      return Response.json(
        init.method === "GET" && path.endsWith("/payments")
          ? { data: [], hasMore: false }
          : {
              id: `pay_${id}`,
              status: "PENDING",
              billingType: "PIX",
              ...(typeof init.body === "string" ? JSON.parse(init.body) : {}),
              value:
                typeof init.body === "string"
                  ? JSON.parse(init.body).value ||
                    JSON.parse(init.body).totalValue ||
                    120
                  : 120,
              invoiceUrl: `http://127.0.0.1:5173/obrigado?mock=${id}`,
            },
      );
    if (path.includes("/installments"))
      return Response.json({ id: `ins_${id}`, data: [] });
  }
  if (provider === "brevo") return Response.json({ messageId: `mock_${id}` });
  if (provider === "uazapi")
    return Response.json({
      id,
      messageid: id,
      messageId: id,
      status: "sent",
      connected: true,
      instance: { status: "connected" },
      data: [],
      participants: [],
    });
  throw new ApiError(
    503,
    `Provider ${provider} exige fixture explícito para este cenário.`,
    "mock_fixture_required",
  );
}
export function providerFetch(session: SessionContext): typeof fetch {
  return async (input, init = {}) => {
    const raw = input instanceof Request ? input.url : String(input);
    const url = new URL(rewrite(raw, session.env));
    const provider = providerFor(url, session.env);
    if (provider === "app")
      throw new ApiError(
        503,
        "Chamada interna deve usar o registro de funções.",
      );
    if (typeof init.body === "string")
      init = { ...init, body: rewrite(init.body, session.env) };
    if (session.env.PROVIDER_MODE === "mock") {
      if (session.env.APP_ENV !== "local" && session.env.APP_ENV !== "test")
        throw new ApiError(503, "Mocks permitidos somente em desenvolvimento.");
      return mockResponse(provider, url, init, session.requestId);
    }
    const method = (init.method || "GET").toUpperCase();
    const mutating = !["GET", "HEAD"].includes(method);
    if (
      mutating &&
      session.env.EXTERNAL_SIDE_EFFECTS !== "true" &&
      !["openai"].includes(provider)
    )
      throw new ApiError(
        503,
        "Integrações externas estão desativadas.",
        "external_side_effects_disabled",
      );
    if (provider === "brevo" && typeof init.body === "string") {
      const email = configValue(session.env, "EMAIL_FROM");
      if (!email)
        throw new ApiError(
          503,
          "Configure EMAIL_FROM.",
          "configuration_required",
        );
      const body = JSON.parse(init.body);
      body.sender = {
        email,
        name: configValue(session.env, "EMAIL_FROM_NAME") || "M31",
      };
      init = { ...init, body: JSON.stringify(body) };
    }
    if (
      session.env.APP_ENV !== "production" &&
      provider === "asaas" &&
      url.hostname !== "api-sandbox.asaas.com"
    )
      throw new ApiError(403, "Homologação exige Asaas sandbox.");
    if (
      mutating &&
      session.env.APP_ENV !== "production" &&
      ["uazapi", "brevo"].includes(provider)
    ) {
      const allowed = (configValue(session.env, "TEST_RECIPIENTS") || "")
        .split(",")
        .filter(Boolean);
      const body = typeof init.body === "string" ? init.body : "";
      if (
        !allowed.length ||
        !allowed.some((recipient) => body.includes(recipient))
      )
        throw new ApiError(
          403,
          "Configure destinatários sintéticos permitidos para homologação.",
        );
    }
    const headers = new Headers(init.headers);
    headers.set("User-Agent", "M31-independent/1");
    if (provider === "asaas") {
      if (headers.has("access-token") && !headers.has("access_token")) {
        headers.set("access_token", headers.get("access-token")!);
        headers.delete("access-token");
      }
      const asaasKey = configValue(session.env, "ASAAS_API_KEY");
      if (asaasKey && !headers.has("access_token")) {
        headers.set("access_token", asaasKey);
      }
    }
    let key: string | undefined;
    if (mutating && provider !== "openai") {
      key = await sha256(
        `${session.requestId}:${provider}:${method}:${url.pathname}:${typeof init.body === "string" ? init.body : ""}`,
      );
      const { data: prior } = await session.db
        .from("m31_provider_attempts")
        .select("*")
        .eq("key", key)
        .maybeSingle();
      if (prior?.status === "completed")
        return Response.json(prior.response, { status: prior.response_status });
      if (prior)
        throw new ApiError(
          409,
          "Operação externa pendente de conferência.",
          "provider_outcome_uncertain",
        );
      const { error } = await session.db
        .from("m31_provider_attempts")
        .insert({ key, provider, status: "started" });
      if (error) throw new ApiError(409, "Operação externa já iniciada.");
    }
    try {
      const response = await fetch(url, {
        ...init,
        headers,
        signal: init.signal || AbortSignal.timeout(25000),
      });
      if (key) {
        const result = await response
          .clone()
          .json()
          .catch(() => ({}));
        await session.db
          .from("m31_provider_attempts")
          .update({
            status: "completed",
            response: result,
            response_status: response.status,
          })
          .eq("key", key);
      }
      return response;
    } catch {
      if (key)
        await session.db
          .from("m31_provider_attempts")
          .update({ status: "uncertain" })
          .eq("key", key);
      throw new ApiError(
        503,
        "Falha no provider. Confira o resultado antes de reenviar.",
        "provider_outcome_uncertain",
      );
    }
  };
}
export async function googleConnection(env: RuntimeEnv) {
  const clientId = configValue(env, "GOOGLE_CLIENT_ID"),
    clientSecret = configValue(env, "GOOGLE_CLIENT_SECRET"),
    refreshToken = configValue(env, "GOOGLE_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken)
    throw new ApiError(
      503,
      "Configure o OAuth do Google Drive.",
      "configuration_required",
    );
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15000),
  });
  const body = (await response.json()) as JsonRecord;
  if (!response.ok || !body.access_token)
    throw new ApiError(503, "OAuth Google indisponível.");
  return { accessToken: body.access_token as string };
}
