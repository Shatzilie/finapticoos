import { describe, expect, it, vi } from "vitest";
import { logAnthropicAction } from "../server/logger.js";
import { MODELS } from "../types.js";
import type { MessageResult } from "../types.js";

function fakeDb(insertedId = "log-1") {
  const returning = vi.fn().mockResolvedValue([{ id: insertedId }]);
  const values = vi.fn(() => ({ returning }));
  const insert = vi.fn(() => ({ values }));
  return {
    db: { insert } as never,
    spies: { insert, values, returning },
  };
}

function fakeMessage(overrides: Partial<MessageResult> = {}): MessageResult {
  return {
    id: "msg_1",
    model: MODELS.sonnet,
    stopReason: "end_turn",
    content: [{ type: "text", text: "ok" }],
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    },
    costCents: 2,
    ...overrides,
  };
}

describe("logAnthropicAction", () => {
  it("inserts an actions_log row using the message usage and cost", async () => {
    const { db, spies } = fakeDb();
    const result = await logAnthropicAction(db, {
      actionType: "summarise_prospect",
      pluginId: "plugin-uuid",
      payload: { prospectId: "marta" },
      result: { summary: "..." },
      message: fakeMessage(),
    });

    expect(spies.insert).toHaveBeenCalledTimes(1);
    expect(spies.values).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "summarise_prospect",
        pluginId: "plugin-uuid",
        payload: { prospectId: "marta" },
        result: { summary: "..." },
        status: "completed",
        tokensIn: 100,
        tokensOut: 50,
        costCents: 2,
        model: MODELS.sonnet,
      }),
    );
    expect(result).toEqual({ id: "log-1" });
  });

  it("counts cache_creation + cache_read against tokens_in to keep audit complete", async () => {
    const { db, spies } = fakeDb();
    await logAnthropicAction(db, {
      actionType: "x",
      message: fakeMessage({
        usage: {
          inputTokens: 100,
          outputTokens: 0,
          cacheCreationInputTokens: 200,
          cacheReadInputTokens: 300,
        },
      }),
    });
    expect(spies.values.mock.calls[0]?.[0]).toMatchObject({
      tokensIn: 600,
      tokensOut: 0,
    });
  });

  it("defaults pluginId / executedBy / approvedBy to null when not provided", async () => {
    const { db, spies } = fakeDb();
    await logAnthropicAction(db, {
      actionType: "free_call",
      message: fakeMessage(),
    });
    const inserted = spies.values.mock.calls[0]?.[0];
    expect(inserted.pluginId).toBeNull();
    expect(inserted.executedBy).toBeNull();
    expect(inserted.approvedBy).toBeNull();
    expect(inserted.approvalId).toBeNull();
  });
});
