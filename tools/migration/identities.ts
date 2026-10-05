import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("Configure Supabase de destino.");
const rows = JSON.parse(await readFile(process.argv[2], "utf8"));
if (!Array.isArray(rows))
  throw new Error("Use uma lista JSON de associações explícitas.");
const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
for (const row of rows) {
  if (!row.legacy_user_id || !row.email || !row.member_id)
    throw new Error("Mapeamento incompleto.");
  const { data: member, error: missing } = await db
    .from("m31_evento_m31_membro")
    .select("payload")
    .eq("id", row.member_id)
    .maybeSingle();
  if (missing || !member || member.payload.user_email !== row.email)
    throw new Error("Membro legado e e-mail não conferem.");
  const { data: existing } = await db
    .from("m31_identities")
    .select("*")
    .eq("legacy_user_id", row.legacy_user_id)
    .maybeSingle();
  if (existing) {
    if (existing.email !== row.email || existing.member_id !== row.member_id)
      throw new Error("Conflito de identidade exige revisão.");
    continue;
  }
  let authId = row.auth_id;
  if (authId) {
    const { data, error } = await db.auth.admin.getUserById(authId);
    if (error || data.user?.email?.toLowerCase() !== row.email.toLowerCase())
      throw new Error(
        "UUID de autenticação não corresponde ao e-mail informado.",
      );
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email: row.email,
      email_confirm: false,
      user_metadata: { full_name: row.full_name || "" },
    });
    if (error || !data.user)
      throw new Error(
        "Conta não criada; se já existir, informe seu auth_id explicitamente.",
      );
    authId = data.user.id;
  }
  const { error: saved } = await db
    .from("m31_identities")
    .insert({
      auth_id: authId,
      legacy_user_id: row.legacy_user_id,
      email: row.email,
      full_name: row.full_name || "",
      member_id: row.member_id,
      active: false,
    });
  if (saved)
    throw new Error(
      "Falha ao vincular identidade; preserve o UUID e reexecute com auth_id.",
    );
}
console.log(
  JSON.stringify({
    prepared: rows.length,
    active: false,
    invitations_sent: false,
  }),
);
