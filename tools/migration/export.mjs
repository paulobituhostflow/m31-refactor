import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { resolve, join } from "node:path";
import { encrypt, digest } from "./crypto.mjs";
const catalog = JSON.parse(
  await readFile(
    new URL("../../worker/catalog/entities.json", import.meta.url),
    "utf8",
  ),
);
export async function exportSnapshot(
  source,
  output,
  secret,
  { pageSize = 500, stopAfter = Infinity } = {},
) {
  await mkdir(output, { recursive: true, mode: 0o700 });
  const manifestPath = join(output, "manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    manifest = {
      version: 1,
      complete: false,
      entities: {},
      files: [],
      created_at: new Date().toISOString(),
    };
  }
  if (manifest.complete) return manifest;
  let completed = 0;
  for (const name of Object.keys(catalog).sort()) {
    const entry = manifest.entities[name] || {
      count: 0,
      pages: [],
      complete: false,
    };
    manifest.entities[name] = entry;
    if (entry.complete) continue;
    const seen = new Set();
    for (const page of entry.pages) {
      const { decrypt } = await import("./crypto.mjs");
      const bytes = await readFile(join(output, page.path));
      if (digest(bytes) !== page.sha256)
        throw new Error("Checksum divergente antes da retomada.");
      for (const line of decrypt(bytes, secret)
        .toString("utf8")
        .trim()
        .split("\n")
        .filter(Boolean))
        seen.add(JSON.parse(line).id);
    }
    let offset = entry.count;
    while (true) {
      const rows = await source.list(
        name,
        "id",
        pageSize,
        offset,
        entry.last_id,
      );
      if (!Array.isArray(rows)) throw new Error(`Resposta inválida: ${name}`);
      for (const row of rows) {
        if (!row.id || seen.has(row.id))
          throw new Error(`Paginação inconsistente: ${name}`);
        seen.add(row.id);
      }
      if (rows.length) {
        const relative = `${name}/page-${String(entry.pages.length).padStart(6, "0")}.jsonl.enc`;
        await mkdir(join(output, name), { recursive: true, mode: 0o700 });
        const bytes = encrypt(
          Buffer.from(rows.map((row) => JSON.stringify(row)).join("\n") + "\n"),
          secret,
        );
        await writeFile(join(output, relative), bytes, { mode: 0o600 });
        entry.pages.push({
          path: relative,
          count: rows.length,
          sha256: digest(bytes),
        });
        entry.count += rows.length;
        offset += rows.length;
        entry.last_id = rows.at(-1).id;
      }
      entry.complete = rows.length < pageSize;
      await saveManifest(manifestPath, manifest);
      completed++;
      if (completed >= stopAfter) return manifest;
      if (entry.complete) break;
    }
  }
  const references = new Map();
  for (const [name, entity] of Object.entries(manifest.entities))
    for (const page of entity.pages) {
      const { decrypt } = await import("./crypto.mjs");
      const rows = decrypt(await readFile(join(output, page.path)), secret)
        .toString("utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map(JSON.parse);
      for (const row of rows)
        visit(row, (value, key) => {
          if (
            typeof value === "string" &&
            (/^https:\/\//.test(value) || value.startsWith("private:")) &&
            /file_url|file_uri|comprovante|anexo|imagem|foto|logo|image|audio|arquivo/i.test(
              key,
            )
          )
            references.set(value, { entity: name });
        });
    }
  for (const uri of references.keys()) {
    const id = digest(uri);
    if (manifest.files.some((file) => file.id === id)) continue;
    if (!source.download)
      throw new Error("Fonte não implementa exportação de arquivos.");
    const file = await source.download(uri);
    const bytes = encrypt(file.bytes, secret);
    const relative = `files/${id}.enc`;
    await mkdir(join(output, "files"), { recursive: true, mode: 0o700 });
    await writeFile(join(output, relative), bytes, { mode: 0o600 });
    manifest.files.push({
      id,
      path: relative,
      size: file.bytes.length,
      mime_type: file.mime_type,
      sha256: digest(bytes),
      source: encrypt(Buffer.from(uri), secret).toString("base64"),
    });
    await saveManifest(manifestPath, manifest);
  }
  manifest.complete = true;
  manifest.completed_at = new Date().toISOString();
  await saveManifest(manifestPath, manifest);
  return manifest;
}
function visit(value, callback, key = "") {
  if (Array.isArray(value))
    for (const item of value) visit(item, callback, key);
  else if (value && typeof value === "object")
    for (const [k, item] of Object.entries(value))
      visit(item, callback, key ? `${key}.${k}` : k);
  else callback(value, key);
}
async function saveManifest(path, data) {
  await writeFile(path + ".tmp", JSON.stringify(data, null, 2), {
    mode: 0o600,
  });
  await rename(path + ".tmp", path);
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    const output = resolve(process.argv[2] || "exports/m31");
    if (!process.argv.includes("--read-only"))
      throw new Error(
        "Use --read-only para confirmar a exportação somente de leitura.",
      );
    if (!process.env.BASE44_APP_ID || !process.env.BASE44_TOKEN)
      throw new Error("Configure BASE44_APP_ID e BASE44_TOKEN.");
    const { createClient } = await import("@base44/sdk");
    const sdk = createClient({
      appId: process.env.BASE44_APP_ID,
      token: process.env.BASE44_TOKEN,
      serverUrl: "https://base44.app",
    });
    const source = {
      list: (name, sort, limit, offset, cursor) =>
        sdk.entities[name].filter(
          cursor ? { id: { $gt: cursor } } : {},
          sort,
          limit,
          0,
        ),
      download: async (uri) => {
        let url = uri;
        if (uri.startsWith("private:")) {
          const result = await sdk.integrations.Core.CreateFileSignedUrl({
            file_uri: uri,
            expires_in: 600,
          });
          url = result.signed_url;
        }
        const parsed = new URL(url);
        const hosts = (
          process.env.BASE44_FILE_HOSTS || "media.base44.com,base44.app"
        )
          .split(",")
          .map((host) => host.trim())
          .filter(Boolean);
        if (parsed.protocol !== "https:" || !hosts.includes(parsed.hostname))
          throw new Error("URL de arquivo inválida.");
        const response = await fetch(parsed, {
          signal: AbortSignal.timeout(30000),
          redirect: "error",
        });
        if (!response.ok) throw new Error("Arquivo indisponível na origem.");
        if (
          Number(response.headers.get("content-length") || 0) >
          50 * 1024 * 1024
        )
          throw new Error("Arquivo excede 50 MiB.");
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > 50 * 1024 * 1024)
          throw new Error("Arquivo excede 50 MiB.");
        return {
          bytes,
          mime_type:
            response.headers.get("content-type") || "application/octet-stream",
        };
      },
    };
    const result = await exportSnapshot(
      source,
      output,
      process.env.EXPORT_ENCRYPTION_KEY,
    );
    console.log(
      JSON.stringify({
        complete: result.complete,
        entities: Object.keys(result.entities).length,
        records: Object.values(result.entities).reduce(
          (n, x) => n + x.count,
          0,
        ),
        files: result.files.length,
      }),
    );
  } catch {
    console.error(
      "Exportação interrompida. Confira acesso, hosts/tamanho dos arquivos e manifesto; detalhes do SDK foram omitidos para proteger credenciais.",
    );
    process.exitCode = 1;
  }
}
