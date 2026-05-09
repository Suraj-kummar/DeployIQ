-- ============================================================
-- DeployIQ — Migration 002: pgvector + Semantic Search
-- Run AFTER 001_initial_schema.sql
-- ============================================================

-- ── Enable pgvector ──────────────────────────────────────────
-- Requires Supabase project on Pro plan or with vector enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- ── Fix Embeddings Table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS fix_embeddings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  failure_id   uuid NOT NULL REFERENCES pipeline_failures(id) ON DELETE CASCADE,
  diagnosis_id uuid NOT NULL REFERENCES diagnoses(id) ON DELETE CASCADE,
  embedding    vector(1536) NOT NULL,  -- OpenAI text-embedding-3-small or Claude equivalent
  summary      text NOT NULL,          -- short text: category + root_cause + fix_steps[0]
  created_at   timestamptz DEFAULT now()
);

-- ── IVFFlat index for fast ANN search ────────────────────────
-- lists=100 is good for up to ~1M rows; tune as data grows
CREATE INDEX IF NOT EXISTS idx_embeddings_team ON fix_embeddings (team_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_ivfflat
  ON fix_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE fix_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "embeddings_select" ON fix_embeddings
  FOR SELECT USING (
    team_id IN (SELECT team_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "embeddings_insert" ON fix_embeddings
  FOR INSERT WITH CHECK (
    team_id IN (SELECT team_id FROM users WHERE id = auth.uid())
  );

-- ── Similarity Search Function ────────────────────────────────
-- Called by FastAPI to find the 3 most similar past fixes
-- Uses cosine distance (<=>), returns similarity score [0, 1]
CREATE OR REPLACE FUNCTION match_similar_fixes(
  query_embedding vector(1536),
  match_team_id   uuid,
  match_count     int DEFAULT 3,
  min_similarity  float DEFAULT 0.70
)
RETURNS TABLE (
  diagnosis_id uuid,
  failure_id   uuid,
  summary      text,
  similarity   float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    fe.diagnosis_id,
    fe.failure_id,
    fe.summary,
    1 - (fe.embedding <=> query_embedding) AS similarity
  FROM fix_embeddings fe
  WHERE
    fe.team_id = match_team_id
    AND 1 - (fe.embedding <=> query_embedding) >= min_similarity
  ORDER BY fe.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ── Stats View (for dashboard) ────────────────────────────────
CREATE OR REPLACE VIEW team_diagnosis_stats AS
SELECT
  d.team_id,
  COUNT(DISTINCT d.id)                                        AS total_diagnoses,
  COUNT(DISTINCT d.failure_id)                                AS total_failures,
  ROUND(AVG(d.time_to_fix_min)::numeric, 1)                  AS avg_fix_minutes,
  COUNT(DISTINCT ff.id) FILTER (WHERE ff.worked = true)       AS confirmed_fixes,
  COUNT(DISTINCT ff.id) FILTER (WHERE ff.worked = false)      AS failed_fixes,
  ROUND(
    100.0 * COUNT(DISTINCT ff.id) FILTER (WHERE ff.worked = true)
    / NULLIF(COUNT(DISTINCT ff.id), 0), 1
  )                                                           AS fix_success_rate,
  COUNT(DISTINCT d.id) FILTER (WHERE d.confidence = 'HIGH')  AS high_confidence_count,
  MAX(d.created_at)                                           AS last_diagnosis_at
FROM diagnoses d
LEFT JOIN fix_feedback ff ON ff.diagnosis_id = d.id
GROUP BY d.team_id;

-- Grant access to authenticated users (RLS applies at table level)
GRANT SELECT ON team_diagnosis_stats TO authenticated;
