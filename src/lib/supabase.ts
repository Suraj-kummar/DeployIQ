// src/lib/supabase.ts
// Supabase client for DeployIQ frontend (React)
// Uses ANON key — RLS enforces team scoping on every query

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
}

// ── Database Types ────────────────────────────────────────────

export type Platform =
  | 'github_actions'
  | 'jenkins'
  | 'gitlab_ci'
  | 'circleci'
  | 'azure_devops'
  | 'bitbucket'

export type DiagnosisCategory =
  | 'environment_misconfiguration'
  | 'dependency_conflict'
  | 'build_script_failure'
  | 'infrastructure_error'
  | 'network_external'
  | 'test_quality_gate'

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'

export interface Team {
  id: string
  name: string
  slug: string
  created_at: string
}

export interface AppUser {
  id: string
  team_id: string | null
  email: string
  role: 'admin' | 'member'
  created_at: string
}

export interface PipelineFailure {
  id: string
  team_id: string
  repo_url: string
  platform: Platform
  failed_stage: string | null
  raw_logs: Record<string, unknown>
  compressed_logs: string | null
  created_at: string
}

export interface FixStep {
  step: number
  label: string
  command: string
  diff: string | null
}

export interface Diagnosis {
  id: string
  failure_id: string
  team_id: string
  category: DiagnosisCategory
  confidence: Confidence
  root_cause: string
  technical_detail: string
  fix_steps: FixStep[]
  prevention: string | null
  pr_diff: string | null
  time_to_fix_min: number | null
  full_output: string
  created_at: string
  // joined
  pipeline_failures?: PipelineFailure
}

export interface FixFeedback {
  id: string
  diagnosis_id: string
  team_id: string
  worked: boolean
  notes: string | null
  created_at: string
}

export interface TeamDiagnosisStats {
  team_id: string
  total_diagnoses: number
  total_failures: number
  avg_fix_minutes: number | null
  confirmed_fixes: number
  failed_fixes: number
  fix_success_rate: number | null
  high_confidence_count: number
  last_diagnosis_at: string | null
}

// ── Database Schema Definition ────────────────────────────────

export interface Database {
  public: {
    Tables: {
      teams:             { Row: Team;            Insert: Omit<Team, 'id' | 'created_at'>;           Update: Partial<Omit<Team, 'id'>> }
      users:             { Row: AppUser;         Insert: Omit<AppUser, 'created_at'>;                Update: Partial<Omit<AppUser, 'id'>> }
      pipeline_failures: { Row: PipelineFailure; Insert: Omit<PipelineFailure, 'id' | 'created_at'>; Update: Partial<Omit<PipelineFailure, 'id'>> }
      diagnoses:         { Row: Diagnosis;       Insert: Omit<Diagnosis, 'id' | 'created_at' | 'pipeline_failures'>; Update: Partial<Omit<Diagnosis, 'id'>> }
      fix_feedback:      { Row: FixFeedback;     Insert: Omit<FixFeedback, 'id' | 'created_at'>;    Update: Partial<Omit<FixFeedback, 'id'>> }
    }
    Views: {
      team_diagnosis_stats: { Row: TeamDiagnosisStats }
    }
    Functions: {
      match_similar_fixes: {
        Args: { query_embedding: number[]; match_team_id: string; match_count?: number; min_similarity?: number }
        Returns: { diagnosis_id: string; failure_id: string; summary: string; similarity: number }[]
      }
    }
  }
}

// ── Client ────────────────────────────────────────────────────

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
})

// ── Auth Helpers ──────────────────────────────────────────────

export const signInWithGitHub = () =>
  supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      scopes: 'read:user user:email',
    },
  })

export const signInWithGoogle = () =>
  supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      scopes: 'openid email profile',
      queryParams: {
        access_type: 'offline',
        prompt: 'select_account',
      },
    },
  })

export const signOut = () => supabase.auth.signOut()

export const getSession = () => supabase.auth.getSession()

export const getUser = () => supabase.auth.getUser()
