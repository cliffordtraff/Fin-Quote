import { createClient } from '@supabase/supabase-js'

import type { Database, Json } from '@/lib/database.types'

import type { RankedWiimCandidate, WiimRunStatus, WiimRunType } from './types'

type WiimRunRow = Database['public']['Tables']['wiim_runs']['Row']

function createSupabaseWriteClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export async function createWiimRun(input: {
  runType: WiimRunType
  metadata?: Record<string, unknown>
  signal?: AbortSignal
}): Promise<WiimRunRow> {
  const supabase = createSupabaseWriteClient()
  const startedAt = new Date().toISOString()

  let query = supabase
    .from('wiim_runs')
    .insert({
      run_type: input.runType,
      status: 'running',
      started_at: startedAt,
      metadata_json: (input.metadata ?? {}) as Json,
    })
    .select('*')
  if (input.signal) query = query.abortSignal(input.signal)
  const { data, error } = await query.single()

  if (error || !data) {
    throw new Error(`Failed to create WIIM run: ${error?.message ?? 'unknown error'}`)
  }

  return data
}

export async function storeWiimCandidates(
  runId: string,
  candidates: RankedWiimCandidate[],
  signal?: AbortSignal,
) {
  if (candidates.length === 0) return

  const supabase = createSupabaseWriteClient()
  let query = supabase.from('wiim_run_candidates').insert(
    candidates.map((candidate) => ({
      wiim_run_id: runId,
      rank: candidate.rank,
      ticker: candidate.ticker,
      theme: candidate.theme,
      headline: candidate.headline,
      why_it_matters: candidate.whyItMatters,
      confidence_score: candidate.confidenceScore,
      candidate_type: candidate.candidateType,
      state_label: candidate.stateLabel,
      signals_json: candidate.signals as unknown as Json,
      source_refs_json: candidate.sourceRefs as unknown as Json,
      metadata_json: candidate.metadata as unknown as Json,
    })),
  )
  if (signal) query = query.abortSignal(signal)
  const { error } = await query

  if (error) {
    throw new Error(`Failed to store WIIM candidates: ${error.message}`)
  }
}

export async function completeWiimRun(input: {
  runId: string
  status?: Extract<WiimRunStatus, 'completed' | 'failed'>
  summaryText?: string | null
  topCandidate?: string | null
  bestContrarianCandidate?: string | null
  topFive?: RankedWiimCandidate[]
  metadata?: Record<string, unknown>
  signal?: AbortSignal
}) {
  const supabase = createSupabaseWriteClient()
  let query = supabase
    .from('wiim_runs')
    .update({
      status: input.status ?? 'completed',
      completed_at: new Date().toISOString(),
      summary_text: input.summaryText ?? null,
      top_candidate: input.topCandidate ?? null,
      best_contrarian_candidate: input.bestContrarianCandidate ?? null,
      top_five_json: (input.topFive ?? null) as unknown as Json,
      metadata_json: (input.metadata ?? {}) as Json,
    })
    .eq('id', input.runId)
  if (input.signal) query = query.abortSignal(input.signal)
  const { error } = await query

  if (error) {
    throw new Error(`Failed to update WIIM run: ${error.message}`)
  }
}

export async function getLatestWiimRun(
  runType: WiimRunType = 'morning',
  signal?: AbortSignal,
): Promise<WiimRunRow | null> {
  const supabase = createSupabaseWriteClient()
  let query = supabase
    .from('wiim_runs')
    .select('*')
    .eq('run_type', runType)
    .eq('status', 'completed')
    .order('started_at', { ascending: false })
    .limit(1)
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query.maybeSingle()

  if (error) {
    throw new Error(`Failed to fetch latest WIIM run: ${error.message}`)
  }

  return data
}
