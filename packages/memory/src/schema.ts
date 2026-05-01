import {
  pgSchema,
  uuid,
  text,
  jsonb,
  timestamp,
  integer,
  customType,
} from "drizzle-orm/pg-core";

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

export const finapticoosUsers = crmSchema.table("finapticoos_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("admin"),
  status: text("status").notNull().default("active"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const finapticoosPlugins = crmSchema.table("finapticoos_plugins", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  version: text("version").notNull(),
  manifest: jsonb("manifest").$type<Record<string, unknown>>().notNull().default({}),
  status: text("status").notNull().default("pending"),
  installedAt: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
  installedBy: uuid("installed_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const finapticoosApprovals = crmSchema.table("finapticoos_approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  pluginId: uuid("plugin_id"),
  actionType: text("action_type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  status: text("status").notNull().default("pending"),
  requestedBy: text("requested_by"),
  decidedBy: uuid("decided_by"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decisionNote: text("decision_note"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const finapticoosActionsLog = crmSchema.table("finapticoos_actions_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  pluginId: uuid("plugin_id"),
  approvalId: uuid("approval_id"),
  actionType: text("action_type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  result: jsonb("result").$type<Record<string, unknown>>().notNull().default({}),
  status: text("status").notNull().default("pending"),
  executedBy: uuid("executed_by"),
  approvedBy: uuid("approved_by"),
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  costCents: integer("cost_cents").notNull().default(0),
  model: text("model"),
  executedAt: timestamp("executed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FinapticoosUserRow = typeof finapticoosUsers.$inferSelect;
export type FinapticoosPluginRow = typeof finapticoosPlugins.$inferSelect;
export type FinapticoosApprovalRow = typeof finapticoosApprovals.$inferSelect;
export type FinapticoosActionLogRow = typeof finapticoosActionsLog.$inferSelect;
export type FinapticoosActionLogInsert = typeof finapticoosActionsLog.$inferInsert;
