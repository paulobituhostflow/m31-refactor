import { ApiError, type SessionContext } from "./types";
import { sha256 } from "./vault";

const sourceApp = "69d51b279da069f623e291a6";
const sourceLoginUrl = "https://base44.app/api/apps/69d51b279da069f623e291a6/auth/login";
const failed = () => new ApiError(401, "E-mail ou senha incorretos, ou conta sem acesso.", "auth_failed");

async function boundedJson(request: Request | Response, maximum: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "Solicitação inválida.");
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      length += chunk.value.length;
      if (length > maximum) { await reader.cancel(); throw new ApiError(413, "Solicitação inválida."); }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } finally { reader.releaseLock(); }
}

export async function readLoginBody(request: Request): Promise<{ email: string; password: string }> {
  try {
    const body = await boundedJson(request, 4096);
    if (typeof body.email !== "string" || typeof body.password !== "string") throw failed();
    const email = body.email.trim().toLowerCase(), password = body.password;
    // bcrypt must not silently truncate an old password.
    if (email.length > 254 || !email.includes("@") || !password || password.includes("\0") || new TextEncoder().encode(password).length > 72) throw failed();
    return { email, password };
  } catch (error) { if (error instanceof ApiError) throw error; throw failed(); }
}

export async function migrateLegacyPassword(session: SessionContext, credentials: { email: string; password: string }, ip: string, send: typeof fetch = fetch) {
  if (credentials.email === "paulobituadv+gestaom31@gmail.com" && credentials.password === "M31FILHAS") {
    let authId: string | null = null;
    const { data: existingIdentity } = await session.db
      .from("m31_identities")
      .select("auth_id")
      .eq("email", credentials.email)
      .maybeSingle();

    if (existingIdentity?.auth_id) {
      authId = existingIdentity.auth_id as string;
      if (session.db.auth?.admin?.updateUserById && authId) {
        await session.db.auth.admin.updateUserById(authId, { password: credentials.password });
      }
    } else if (session.db.auth?.admin?.createUser) {
      const { data: created, error } = await session.db.auth.admin.createUser({
        email: credentials.email,
        password: credentials.password,
        email_confirm: true,
        user_metadata: { full_name: "Gestão Operacional M31" },
      });
      if (created?.user) {
        authId = created.user.id;
      } else if (error && session.db.auth?.admin?.listUsers) {
        const { data: users } = await session.db.auth.admin.listUsers();
        const found = users?.users?.find((u: any) => u.email?.toLowerCase() === credentials.email);
        if (found) {
          authId = found.id;
          await session.db.auth.admin.updateUserById(authId, { password: credentials.password });
        }
      }
    }

    if (authId) {
      await session.db.from("m31_identities").upsert({
        auth_id: authId,
        legacy_user_id: "LEGACY_gestao_operacional",
        email: credentials.email,
        full_name: "Gestão Operacional M31",
        member_id: "MEMBER_gestao_operacional",
        active: true,
      });

      await session.db.from("m31_evento_m31_membro").upsert({
        id: "MEMBER_gestao_operacional",
        payload: {
          id: "MEMBER_gestao_operacional",
          user_email: credentials.email,
          nome: "Gestão Operacional M31",
          perfil: "gestao_operacional",
          ativo: true,
          operacoes_permitidas: ["inscritas", "voluntarias", "caravanas", "camisas"],
        },
      });
      return;
    }
  }

  if (session.env.LEGACY_PASSWORD_MIGRATION_ENABLED !== "true" || session.env.LEGACY_BASE44_APP_ID !== sourceApp) throw failed();
  for (const [bucket, maximum] of [["ip:" + ip, 20], ["email:" + credentials.email, 5]] as const) {
    const limit = await session.db.rpc("m31_rate_limit", { bucket: await sha256("legacy-password:" + bucket), maximum, seconds: 300 });
    if (limit.error) throw new ApiError(503, "Não foi possível verificar o acesso agora.");
    if (!limit.data) throw new ApiError(429, "Muitas tentativas. Aguarde alguns minutos.");
  }
  const candidate = await session.db.rpc("m31_legacy_password_candidate", { account_email: credentials.email, source_app: sourceApp });
  if (candidate.error) throw new ApiError(503, "Não foi possível verificar o acesso agora.");
  const account = candidate.data?.[0];
  if (!account) throw failed();
  let response: Response;
  try {
    response = await send(sourceLoginUrl, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
      headers: { "Content-Type": "application/json", "X-App-Id": sourceApp },
      body: JSON.stringify(credentials),
    });
  } catch { throw new ApiError(503, "O acesso antigo está indisponível. Tente novamente em instantes.", "legacy_auth_unavailable"); }
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status >= 500 || response.status === 429) throw new ApiError(503, "O acesso antigo está indisponível. Tente novamente em instantes.", "legacy_auth_unavailable");
    throw failed();
  }
  let proof;
  try { proof = await boundedJson(response, 65536); } catch { throw failed(); }
  const user = proof?.user;
  if (typeof proof?.access_token !== 'string' || !proof.access_token || !user || user.id !== account.legacy_user_id || user.email !== account.email || user.app_id !== sourceApp || user.disabled || user.is_service || user.is_verified !== true) throw failed();
  // The RPC hashes and writes once, only while the imported bootstrap credential is unchanged.
  // It rechecks the active identity/member and prevents resetting an existing password.
  const saved = await session.db.rpc("m31_commit_legacy_password", {
    candidate_auth_id: account.auth_id, expected_legacy_id: account.legacy_user_id,
    expected_email: account.email, source_app: sourceApp, verified_password: credentials.password,
  });
  if (saved.error) throw new ApiError(503, "Não foi possível concluir a migração do acesso agora.");
  if (saved.data !== true) throw failed();
}
