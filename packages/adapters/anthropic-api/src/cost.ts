import type { ModelKey, UsageStats } from "./types.js";

/**
 * Per-million-token prices in USD cents (× 100 to keep integer math).
 *
 * Source: Anthropic public pricing as of 2026-Q2. Adjust here when pricing
 * shifts; cost.test.ts pins the math against fixed prices.
 *
 * Cache write costs 25% more than base input; cache read costs 10% of base.
 */
export const PRICING: Record<
  ModelKey,
  {
    inputCentsPerMillion: number;
    outputCentsPerMillion: number;
    cacheWriteCentsPerMillion: number;
    cacheReadCentsPerMillion: number;
  }
> = {
  sonnet: {
    inputCentsPerMillion: 300,
    outputCentsPerMillion: 1500,
    cacheWriteCentsPerMillion: 375,
    cacheReadCentsPerMillion: 30,
  },
  haiku: {
    inputCentsPerMillion: 100,
    outputCentsPerMillion: 500,
    cacheWriteCentsPerMillion: 125,
    cacheReadCentsPerMillion: 10,
  },
};

/**
 * Compute cost in **cents** for a single API call. Always rounds up to keep
 * billed totals conservative — under-billing internal cost trackers is worse
 * than over-billing.
 */
export function computeCostCents(model: ModelKey, usage: UsageStats): number {
  const price = PRICING[model];
  const totalCents =
    (usage.inputTokens * price.inputCentsPerMillion) / 1_000_000 +
    (usage.outputTokens * price.outputCentsPerMillion) / 1_000_000 +
    (usage.cacheCreationInputTokens * price.cacheWriteCentsPerMillion) / 1_000_000 +
    (usage.cacheReadInputTokens * price.cacheReadCentsPerMillion) / 1_000_000;
  return Math.ceil(totalCents);
}
