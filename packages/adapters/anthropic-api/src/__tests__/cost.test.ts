import { describe, expect, it } from "vitest";
import { computeCostCents, PRICING } from "../cost.js";

describe("computeCostCents", () => {
  it("prices a Sonnet 4.6 call with no caching using base rates", () => {
    const cost = computeCostCents("sonnet", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    });
    expect(cost).toBe(PRICING.sonnet.inputCentsPerMillion + PRICING.sonnet.outputCentsPerMillion);
  });

  it("prices a Haiku 4.5 call cheaper than Sonnet for the same usage", () => {
    const usage = {
      inputTokens: 500_000,
      outputTokens: 200_000,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    };
    const sonnetCost = computeCostCents("sonnet", usage);
    const haikuCost = computeCostCents("haiku", usage);
    expect(haikuCost).toBeLessThan(sonnetCost);
    expect(haikuCost).toBeGreaterThan(0);
  });

  it("charges more for cache writes and less for cache reads vs. base input", () => {
    const baseInput = computeCostCents("sonnet", {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    });
    const cacheWrite = computeCostCents("sonnet", {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 1_000_000,
      cacheReadInputTokens: 0,
    });
    const cacheRead = computeCostCents("sonnet", {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 1_000_000,
    });
    expect(cacheWrite).toBeGreaterThan(baseInput);
    expect(cacheRead).toBeLessThan(baseInput);
  });

  it("rounds up to keep cost trackers conservative (never under-billed)", () => {
    // 1 input token at 300 cents/M → 0.0003 cents → ceil to 1 cent
    const cost = computeCostCents("sonnet", {
      inputTokens: 1,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    });
    expect(cost).toBe(1);
  });

  it("returns 0 for an empty call", () => {
    const cost = computeCostCents("sonnet", {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    });
    expect(cost).toBe(0);
  });
});
