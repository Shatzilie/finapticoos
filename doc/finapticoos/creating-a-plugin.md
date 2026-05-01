# Creating a FinapticoOS plugin

> Sprint 0 baseline. The Editors (WP / LinkedIn / Vercel) of Sprint 1 follow this same shape.

## Two flavours

FinapticoOS supports two plugin shapes, and you pick based on UX:

1. **Paperclip-native plugin** — registers UI slots (dashboard widgets, settings panels) inside the Paperclip-style Company/Agent boards. Use this when the plugin needs to live inside the Paperclip Board UX. SDK: `@finapticoos/plugin-sdk` (`definePlugin`, `runWorker`, manifest with `apiVersion: 1`).
2. **FinapticoOS smoke / control-plane script** — a standalone TypeScript script that runs against the FinapticoOS extensions schema (`crm.finapticoos_*` + `crm.agent_shared_memory`) and the bridge to the Finaptico CRM. Use this for batch jobs, smoke tests, scheduled reports, and the inaugural Sprint 0 Bloque 9 case. SDK: just direct imports from `@finapticoos/bridge`, `@finapticoos/memory`, `@finapticoos/adapter-anthropic-api`.

Sprint 0's Bloque 9 case (`packages/finapticoos-smoke/src/run-marta.ts`) is the canonical example of flavour 2. The Sprint 1 Editors will likely be flavour 1 because they need UI controls.

## Decision rule

- Need a button / panel inside the Paperclip Board? → flavour 1.
- Need to read CRM, call an LLM, gate on human approval, run on a cron, all without UI? → flavour 2.
- Need both? → split: flavour 1 plugin for the UI, flavour 2 script for the heavy work, communicate via `crm.finapticoos_approvals` rows.

## Flavour 2 skeleton

```ts
// packages/your-plugin/src/run.ts
import { createBridgeClient, getProspectDossier } from "@finapticoos/bridge";
import { createAnthropicClient } from "@finapticoos/adapter-anthropic-api";
import { logAnthropicAction } from "@finapticoos/adapter-anthropic-api/server";
import {
  createMemoryClient,
  createEmbeddingsClient,
  createMemoryHelpers,
} from "@finapticoos/memory";

async function main() {
  const bridge = createBridgeClient();
  const anthropic = createAnthropicClient();
  const memoryClient = createMemoryClient();
  const memory = createMemoryHelpers({
    client: memoryClient,
    embeddings: createEmbeddingsClient(),
  });

  // your work here

  await Promise.all([bridge.close(), memoryClient.close()]);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
```

## Required env vars (every flavour 2 script reads these)

| Env var | Purpose |
|---|---|
| `FINAPTICOOS_BRIDGE_DATABASE_URL` | Read-only CRM access (role `finapticoos_reader`) |
| `FINAPTICOOS_MEMORY_DATABASE_URL` | Write access to `crm.finapticoos_*` + `crm.agent_shared_memory` |
| `OPENAI_API_KEY` | `text-embedding-3-small` embeddings for memory writes |
| `ANTHROPIC_API_KEY` | Sonnet 4.6 / Haiku 4.5 calls |

## Naming convention

`@finapticoos/your-plugin-name` if it lives in `packages/`. For Sprint 0 ad-hoc work prefer the `packages/finapticoos-*` namespace so the existing Paperclip plugin examples (`packages/plugins/examples/*`) stay reserved for the upstream SDK reference plugins.

## See also

- [`requesting-approval.md`](./requesting-approval.md) — gating actions on a human OK.
- [`using-shared-memory.md`](./using-shared-memory.md) — vector memory via pgvector.
- [`logging-actions.md`](./logging-actions.md) — audit + cost trail in `crm.finapticoos_actions_log`.
