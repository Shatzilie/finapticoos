# @finapticoos/smoke

Sprint 0 Bloque 9 inaugural smoke. Exercises the FinapticoOS extensions
stack end-to-end against the prospect Marta Bellot fixture
(`411ebb54-c7f8-44a1-9096-27d4b7c97912`, sincronía con fixture Berta V1).

8 steps — see `src/run-marta.ts` for the full timeline:

1. `getProspectDossier` from `@finapticoos/bridge` (read-only CRM).
2. Build "resume perfil 3 líneas" prompt from the dossier.
3. `Sonnet 4.6` call via `@finapticoos/adapter-anthropic-api` with prompt caching.
4. `writeMemory` to `crm.agent_shared_memory` scope `prospect:marta-bellot`.
5. Enqueue approval in `crm.finapticoos_approvals`.
6. Poll until `status='approved'` (manual SQL approval in Supabase Dashboard).
7. Stub action to stdout (Sprint 0; Sprint 1 Editors replace this with real CRM POST).
8. `logAnthropicAction` to `crm.finapticoos_actions_log` with tokens + cost.

## Run

From the Easypanel finapticoos service Console:

```bash
pnpm --filter @finapticoos/smoke smoke:marta
```

Required env vars (already configured in Easypanel for the service):

- `FINAPTICOOS_BRIDGE_DATABASE_URL` (read-only `finapticoos_reader`)
- `FINAPTICOOS_MEMORY_DATABASE_URL` (write to `crm.finapticoos_*` + `crm.agent_shared_memory`)
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

## Approve the queued action

After step 5, the script prints the approval id and polls. Open Supabase
Dashboard → SQL Editor:

```sql
UPDATE crm.finapticoos_approvals
SET status='approved', decided_at=now()
WHERE id='<approval-uuid printed by the script>';
```

The script picks it up within 5 s (poll interval) and proceeds to step 7.

## Verification budget

The script measures every step. The total billable time (excluding the
human approval wait of step 6) MUST stay under 30 s for Sprint 0 acceptance.
The summary block at the end prints ✓ PASS or ✗ FAIL against that budget.
