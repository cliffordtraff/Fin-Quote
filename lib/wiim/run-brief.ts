import {
  completeWiimRun,
  createWiimRun,
  getLatestWiimRun,
  storeWiimCandidates,
} from './store'
import { computeWiimDelta } from './delta'
import { fetchWiimCandidates } from './fetch-candidates'
import { formatWiimBrief } from './format'
import { rankWiimCandidates, summarizeWiimRun } from './rank'
import type {
  RankedWiimCandidate,
  WiimRunSummary,
  WiimRunType,
} from './types'

export interface RunWiimBriefOptions {
  runType?: WiimRunType
  compareLatest?: boolean
  compareRunType?: WiimRunType
  label?: string
  persist?: boolean
  signal?: AbortSignal
}

export interface RunWiimBriefResult extends WiimRunSummary {
  runId: string | null
  rankedCandidateCount: number
}

export async function runWiimBrief(
  options: RunWiimBriefOptions = {},
): Promise<RunWiimBriefResult> {
  const runType = options.runType ?? 'morning'
  const compareLatest = options.compareLatest ?? true
  const compareRunType =
    options.compareRunType ?? (runType === 'mid_morning' ? 'morning' : runType)
  const label =
    options.label ??
    (runType === 'mid_morning'
      ? 'WIIM Mid-Morning Brief'
      : 'WIIM Morning Brief')
  const persist = options.persist ?? true
  options.signal?.throwIfAborted()

  if (!['morning', 'mid_morning'].includes(runType)) {
    throw new Error(`Unsupported WIIM run type: ${runType}`)
  }
  if (!['morning', 'mid_morning'].includes(compareRunType)) {
    throw new Error(`Unsupported WIIM comparison run type: ${compareRunType}`)
  }

  const fetched = await fetchWiimCandidates(options.signal)
  options.signal?.throwIfAborted()
  const rankedCandidates = rankWiimCandidates(
    fetched.candidates,
    fetched.candidates.length,
  )
  const topFive = rankedCandidates.slice(0, 5)
  const latestRun = compareLatest
    ? await getLatestWiimRun(compareRunType, options.signal)
    : null
  options.signal?.throwIfAborted()
  const previousTopFive = Array.isArray(latestRun?.top_five_json)
    ? (latestRun.top_five_json as unknown as RankedWiimCandidate[])
    : []
  const delta =
    compareLatest && previousTopFive.length > 0
      ? computeWiimDelta(previousTopFive, topFive)
      : null
  const summary = summarizeWiimRun({
    runType,
    generatedAt: fetched.generatedAt,
    candidateCount: fetched.candidates.length,
    topFive,
    metadata: {
      marketCandidateCount: fetched.marketCandidateCount,
      delta,
      comparisonRunId: latestRun?.id ?? null,
      comparisonRunType: compareLatest ? compareRunType : null,
    },
  })
  summary.summaryText = formatWiimBrief({
    ...summary,
    metadata: {
      ...summary.metadata,
      label,
    },
  })

  if (!persist) {
    return {
      runId: null,
      rankedCandidateCount: rankedCandidates.length,
      ...summary,
    }
  }

  let runId: string | null = null
  try {
    options.signal?.throwIfAborted()
    const run = await createWiimRun({
      runType,
      metadata: {
        marketCandidateCount: fetched.marketCandidateCount,
        candidateCount: fetched.candidates.length,
        automation: true,
      },
      signal: options.signal,
    })
    runId = run.id
    options.signal?.throwIfAborted()
    await storeWiimCandidates(run.id, rankedCandidates, options.signal)
    options.signal?.throwIfAborted()
    await completeWiimRun({
      runId: run.id,
      status: 'completed',
      summaryText: summary.summaryText,
      topCandidate: summary.topCandidate,
      bestContrarianCandidate: summary.bestContrarianCandidate,
      topFive,
      metadata: {
        marketCandidateCount: fetched.marketCandidateCount,
        candidateCount: fetched.candidates.length,
        persistedCandidateCount: rankedCandidates.length,
        generatedAt: fetched.generatedAt,
        compareLatest,
        comparisonRunId: latestRun?.id ?? null,
        comparisonRunType: compareLatest ? compareRunType : null,
        delta,
        automation: true,
      },
      signal: options.signal,
    })
  } catch (error) {
    if (runId) {
      await completeWiimRun({
        runId,
        status: 'failed',
        metadata: {
          automation: true,
          error: error instanceof Error ? error.message : String(error),
        },
        signal: AbortSignal.timeout(5_000),
      }).catch(() => undefined)
    }
    throw error
  }

  return {
    runId,
    rankedCandidateCount: rankedCandidates.length,
    ...summary,
  }
}
