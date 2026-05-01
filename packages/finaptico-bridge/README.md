# @finapticoos/bridge

Read-only access from FinapticoOS plugins/server to the Finaptico CRM
(`crm.prospects`, `crm.meetings`, `crm.interactions`).

Plan Sprint 0 Bloque 7a — **zero state duplication**: FinapticoOS does not
mirror CRM data, plugins fetch on demand via these helpers.

## Setup once per environment

Apply both migrations in order from the Supabase Dashboard SQL Editor.
Both are idempotent — safe to re-run on existing environments.

### 1. [`migrations/0001_finapticoos_reader_role.sql`](./migrations/0001_finapticoos_reader_role.sql)

Creates the `finapticoos_reader` Postgres role with `GRANT SELECT` on
the three CRM tables. Verification (last `SELECT` of the migration)
must return:

| can_select_prospects | can_insert_prospects | can_select_meetings | can_select_interactions |
|---|---|---|---|
| true | false | true | true |

### 2. [`migrations/0002_finapticoos_reader_rls_policies.sql`](./migrations/0002_finapticoos_reader_rls_policies.sql)

**Required when the destination tables have Row Level Security enabled**
— which is the default in Supabase. The Finaptico CRM tables have RLS
on by default, so without this migration the smoke against Marta returned
an empty dossier even though `GRANT SELECT` was in place.

**Why**: Postgres checks RLS *after* table-level GRANTs. A role with
SELECT but no matching policy receives 0 rows silently, not an error —
the queries appear to "work" but return nothing. This migration adds
one `FOR SELECT TO finapticoos_reader USING (true)` policy per table,
which is equivalent to "no RLS for this role only" without affecting
existing policies for `anon` / `authenticated` / `service_role`.

Verification: `SELECT * FROM pg_policies WHERE policyname LIKE
'finapticoos_reader_%'` must return 3 rows (one per table).

> Operational note for future installations: any new CRM table the bridge
> needs to read MUST get its own GRANT (extend 0001) AND its own RLS policy
> (extend 0002 or write a follow-up migration). Forgetting either step
> leads to the silent-empty-result failure mode.

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
