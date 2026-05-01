# Logging actions

Every executed plugin action MUST land in `crm.finapticoos_actions_log`. This is the FinapticoOS audit trail — non-negotiable.

The Anthropic adapter ships a helper that fills the log with token + cost telemetry automatically.

## Standard call

```ts
import { logAnthropicAction } from "@finapticoos/adapter-anthropic-api/server";
import { createMemoryClient } from "@finapticoos/memory";

const memoryClient = createMemoryClient();

const message = await anthropic.sendMessage({ ... });   // your inference call
// ... do whatever the plugin does with `message` ...

await logAnthropicAction(memoryClient, {
  actionType: "linkedin.publish_post",
  approvalId,           // optional; the approval row this action consumes
  pluginId,             // optional; uuid of the plugin row in finapticoos_plugins
  payload: { audience: "founders-spain", draftId: 42 },
  result: { publishedUrl: "https://linkedin.com/...", success: true },
  status: "completed",
  message,              // the MessageResult from anthropic.sendMessage
});
```

## What the helper logs

The helper extracts from `message`:

- `tokens_in` = `inputTokens + cacheCreationInputTokens + cacheReadInputTokens`
- `tokens_out` = `outputTokens`
- `cost_cents` = the per-call cost from `computeCostCents` (rounded up — never under-bills)
- `model` = the resolved Anthropic model ID (e.g. `claude-sonnet-4-6`)

Plus whatever you passed in `payload` / `result` / `status`.

## When you do NOT call Anthropic

For actions that don't involve an LLM call (e.g. a CRUD mutation triggered by a cron), insert into the table directly:

```ts
import { finapticoosActionsLog, createMemoryClient } from "@finapticoos/memory";

const client = createMemoryClient();
await client.db.insert(finapticoosActionsLog).values({
  actionType: "cron.refresh_dossier",
  payload: { prospectId: "..." },
  result: { rowsRefreshed: 12 },
  status: "completed",
  // tokens_in / tokens_out / cost_cents default to 0
});
```

## Why every action

- Auditability — Sprint 0 Bloque 8 hardening assumes every plugin action is reviewable from the audit log.
- Cost tracking — without this, the OpenAI/Anthropic monthly cap (~5 USD per provider) becomes invisible. The CFO-facing dashboards (Sprint 1+) will pivot off this table.
- Incident response — if a plugin misbehaves, the only record of what it did is here.

## Schema

See `packages/memory/migrations/0001_finapticoos_initial.sql` for the full DDL of `crm.finapticoos_actions_log` (incl. the indexes on `plugin_id` and `executed_at`).
