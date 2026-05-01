import { describe, expect, it, vi } from "vitest";
import {
  getProspect,
  getProspectsByStatus,
  getMeeting,
  getMeetingsForProspect,
  getInteractionsForProspect,
  getProspectDossier,
} from "../index.js";
import type { InteractionRow, MeetingRow, ProspectRow } from "../schema.js";

function fakeProspect(id: string, overrides: Partial<ProspectRow> = {}): ProspectRow {
  return {
    id,
    orgId: "org-1",
    origin: "calcom",
    status: "warm",
    preferredLanguage: "es",
    firstContactDate: null,
    discoveryDate: null,
    notes: null,
    createdAt: new Date("2026-04-30T00:00:00Z"),
    updatedAt: null,
    ...overrides,
  };
}

function fakeMeeting(id: string, overrides: Partial<MeetingRow> = {}): MeetingRow {
  return {
    id,
    orgId: "org-1",
    title: "Discovery — Marta",
    meetingDate: new Date("2026-05-01T10:00:00Z"),
    durationMinutes: 30,
    attendees: null,
    meetingType: "discovery",
    summary: null,
    decisions: null,
    notes: null,
    fathomUrl: null,
    fathomTranscript: null,
    externalId: null,
    source: "calcom",
    status: "scheduled",
    createdAt: null,
    ...overrides,
  };
}

function fakeInteraction(id: string, overrides: Partial<InteractionRow> = {}): InteractionRow {
  return {
    id,
    prospectId: "p-1",
    interactionType: "research",
    interactionDate: new Date("2026-04-29T08:00:00Z"),
    summary: null,
    insightsPositive: null,
    insightsNegative: null,
    nextAction: null,
    notes: null,
    createdAt: null,
    ...overrides,
  };
}

/**
 * Mock chainable drizzle db. Each method returns a thenable that resolves to
 * the rows the test sets up — that mirrors how db.select().from().where()...
 * is awaited in the helpers without us importing real drizzle internals.
 */
function fakeDb<TRows>(rows: TRows[]) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    then: (resolve: (rows: TRows[]) => unknown) => resolve(rows),
  };
  const select = vi.fn(() => chain);
  return { db: { select } as never, chain, select };
}

describe("bridge helpers", () => {
  it("getProspect returns the row when found, null when missing", async () => {
    const found = fakeProspect("p-1");
    const a = fakeDb([found]);
    expect(await getProspect(a.db, "p-1")).toEqual(found);

    const b = fakeDb<ProspectRow>([]);
    expect(await getProspect(b.db, "p-missing")).toBeNull();
  });

  it("getProspectsByStatus returns array (newest first via orderBy)", async () => {
    const p1 = fakeProspect("p-1", { status: "qualified" });
    const p2 = fakeProspect("p-2", { status: "qualified" });
    const a = fakeDb([p1, p2]);
    const result = await getProspectsByStatus(a.db, "qualified");
    expect(result).toHaveLength(2);
    expect(a.chain.orderBy).toHaveBeenCalled();
  });

  it("getMeeting returns the row or null", async () => {
    const m = fakeMeeting("m-1");
    expect(await getMeeting(fakeDb([m]).db, "m-1")).toEqual(m);
    expect(await getMeeting(fakeDb<MeetingRow>([]).db, "missing")).toBeNull();
  });

  it("getMeetingsForProspect uses innerJoin against prospects on org_id", async () => {
    const m = fakeMeeting("m-1");
    const a = fakeDb([m]);
    await getMeetingsForProspect(a.db, "p-1");
    expect(a.chain.innerJoin).toHaveBeenCalled();
    expect(a.chain.where).toHaveBeenCalled();
  });

  it("getInteractionsForProspect filters by prospect_id, ordered desc", async () => {
    const i1 = fakeInteraction("i-1");
    const i2 = fakeInteraction("i-2");
    const a = fakeDb([i1, i2]);
    const result = await getInteractionsForProspect(a.db, "p-1");
    expect(result).toHaveLength(2);
    expect(a.chain.orderBy).toHaveBeenCalled();
  });

  it("getProspectDossier returns null when prospect missing (no extra queries)", async () => {
    const a = fakeDb<ProspectRow>([]);
    const result = await getProspectDossier(a.db, "p-missing");
    expect(result).toBeNull();
  });
});
