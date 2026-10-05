import { authorizeFileLinks } from "./file-links";
import { openTokens, sealTokens } from "./vault";
import catalog from "../catalog/entities.json";
import {
  ApiError,
  type EntityApi,
  type JsonRecord,
  type SessionContext,
} from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";
export const entityNames = Object.keys(catalog);
export const tableName = (name: string) =>
  `m31_${name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()}`;
const copy = <T>(v: T): T => structuredClone(v);
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
function field(row: JsonRecord, key: string): any {
  return key.split(".").reduce((value, part) => value?.[part], row);
}
export function matches(row: JsonRecord, query: JsonRecord = {}): boolean {
  return Object.entries(query).every(([key, expected]) => {
    if (key === "$or")
      return Array.isArray(expected) && expected.some((q) => matches(row, q));
    if (key === "$and")
      return Array.isArray(expected) && expected.every((q) => matches(row, q));
    const actual = field(row, key);
    if (
      expected !== null &&
      typeof expected === "object" &&
      !Array.isArray(expected)
    ) {
      return Object.entries(expected).every(([op, v]) => {
        if (op === "$in")
          return (v as unknown[]).some((x) =>
            Array.isArray(actual)
              ? actual.some((item) => same(x, item))
              : same(x, actual),
          );
        if (op === "$nin")
          return !(v as unknown[]).some((x) =>
            Array.isArray(actual)
              ? actual.some((item) => same(x, item))
              : same(x, actual),
          );
        if (op === "$ne") return !same(actual, v);
        if (op === "$eq") return same(actual, v);
        if (op === "$exists")
          return v
            ? actual !== undefined && actual !== null
            : actual === undefined || actual === null;
        if (op === "$gt") return actual > (v as string | number);
        if (op === "$gte") return actual >= (v as string | number);
        if (op === "$lt") return actual < (v as string | number);
        if (op === "$lte") return actual <= (v as string | number);
        throw new ApiError(
          400,
          "Operador de filtro inválido.",
          "invalid_filter",
        );
      });
    }
    return expected === null ? actual == null : same(actual, expected);
  });
}
export function applyPatch(row: JsonRecord, patch: JsonRecord): JsonRecord {
  if (!Object.keys(patch).some((k) => k.startsWith("$")))
    return { ...row, ...copy(patch) };
  let result = { ...row, ...copy(patch.$set || {}) };
  for (const [k, v] of Object.entries(patch.$inc || {}))
    result[k] = Number(result[k] || 0) + Number(v);
  for (const k of Object.keys(patch.$unset || {})) delete result[k];
  for (const [k, v] of Object.entries(patch.$push || {}))
    result[k] = [...(result[k] || []), v];
  return result;
}
interface Snapshot {
  record: JsonRecord;
  revision: number;
}
export interface Change {
  entity: string;
  id: string;
  expected: number | null;
  data: JsonRecord | null;
}
export class UnitOfWork {
  private snapshots = new Map<string, Map<string, Snapshot>>();
  private loading = new Map<string, Promise<Map<string, Snapshot>>>();
  private pending = new Set<Promise<void>>();
  track<T>(execution: Promise<T>): Promise<T> {
    const settled = execution.then(
      () => {
        this.pending.delete(settled);
      },
      () => {
        this.pending.delete(settled);
      },
    );
    this.pending.add(settled);
    return execution;
  }
  async flush() {
    while (this.pending.size) await Promise.all([...this.pending]);
  }
  private session?: SessionContext;
  setSession(session: SessionContext) {
    this.session = session;
  }
  private staged = new Map<string, Change>();
  constructor(
    readonly db: SupabaseClient,
    readonly importMode = false,
    readonly tokenKey = "",
  ) {}
  private async load(name: string): Promise<Map<string, Snapshot>> {
    if (!entityNames.includes(name))
      throw new ApiError(404, "Entidade não disponível.", "unknown_entity");
    if (this.snapshots.has(name)) return this.snapshots.get(name)!;
    if (this.loading.has(name)) return this.loading.get(name)!;
    const loading = (async () => {
      const rows = new Map<string, Snapshot>();
      let cursor: string | undefined;
      for (let page = 0; ; page++) {
        if (page >= 100)
          throw new ApiError(503, "Consulta excedeu o limite operacional.");
        let query = this.db
          .from(tableName(name))
          .select("id,payload,revision")
          .order("id")
          .limit(1000);
        if (cursor) query = query.gt("id", cursor);
        const { data, error } = await query;
        if (error)
          throw new ApiError(
            503,
            "Banco indisponível.",
            error.code || "database_error",
          );
        for (const row of data || []) {
          if (rows.has(row.id))
            throw new ApiError(503, "Paginação inconsistente.");
          rows.set(row.id, {
            record: {
              ...(await openTokens(row.payload, this.tokenKey)),
              id: row.id,
            },
            revision: row.revision,
          });
        }
        if ((data || []).length < 1000) break;
        cursor = data![data!.length - 1].id;
      }
      this.snapshots.set(name, rows);
      return rows;
    })();
    this.loading.set(name, loading);
    return loading;
  }
  private async all(name: string) {
    const initial = await this.load(name);
    const rows = new Map(
      [...initial].map(([id, snap]) => [id, copy(snap.record)]),
    );
    for (const change of this.staged.values())
      if (change.entity === name) {
        if (change.data) rows.set(change.id, copy(change.data));
        else rows.delete(change.id);
      }
    return [...rows.values()];
  }
  entity(name: string): EntityApi {
    const filter = async (
      query: JsonRecord = {},
      sort: string | null = "-id",
      limit = 500,
      offset = 0,
    ) => {
      if (
        !Number.isInteger(limit) ||
        limit < 0 ||
        limit > 100000 ||
        !Number.isInteger(offset) ||
        offset < 0
      )
        throw new ApiError(400, "Paginação inválida.");
      const keys = (sort || "-id").split(",").filter(Boolean);
      if (!keys.some((k) => k.replace(/^-/, "") === "id")) keys.push("id");
      return (await this.all(name))
        .filter((r) => matches(r, query))
        .sort((a, b) => {
          for (const key of keys) {
            const desc = key.startsWith("-");
            const k = key.replace(/^-/, "");
            const av = field(a, k),
              bv = field(b, k);
            if (av === bv) continue;
            const result = av == null ? -1 : bv == null ? 1 : av < bv ? -1 : 1;
            return desc ? -result : result;
          }
          return 0;
        })
        .slice(offset, offset + limit);
    };
    const get = async (id: string) => {
      const row = (await this.all(name)).find((r) => r.id === id);
      if (!row)
        throw new ApiError(404, "Registro não encontrado.", "not_found");
      return copy(row);
    };
    const update = async (id: string, patch: JsonRecord) => {
      const original = await get(id);
      const data = {
        ...applyPatch(original, patch),
        id,
        created_date: original.created_date,
        updated_date: new Date().toISOString(),
      };
      if (patch.id && patch.id !== id) throw new ApiError(400, "ID imutável.");
      const expected = (await this.load(name)).get(id)?.revision ?? null;
      this.staged.set(`${name}:${id}`, { entity: name, id, expected, data });
      return copy(data);
    };
    const create = async (data: JsonRecord) => {
      const id = data.id || crypto.randomUUID();
      if ((await this.all(name)).some((r) => r.id === id))
        throw new ApiError(409, "Registro já existe.");
      const defaults = Object.fromEntries(
        Object.entries((catalog as JsonRecord)[name].properties || {})
          .filter(([, rule]) => (rule as JsonRecord).default !== undefined)
          .map(([field, rule]) => [field, copy((rule as JsonRecord).default)]),
      );
      const now = new Date().toISOString();
      const row = {
        ...defaults,
        ...copy(data),
        id,
        created_date: data.created_date || now,
        updated_date: data.updated_date || now,
      };
      this.staged.set(`${name}:${id}`, {
        entity: name,
        id,
        expected: null,
        data: row,
      });
      return copy(row);
    };
    return {
      list: (sort, limit, offset) => filter({}, sort, limit, offset),
      filter,
      get,
      create,
      update,
      delete: async (id) => {
        const row = await get(id);
        this.staged.set(`${name}:${id}`, {
          entity: name,
          id,
          expected: (await this.load(name)).get(id)?.revision ?? null,
          data: null,
        });
        return row;
      },
      updateMany: async (query, patch) => {
        const found = await filter(query, "-id", 100000);
        for (const row of found) await update(row.id, patch);
        return {
          updated: found.length,
          matched: found.length,
          modifiedCount: found.length,
        };
      },
      bulkCreate: async (rows) => {
        const results = [];
        for (const row of rows) results.push(await create(row));
        return results;
      },
      bulkUpdate: async (rows) => {
        const results = [];
        for (const row of rows)
          results.push(await update(row.id, row.data || row));
        return results;
      },
    };
  }
  get entities(): Record<string, EntityApi> {
    return new Proxy({}, { get: (_target, name) => this.entity(String(name)) });
  }
  get changes() {
    return [...this.staged.values()];
  }
  async commit() {
    await this.flush();
    if (!this.staged.size) return;
    const links = this.session
      ? await authorizeFileLinks(this.changes, this.session)
      : [];
    const { error } = await this.db.rpc(
      links.length ? "m31_commit_files" : "m31_commit",
      {
        ...(links.length ? { file_links: links } : {}),
        changes: await Promise.all(
          this.changes.map(async (change) => ({
            ...change,
            data: change.data
              ? await sealTokens(change.data, this.tokenKey)
              : null,
          })),
        ),
        suppress_events: this.importMode,
      },
    );
    if (error) {
      if (error.code === "40001" || error.code === "23505")
        throw new ApiError(
          409,
          "Os dados mudaram durante a operação. Atualize e tente novamente.",
          "concurrent_change",
        );
      throw new ApiError(
        503,
        "Não foi possível salvar a operação.",
        error.code || "commit_failed",
      );
    }
    this.staged.clear();
  }
}
