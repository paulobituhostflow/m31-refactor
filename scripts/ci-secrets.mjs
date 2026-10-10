import { writeFile } from "node:fs/promises";
const requiredKeys = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "TOKEN_ENCRYPTION_KEY",
];
// Empty optional secrets must not erase credentials already configured remotely.
// Supabase Auth SMTP/OAuth settings and migration keys are not Worker bindings.
const integrationKeys = [
  "ASAAS_API_KEY",
  "ASAAS_WEBHOOK_TOKEN",
  "UAZAPI_BASE_URL",
  "UAZAPI_TOKEN",
  "UAZAPI_WEBHOOK_TOKEN",
  "BREVO_API_KEY",
  "EMAIL_FROM",
  "EMAIL_FROM_NAME",
  "WHATSAPP_GROUP_INVITE",
  "TEST_RECIPIENTS",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
  "GOOGLE_CAMISAS_SHEET_ID",
  "GOOGLE_CARTINHAS_SHEET_NAME",
  "GOOGLE_BACKUP_FOLDER_NAME",
  "OPENAI_API_KEY",
  "OPENAI_TEXT_MODEL",
  "OPENAI_TRANSCRIPTION_MODEL",
];
for (const key of [
  ...requiredKeys,
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

const configuredKeys = [
  ...requiredKeys,
  ...integrationKeys.filter((key) => Boolean(process.env[key]?.trim())),
];
await writeFile(
  ".ci-secrets.json",
  JSON.stringify(
    Object.fromEntries(configuredKeys.map((key) => [key, process.env[key]])),
  ),
  { mode: 0o600, flag: "wx" },
);
console.log(
  "Configuração validada; segredos de infraestrutura e integrações preparados sem impressão.",
);
