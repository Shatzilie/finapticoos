import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema.js";

export type BridgeDb = PostgresJsDatabase<typeof schema>;

export interface CreateBridgeClientOptions {
  /**
   * Connection URL for the Finaptico CRM read-only role
   * (`finapticoos_reader`). Falls back to env vars in this priority:
   * FINAPTICOOS_BRIDGE_DATABASE_URL → SUPABASE_FINAPTICOOS_URL → DATABASE_URL.
   *
   * In production this URL MUST authenticate as `finapticoos_reader`, NOT as
   * the privileged `postgres` role: defense-in-depth for the CRM (a bug in
   * any plugin that consumes this bridge can never INSERT/UPDATE/DELETE on
   * crm.* because Postgres rejects it at the role level).
   */
  url?: string;
  /** Maximum simultaneous connections in the pool. Defaults to 5. */
  max?: number;
}

const ENV_KEYS = [
  "FINAPTICOOS_BRIDGE_DATABASE_URL",
  "SUPABASE_FINAPTICOOS_URL",
  "DATABASE_URL",
] as const;

function resolveConnectionUrl(explicit?: string): string {
  if (explicit && explicit.trim().length > 0) return explicit.trim();
  for (const key of ENV_KEYS) {
    const value = process.env[key];
    if (value && value.trim().length > 0) return value.trim();
  }
  throw new Error(
    `@finapticoos/bridge: no database URL configured. Set one of ${ENV_KEYS.join(", ")}.`,
  );
}

export interface BridgeClient {
  db: BridgeDb;
  raw: Sql;
  close(): Promise<void>;
}

export function createBridgeClient(options: CreateBridgeClientOptions = {}): BridgeClient {
  const url = resolveConnectionUrl(options.url);
  // prepare:false matches @finapticoos/memory and the db package — required
  // when the URL points at the Supabase Transaction pooler. Session pooler
  // and Direct connections also tolerate it without measurable cost.
  const raw = postgres(url, {
    max: options.max ?? 5,
    prepare: false,
  });
  const db = drizzle(raw, { schema });
  return {
    db,
    raw,
    async close() {
      await raw.end({ timeout: 5 });
    },
  };
}
