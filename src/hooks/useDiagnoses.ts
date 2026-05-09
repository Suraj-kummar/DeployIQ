// src/hooks/useDiagnoses.ts
// React hooks for all Supabase data fetching + Realtime subscription

import { useEffect, useState, useCallback } from 'react'
import { supabase, type Diagnosis, type PipelineFailure, type FixFeedback, type TeamDiagnosisStats } from '../lib/supabase'



// ── useDiagnoses ──────────────────────────────────────────────
// Fetches recent diagnoses and subscribes to live INSERT events.
// Dashboard updates instantly when FastAPI writes a new diagnosis.

export function useDiagnoses(teamId: string | null, limit = 20) {
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!teamId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('diagnoses')
      .select('*, pipeline_failures(repo_url, platform, failed_stage)')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) setError(error.message)
    else setDiagnoses(data as Diagnosis[])
    setLoading(false)
  }, [teamId, limit])

  useEffect(() => {
    fetch()
  }, [fetch])

  // Realtime subscription — new diagnoses appear without reload
  useEffect(() => {
    if (!teamId) return

    const channel = supabase
      .channel(`diagnoses:${teamId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'diagnoses',
          filter: `team_id=eq.${teamId}`,
        },
        (payload) => {
          setDiagnoses((prev) => [payload.new as Diagnosis, ...prev])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [teamId])

  return { diagnoses, loading, error, refetch: fetch }
}

// ── useFailures ───────────────────────────────────────────────

export function useFailures(teamId: string | null, limit = 20) {
  const [failures, setFailures] = useState<PipelineFailure[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    if (!teamId) return
    setLoading(true)
    supabase
      .from('pipeline_failures')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(limit)
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setFailures(data as PipelineFailure[])
        setLoading(false)
      })
  }, [teamId, limit])

  return { failures, loading, error }
}

// ── useTeamStats ──────────────────────────────────────────────

export function useTeamStats(teamId: string | null) {
  const [stats, setStats]     = useState<TeamDiagnosisStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    if (!teamId) return
    supabase
      .from('team_diagnosis_stats')
      .select('*')
      .eq('team_id', teamId)
      .single()
      .then(({ data, error }) => {
        if (error && error.code !== 'PGRST116') setError(error.message)
        else setStats((data ?? null) as unknown as TeamDiagnosisStats)
        setLoading(false)
      })
  }, [teamId])

  return { stats, loading, error }
}

// ── useSubmitFeedback ─────────────────────────────────────────

export function useSubmitFeedback() {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const submit = useCallback(async (
    diagnosisId: string,
    teamId: string,
    worked: boolean,
    notes?: string,
  ): Promise<FixFeedback | null> => {
    setSubmitting(true)
    setError(null)
    const { data, error } = await supabase
      .from('fix_feedback')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert([{ diagnosis_id: diagnosisId, team_id: teamId, worked, notes: notes ?? null }] as any)
      .select()
      .single()

    setSubmitting(false)
    if (error) { setError(error.message); return null }
    return data as FixFeedback
  }, [])

  return { submit, submitting, error }
}

// ── useCurrentUser ────────────────────────────────────────────

export function useCurrentUser() {
  const [userId, setUserId]   = useState<string | null>(null)
  const [teamId, setTeamId]   = useState<string | null>(null)
  const [role, setRole]       = useState<'admin' | 'member' | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id ?? null
      setUserId(uid)
      if (uid) {
        supabase
          .from('users')
          .select('team_id, role')
          .eq('id', uid)
          .single()
          .then(({ data }) => {
            const user = data as { team_id: string | null; role: 'admin' | 'member' } | null
            setTeamId(user?.team_id ?? null)
            setRole(user?.role ?? null)
            setLoading(false)
          })
      } else {
        setLoading(false)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  return { userId, teamId, role, loading }
}
