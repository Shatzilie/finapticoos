# Using shared semantic memory

`crm.agent_shared_memory` is a single pgvector-backed table that every Finaptico agent (FinapticoOS plugins, n8n workflows, future Sprint 1 Editors) can write to and search. Embeddings come from OpenAI `text-embedding-3-small` (1536 dimensions). The package wrapping it is `@finapticoos/memory`.

## Write

```ts
import {
  createMemoryClient,
  createEmbeddingsClient,
  createMemoryHelpers,
} from "@finapticoos/memory";

const client = createMemoryClient();
const memory = createMemoryHelpers({
  client,
  embeddings: createEmbeddingsClient(),
});

const { id } = await memory.writeMemory({
  scope: "prospect:marta-bellot",
  content: "Marta lleva ERP Odoo en consultoría y nos preguntó por dashboards de control financiero.",
  createdBy: "plugin:hello-world",
  metadata: {
    sourceMeetingId: "uuid-of-meeting",
    confidence: "high",
  },
  // expiresAt: new Date("2026-12-31T00:00:00Z"),  // optional
});
```

## Search semantic

```ts
const hits = await memory.searchMemory({
  scope: "prospect:marta-bellot",
  query: "ERP odoo dashboards",
  limit: 5,
  minSimilarity: 0.7,
});
// → [{ id, scope, content, similarity, metadata, createdBy, createdAt, ... }]
```

`similarity` is in `[0, 1]` (`1 - cosine_distance`). The default index is `ivfflat` with 100 lists — tune the lists value when the table grows past 1M rows (rule of thumb `lists ≈ rows / 1000`).

## Forget / prune

```ts
// Remove a single row by id (e.g. retract an opinion)
await memory.forgetMemory(id);

// Remove every row whose expires_at is in the past
const { deleted } = await memory.pruneExpired();
```

## Scope conventions

Pick a stable key shape so multiple plugins/agents can share the same memory pool without colliding:

- `prospect:<slug>` — facts about a prospect.
- `client:<slug>` — facts about an active client (YMBI, Blacktar, etc).
- `agent:<slug>` — operational notes about an agent (Berta, Marc).
- `topic:<slug>` — cross-cutting topics (e.g. `topic:fiscal-q2-2026`).
- `plugin:<slug>` — internal plugin state that benefits from semantic recall.

## Cost note

Each `writeMemory` call generates ONE embedding (~0.0001 USD per call at current `text-embedding-3-small` pricing). Each `searchMemory` also generates one (the query embedding). Budget is shared with the CRM M8 RAG cron — same `OPENAI_API_KEY`. Cap: 5 USD/month total across the Finaptico stack.

## Schema

See `packages/memory/migrations/0001_finapticoos_initial.sql` for the table DDL + the `ivfflat (embedding vector_cosine_ops)` index.
