import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
const raw = execFileSync(
  "npx",
  ["--no-install", "supabase", "status", "-o", "json"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
);
const status = JSON.parse(raw);
const url = status.API_URL || "http://127.0.0.1:54321";
const anon = status.ANON_KEY || status.PUBLISHABLE_KEY,
  service = status.SERVICE_ROLE_KEY || status.SECRET_KEY;
if (!anon || !service)
  throw new Error("Supabase local não retornou credenciais.");
let old = {};
try {
  old = Object.fromEntries(
    (await readFile(".dev.vars", "utf8"))
      .split("\n")
      .filter((line) => line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const encryption = old.TOKEN_ENCRYPTION_KEY || randomBytes(32).toString("hex");
await writeFile(
  ".env.local",
  `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_PUBLISHABLE_KEY=${anon}\n`,
  { mode: 0o600 },
);
const settings = {
  ...old,
  SUPABASE_URL: url,
  SUPABASE_SERVICE_ROLE_KEY: service,
  SUPABASE_PUBLISHABLE_KEY: anon,
  TOKEN_ENCRYPTION_KEY: encryption,
  APP_ORIGIN: "http://127.0.0.1:5173",
  PROVIDER_MODE: "mock",
  EXTERNAL_SIDE_EFFECTS: "false",
  AUTOMATIONS_ENABLED: "false",
  ASAAS_API_KEY: "LOCAL_MOCK_VALIDACAO",
  UAZAPI_TOKEN: "LOCAL_MOCK_VALIDACAO",
  BREVO_API_KEY: "LOCAL_MOCK_VALIDACAO",
  ASAAS_WEBHOOK_TOKEN:
    old.ASAAS_WEBHOOK_TOKEN || randomBytes(32).toString("hex"),
  UAZAPI_WEBHOOK_TOKEN:
    old.UAZAPI_WEBHOOK_TOKEN || randomBytes(32).toString("hex"),
};
await writeFile(
  ".dev.vars",
  Object.entries(settings)
    .map(([name, value]) => `${name}=${value}`)
    .join("\n") + "\n",
  { mode: 0o600 },
);
console.log("Ambiente local configurado sem imprimir credenciais.");
