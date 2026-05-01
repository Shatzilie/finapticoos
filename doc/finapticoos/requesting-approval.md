# Requesting human approval

The `crm.finapticoos_approvals` table is the FinapticoOS-native gate for any irreversible action a plugin wants to execute. The pattern is **enqueue → wait → execute → audit**.

> Sprint 0 has NO UI for approvals — operators approve via Supabase Dashboard SQL Editor. Sprint 1 Editors ship a proper review surface.

## Enqueue

```ts
import { finapticoosApprovals, createMemoryClient } from "@finapticoos/memory";

const client = createMemoryClient();
const inserted = await client.db
  .insert(finapticoosApprovals)
  .values({
    actionType: "linkedin.publish_post",
    payload: {
      draft: "...",
      audienceTag: "founders-spain",
    },
    requestedBy: "plugin:linkedin-editor",
  })
  .returning({ id: finapticoosApprovals.id });

const approvalId = inserted[0]!.id;
```

`actionType` is a free-form string. Pick a stable convention per plugin (e.g. `"<plugin_slug>.<verb>"`).

## Wait

```ts
import { finapticoosApprovals } from "@finapticoos/memory";
import { eq } from "drizzle-orm";

async function waitForApproval(approvalId: string, timeoutMs = 5 * 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const rows = await client.db
      .select({ status: finapticoosApprovals.status })
      .from(finapticoosApprovals)
      .where(eq(finapticoosApprovals.id, approvalId))
      .limit(1);
    const status = rows[0]?.status ?? "missing";
    if (status === "approved" || status === "rejected") return status;
    await new Promise((r) => setTimeout(r, 5_000));
  }
  return "timeout";
}
```

## Approve from Supabase Dashboard

```sql
UPDATE crm.finapticoos_approvals
SET status='approved', decided_at=now(), decided_by=NULL
WHERE id='<approval-uuid>';
```

To reject:

```sql
UPDATE crm.finapticoos_approvals
SET status='rejected', decided_at=now(), decision_note='razón'
WHERE id='<approval-uuid>';
```

## Always log to actions_log after acting

Every executed action should land in `crm.finapticoos_actions_log` referencing the `approvalId`. See [`logging-actions.md`](./logging-actions.md).

## Schema reminder

The `crm.finapticoos_approvals` row carries:

- `status` — `pending` (default), `approved`, `rejected`.
- `payload` — JSONB with whatever the plugin needs to replay the action.
- `requested_by` / `decided_by` — free-form actor tags.
- `expires_at` — optional; the bridge does NOT auto-expire, plugins should own that policy.

See `packages/memory/migrations/0001_finapticoos_initial.sql` for the full DDL.
