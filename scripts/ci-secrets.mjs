import { writeFile } from "node:fs/promises";
const keys = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "TOKEN_ENCRYPTION_KEY",
];
for (const key of [
  ...keys,
  "APP_ORIGIN",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
])
  if (!process.env[key])
    throw new Error(`Variável obrigatória ausente: ${key}`);
if (!["staging", "production"].includes(process.env.DEPLOY_ENV))
  throw new Error("Ambiente inválido.");
if (new URL(process.env.APP_ORIGIN).protocol !== "https:")
  throw new Error("APP_ORIGIN deve usar HTTPS.");
if (process.env.TOKEN_ENCRYPTION_KEY.length < 32)
  throw new Error("TOKEN_ENCRYPTION_KEY inválida.");
if (new URL(process.env.SUPABASE_URL).protocol !== "https:")
  throw new Error("Ambiente hospedado exige Supabase HTTPS.");
if (process.env.SUPABASE_PUBLISHABLE_KEY.startsWith("sb_secret_"))
  throw new Error("Chave privilegiada não pode ser pública.");

await writeFile(
  ".ci-secrets.json",
  JSON.stringify(
    Object.fromEntries(keys.map((key) => [key, process.env[key]])),
  ),
  { mode: 0o600 },
);
console.log(
  "Configuração obrigatória validada; segredos preparados sem impressão.",
);
