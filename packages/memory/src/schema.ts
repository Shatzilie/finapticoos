import { pgSchema, uuid, text, jsonb, timestamp, customType } from "drizzle-orm/pg-core";

const crmSchema = pgSchema("crm");

const vector = customType<{
  data: number[];
  driverData: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`;
  },
  toDriver(value) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value) {
    if (typeof value !== "string") return value as unknown as number[];
    const trimmed = value.replace(/^\[|\]$/g, "");
    return trimmed.length === 0 ? [] : trimmed.split(",").map(Number);
  },
});

export const agentSharedMemory = crmSchema.table("agent_shared_memory", {
  id: uuid("id").primaryKey().defaultRandom(),
  scope: text("scope").notNull(),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export type AgentSharedMemoryRow = typeof agentSharedMemory.$inferSelect;
export type AgentSharedMemoryInsert = typeof agentSharedMemory.$inferInsert;
