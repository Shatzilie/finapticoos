# @finapticoos/memory

FinapticoOS shared semantic memory + control-plane schema, hosted on the
Finaptico Supabase project (`utwhvnafvtardndgkbjn`).

## What lives here

- `crm.finapticoos_users` — operadores humanos del control plane.
- `crm.finapticoos_plugins` — plugins instalados.
- `crm.finapticoos_approvals` — aprobaciones humanas pendientes / decididas.
- `crm.finapticoos_actions_log` — audit log inmutable (tokens + coste por acción).
- `crm.agent_shared_memory` — memoria semántica vector (1536d, OpenAI
  `text-embedding-3-small`) compartida entre agentes Finaptico.

## Apply the initial migration

The migration is plain SQL (no Drizzle Kit needed), idempotent, and
schema-namespaced under `crm.finapticoos_*`/`crm.agent_shared_memory` to avoid
touching anything else in the Finaptico Supabase project.

```bash
# from the repo root
psql "$DIRECT_URL" -f packages/memory/migrations/0001_finapticoos_initial.sql
```

`DIRECT_URL` is the Supabase direct connection (port 5432). If you only have
the pooler URL handy, use that — both work for DDL.

After it runs:
- `crm` schema exists (created if missing).
- `vector` and `pgcrypto` extensions are enabled.
- The 5 FinapticoOS tables exist with the indexes called out in the migration
  (ivfflat for embeddings + scope/status indexes for fast lookup).

## Required env vars

```bash
# Connection (any one of these; the helpers fall through in this order)
FINAPTICOOS_MEMORY_DATABASE_URL=postgresql://postgres:...@db.utwhvnafvtardndgkbjn.supabase.co:5432/postgres
SUPABASE_FINAPTICOOS_URL=...   # alias accepted
DATABASE_URL=...               # final fallback (shared with Paperclip core)

# OpenAI for text-embedding-3-small (reuse the CRM key — same one the M8 RAG
# embeddings cron consumes; do not open a new account)
OPENAI_API_KEY=sk-proj-...
```

## Use

```ts
import {
  createMemoryClient,
  createEmbeddingsClient,
  createMemoryHelpers,
} from "@finapticoos/memory";

const client = createMemoryClient();
const embeddings = createEmbeddingsClient();
const memory = createMemoryHelpers({ client, embeddings });

await memory.writeMemory({
  scope: "prospect:marta-bellot",
  content: "Marta lleva ERP Odoo en consultoría y nos preguntó por dashboards.",
  createdBy: "plugin:hello-world",
});

const hits = await memory.searchMemory({
  scope: "prospect:marta-bellot",
  query: "ERP odoo dashboards",
  limit: 5,
  minSimilarity: 0.7,
});
```
