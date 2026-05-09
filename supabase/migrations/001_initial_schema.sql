-- ============================================================
-- DeployIQ — Migration 001: Initial Schema
-- ============================================================

-- ── Extensions ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Teams ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  slug       text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ── Users (mirrors auth.users) ──────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id    uuid REFERENCES teams(id) ON DELETE SET NULL,
  email      text NOT NULL,
  role       text DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at timestamptz DEFAULT now()
);

-- ── Pipeline Failures ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipeline_failures (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  repo_url        text NOT NULL,
  platform        text NOT NULL CHECK (platform IN ('github_actions', 'jenkins', 'gitlab_ci', 'circleci', 'azure_devops', 'bitbucket')),
  failed_stage    text,
  raw_logs        JSONB NOT NULL,
  compressed_logs text,
  created_at      timestamptz DEFAULT now()
);

-- ── Diagnoses ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diagnoses (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  failure_id       uuid NOT NULL REFERENCES pipeline_failures(id) ON DELETE CASCADE,
  team_id          uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  category         text NOT NULL CHECK (category IN (
                     'environment_misconfiguration',
                     'dependency_conflict',
                     'build_script_failure',
                     'infrastructure_error',
                     'network_external',
                     'test_quality_gate'
                   )),
  confidence       text NOT NULL CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
  root_cause       text NOT NULL,
  technical_detail text NOT NULL,
  fix_steps        JSONB NOT NULL,  -- [{step: int, label: str, command: str, diff: str|null}]
  prevention       text,
  pr_diff          text,
  time_to_fix_min  int,
  full_output      text NOT NULL,
  created_at       timestamptz DEFAULT now()
);

-- ── Fix Feedback ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fix_feedback (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnosis_id uuid NOT NULL REFERENCES diagnoses(id) ON DELETE CASCADE,
  team_id      uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  worked       boolean NOT NULL,
  notes        text,
  created_at   timestamptz DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_failures_team_created    ON pipeline_failures (team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_failures_platform        ON pipeline_failures (platform);
CREATE INDEX IF NOT EXISTS idx_diagnoses_team_created   ON diagnoses (team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diagnoses_failure        ON diagnoses (failure_id);
CREATE INDEX IF NOT EXISTS idx_diagnoses_category       ON diagnoses (category);
CREATE INDEX IF NOT EXISTS idx_diagnoses_confidence     ON diagnoses (confidence);
CREATE INDEX IF NOT EXISTS idx_feedback_diagnosis       ON fix_feedback (diagnosis_id);
CREATE INDEX IF NOT EXISTS idx_users_team               ON users (team_id);

-- ── Auth Trigger: auto-create user row on signup ─────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (new.id, new.raw_user_meta_data->>'email')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ── RLS: Enable on all tables ─────────────────────────────────
ALTER TABLE teams             ENABLE ROW LEVEL SECURITY;
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnoses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE fix_feedback      ENABLE ROW LEVEL SECURITY;

-- ── RLS Policies: teams ───────────────────────────────────────
CREATE POLICY "teams_select" ON teams
  FOR SELECT USING (
    id IN (SELECT team_id FROM users WHERE id = auth.uid())
  );

-- ── RLS Policies: users ───────────────────────────────────────
CREATE POLICY "users_select_own" ON users
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "users_select_teammates" ON users
  FOR SELECT USING (
    team_id IN (SELECT team_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (id = auth.uid());

-- ── RLS Policies: pipeline_failures ──────────────────────────
CREATE POLICY "failures_select" ON pipeline_failures
  FOR SELECT USING (
    team_id IN (SELECT team_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "failures_insert" ON pipeline_failures
  FOR INSERT WITH CHECK (
    team_id IN (SELECT team_id FROM users WHERE id = auth.uid())
  );

-- ── RLS Policies: diagnoses ───────────────────────────────────
CREATE POLICY "diagnoses_select" ON diagnoses
  FOR SELECT USING (
    team_id IN (SELECT team_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "diagnoses_insert" ON diagnoses
  FOR INSERT WITH CHECK (
    team_id IN (SELECT team_id FROM users WHERE id = auth.uid())
  );

-- ── RLS Policies: fix_feedback ────────────────────────────────
CREATE POLICY "feedback_select" ON fix_feedback
  FOR SELECT USING (
    team_id IN (SELECT team_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "feedback_insert" ON fix_feedback
  FOR INSERT WITH CHECK (
    team_id IN (SELECT team_id FROM users WHERE id = auth.uid())
  );

-- ── Realtime: enable on diagnoses ────────────────────────────
-- Run in Supabase dashboard: Database → Replication → enable for 'diagnoses'
-- Or via CLI: supabase db push then enable in dashboard
