import type { SupabaseClient } from "@supabase/supabase-js";
export type JsonRecord = Record<string, any>; // Legacy entity fields are validated at domain boundaries and retain unknown historical fields.
export interface User {
  id: string;
  auth_id: string;
  email: string;
  full_name: string;
  role: string;
  membro?: JsonRecord;
}
export interface RuntimeEnv extends Omit<
  Cloudflare.Env,
  | "APP_ENV"
  | "APP_ORIGIN"
  | "PROVIDER_MODE"
  | "EXTERNAL_SIDE_EFFECTS"
  | "AUTOMATIONS_ENABLED"
> {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  APP_ENV: string;
  APP_ORIGIN: string;
  PROVIDER_MODE: string;
  EXTERNAL_SIDE_EFFECTS: string;
  AUTOMATIONS_ENABLED: string;
}
export interface EntityApi {
  list(
    sort?: string | null,
    limit?: number,
    offset?: number,
  ): Promise<JsonRecord[]>;
  filter(
    filter?: JsonRecord,
    sort?: string | null,
    limit?: number,
    offset?: number,
  ): Promise<JsonRecord[]>;
  get(id: string): Promise<JsonRecord>;
  create(data: JsonRecord): Promise<JsonRecord>;
  update(id: string, data: JsonRecord): Promise<JsonRecord>;
  delete(id: string): Promise<JsonRecord>;
  updateMany(
    filter: JsonRecord,
    patch: JsonRecord,
  ): Promise<{ updated: number; matched: number; modifiedCount: number }>;
  bulkCreate(data: JsonRecord[]): Promise<JsonRecord[]>;
  bulkUpdate(data: JsonRecord[]): Promise<JsonRecord[]>;
}
export interface LegacyClient {
  entities: Record<string, EntityApi>;
  auth: { me(): Promise<User>; updateMe(data: JsonRecord): Promise<User> };
  functions: {
    invoke(
      name: string,
      body?: JsonRecord,
    ): Promise<{ data: any; status: number }>;
  };
  integrations: { Core: Record<string, (args: JsonRecord) => Promise<any>> };
  connectors: { getConnection(name: string): Promise<{ accessToken: string }> };
  asServiceRole: LegacyClient;
}
export interface HandlerContext {
  client: LegacyClient;
  config(key: string): string | undefined;
  fetch: typeof fetch;
  health(): Promise<JsonRecord>;
  logger: Pick<Console, "log" | "warn" | "error" | "info" | "debug">;
}
export interface SessionContext {
  env: RuntimeEnv;
  db: SupabaseClient;
  user: User | null;
  internal: boolean;
  requestId: string;
  guestHash?: string;
  guestBody?: JsonRecord;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "request_failed",
  ) {
    super(message);
  }
}
