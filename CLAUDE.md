# CLAUDE.md — FinapticoOS fork

Self-managed memo para cualquier sesión Claude Code que abra este repo. El
objetivo es retomar Sprint 0 sin re-aprender nada. Mantener actualizado tras
cualquier cambio estructural.

---

## 1 · Stack y arquitectura

- **Repo**: fork de [`paperclipai/paperclip`](https://github.com/paperclipai/paperclip) → [`Shatzilie/finapticoos`](https://github.com/Shatzilie/finapticoos). Rama divergente `finaptico/main`. `master` queda limpio para rebases mensuales upstream (Bloque "Marco" out-of-scope Sprint 0).
- **Monorepo pnpm**: `pnpm-workspace.yaml` enumera `packages/*`, `packages/adapters/*`, `packages/plugins/*`, `packages/plugins/examples/*`, `server`, `ui`, `cli`. Excluye `packages/plugins/sandbox-providers/**` y `plugin-orchestration-smoke-example`.
- **Frontend**: `ui/` Vite + React 19. Servido en dev por vite-dev-middleware del server Express; en prod el `pnpm --filter @finapticoos/ui build` deja assets estáticos que el server sirve junto al puerto 3100.
- **Backend**: `server/` Express 5 + better-auth + Drizzle.
- **DB Drizzle migrations**: `packages/db/src/migrations/` — 75 migrations Paperclip core. Se aplican automáticamente al arranque (`applyPendingMigrations`).
- **DB FinapticoOS extensions** (paquete propio):
  - `packages/memory/` — `@finapticoos/memory`. Schema Drizzle `pgSchema("crm")` para `crm.finapticoos_users/plugins/approvals/actions_log` + `crm.agent_shared_memory` con `vector(1536)`. Migration plana `migrations/0001_finapticoos_initial.sql`, NO Drizzle Kit (cross-system, plan línea 111 spec "no MCP").
  - `packages/finaptico-bridge/` — `@finapticoos/bridge`. Read-only mirror Drizzle de `crm.prospects/meetings/interactions` del CRM. Helpers `getProspect/getProspectsByStatus/getMeeting/getMeetingsForProspect/getInteractionsForProspect/getProspectDossier`. Migrations 0001 (rol + GRANT) + 0002 (RLS policies).
  - `packages/adapters/anthropic-api/` — `@finapticoos/adapter-anthropic-api`. Wrapper `@anthropic-ai/sdk` con prompt caching + cost tracking sobre `crm.finapticoos_actions_log`.
  - `packages/finapticoos-smoke/` — `@finapticoos/smoke`. Script `run-marta.ts` ejerce el stack completo end-to-end.
- **Coexistencia DB**: Paperclip core vive en `public.*` del Supabase Finaptico (project ref `utwhvnafvtardndgkbjn`) coexistiendo con 5 tablas legacy CRM (`blog_proposal_rounds`, `contable_acciones`, `notion_sync_clients`, `prospection_news`, `tax_filings`) — verificada zero-collision con los ~80 nombres Paperclip core. FinapticoOS extensions viven en `crm.finapticoos_*` + `crm.agent_shared_memory` (namespace separado del CRM Finaptico que también vive en `crm.*`).

---

## 2 · Decisiones técnicas Sprint 0 con su porqué

| Decisión | Porqué |
|---|---|
| **DATABASE_URL = Session pooler Supabase** (`:5432`, pool_mode session) | Transaction pooler `:6543` rechaza prepared statements (PostgresError 08P01) Y rechaza startup params custom (`unsupported startup parameter: search_path`). Direct `:5432` no escala bien. Session pooler es el único que satisface ambas necesidades para Paperclip core. |
| **`prepare: false`** en TODAS las factories postgres-js | Coherencia con Transaction pooler por si en el futuro DATABASE_URL muta + memoria/bridge ya lo usan. Las queries siguen parametrizadas (immune SQL injection), solo se desactiva el cache de plan. Coste runtime: <1ms por query, invisible para control plane. |
| **Paperclip core en `public.*`**, NO en schema dedicado | Las 75 migrations SQL Paperclip hardcodean `"public"."tablename"` literal. `search_path` per-connection o startup no las redirige. Se intentó aislar en `finapticoos_core` (commit `ccd3c450`) y se revirtió (commit `1cc8ce8b`). Pivot a coexistencia con las 5 legacy CRM. |
| **FinapticoOS extensions en `crm.finapticoos_*`** | Convención prefijo `finapticoos_` evita contaminar namespace `crm.*` del CRM Finaptico (que también está en `crm.*` con sus propias tablas). Schema único, prefijos distintos. |
| **RLS policies retroactivas** (migration 0002 bridge) | El rol `finapticoos_reader` tenía `GRANT SELECT` pero las tablas `crm.prospects/meetings/interactions` tienen RLS habilitado en Supabase. Postgres comprueba RLS DESPUÉS del GRANT → queries devolvían 0 filas silenciosamente. Migration 0002 añade `CREATE POLICY ... USING (true)` por tabla. Cualquier nueva tabla CRM consumida debe extender ambas (0001 GRANT + 0002 policy). |
| **Entrypoint `chown -R node:node /finapticoos` incondicional** | Heredado upstream, el chown solo corría cuando el UID/GID del runtime difería del build (deploy típico Easypanel pasa UID=1000=build default → chown skipped). Pero cualquier root pass-through (Easypanel Console exec, scripts admin) crea archivos `root:root`. El restart entonces atrapaba runtime con EACCES en `.env`. Fix: chown siempre como root antes del `exec gosu node`, no condicional. |
| **MFA Sprint 0.1 — CERRADO 2026-05-04** | Original: plan dice "MFA OBLIGATORIO" pero Paperclip upstream NO incluye plugin `twoFactor` ni UI. Sprint 0 difirió a Sprint 0.1 con deadline 2026-05-15. **Cerrado 11 días antes**: 5 commits sobre `feature/mfa-sprint-0.1` mergeados ff a `finaptico/main` (`64ce07c4` backend + `3561ce36` enroll + `1eaaf181` verify+recovery + `c6629220` enforcement+settings + `64aeaf0b` docs+E2E). Smoke prod cuenta Fatima verde. Detalle completo en sección "Cerradas en Sprint 0.1". |
| **CSP `'unsafe-inline'` provisional** | Paperclip UI hereda inline scripts/styles. Endurecerlo a nonces o assets extraídos es trabajo adicional. TODO Sprint 1: auditar y migrar. |
| **Smoke como paquete standalone** (`@finapticoos/smoke`), NO ampliando upstream `plugin-hello-world-example` | Preserva el ejemplo educacional minimal del SDK plugin Paperclip. El smoke ejerce stack completo (bridge + memory + adapter + approvals) que NO encaja en lifecycle plugin SDK estándar. |

---

## 3 · Workflow Easypanel

- **Auto Deploy OFF** para finapticoos por bug heredado en los otros 3 servicios Finaptico Easypanel. **Cada push requiere Implementar manual** desde Easypanel UI → finapticoos → Implementar.
- **Cambios solo de env var NO disparan rebuild** (Trampa C migración). Para aplicar nueva env var hace falta commit (puede ser `git commit --allow-empty -m "force rebuild"` y push) + Implementar.
- **Cualquier `package.json` nuevo en `packages/` DEBE añadir su `COPY` al `Dockerfile` deps stage**, justo donde están los demás (líneas ~17-37). Sin ese COPY el `pnpm install --frozen-lockfile` del image build no genera node_modules para el paquete y el runtime falla con "tsx: not found / node_modules missing" (Bloque 9 hotfix `7d05b186`). Sprint 1 considerar `COPY --parents packages/*/package.json` con BuildKit para auto-descubrir.
- **Console del container corre como root**. Útil para troubleshooting pero CUALQUIER archivo creado ahí en `/finapticoos/*` queda `root:root`. El entrypoint normaliza ownership en cada arranque (commit `622f2ff8`) — no requiere acción manual, pero recordar la dinámica.
- **`docker-entrypoint.sh` es build-time** (COPY al imagen). Cambios al script requieren rebuild (Implementar), no solo Restart.

---

## 4 · Deudas conocidas

| Deuda | Plazo | Tracking |
|---|---|---|
| **CSP `'unsafe-inline'`** en script-src y style-src | Sprint 1 | TODO marcado en `server/src/middleware/hardening.ts`. Migrar a nonces o assets extraídos. |
| **`ANTHROPIC_API_KEY` shared con n8n** | Sprint 1 | Reusa `sk-ant-api03-E7S4ombB...` que también consume n8n para posts blog. Si Sprint 1 escala uso de Anthropic en plugins, dedicar key separada para FinapticoOS y monitorizar gasto independiente. |
| **Auto Deploy Easypanel bug heredado** | Cuando Hostinger/Easypanel resuelvan | Mantener Implementar manual. Documentado por Fatima en plan VPS migración. |
| **Pooler URL formato** | Sprint 1 si escalan conexiones | Actualmente `db.utwhvnafvtardndgkbjn.supabase.co:5432` — Session pooler. Si Supabase migra al formato `aws-0-<region>.pooler.supabase.com:5432`, actualizar env var (no requiere code change). |
| **UX nav `MFASettingsCard`** (Sprint 0.1 deuda residual) | Sprint 1 | Card existe en `ui/src/components/MFASettingsCard.tsx` y se renderiza en `ui/src/pages/ProfileSettings.tsx`, pero no es accesible vía nav típico Paperclip. Workaround temporal: regenerate codes / disable vía endpoint better-auth directo o rescue SQL. Smoke prod 04/05 saltó esta verificación porque comportamiento (enforce + verify) ya estaba validado. |
| **E2E flow completo TOTP real** | Sprint 1 o post-deploy | Actual `tests/e2e/mfa-routes-smoke.spec.ts` solo verifica render. Flow real requiere lib `otpauth` + bootstrap admin invite + ~3-4h. Smoke prod manual (Fatima 04/05) sustituyó el E2E completo. |
| **Defensa profunda server-side hook** en endpoints sensibles | Sprint 1 si Editors abren rutas cross-user | Frontend gate (`MFAGate` en `CloudAccessGate`) suficiente para single-admin Sprint 0.1. |
| **Password reset flow** | Sprint 1 | Paperclip upstream NO incluye handler aunque la ruta `/api/auth/reset-password` está registrada. Documentado en `docs/MFA_RESCUE.md` que NO está en scope MFA — separate task. |

### Cerradas en Sprint 0.1

- ✅ **MFA full-stack** (deadline original 2026-05-15) — **shipped 2026-05-04, 11 días antes**. Plugin `twoFactor` + tabla `two_factor` + columna `user.two_factor_enabled` + páginas `/auth/mfa-enroll`/`/mfa-verify`/`/mfa-recovery` + componente `OTPInput` accesible + enforcement strict en `CloudAccessGate` + `docs/MFA_RESCUE.md` (procedimiento unlock SQL Bitwarden) + tests smoke routes Playwright. 5 commits en `feature/mfa-sprint-0.1` (`64ce07c4`, `3561ce36`, `1eaaf181`, `c6629220`, `64aeaf0b`) mergeados ff a `finaptico/main`. Smoke prod cuenta Fatima verde (login → forced enroll → submit TOTP → enrollment confirmed → logout → login → forced verify → access app). Backup tag local `backup/pre-mfa-2026-05-04 → 54283274` retenido por seguridad.

---

## 5 · Estado BD actual (Supabase Finaptico, project ref `utwhvnafvtardndgkbjn`)

- **`public.*`**: ~80 tablas Paperclip core (creadas por las 75 migrations Drizzle al arranque del server) + 5 legacy CRM (`blog_proposal_rounds`, `contable_acciones`, `notion_sync_clients`, `prospection_news`, `tax_filings`). Zero collision verificada.
- **`drizzle.__drizzle_migrations`**: 75 filas, una por migration aplicada. Si está vacío el server reaplica todo al arranque (rama `no-migration-journal-empty-db`).
- **`crm.*`** (CRM Finaptico — out of our scope, lo gestiona el repo `FactorIA-CRMFinaptico`): tablas existentes incluyen `prospects`, `meetings`, `interactions`, `organizations`, `contacts`, `calendar_events`, etc. Con RLS habilitado.
- **`crm.finapticoos_*`** (Bloque 4): 4 tablas — `finapticoos_users`, `finapticoos_plugins`, `finapticoos_approvals`, `finapticoos_actions_log`. Sin RLS (acceso vía DATABASE_URL Paperclip core role).
- **`crm.agent_shared_memory`** (Bloque 4): vector(1536) embedding column + ivfflat cosine index + scope/expires_at indexes. Sin RLS.
- **Roles Postgres**:
  - `postgres` (default Supabase) — superuser, usado por `DATABASE_URL` y `FINAPTICOOS_MEMORY_DATABASE_URL`.
  - `finapticoos_reader` (Bloque 7a) — solo `GRANT SELECT crm.prospects/meetings/interactions` + RLS policies `finapticoos_reader_select_<table>` con `USING (true)`. Usado por `FINAPTICOOS_BRIDGE_DATABASE_URL`. Password: `REDACTED_ROTATED_2026_05_04` (en Bitwarden + `packages/finaptico-bridge/migrations/0001_finapticoos_reader_role.sql`).
- **Backups**:
  - Native Paperclip: `databaseBackupEnabled` cada 60 min, retención 7 días, en `/finapticoos/instances/default/data/backups` dentro del volumen Easypanel. **Solo cubre `public.*`** del DATABASE_URL.
  - pg_dump cron CRM (gestionado por el repo `FactorIA-CRMFinaptico` paralelo): full database dump diario incluyendo `crm.*` completo → cubre `crm.finapticoos_*` y `crm.agent_shared_memory` automáticamente.

---

## 6 · Ruta recovery (BD restaurada desde backup)

Orden estricto, cada paso idempotente:

1. **Aplicar `packages/memory/migrations/0001_finapticoos_initial.sql`** — crea schema `crm` (si falta), extensions `vector` + `pgcrypto`, las 5 tablas FinapticoOS extensions + indexes ivfflat.
2. **Aplicar `packages/finaptico-bridge/migrations/0001_finapticoos_reader_role.sql`** — crea rol `finapticoos_reader` (si falta) + GRANT SELECT en las 3 tablas CRM. Verificación final: `has_table_privilege('finapticoos_reader', 'crm.prospects', 'SELECT') = true`.
3. **Aplicar `packages/finaptico-bridge/migrations/0002_finapticoos_reader_rls_policies.sql`** — RLS policies `USING (true)` para el rol reader sobre las 3 tablas. Verificación: `SELECT FROM pg_policies WHERE policyname LIKE 'finapticoos_reader_%'` → 3 filas.
4. **Si `drizzle.__drizzle_migrations` está vacío** o no existe (BD nueva o restore parcial): el server lo bootstrapea solo al arrancar (rama `no-migration-journal-empty-db` aplica las 75 migrations Paperclip core sobre `public.*`). **Si tiene filas residuales sin tablas correspondientes** (deploy parcial previo): aplicar `packages/db/cleanup-residuals.sql` que dropea las 80 tablas Paperclip + types huérfanos + TRUNCATE journal.
5. **Restart Easypanel finapticoos** — el server arranca, aplica migrations si `drizzle.__drizzle_migrations` vacío, monta el volumen `/finapticoos`, normaliza ownership con chown -R node:node, lee `.env` como user node, escucha en `:3100`.
6. **Smoke verificación**: `pnpm --filter @finapticoos/smoke smoke:marta` desde Console. Espera total billable < 30s + audit log con tokens/cost reales en `crm.finapticoos_actions_log`.

---

## 7 · Commits clave Sprint 0

Cronología en `finaptico/main` (más antiguo → más reciente):

| Commit | Bloque | Entrega |
|---|---|---|
| `cff6cee5` | 1 | Fork inicial Paperclip → FinapticoOS, smoke local 3100 |
| `6995a356` | 2 | Telemetría off — defensa en profundidad (carpeta upstream telemetry/ borrada + stub no-op + feedback-share-client neutralizado + .env.production flags) |
| `e22ebe03` | 3 | Rebranding masivo Paperclip → FinapticoOS (1552 archivos, sed protect-rebrand-restore atómico) |
| `ac327931` | 4 | Paquete @finapticoos/memory + migration crm.finapticoos_* + agent_shared_memory pgvector + tests 14/14 |
| `8b4d87c8` | 5 | Adapter @finapticoos/adapter-anthropic-api con prompt caching + cost tracking + tests 13/13 |
| `156636de` | 6 | Adapter Dockerfile heredado al fork (volume /finapticoos, COPY paquetes nuevos, ENV flags telemetría runtime) |
| `ccd3c450` | 6 hotfix #1 | Aislar Paperclip core en finapticoos_core via search_path (luego revertido) |
| `bdaeccc4` | 6 hotfix #2 | prepare:false en createDb/createUtilitySql para Transaction pooler |
| `1cc8ce8b` | 6 revert | Pivotar Paperclip core a public.* — aislamiento search_path inviable (migrations hardcodean schema) |
| `dda2ca3f` | 6 cleanup | Cleanup script residuos Paperclip en public.* tras pivot |
| `622f2ff8` | 6 hotfix #3 | Entrypoint normaliza ownership /finapticoos en cada arranque (incondicional, no solo UID remap) |
| `a7e21a92` | 6 cleanup v2 | Cleanup también vacía drizzle.__drizzle_migrations |
| `4e09bc06` | 7a | Paquete @finapticoos/bridge — lectura read-only CRM con rol postgres dedicado finapticoos_reader |
| `b390f444` | 8 | Hardening + auth — helmet + rate limit + sesión 30d (MFA diferido Sprint 0.1) |
| `6913f006` | 9 | Smoke inaugural Marta Bellot + docs FinapticoOS plugin authoring |
| `7d05b186` | 9 hotfix | Dockerfile copia packages nuevos Bloques 7a + 9 en deps stage |
| `74421d47` | 7a hotfix | RLS policies para finapticoos_reader sobre tablas CRM (migration 0002) |

---

## 8 · Qué NO está hecho (out of Sprint 0 finapticoos repo)

- **Bloque 7b** — publisher CRM→finapticoos + endpoint receptor finapticoos→CRM. **Vive en el repo `FactorIA-CRMFinaptico`** (no aquí). Plan original asigna esa sesión cierre paralela a Desktop. Implica:
  - `frontend/src/lib/finapticoos/types.ts` — Zod schemas + event types union.
  - `frontend/src/lib/finapticoos/publisher.ts` — HMAC-SHA256 publisher CRM→FinapticoOS.
  - `frontend/src/app/api/webhooks/finapticoos-action/route.ts` — endpoint receptor con HMAC validation.
  - Posible micro-migration `crm.interactions.interaction_type` CHECK +`ai_action`.
- **Bloque 10 docs cierre** — actualizar `docs/project_memory.md` + `implementation/task_tracker.md` del repo CRM con entrada "Sprint 0 FinapticoOS shipped". También en repo CRM, no aquí.
- ~~**Sprint 0.1 MFA full-stack** — deadline 2026-05-15.~~ **CERRADO 2026-05-04, 11 días antes** (ver sección "Deudas conocidas → Cerradas en Sprint 0.1" arriba). Plugin `twoFactor` + tabla `two_factor` + páginas enroll/verify/recovery + enforcement strict + `docs/MFA_RESCUE.md`. Smoke prod cuenta Fatima verde.
- **Agente Marco** (rebase semanal upstream Paperclip + documentar patrones de conflicto) — spec en `Desktop/Finaptico Asistente/agentes/spec_marco_monitor_paperclip_upstream.md`. Post-FinapticoOS deploy.
- **Sprint 1 Editors** (WP / LinkedIn / Vercel) — plugins reales con UI Company integrada (ahí sí necesitarán Company virtual del wizard FinapticoOS), aprobaciones via UI propia, integración con bridge + memory + adapter ya listos.

---

## Comandos cheat sheet

```bash
# Dev local con embedded postgres
pnpm install
pnpm dev                                          # localhost:3100

# Typecheck recursivo
pnpm -r typecheck

# Smoke Marta (solo desde Console Easypanel container, requiere env vars prod)
pnpm --filter @finapticoos/smoke smoke:marta

# Tests por paquete
pnpm --filter @finapticoos/memory test            # 14/14
pnpm --filter @finapticoos/adapter-anthropic-api test  # 13/13
pnpm --filter @finapticoos/bridge test            # 12/12
```

---

> Última actualización: cierre Sprint 0 lado finapticoos repo. Mantener este
> archivo al día tras cada bloque o decisión arquitectónica relevante.
