-- FinapticoOS Sprint 0 Bloque 4 — initial schema for control plane + shared semantic memory.
-- Target: Supabase Finaptico project ref utwhvnafvtardndgkbjn.
-- Apply with: psql "$DIRECT_URL" -f migrations/0001_finapticoos_initial.sql
-- Idempotent: every CREATE uses IF NOT EXISTS so reruns are safe.

CREATE SCHEMA IF NOT EXISTS crm;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- crm.finapticoos_users — operadores humanos del control plane FinapticoOS.
-- Independiente de Paperclip core auth (better-auth en public.*) y de cualquier
-- tabla de usuarios CRM existente. Solo se crea si el schema lo necesita.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm.finapticoos_users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  role        TEXT NOT NULL DEFAULT 'admin',
  status      TEXT NOT NULL DEFAULT 'active',
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finapticoos_users_status
  ON crm.finapticoos_users (status);

-- ----------------------------------------------------------------------------
-- crm.finapticoos_plugins — plugins instalados en el control plane.
-- Refleja el manifest del plugin SDK + estado de ciclo de vida.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm.finapticoos_plugins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,
  version       TEXT NOT NULL,
  manifest      JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'pending',
  installed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  installed_by  UUID REFERENCES crm.finapticoos_users(id) ON DELETE SET NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finapticoos_plugins_status
  ON crm.finapticoos_plugins (status);

-- ----------------------------------------------------------------------------
-- crm.finapticoos_approvals — aprobaciones humanas pendientes / decididas.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm.finapticoos_approvals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id     UUID REFERENCES crm.finapticoos_plugins(id) ON DELETE CASCADE,
  action_type   TEXT NOT NULL,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'pending',
  requested_by  TEXT,
  decided_by    UUID REFERENCES crm.finapticoos_users(id) ON DELETE SET NULL,
  decided_at    TIMESTAMPTZ,
  decision_note TEXT,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finapticoos_approvals_status
  ON crm.finapticoos_approvals (status);
CREATE INDEX IF NOT EXISTS idx_finapticoos_approvals_plugin
  ON crm.finapticoos_approvals (plugin_id);

-- ----------------------------------------------------------------------------
-- crm.finapticoos_actions_log — audit log inmutable de acciones ejecutadas.
-- Plan Bloque 5 (adapter Anthropic) + Bloque 8 (audit) leen/escriben aquí.
-- Tokens y coste por llamada se loguean en este nivel para tracking de gasto.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm.finapticoos_actions_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id     UUID REFERENCES crm.finapticoos_plugins(id) ON DELETE SET NULL,
  approval_id   UUID REFERENCES crm.finapticoos_approvals(id) ON DELETE SET NULL,
  action_type   TEXT NOT NULL,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  result        JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'pending',
  executed_by   UUID REFERENCES crm.finapticoos_users(id) ON DELETE SET NULL,
  approved_by   UUID REFERENCES crm.finapticoos_users(id) ON DELETE SET NULL,
  tokens_in     INTEGER NOT NULL DEFAULT 0,
  tokens_out    INTEGER NOT NULL DEFAULT 0,
  cost_cents    INTEGER NOT NULL DEFAULT 0,
  model         TEXT,
  executed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finapticoos_actions_log_plugin
  ON crm.finapticoos_actions_log (plugin_id);
CREATE INDEX IF NOT EXISTS idx_finapticoos_actions_log_executed_at
  ON crm.finapticoos_actions_log (executed_at DESC);

-- ----------------------------------------------------------------------------
-- crm.agent_shared_memory — memoria semántica compartida entre agentes Finaptico
-- (FinapticoOS plugins, agentes CRM, agentes n8n). pgvector + OpenAI
-- text-embedding-3-small (1536 dims). Plan Bloque 4 línea 59.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm.agent_shared_memory (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope       TEXT NOT NULL,
  content     TEXT NOT NULL,
  embedding   vector(1536) NOT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_shared_memory_scope
  ON crm.agent_shared_memory (scope);

CREATE INDEX IF NOT EXISTS idx_agent_shared_memory_expires_at
  ON crm.agent_shared_memory (expires_at)
  WHERE expires_at IS NOT NULL;

-- ivfflat needs ANALYZE to estimate row counts; lists=100 is the Supabase default.
-- For datasets < 1k rows the index is overkill but harmless. Tune lists when the
-- table grows past 1M rows (rule of thumb: lists ≈ rows / 1000).
CREATE INDEX IF NOT EXISTS idx_agent_shared_memory_embedding
  ON crm.agent_shared_memory
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
