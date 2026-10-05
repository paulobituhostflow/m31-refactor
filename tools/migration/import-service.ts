import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, digest, canonical } from "./crypto.mjs";
import { sealTokens } from "../../worker/runtime/vault";
import { tableName } from "../../worker/runtime/entities";
interface Options {
  secret: string;
  tokenKey: string;
  origin: string;
  stopAfterBatches?: number;
}
interface Link {
  entity: string;
  record_id: string;
  scope: string;
}
export async function importSnapshot(
  db: SupabaseClient,
  folder: string,
  snapshot: any,
  options: Options,
) {
  const { manifest, entities } = snapshot;
  const { data: active, error } = await db
    .from("m31_workflows")
    .select("id")
    .eq("enabled", true);
  if (error || active?.length)
    throw new Error("Importação exige workflows pausados.");
  if (!options.origin || !options.tokenKey)
    throw new Error("Configure APP_ORIGIN e TOKEN_ENCRYPTION_KEY.");
  const origin = new URL(options.origin);
  if (!["http:", "https:"].includes(origin.protocol))
    throw new Error("APP_ORIGIN inválido.");
  const mappings = new Map<string, { url: string; uri: string }>();
  for (const file of manifest.files) {
    const source = decrypt(
      Buffer.from(file.source, "base64"),
      options.secret,
    ).toString("utf8");
    const bytes = decrypt(
      await readFile(join(folder, file.path)),
      options.secret,
    );
    const id =
      file.id.slice(0, 8) +
      "-" +
      file.id.slice(8, 12) +
      "-4" +
      file.id.slice(13, 16) +
      "-a" +
      file.id.slice(17, 20) +
      "-" +
      file.id.slice(20, 32);
    const path = `migration/${file.id}`;
    const links: Link[] = [];
    function references(value: any, keys: string[], link: Omit<Link, "scope">) {
      if (value === source) {
        const scope = keys.some((k) => /^cartinha_|pastoral|audio/i.test(k))
          ? "cartinhas"
          : keys.some((k) => /comprovante|payment|finance|recibo/i.test(k))
            ? "finance"
            : "record";
        links.push({ ...link, scope });
      } else if (Array.isArray(value))
        for (const item of value) references(item, keys, link);
      else if (value && typeof value === "object")
        for (const [k, item] of Object.entries(value))
          references(item, [...keys, k], link);
    }
    for (const [entity, rows] of Object.entries(entities) as [string, any[]][])
      for (const row of rows)
        references(row, [], { entity, record_id: row.id });
    const branding =
      links.length > 0 &&
      links.every((link) => /Brand|EventPageConfig/.test(link.entity));
    const bucket = branding ? "m31-public" : "m31-private";
    const purpose = links.some((l) => l.scope === "cartinhas")
      ? "cartinhas"
      : links.some((l) => l.scope === "finance")
        ? "finance"
        : "migration";
    const { error: upload } = await db.storage
      .from(bucket)
      .upload(path, bytes, { upsert: true, contentType: file.mime_type });
    if (upload) throw new Error("Falha ao importar arquivo.");
    const { error: meta } = await db
      .from("m31_files")
      .upsert({
        id,
        bucket,
        path,
        purpose,
        original_name: file.id,
        mime_type: file.mime_type,
        size: file.size,
      });
    if (meta) throw new Error("Falha ao importar metadados.");
    for (const link of links) {
      const { error: relation } = await db
        .from("m31_file_links")
        .upsert({
          file_id: id,
          entity: link.entity,
          record_id: link.record_id,
        });
      if (relation) throw new Error("Falha no vínculo do arquivo.");
    }
    mappings.set(source, {
      url: `${origin.origin}/api/files/${id}`,
      uri: `supabase://${bucket}/${path}`,
    });
  }
  function replace(value: any, key = ""): any {
    if (typeof value === "string") {
      const mapped = mappings.get(value);
      return mapped ? (key.endsWith("_uri") ? mapped.uri : mapped.url) : value;
    }
    if (Array.isArray(value)) return value.map((item) => replace(item, key));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, replace(v, k)]),
      );
    return value;
  }
  let imported = 0,
    unchanged = 0,
    batches = 0;
  for (const [name, rows] of Object.entries(entities) as [string, any[]][]) {
    for (let start = 0; start < rows.length; start += 100) {
      const batch = rows.slice(start, start + 100);
      const { data: old, error: readError } = await db
        .from(tableName(name))
        .select("id,payload,revision")
        .in(
          "id",
          batch.map((row) => row.id),
        );
      if (readError) throw new Error("Não foi possível ler destino.");
      const changes = [];
      for (const raw of batch) {
        const row = replace(raw),
          prior = old?.find((r) => r.id === row.id),
          sourceHash = digest(canonical(row));
        if (prior?.payload?._migration_source_hash === sourceHash) {
          unchanged++;
          continue;
        }
        // Re-import cannot overwrite records changed by the new application after the snapshot.
        if (
          prior?.payload?._migration_source_hash &&
          digest(
            canonical(await plainPayload(prior.payload, options.tokenKey)),
          ) !== prior.payload._migration_source_hash
        )
          throw new Error(
            "Destino foi alterado após importação; exige reconciliação.",
          );
        const data = await sealTokens(
          { ...row, _migration_source_hash: sourceHash },
          options.tokenKey,
        );
        changes.push({
          entity: name,
          id: row.id,
          expected: prior?.revision ?? null,
          data,
        });
      }
      if (changes.length) {
        const { error: saved } = await db.rpc("m31_commit", {
          changes,
          suppress_events: true,
        });
        if (saved)
          throw new Error("Falha no lote; corrija a causa e reexecute.");
        imported += changes.length;
      }
      batches++;
      if (batches === options.stopAfterBatches)
        throw new Error("VALIDACAO interruption");
    }
  }
  return {
    success: true,
    imported,
    unchanged,
    files: manifest.files.length,
    automations: "paused",
    auth: "explicit_mapping_required",
  };
}
async function plainPayload(payload: any, key: string) {
  const { openTokens } = await import("../../worker/runtime/vault");
  const row = await openTokens(payload, key);
  delete row._migration_source_hash;
  return row;
}
