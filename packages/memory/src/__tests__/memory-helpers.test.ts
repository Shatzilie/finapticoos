import { describe, expect, it, vi } from "vitest";
import { createMemoryHelpers } from "../index.js";
import type { EmbeddingsClient } from "../embeddings.js";

function fakeEmbeddings(vector: number[]): EmbeddingsClient {
  return {
    embed: vi.fn().mockResolvedValue(vector),
  };
}

function fakeDb(opts: {
  insertReturning?: Array<{ id: string }>;
  deleteReturning?: Array<{ id: string }>;
  executeRows?: Array<Record<string, unknown>>;
}) {
  const insertReturning = vi.fn().mockResolvedValue(opts.insertReturning ?? [{ id: "row-1" }]);
  const insertValues = vi.fn(() => ({ returning: insertReturning }));
  const insert = vi.fn(() => ({ values: insertValues }));

  const deleteReturning = vi.fn().mockResolvedValue(opts.deleteReturning ?? []);
  const deleteWhere = vi.fn(() => ({ returning: deleteReturning }));
  const deleteFn = vi.fn(() => ({ where: deleteWhere }));

  const execute = vi.fn().mockResolvedValue(opts.executeRows ?? []);

  // The shape mimics the chainable drizzle API enough for the helpers under
  // test. createMemoryHelpers only invokes these specific call sequences.
  return {
    db: { insert, delete: deleteFn, execute } as never,
    spies: { insert, insertValues, deleteFn, deleteWhere, execute },
  };
}

describe("memory helpers", () => {
  it("writeMemory embeds the content and inserts the row", async () => {
    const vector = Array.from({ length: 1536 }, () => 0.1);
    const embeddings = fakeEmbeddings(vector);
    const { db, spies } = fakeDb({ insertReturning: [{ id: "mem-123" }] });
    const helpers = createMemoryHelpers({ client: db, embeddings });

    const result = await helpers.writeMemory({
      scope: "prospect:marta-bellot",
      content: "Marta lleva ERP Odoo en consultoría",
      createdBy: "plugin:hello-world",
      metadata: { source: "berta-v1" },
    });

    expect(embeddings.embed).toHaveBeenCalledWith("Marta lleva ERP Odoo en consultoría");
    expect(spies.insert).toHaveBeenCalledTimes(1);
    expect(spies.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "prospect:marta-bellot",
        content: "Marta lleva ERP Odoo en consultoría",
        embedding: vector,
        createdBy: "plugin:hello-world",
        metadata: { source: "berta-v1" },
        expiresAt: null,
      }),
    );
    expect(result).toEqual({ id: "mem-123" });
  });

  it("searchMemory embeds the query and filters by similarity threshold", async () => {
    const vector = Array.from({ length: 1536 }, () => 0.2);
    const embeddings = fakeEmbeddings(vector);
    const { db, spies } = fakeDb({
      executeRows: [
        {
          id: "a",
          scope: "prospect:marta-bellot",
          content: "high match",
          metadata: {},
          created_by: "x",
          created_at: new Date("2026-05-01T00:00:00Z"),
          expires_at: null,
          similarity: "0.92",
        },
        {
          id: "b",
          scope: "prospect:marta-bellot",
          content: "low match",
          metadata: {},
          created_by: "x",
          created_at: new Date("2026-05-01T00:00:00Z"),
          expires_at: null,
          similarity: 0.55,
        },
      ],
    });
    const helpers = createMemoryHelpers({ client: db, embeddings });

    const results = await helpers.searchMemory({
      scope: "prospect:marta-bellot",
      query: "ERP odoo",
      limit: 5,
      minSimilarity: 0.7,
    });

    expect(embeddings.embed).toHaveBeenCalledWith("ERP odoo");
    expect(spies.execute).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("a");
    expect(results[0]?.similarity).toBeCloseTo(0.92);
  });

  it("forgetMemory deletes by id and reports row count", async () => {
    const helpers = createMemoryHelpers({
      client: fakeDb({ deleteReturning: [{ id: "mem-9" }] }).db,
      embeddings: fakeEmbeddings([]),
    });
    const result = await helpers.forgetMemory("mem-9");
    expect(result).toEqual({ deleted: 1 });
  });

  it("pruneExpired deletes nothing when nothing has expired", async () => {
    const helpers = createMemoryHelpers({
      client: fakeDb({ deleteReturning: [] }).db,
      embeddings: fakeEmbeddings([]),
    });
    const result = await helpers.pruneExpired(new Date("2026-05-01"));
    expect(result).toEqual({ deleted: 0 });
  });
});
