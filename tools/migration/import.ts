import { writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { readSnapshot } from "./validate.mjs";
import { importSnapshot } from "./import-service";
const folder = resolve(process.argv[2] || "exports/m31");
const snapshot = await readSnapshot(folder, process.env.EXPORT_ENCRYPTION_KEY);
if (process.argv.includes("--dry-run")) {
  console.log(
    JSON.stringify({
      valid: true,
      dry_run: true,
      entities: Object.keys(snapshot.entities).length,
      files: snapshot.manifest.files.length,
    }),
  );
  process.exit(0);
}
if (
  process.env.MIGRATION_TARGET === "production" &&
  (!process.argv.includes("--final-cutover") ||
    !process.argv.includes("--ack-write-freeze"))
)
  throw new Error(
    "Produção exige --final-cutover e --ack-write-freeze após conferência.",
  );
if (
  !["staging", "local", "production"].includes(
    process.env.MIGRATION_TARGET || "",
  )
)
  throw new Error(
    "Importação inicial exige MIGRATION_TARGET=staging ou local.",
  );
if (
  !process.env.SUPABASE_URL ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY ||
  !process.env.TOKEN_ENCRYPTION_KEY
)
  throw new Error("Configure Supabase e TOKEN_ENCRYPTION_KEY.");
if (
  process.env.MIGRATION_TARGET === "local" &&
  !["127.0.0.1", "localhost"].includes(
    new URL(process.env.SUPABASE_URL).hostname,
  )
)
  throw new Error("Importação local exige Supabase local.");
const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const report = await importSnapshot(db, folder, snapshot, {
  secret: process.env.EXPORT_ENCRYPTION_KEY!,
  tokenKey: process.env.TOKEN_ENCRYPTION_KEY,
  origin: process.env.APP_ORIGIN!,
});
await writeFile(
  join(folder, "import-report.json"),
  JSON.stringify(report, null, 2),
  { mode: 0o600 },
);
console.log(JSON.stringify(report));
