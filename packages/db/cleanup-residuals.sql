-- FinapticoOS Sprint 0 Bloque 6 cleanup — limpia residuos de Paperclip core
-- en public.* dejados por deploys parciales antes del pivot a coexistencia.
--
-- Contexto: el primer deploy (antes del hotfix Bloque 6) intentó aplicar las
-- 75 migrations Paperclip core sobre Supabase Finaptico. Cuando crasheó el
-- bootstrap, algunos CREATE TABLE / CREATE TYPE quedaron a medio aplicar en
-- public.* sin registro en drizzle.__drizzle_migrations. El reintento ahora
-- choca con duplicados (PostgresError 23505 en pg_type, etc.).
--
-- Este script DROP IF EXISTS las 80 tablas Paperclip en public.* con CASCADE
-- (limpia los TYPES composite implícitos, sequences SERIAL, índices y
-- constraints asociados de cada tabla). Idempotente — ejecutar las veces
-- que haga falta.
--
-- LO QUE NO TOCA (verificación previa al diseño):
--   • blog_proposal_rounds, contable_acciones, notion_sync_clients,
--     prospection_news, tax_filings (5 tablas legacy CRM en public.*).
--   • drizzle.__drizzle_migrations (debe seguir vacío después de esto).
--   • crm.finapticoos_users / plugins / approvals / actions_log
--     (Bloque 4 schema FinapticoOS extensions).
--   • crm.agent_shared_memory (Bloque 4 memoria semántica).
--   • Cualquier tabla en public.* cuyo nombre no esté en la lista Paperclip
--     verificada (los 80 nombres bajo).
--
-- Aplicar desde Supabase Dashboard → SQL Editor.

DO $$
DECLARE
  paperclip_tables TEXT[] := ARRAY[
    'account',
    'activity_log',
    'agent_api_keys',
    'agent_config_revisions',
    'agent_runtime_state',
    'agent_task_sessions',
    'agent_wakeup_requests',
    'agents',
    'approval_comments',
    'approvals',
    'assets',
    'board_api_keys',
    'budget_incidents',
    'budget_policies',
    'cli_auth_challenges',
    'companies',
    'company_logos',
    'company_memberships',
    'company_secret_versions',
    'company_secrets',
    'company_skills',
    'company_user_sidebar_preferences',
    'cost_events',
    'document_revisions',
    'documents',
    'environment_leases',
    'environments',
    'execution_workspaces',
    'feedback_exports',
    'feedback_votes',
    'finance_events',
    'goals',
    'heartbeat_run_events',
    'heartbeat_run_watchdog_decisions',
    'heartbeat_runs',
    'inbox_dismissals',
    'instance_settings',
    'instance_user_roles',
    'invites',
    'issue_approvals',
    'issue_attachments',
    'issue_comments',
    'issue_documents',
    'issue_execution_decisions',
    'issue_inbox_archives',
    'issue_labels',
    'issue_read_states',
    'issue_reference_mentions',
    'issue_relations',
    'issue_thread_interactions',
    'issue_tree_hold_members',
    'issue_tree_holds',
    'issue_work_products',
    'issues',
    'join_requests',
    'labels',
    'plugin_company_settings',
    'plugin_config',
    'plugin_database_namespaces',
    'plugin_entities',
    'plugin_job_runs',
    'plugin_jobs',
    'plugin_logs',
    'plugin_migrations',
    'plugin_state',
    'plugin_webhook_deliveries',
    'plugins',
    'principal_permission_grants',
    'project_goals',
    'project_workspaces',
    'projects',
    'routine_runs',
    'routine_triggers',
    'routines',
    'session',
    'user',
    'user_sidebar_preferences',
    'verification',
    'workspace_operations',
    'workspace_runtime_services'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY paperclip_tables LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', t);
  END LOOP;
END $$;

-- Limpia TYPES composite huérfanos (caso raro: tabla dropeada manualmente
-- en intento previo dejando el TYPE colgado, o CREATE TYPE explícito que
-- alguna migration futura introduzca). DROP IF EXISTS es no-op si no existe.
DO $$
DECLARE
  paperclip_types TEXT[] := ARRAY[
    'account',
    'activity_log',
    'agent_api_keys',
    'agent_config_revisions',
    'agent_runtime_state',
    'agent_task_sessions',
    'agent_wakeup_requests',
    'agents',
    'approval_comments',
    'approvals',
    'assets',
    'board_api_keys',
    'budget_incidents',
    'budget_policies',
    'cli_auth_challenges',
    'companies',
    'company_logos',
    'company_memberships',
    'company_secret_versions',
    'company_secrets',
    'company_skills',
    'company_user_sidebar_preferences',
    'cost_events',
    'document_revisions',
    'documents',
    'environment_leases',
    'environments',
    'execution_workspaces',
    'feedback_exports',
    'feedback_votes',
    'finance_events',
    'goals',
    'heartbeat_run_events',
    'heartbeat_run_watchdog_decisions',
    'heartbeat_runs',
    'inbox_dismissals',
    'instance_settings',
    'instance_user_roles',
    'invites',
    'issue_approvals',
    'issue_attachments',
    'issue_comments',
    'issue_documents',
    'issue_execution_decisions',
    'issue_inbox_archives',
    'issue_labels',
    'issue_read_states',
    'issue_reference_mentions',
    'issue_relations',
    'issue_thread_interactions',
    'issue_tree_hold_members',
    'issue_tree_holds',
    'issue_work_products',
    'issues',
    'join_requests',
    'labels',
    'plugin_company_settings',
    'plugin_config',
    'plugin_database_namespaces',
    'plugin_entities',
    'plugin_job_runs',
    'plugin_jobs',
    'plugin_logs',
    'plugin_migrations',
    'plugin_state',
    'plugin_webhook_deliveries',
    'plugins',
    'principal_permission_grants',
    'project_goals',
    'project_workspaces',
    'projects',
    'routine_runs',
    'routine_triggers',
    'routines',
    'session',
    'user',
    'user_sidebar_preferences',
    'verification',
    'workspace_operations',
    'workspace_runtime_services'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY paperclip_types LOOP
    EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', t);
  END LOOP;
END $$;

-- Verificación post-cleanup. Esperado:
--   public_tables   = 5 (las 5 legacy CRM, ninguna Paperclip)
--   journal_rows    = 0 (drizzle.__drizzle_migrations vacío, list para
--                        que el server aplique las 75 al siguiente arranque)
--   crm_finapticoos = 5 (las 4 finapticoos_* + agent_shared_memory de Bloque 4)
SELECT
  (SELECT count(*)::int FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS public_tables,
  (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS journal_rows,
  (SELECT count(*)::int FROM information_schema.tables
    WHERE table_schema = 'crm'
      AND (table_name LIKE 'finapticoos_%' OR table_name = 'agent_shared_memory')) AS crm_finapticoos;
