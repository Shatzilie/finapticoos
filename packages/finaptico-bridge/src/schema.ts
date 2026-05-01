import { pgSchema, uuid, text, integer, jsonb, timestamp, date } from "drizzle-orm/pg-core";

const crmSchema = pgSchema("crm");

/**
 * Read-only mirror of the Finaptico CRM schema. Reconstructed from observed
 * INSERTs and SELECTs in the CRM repo (frontend/src/lib/agents/berta/context.ts,
 * frontend/src/app/api/webhooks/calcom/route.ts, frontend/scripts/seed.sql).
 *
 * The CRM uses Supabase JS (no Drizzle), so columns are inferred conservatively:
 * fields that always appear in selects are required; everything else is
 * nullable. If FinapticoOS plugins start querying additional fields, extend
 * here — but never write through this schema; the connection role
 * `finapticoos_reader` only has GRANT SELECT.
 */
export const prospects = crmSchema.table("prospects", {
  id: uuid("id").primaryKey(),
  orgId: uuid("org_id").notNull(),
  origin: text("origin"),
  status: text("status"),
  preferredLanguage: text("preferred_language"),
  firstContactDate: date("first_contact_date"),
  discoveryDate: date("discovery_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const meetings = crmSchema.table("meetings", {
  id: uuid("id").primaryKey(),
  orgId: uuid("org_id"),
  title: text("title"),
  meetingDate: timestamp("meeting_date", { withTimezone: true }),
  durationMinutes: integer("duration_minutes"),
  attendees: jsonb("attendees").$type<unknown>(),
  meetingType: text("meeting_type"),
  summary: text("summary"),
  decisions: text("decisions"),
  notes: text("notes"),
  fathomUrl: text("fathom_url"),
  fathomTranscript: text("fathom_transcript"),
  externalId: text("external_id"),
  source: text("source"),
  status: text("status"),
  createdAt: timestamp("created_at", { withTimezone: true }),
});

export const interactions = crmSchema.table("interactions", {
  id: uuid("id").primaryKey(),
  prospectId: uuid("prospect_id").notNull(),
  interactionType: text("interaction_type"),
  interactionDate: timestamp("interaction_date", { withTimezone: true }),
  summary: text("summary"),
  insightsPositive: text("insights_positive"),
  insightsNegative: text("insights_negative"),
  nextAction: text("next_action"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }),
});

export type ProspectRow = typeof prospects.$inferSelect;
export type MeetingRow = typeof meetings.$inferSelect;
export type InteractionRow = typeof interactions.$inferSelect;
