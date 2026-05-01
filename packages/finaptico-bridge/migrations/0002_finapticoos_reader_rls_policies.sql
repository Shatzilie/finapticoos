-- FinapticoOS Sprint 0 Bloque 7a hotfix — RLS policies for finapticoos_reader.
--
-- Background: crm.prospects / crm.meetings / crm.interactions have Row Level
-- Security enabled in the Finaptico Supabase project. Postgres checks RLS
-- AFTER the table-level GRANT, so a role with `GRANT SELECT` but no matching
-- policy receives an empty result set instead of an error — every query
-- silently returns 0 rows. Migration 0001_finapticoos_reader_role.sql granted
-- SELECT but did not create the matching RLS policy, so the smoke against
-- Marta initially returned an empty dossier.
--
-- This migration adds one permissive policy per table for the reader role.
-- "USING (true)" allows the reader to see every row — equivalent to no RLS
-- for this role only. Other roles (anon, authenticated, service_role) are
-- unaffected and continue under whatever existing policies the CRM uses.
--
-- Idempotent: DROP POLICY IF EXISTS before each CREATE. Apply from Supabase
-- Dashboard SQL Editor (same way as 0001).

DROP POLICY IF EXISTS finapticoos_reader_select_prospects ON crm.prospects;
CREATE POLICY finapticoos_reader_select_prospects
  ON crm.prospects FOR SELECT TO finapticoos_reader USING (true);

DROP POLICY IF EXISTS finapticoos_reader_select_meetings ON crm.meetings;
CREATE POLICY finapticoos_reader_select_meetings
  ON crm.meetings FOR SELECT TO finapticoos_reader USING (true);

DROP POLICY IF EXISTS finapticoos_reader_select_interactions ON crm.interactions;
CREATE POLICY finapticoos_reader_select_interactions
  ON crm.interactions FOR SELECT TO finapticoos_reader USING (true);

-- Verification: should return 3 rows, one per table, all SELECT command.
SELECT
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'crm'
  AND policyname LIKE 'finapticoos_reader_%'
ORDER BY tablename;
