# @finapticoos/adapter-anthropic-api

Anthropic API adapter for FinapticoOS plugins. Wraps `@anthropic-ai/sdk` with
prompt caching on by default and per-call cost tracking that lands in
`crm.finapticoos_actions_log`.

## Models

- `sonnet` → `claude-sonnet-4-6` (default).
- `haiku` → `claude-haiku-4-5-20251001` (opt-in for cheap, high-volume calls).

## Usage

```ts
import {
  createAnthropicClient,
  logAnthropicAction,
} from "@finapticoos/adapter-anthropic-api";
import {
  createAnthropicClient as _createAnthropicClient,
} from "@finapticoos/adapter-anthropic-api";
// server-only logger:
import { logAnthropicAction as _logAnthropicAction } from "@finapticoos/adapter-anthropic-api/server";
import { createMemoryClient } from "@finapticoos/memory";

const anthropic = createAnthropicClient(); // ANTHROPIC_API_KEY from env
const memory = createMemoryClient();

const result = await anthropic.sendMessage({
  // model: "haiku",   // opt-in cheaper model when reasoning depth is overkill
  system: "You are a CFO automation assistant for Finaptico.",
  messages: [{ role: "user", content: "Resumen del prospect Marta Bellot." }],
  tools: [
    {
      name: "lookup_prospect",
      description: "Returns prospect facts from the CRM.",
      input_schema: { type: "object", properties: { prospectId: { type: "string" } }, required: ["prospectId"] },
    },
  ],
  callerId: "plugin:hello-world",
});

await logAnthropicAction(memory, {
  actionType: "summarise_prospect",
  pluginId: "plugin-uuid-here",
  payload: { prospectId: "411ebb54-c7f8-44a1-9096-27d4b7c97912" },
  result: { summaryFirstChar: result.content[0]?.type ?? "?" },
  message: result,
});
```

## Prompt caching

When `enablePromptCaching` is left at its default (`true`), the adapter:

- Wraps `system` in a single `text` block with `cache_control: ephemeral`.
- Adds `cache_control: ephemeral` to the **last** tool only — Anthropic caches
  every block up to that breakpoint, so a single marker covers the whole tool
  catalogue.

The OpenAI/Anthropic skill rule for prompt caching is followed: pass system +
tools through the cache, leave per-call user content as the live tail.

## Cost tracking

`computeCostCents(model, usage)` returns the call cost in USD cents (rounded
**up** so cost trackers never under-bill). `logAnthropicAction` writes:

- `tokens_in` = `inputTokens + cacheCreationInputTokens + cacheReadInputTokens`
- `tokens_out` = `outputTokens`
- `cost_cents` = `result.costCents`
- `model` = the resolved Anthropic model id

Pricing constants live in `src/cost.ts`. Update them when Anthropic shifts
prices; `cost.test.ts` pins the math against the constants so a typo in the
table will fail CI.

## Env vars

```bash
ANTHROPIC_API_KEY=sk-ant-api03-...   # reuse the Finaptico stack key
```

## Smoke test (manual)

`vitest` covers the wiring. To verify against the real API:

```bash
ANTHROPIC_API_KEY=sk-ant-... \
  pnpm --filter @finapticoos/adapter-anthropic-api exec tsx -e \
  'import { createAnthropicClient } from "./src/index.js"; \
   const c = createAnthropicClient(); \
   const r = await c.sendMessage({ messages: [{ role: "user", content: "ping" }] }); \
   console.log(r.content[0], r.usage, r.costCents);'
```
