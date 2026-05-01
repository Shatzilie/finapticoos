import { eq, desc, and } from "drizzle-orm";
import {
  prospects,
  meetings,
  interactions,
  type ProspectRow,
  type MeetingRow,
  type InteractionRow,
} from "./schema.js";
import type { BridgeClient, BridgeDb } from "./client.js";

export {
  prospects,
  meetings,
  interactions,
  type ProspectRow,
  type MeetingRow,
  type InteractionRow,
} from "./schema.js";
export {
  createBridgeClient,
  type BridgeClient,
  type BridgeDb,
  type CreateBridgeClientOptions,
} from "./client.js";

function resolveDb(input: BridgeClient | BridgeDb): BridgeDb {
  return "db" in input ? input.db : input;
}

/** Fetch a single prospect row by id. Returns null when no match. */
export async function getProspect(
  client: BridgeClient | BridgeDb,
  id: string,
): Promise<ProspectRow | null> {
  const db = resolveDb(client);
  const rows = await db
    .select()
    .from(prospects)
    .where(eq(prospects.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Fetch every prospect with the given status, newest first. Status values are
 * defined by the CRM (e.g. "warm", "qualified", "client", "lost") — the
 * bridge does not validate the value, the CRM is the source of truth.
 */
export async function getProspectsByStatus(
  client: BridgeClient | BridgeDb,
  status: string,
): Promise<ProspectRow[]> {
  const db = resolveDb(client);
  return db
    .select()
    .from(prospects)
    .where(eq(prospects.status, status))
    .orderBy(desc(prospects.createdAt));
}

/** Fetch a single meeting row by id. Returns null when no match. */
export async function getMeeting(
  client: BridgeClient | BridgeDb,
  id: string,
): Promise<MeetingRow | null> {
  const db = resolveDb(client);
  const rows = await db
    .select()
    .from(meetings)
    .where(eq(meetings.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Fetch every meeting linked to the same organisation as the given prospect.
 * Meetings are tied to organisations (org_id), not directly to prospects, so
 * we resolve through prospects.org_id. Returns newest first.
 */
export async function getMeetingsForProspect(
  client: BridgeClient | BridgeDb,
  prospectId: string,
): Promise<MeetingRow[]> {
  const db = resolveDb(client);
  return db
    .select({
      id: meetings.id,
      orgId: meetings.orgId,
      title: meetings.title,
      meetingDate: meetings.meetingDate,
      durationMinutes: meetings.durationMinutes,
      attendees: meetings.attendees,
      meetingType: meetings.meetingType,
      summary: meetings.summary,
      decisions: meetings.decisions,
      notes: meetings.notes,
      fathomUrl: meetings.fathomUrl,
      fathomTranscript: meetings.fathomTranscript,
      externalId: meetings.externalId,
      source: meetings.source,
      status: meetings.status,
      createdAt: meetings.createdAt,
    })
    .from(meetings)
    .innerJoin(prospects, eq(prospects.orgId, meetings.orgId))
    .where(eq(prospects.id, prospectId))
    .orderBy(desc(meetings.meetingDate));
}

/**
 * Fetch every interaction logged against the given prospect. Returns newest
 * first based on `interaction_date`.
 */
export async function getInteractionsForProspect(
  client: BridgeClient | BridgeDb,
  prospectId: string,
): Promise<InteractionRow[]> {
  const db = resolveDb(client);
  return db
    .select()
    .from(interactions)
    .where(eq(interactions.prospectId, prospectId))
    .orderBy(desc(interactions.interactionDate));
}

/**
 * Convenience: combined fetch for a "prospect dossier" — the prospect plus
 * its full interaction history plus every meeting on its organisation.
 * Plugins typically need all three at once when summarising for an agent.
 */
export interface ProspectDossier {
  prospect: ProspectRow;
  interactions: InteractionRow[];
  meetings: MeetingRow[];
}

export async function getProspectDossier(
  client: BridgeClient | BridgeDb,
  prospectId: string,
): Promise<ProspectDossier | null> {
  const prospect = await getProspect(client, prospectId);
  if (!prospect) return null;
  const [interactionRows, meetingRows] = await Promise.all([
    getInteractionsForProspect(client, prospectId),
    getMeetingsForProspect(client, prospectId),
  ]);
  return { prospect, interactions: interactionRows, meetings: meetingRows };
}
