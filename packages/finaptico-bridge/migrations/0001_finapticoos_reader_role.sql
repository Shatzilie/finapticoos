-- FinapticoOS Sprint 0 Bloque 7a — read-only role for the CRM bridge.
-- Apply once from Supabase Dashboard SQL Editor against the Finaptico
-- project (utwhvnafvtardndgkbjn). Idempotent.
--
-- Rationale: @finapticoos/bridge consumes crm.prospects / crm.meetings /
-- crm.interactions on demand. Connecting with the privileged `postgres` role
-- would let any bug in any plugin INSERT/UPDATE/DELETE on the live CRM. We
-- create a dedicated role with GRANT SELECT only — defense in depth at the
-- Postgres level (rejection happens before SQL touches the table).
--
-- Password below is generated for this fork. Replace with a fresh
-- `openssl rand -hex 16` per environment if you ever rotate it.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finapticoos_reader') THEN
    CREATE ROLE finapticoos_reader LOGIN PASSWORD 'REDACTED_ROTATED_2026_05_04';
  END IF;
END $$;

GRANT USAGE ON SCHEMA crm TO finapticoos_reader;
GRANT SELECT ON crm.prospects TO finapticoos_reader;
GRANT SELECT ON crm.meetings TO finapticoos_reader;
GRANT SELECT ON crm.interactions TO finapticoos_reader;

-- Verification: the reader can SELECT but cannot mutate. Esperado:
--   can_select_prospects | can_insert_prospects | can_select_meetings | can_select_interactions
--          true          |        false         |         true        |          true
SELECT
  has_table_privilege('finapticoos_reader', 'crm.prospects', 'SELECT') AS can_select_prospects,
  has_table_privilege('finapticoos_reader', 'crm.prospects', 'INSERT') AS can_insert_prospects,
  has_table_privilege('finapticoos_reader', 'crm.meetings', 'SELECT') AS can_select_meetings,
  has_table_privilege('finapticoos_reader', 'crm.interactions', 'SELECT') AS can_select_interactions;
