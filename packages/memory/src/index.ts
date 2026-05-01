import { sql, eq, and, lt } from "drizzle-orm";
import { agentSharedMemory } from "./schema.js";
import { createMemoryClient, type MemoryClient, type MemoryDb } from "./client.js";
import { createEmbeddingsClient, type EmbeddingsClient } from "./embeddings.js";

export { agentSharedMemory } from "./schema.js";
export type { AgentSharedMemoryRow, AgentSharedMemoryInsert } from "./schema.js";
export { createMemoryClient, type MemoryClient, type MemoryDb } from "./client.js";
export {
  createEmbeddingsClient,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  type EmbeddingsClient,
} from "./embeddings.js";

export interface MemoryWriteOptions {
  scope: string;
  content: string;
  createdBy: string;
  metadata?: Record<string, unknown>;
  expiresAt?: Date | null;
}

export interface MemorySearchOptions {
  scope: string;
  query: string;
  limit?: number;
  /** Cosine similarity threshold in [0,1]. Results below this are dropped. */
  minSimilarity?: number;
  /** Skip rows whose expires_at is in the past. Defaults to true. */
  excludeExpired?: boolean;
}

export interface MemorySearchResult {
  id: string;
  scope: string;
  content: string;
  metadata: Record<string, unknown>;
  createdBy: string;
  createdAt: Date;
  expiresAt: Date | null;
  similarity: number;
}

export interface MemoryHelperOptions {
  client: MemoryClient | MemoryDb;
  embeddings: EmbeddingsClient;
}

function resolveDb(input: MemoryClient | MemoryDb): MemoryDb {
  return "db" in input ? input.db : input;
}

export interface MemoryHelpers {
  writeMemory(options: MemoryWriteOptions): Promise<{ id: string }>;
  searchMemory(options: MemorySearchOptions): Promise<MemorySearchResult[]>;
  forgetMemory(id: string): Promise<{ deleted: number }>;
  pruneExpired(now?: Date): Promise<{ deleted: number }>;
}

export function createMemoryHelpers({ client, embeddings }: MemoryHelperOptions): MemoryHelpers {
  const db = resolveDb(client);

  return {
    async writeMemory({ scope, content, createdBy, metadata, expiresAt }) {
      const embedding = await embeddings.embed(content);
      const inserted = await db
        .insert(agentSharedMemory)
        .values({
          scope,
          content,
          embedding,
          createdBy,
          metadata: metadata ?? {},
          expiresAt: expiresAt ?? null,
        })
        .returning({ id: agentSharedMemory.id });
      const id = inserted[0]?.id;
      if (!id) {
        throw new Error("@finapticoos/memory: insert returned no id");
      }
      return { id };
    },

    async searchMemory({ scope, query, limit, minSimilarity, excludeExpired }) {
      const queryEmbedding = await embeddings.embed(query);
      const effectiveLimit = Math.max(1, Math.min(limit ?? 8, 100));
      const threshold = minSimilarity ?? 0;
      const skipExpired = excludeExpired ?? true;
      const literal = `[${queryEmbedding.join(",")}]`;

      const rows = await db.execute<{
        id: string;
        scope: string;
        content: string;
        metadata: Record<string, unknown>;
        created_by: string;
        created_at: Date;
        expires_at: Date | null;
        similarity: string | number;
      }>(sql`
        SELECT
          id,
          scope,
          content,
          metadata,
          created_by,
          created_at,
          expires_at,
          1 - (embedding <=> ${literal}::vector) AS similarity
        FROM crm.agent_shared_memory
        WHERE scope = ${scope}
          ${skipExpired ? sql`AND (expires_at IS NULL OR expires_at > now())` : sql``}
        ORDER BY embedding <=> ${literal}::vector ASC
        LIMIT ${effectiveLimit}
      `);

      return rows
        .map((row) => ({
          id: row.id,
          scope: row.scope,
          content: row.content,
          metadata: row.metadata,
          createdBy: row.created_by,
          createdAt: row.created_at,
          expiresAt: row.expires_at,
          similarity: typeof row.similarity === "string" ? Number(row.similarity) : row.similarity,
        }))
        .filter((row) => row.similarity >= threshold);
    },

    async forgetMemory(id) {
      const deleted = await db
        .delete(agentSharedMemory)
        .where(eq(agentSharedMemory.id, id))
        .returning({ id: agentSharedMemory.id });
      return { deleted: deleted.length };
    },

    async pruneExpired(now) {
      const cutoff = now ?? new Date();
      const deleted = await db
        .delete(agentSharedMemory)
        .where(
          and(
            // expires_at NOT NULL is implicit because lt(...) excludes NULLs
            lt(agentSharedMemory.expiresAt, cutoff),
          ),
        )
        .returning({ id: agentSharedMemory.id });
      return { deleted: deleted.length };
    },
  };
}
