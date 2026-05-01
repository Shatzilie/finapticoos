# @finapticoos/bridge

Read-only access from FinapticoOS plugins/server to the Finaptico CRM
(`crm.prospects`, `crm.meetings`, `crm.interactions`).

Plan Sprint 0 Bloque 7a — **zero state duplication**: FinapticoOS does not
mirror CRM data, plugins fetch on demand via these helpers.

## Setup once per environment

Apply the SQL in [`migrations/0001_finapticoos_reader_role.sql`](./migrations/0001_finapticoos_reader_role.sql)
from the Supabase Dashboard SQL Editor. It creates the
`finapticoos_reader` Postgres role with `GRANT SELECT` on the three CRM
tables. Idempotent.

Verification (last `SELECT` of the migration) must return:

| can_select_prospects | can_insert_prospects | can_select_meetings | can_select_interactions |
|---|---|---|---|
| true | false | true | true |

## Env var

```bash
FINAPTICOOS_BRIDGE_DATABASE_URL=postgresql://finapticoos_reader:REDACTED_ROTATED_2026_05_04@db.utwhvnafvtardndgkbjn.supabase.co:5432/postgres
```

The helpers also fall back to `SUPABASE_FINAPTICOOS_URL` then `DATABASE_URL`
in that order, but in production you SHOULD use the dedicated reader URL —
the privileged `postgres` role would let a plugin bug write into the CRM.

## Use

```ts
import {
  createBridgeClient,
  getProspect,
  getProspectsByStatus,
  getMeeting,
  getMeetingsForProspect,
  getInteractionsForProspect,
  getProspectDossier,
} from "@finapticoos/bridge";

const bridge = createBridgeClient();

const marta = await getProspect(bridge, "411ebb54-c7f8-44a1-9096-27d4b7c97912");
const dossier = await getProspectDossier(bridge, marta!.id);
// dossier = { prospect, interactions: [...newest first], meetings: [...newest first] }
```

## What this package will NOT do

- Write to `crm.*` (Postgres rejects at the role level).
- Mirror or cache CRM data inside FinapticoOS.
- Validate CRM business rules — the CRM is the source of truth for status
  values, valid `meeting_type`, etc.

## Iteration path

If Sprint 1 expands the bridge to multiple consumers with distinct read
permissions, migrate from `GRANT SELECT` to Supabase RLS policies on the
same tables and switch the connection style to the Supabase JS client.
For Sprint 0 with a single consumer the GRANT model is simpler and equally
safe.
