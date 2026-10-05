import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { UnitOfWork } from "./entities";
import { ApiError, type RuntimeEnv, type User } from "./types";
export function database(env: RuntimeEnv): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
    throw new ApiError(
      503,
      "Configure o Supabase para iniciar o backend.",
      "configuration_required",
    );
  if (
    env.APP_ENV === "local" &&
    !["127.0.0.1", "localhost"].includes(new URL(env.SUPABASE_URL).hostname)
  )
    throw new ApiError(503, "Desenvolvimento local exige Supabase local.");
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function authenticate(
  req: Request,
  db: SupabaseClient,
  work: UnitOfWork,
): Promise<User | null> {
  const header = req.headers.get("Authorization");
  if (!header) return null;
  if (!header.startsWith("Bearer "))
    throw new ApiError(401, "Sessão inválida.");
  const token = header.slice(7);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, "Sessão expirada.");
  const { data: identity } = await db
    .from("m31_identities")
    .select("*")
    .eq("auth_id", data.user.id)
    .maybeSingle();
  if (!identity || identity.active !== true)
    throw new ApiError(403, "Conta sem acesso ou revogada.");
  const member = (
    await work
      .entity("EventoM31Membro")
      .filter({ user_email: identity.email, ativo: true }, "-id", 100)
  ).find((m) => !identity.member_id || m.id === identity.member_id);
  return {
    id: identity.legacy_user_id,
    auth_id: data.user.id,
    email: identity.email,
    full_name: identity.full_name || data.user.user_metadata.full_name || "",
    role: member?.perfil === "super_admin" ? "admin" : "user",
    membro: member,
  };
}
export function requireUser(user: User | null): asserts user is User {
  if (!user) throw new ApiError(401, "Entre com sua conta.");
}
export function superAdmin(user: User | null) {
  return user?.role === "admin";
}
