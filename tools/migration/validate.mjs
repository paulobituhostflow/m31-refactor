import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { decrypt, digest } from "./crypto.mjs";
function safePath(folder, path) {
  const root = resolve(folder) + sep,
    target = resolve(folder, path);
  if (!target.startsWith(root)) throw new Error("Caminho fora do snapshot.");
  return target;
}
export async function readSnapshot(folder, secret) {
  const manifest = JSON.parse(
    await readFile(join(folder, "manifest.json"), "utf8"),
  );
  if (manifest.version !== 1 || !manifest.complete)
    throw new Error("Snapshot incompleto.");
  const entities = {};
  const errors = [];
  for (const [name, entry] of Object.entries(manifest.entities)) {
    const rows = [];
    const ids = new Set();
    for (const page of entry.pages) {
      const bytes = await readFile(safePath(folder, page.path));
      if (digest(bytes) !== page.sha256)
        throw new Error(`Checksum divergente: ${name}`);
      const records = decrypt(bytes, secret)
        .toString("utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map(JSON.parse);
      if (records.length !== page.count)
        throw new Error("Contagem divergente.");
      for (const row of records) {
        if (!row.id || ids.has(row.id))
          errors.push(`${name}: duplicate_or_missing_id`);
        ids.add(row.id);
        rows.push(row);
      }
    }
    if (rows.length !== entry.count) errors.push(`${name}: count_mismatch`);
    entities[name] = rows;
  }
  const references = {
    inscricao_id: "EventoM31Inscricao",
    caravana_id: "EventoM31Caravana",
    tarefa_id: "EventoM31Tarefa",
    edicao_id: "M31EdicaoEvento",
    fornecedor_id: "FinancialSupplier",
  };
  for (const [name, rows] of Object.entries(entities))
    for (const row of rows)
      for (const [field, target] of Object.entries(references)) {
        if (
          row[field] &&
          entities[target] &&
          !entities[target].some((record) => record.id === row[field])
        )
          errors.push(`${name}: broken_${field}`);
      }
  for (const file of manifest.files) {
    const bytes = await readFile(safePath(folder, file.path));
    if (
      digest(bytes) !== file.sha256 ||
      decrypt(bytes, secret).length !== file.size
    )
      errors.push("file_checksum_mismatch");
  }
  if (errors.length)
    throw new Error(`Snapshot reprovado: ${[...new Set(errors)].join(", ")}`);
  return { manifest, entities };
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const { manifest } = await readSnapshot(
    resolve(process.argv[2] || "exports/m31"),
    process.env.EXPORT_ENCRYPTION_KEY,
  );
  console.log(
    JSON.stringify({
      valid: true,
      entities: Object.keys(manifest.entities).length,
      records: Object.values(manifest.entities).reduce(
        (n, x) => n + x.count,
        0,
      ),
      files: manifest.files.length,
    }),
  );
}
