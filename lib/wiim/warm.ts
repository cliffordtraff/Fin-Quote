import { getStockWhyMovingData, peekStockWhyMovingCache } from '@/lib/stock-why-moving'

export type WarmProfile = 'gentle' | 'balanced' | 'aggressive'

export interface WarmProfileSettings {
  concurrency: number
  batchSize: number
  perSymbolPauseMs: number
  jitterMs: number
}

export const WIIM_WARM_PROFILES: Record<WarmProfile, WarmProfileSettings> = {
  gentle: {
    concurrency: 1,
    batchSize: 1,
    perSymbolPauseMs: 300,
    jitterMs: 150,
  },
  balanced: {
    concurrency: 2,
    batchSize: 2,
    perSymbolPauseMs: 250,
    jitterMs: 100,
  },
  aggressive: {
    concurrency: 4,
    batchSize: 5,
    perSymbolPauseMs: 150,
    jitterMs: 75,
  },
}

export const WIIM_WARM_RETRY_PROFILE: WarmProfileSettings = {
  concurrency: 1,
  batchSize: 1,
  perSymbolPauseMs: 350,
  jitterMs: 150,
}

export type WarmResultStatus =
  | 'found'
  | 'not_found'
  | 'error'
  | 'skipped_fresh'
  | 'dry_run'

export interface WarmResult {
  symbol: string
  status: WarmResultStatus
  displayText: string | null
  errorMessage: string | null
  source: 'cache' | 'live' | 'none'
  pass: 1 | 2
}

export interface WarmSummary {
  warmedCount: number
  successCount: number
  notFoundCount: number
  errorCount: number
  skippedFreshCount: number
  dryRunCount: number
  errorRate: number
  errorSymbols: string[]
}

export interface WarmSymbolOptions {
  dryRun: boolean
  forceRefresh: boolean
  perSymbolPauseMs: number
  jitterMs: number
  pass?: 1 | 2
  signal?: AbortSignal
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(signal?.reason)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export function resolveWarmProfile(profile: string | undefined): WarmProfileSettings {
  if (profile === 'gentle' || profile === 'balanced' || profile === 'aggressive') {
    return WIIM_WARM_PROFILES[profile]
  }
  return WIIM_WARM_PROFILES.balanced
}

export function summarizeWarmResults(results: WarmResult[]): WarmSummary {
  const successCount = results.filter((item) => item.status === 'found').length
  const notFoundCount = results.filter((item) => item.status === 'not_found').length
  const errorCount = results.filter((item) => item.status === 'error').length
  const skippedFreshCount = results.filter((item) => item.status === 'skipped_fresh').length
  const dryRunCount = results.filter((item) => item.status === 'dry_run').length
  const attemptedLiveCount = results.length - skippedFreshCount - dryRunCount
  const errorRate = attemptedLiveCount > 0 ? errorCount / attemptedLiveCount : 0

  return {
    warmedCount: results.length,
    successCount,
    notFoundCount,
    errorCount,
    skippedFreshCount,
    dryRunCount,
    errorRate: Math.round(errorRate * 1000) / 1000,
    errorSymbols: results.filter((item) => item.status === 'error').map((item) => item.symbol),
  }
}

export function mergeWarmRetryResults(primary: WarmResult[], retry: WarmResult[]): WarmResult[] {
  const retryBySymbol = new Map(retry.map((item) => [item.symbol, item]))
  const merged = primary.map((item) => {
    if (item.status !== 'error') return item
    const retried = retryBySymbol.get(item.symbol)
    if (!retried || retried.status === 'error') return item
    return retried
  })

  for (const item of retry) {
    if (!merged.some((entry) => entry.symbol === item.symbol)) {
      merged.push(item)
    }
  }

  return merged
}

export async function warmSymbol(symbol: string, options: WarmSymbolOptions): Promise<WarmResult> {
  const pass = options.pass ?? 1
  options.signal?.throwIfAborted()

  if (options.dryRun) {
    return {
      symbol,
      status: 'dry_run',
      displayText: null,
      errorMessage: null,
      source: 'none',
      pass,
    }
  }

  if (!options.forceRefresh) {
    const cached = await peekStockWhyMovingCache(symbol)
    if (cached.freshness === 'fresh' && cached.result) {
      return {
        symbol,
        status: 'skipped_fresh',
        displayText: cached.result.displayText,
        errorMessage: null,
        source: 'cache',
        pass,
      }
    }
  }

  const result = await getStockWhyMovingData(symbol, {
    forceRefresh: options.forceRefresh,
    signal: options.signal,
  })
  options.signal?.throwIfAborted()
  const liveResult: WarmResult = {
    symbol,
    status: result.status,
    displayText: result.displayText,
    errorMessage: result.errorMessage,
    source: 'live',
    pass,
  }

  const jitter = options.jitterMs > 0 ? Math.floor(Math.random() * options.jitterMs) : 0
  const pause = options.perSymbolPauseMs + jitter
  if (pause > 0) {
    await sleep(pause, options.signal)
  }

  return liveResult
}

export async function warmSymbolsSequential(
  symbols: string[],
  options: WarmSymbolOptions,
): Promise<WarmResult[]> {
  const results: WarmResult[] = []
  for (const symbol of symbols) {
    results.push(await warmSymbol(symbol, options))
  }
  return results
}

export interface WarmRunComparisonRow {
  label: string
  profile?: string
  universeMode?: string
  warmedCount: number
  successCount: number
  notFoundCount: number
  errorCount: number
  skippedFreshCount: number
  errorRate: number
  concurrency?: number
  batchSize?: number
  perSymbolPauseMs?: number
  jitterMs?: number
  retryPass?: boolean
}

export function buildWarmRunComparisonRow(
  label: string,
  payload: Record<string, unknown>,
): WarmRunComparisonRow {
  const summary = summarizeWarmResults(
    Array.isArray(payload.results)
      ? (payload.results as WarmResult[])
      : [],
  )

  return {
    label,
    profile: typeof payload.profile === 'string' ? payload.profile : undefined,
    universeMode: typeof payload.universeMode === 'string' ? payload.universeMode : undefined,
    warmedCount: Number(payload.warmedCount ?? summary.warmedCount),
    successCount: Number(payload.successCount ?? summary.successCount),
    notFoundCount: Number(payload.notFoundCount ?? summary.notFoundCount),
    errorCount: Number(payload.errorCount ?? summary.errorCount),
    skippedFreshCount: Number(payload.skippedFreshCount ?? summary.skippedFreshCount),
    errorRate: Number(payload.errorRate ?? summary.errorRate),
    concurrency: typeof payload.concurrency === 'number' ? payload.concurrency : undefined,
    batchSize: typeof payload.batchSize === 'number' ? payload.batchSize : undefined,
    perSymbolPauseMs: typeof payload.perSymbolPauseMs === 'number' ? payload.perSymbolPauseMs : undefined,
    jitterMs: typeof payload.jitterMs === 'number' ? payload.jitterMs : undefined,
    retryPass: Boolean(payload.retryPass),
  }
}

export function formatWarmRunComparison(rows: WarmRunComparisonRow[]): string {
  const headers = [
    'label',
    'found',
    'not_found',
    'error',
    'skipped',
    'error_rate',
    'profile',
  ]

  const lines = [
    headers.join('\t'),
    ...rows.map((row) =>
      [
        row.label,
        row.successCount,
        row.notFoundCount,
        row.errorCount,
        row.skippedFreshCount,
        row.errorRate.toFixed(3),
        row.profile ?? '-',
      ].join('\t'),
    ),
  ]

  return lines.join('\n')
}
