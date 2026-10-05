import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { encrypt } from "./crypto.mjs";
if (!process.argv.includes("--prepare-links"))
  throw new Error("Use --prepare-links; nenhum e-mail será enviado.");
if (
  !process.env.SUPABASE_URL ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY ||
  !process.env.APP_ORIGIN
)
  throw new Error("Configure o ambiente de destino.");
const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const links = [];
for (let offset = 0; ; offset += 1000) {
  const { data, error } = await db
    .from("m31_identities")
    .select("auth_id,email,legacy_user_id")
    .order("auth_id")
    .range(offset, offset + 999);
  if (error) throw new Error("Não foi possível ler identidades.");
  for (const identity of data || []) {
    const { data: link, error: failure } = await db.auth.admin.generateLink({
      type: "recovery",
      email: identity.email,
      options: { redirectTo: `${process.env.APP_ORIGIN}/m31-reset-password` },
    });
    if (failure || !link.properties?.action_link)
      throw new Error("Falha ao preparar recuperação.");
    links.push({
      legacy_user_id: identity.legacy_user_id,
      email: identity.email,
      url: link.properties.action_link,
    });
  }
  if ((data || []).length < 1000) break;
}
await mkdir("reports/private", { recursive: true, mode: 0o700 });
const output = resolve("reports/private/recovery-links.json.enc");
await writeFile(
  output,
  encrypt(
    Buffer.from(JSON.stringify(links)),
    process.env.EXPORT_ENCRYPTION_KEY,
  ),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({ prepared: links.length, sent: 0, encrypted: true }),
);
