import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema.js";

export type MemoryDb = PostgresJsDatabase<typeof schema>;

export interface CreateMemoryClientOptions {
  /**
   * Connection string for the Supabase Finaptico Postgres. Can be either the
   * pooled DATABASE_URL or the direct DIRECT_URL — both work for the workloads
   * this package executes (vector search + low-volume writes).
   */
  url?: string;
  /** Maximum simultaneous connections in the pool. Defaults to 5. */
  max?: number;
  /** Connect timeout (seconds). Defaults to 10s. */
  connectTimeoutSeconds?: number;
}

const ENV_KEYS = [
  "FINAPTICOOS_MEMORY_DATABASE_URL",
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
    `@finapticoos/memory: no database URL configured. Set one of ${ENV_KEYS.join(", ")}.`,
  );
}

export interface MemoryClient {
  db: MemoryDb;
  raw: Sql;
  close(): Promise<void>;
}

export function createMemoryClient(options: CreateMemoryClientOptions = {}): MemoryClient {
  const url = resolveConnectionUrl(options.url);
  const raw = postgres(url, {
    max: options.max ?? 5,
    connect_timeout: options.connectTimeoutSeconds ?? 10,
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
