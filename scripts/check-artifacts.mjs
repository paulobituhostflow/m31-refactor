import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
async function files(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await files(path)));
    else result.push(path);
  }
  return result;
}
const pkg = JSON.parse(await readFile("package.json", "utf8"));
if (
  Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).some((name) =>
    name.startsWith("@base44/"),
  )
)
  throw new Error("Dependência Base44 no runtime.");
let publicKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!publicKey) {
  try {
    const local = await readFile(".env.local", "utf8");
    publicKey = local
      .split("\n")
      .find((line) => line.startsWith("VITE_SUPABASE_PUBLISHABLE_KEY="))
      ?.split("=")
      .slice(1)
      .join("=")
      .trim();
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
if (publicKey && publicKey.startsWith("sb_secret_"))
  throw new Error("Chave privilegiada configurada no frontend.");
if (publicKey && publicKey.split(".").length === 3) {
  let payload;
  try {
    payload = JSON.parse(
      Buffer.from(publicKey.split(".")[1], "base64url").toString("utf8"),
    );
  } catch {
    throw new Error("Chave pública inválida.");
  }
  if (payload.role !== "anon")
    throw new Error("JWT privilegiado configurado no frontend.");
}
const patterns = [
  /https?:\/\/(?:[^/\s]*\.)?base44\.(?:com|app)\b/i,
  /\b(?:ghp_|github_pat_|sk-proj-|xkeysib-)[A-Za-z0-9_-]{20,}/,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
];
for (const folder of ["dist", ".worker-build"])
  for (const path of await files(folder)) {
    if (!/\.(?:js|html|css)$/.test(path)) continue;
    let content = await readFile(path, "utf8");
    if (publicKey)
      content = content.replaceAll(publicKey, "PUBLIC_SUPABASE_KEY_ALLOWED");
    // Only the Worker may validate an old password against this exact source app.
    // The browser and all other source endpoints must remain independent.
    if (folder === '.worker-build')
      content = content.replaceAll('https://base44.app/api/apps/69d51b279da069f623e291a6/auth/login', 'TEMPORARY_LEGACY_AUTH_ALLOWED');
    if (patterns.some((pattern) => pattern.test(content)))
      throw new Error(`Build contém dependência da origem ou segredo: ${path}`);
  }
console.log(
  "Frontend independente; Worker permite apenas a autenticação legada temporária; padrões de segredos privilegiados ausentes.",
);
