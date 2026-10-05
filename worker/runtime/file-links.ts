import type { SessionContext, JsonRecord } from "./types";
import { ApiError } from "./types";
import type { Change } from "./entities";
import { fileRecord, requireLetterAuthor } from "./integrations";
export async function authorizeFileLinks(
  changes: Change[],
  session: SessionContext,
) {
  const links: JsonRecord[] = [];
  async function visit(
    value: unknown,
    keys: string[],
    entity: string,
    id: string,
  ): Promise<void> {
    if (Array.isArray(value)) {
      for (const item of value) await visit(item, keys, entity, id);
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value))
        await visit(item, [...keys, key], entity, id);
      return;
    }
    if (typeof value !== "string") return;
    let fileId: string | undefined;
    if (value.startsWith("supabase://")) {
      const uri = value.slice(11),
        slash = uri.indexOf("/");
      const { data, error } = await session.db
        .from("m31_files")
        .select("id")
        .eq("bucket", uri.slice(0, slash))
        .eq("path", uri.slice(slash + 1))
        .maybeSingle();
      if (error || !data)
        throw new ApiError(404, "Arquivo referenciado não encontrado.");
      fileId = data.id;
    } else {
      try {
        const url = new URL(value, session.env.APP_ORIGIN);
        if (
          url.origin === new URL(session.env.APP_ORIGIN).origin &&
          /^\/api\/files\/[^/]+$/.test(url.pathname)
        )
          fileId = url.pathname.split("/").at(-1);
      } catch {
        return;
      }
    }
    if (!fileId) return;
    await fileRecord(session, fileId);
    const scope = keys.some((k) => /^cartinha_|pastoral/i.test(k))
      ? "cartinhas"
      : keys.some((k) => /comprovante|finance|recibo/i.test(k))
        ? "finance"
        : "record";
    if (scope === "cartinhas" && !session.internal)
      await requireLetterAuthor(session);
    links.push({ file_id: fileId, entity, record_id: id, scope });
  }
  for (const change of changes)
    if (change.data) await visit(change.data, [], change.entity, change.id);
  return links;
}
