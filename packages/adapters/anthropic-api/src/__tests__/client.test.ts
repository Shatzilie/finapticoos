import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { messagesCreate } = vi.hoisted(() => ({
  messagesCreate: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: messagesCreate };
      constructor(public config: { apiKey: string }) {}
    },
  };
});

import { createAnthropicClient } from "../client.js";
import { MODELS } from "../types.js";

function buildResponse(overrides: Partial<{ inputTokens: number; outputTokens: number }> = {}) {
  return {
    id: "msg_test",
    model: MODELS.sonnet,
    stop_reason: "end_turn",
    content: [{ type: "text", text: "hello" }],
    usage: {
      input_tokens: overrides.inputTokens ?? 100,
      output_tokens: overrides.outputTokens ?? 50,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };
}

describe("AnthropicAdapterClient.sendMessage", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    messagesCreate.mockReset();
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("defaults to Sonnet 4.6 with prompt caching on system + last tool", async () => {
    messagesCreate.mockResolvedValueOnce(buildResponse());
    const client = createAnthropicClient();
    await client.sendMessage({
      system: "You are a finance assistant.",
      messages: [{ role: "user", content: "summarise" }],
      tools: [
        { name: "get_balance", description: "...", input_schema: { type: "object" } },
        { name: "post_invoice", description: "...", input_schema: { type: "object" } },
      ],
    });

    expect(messagesCreate).toHaveBeenCalledTimes(1);
    const params = messagesCreate.mock.calls[0]?.[0];
    expect(params.model).toBe(MODELS.sonnet);
    expect(params.max_tokens).toBe(4096);

    expect(Array.isArray(params.system)).toBe(true);
    expect(params.system[0]).toMatchObject({
      type: "text",
      text: "You are a finance assistant.",
      cache_control: { type: "ephemeral" },
    });

    expect(params.tools).toHaveLength(2);
    expect(params.tools[0].cache_control).toBeUndefined();
    expect(params.tools[1].cache_control).toEqual({ type: "ephemeral" });
  });

  it("opts into Haiku 4.5 when model:'haiku' is passed", async () => {
    messagesCreate.mockResolvedValueOnce({
      ...buildResponse(),
      model: MODELS.haiku,
    });
    const client = createAnthropicClient();
    await client.sendMessage({
      model: "haiku",
      messages: [{ role: "user", content: "fast call" }],
    });
    expect(messagesCreate.mock.calls[0]?.[0].model).toBe(MODELS.haiku);
  });

  it("returns usage stats and cost in cents based on the model", async () => {
    messagesCreate.mockResolvedValueOnce(buildResponse({ inputTokens: 1000, outputTokens: 500 }));
    const client = createAnthropicClient();
    const result = await client.sendMessage({
      messages: [{ role: "user", content: "x" }],
    });
    expect(result.usage).toEqual({
      inputTokens: 1000,
      outputTokens: 500,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    });
    // Sonnet: (1000 * 300 + 500 * 1500) / 1M = 1.05 cents → ceil to 2
    expect(result.costCents).toBe(2);
  });

  it("disables prompt caching when enablePromptCaching:false", async () => {
    messagesCreate.mockResolvedValueOnce(buildResponse());
    const client = createAnthropicClient();
    await client.sendMessage({
      system: "raw system",
      messages: [{ role: "user", content: "x" }],
      tools: [{ name: "t", description: "...", input_schema: { type: "object" } }],
      enablePromptCaching: false,
    });
    const params = messagesCreate.mock.calls[0]?.[0];
    expect(params.system).toBe("raw system");
    expect(params.tools[0].cache_control).toBeUndefined();
  });

  it("throws when ANTHROPIC_API_KEY is missing", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => createAnthropicClient()).toThrow(/ANTHROPIC_API_KEY missing/);
  });
});
