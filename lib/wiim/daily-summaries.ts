import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  generateStockWhyMovingSummary,
  storeGeneratedWhyMovingSummary,
  WIIM_SUMMARY_CONFIG_VERSION,
} from '@/lib/generated-stock-why-moving'

export interface DailySummaryCoverage {
  completedSymbols: string[]
  generatedSymbols: string[]
  noResultSymbols: string[]
  validationRejectedSymbols: string[]
}

export interface DailySummaryBatchResult {
  attemptedSymbols: string[]
  generatedSymbols: string[]
  noResultSymbols: string[]
  failed: Array<{ symbol: string; error: string }>
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Missing Supabase service role configuration for daily summaries',
    )
  }
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function uniqueSymbols(symbols: string[]) {
  return Array.from(
    new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)),
  )
}

export function mergeWiimSummaryRunSymbols(
  existingSymbols: string[],
  requestedSymbols: string[],
): string[] {
  return uniqueSymbols([...existingSymbols, ...requestedSymbols])
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  let nextIndex = 0
  async function runner() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      await worker(items[index])
    }
  }
  const results = await Promise.allSettled(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), items.length) },
      () => runner(),
    ),
  )
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  )
  if (failure) throw failure.reason
}

export async function withAbortTimeout<T>(
  worker: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  label: string,
  upstreamSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController()
  let timedOut = false
  const onUpstreamAbort = () => controller.abort(upstreamSignal?.reason)
  if (upstreamSignal?.aborted) onUpstreamAbort()
  else upstreamSignal?.addEventListener('abort', onUpstreamAbort, {
    once: true,
  })
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort(new Error(`${label} timed out after ${timeoutMs}ms`))
  }, timeoutMs)
  let removeWorkerAbortListener: () => void = () => undefined
  const aborted = new Promise<never>((_resolve, reject) => {
    const onWorkerAbort = () => {
      reject(
        controller.signal.reason ??
          new Error(`${label} generation was cancelled`),
      )
    }
    if (controller.signal.aborted) {
      onWorkerAbort()
      return
    }
    controller.signal.addEventListener('abort', onWorkerAbort, { once: true })
    removeWorkerAbortListener = () =>
      controller.signal.removeEventListener('abort', onWorkerAbort)
  })
  try {
    // Provider reads do not all support cancellation. Racing the abort keeps
    // the leased cron invocation bounded; persistence happens only after this
    // wrapper resolves, so a detached read can never write a stale summary.
    return await Promise.race([
      Promise.resolve().then(() => worker(controller.signal)),
      aborted,
    ])
  } catch (error) {
    if (timedOut) {
      throw new Error(`${label} timed out after ${timeoutMs}ms`, {
        cause: error,
      })
    }
    throw error
  } finally {
    clearTimeout(timer)
    removeWorkerAbortListener()
    upstreamSignal?.removeEventListener('abort', onUpstreamAbort)
  }
}

export async function getDailySummaryCoverage(
  marketDate: string,
  symbols: string[],
  signal?: AbortSignal,
): Promise<DailySummaryCoverage> {
  signal?.throwIfAborted()
  const normalized = uniqueSymbols(symbols)
  if (normalized.length === 0) {
    return {
      completedSymbols: [],
      generatedSymbols: [],
      noResultSymbols: [],
      validationRejectedSymbols: [],
    }
  }

  const supabase = getServiceClient()
  const rows: Array<{
    symbol: string
    summary_text: string | null
    no_summary_reason: string | null
  }> = []
  for (let index = 0; index < normalized.length; index += 100) {
    signal?.throwIfAborted()
    const batch = normalized.slice(index, index + 100)
    let query = supabase
      .from('stock_summaries')
      .select('symbol, summary_text, no_summary_reason')
      .eq('summary_date', marketDate)
      .eq('config_version', WIIM_SUMMARY_CONFIG_VERSION)
      .in('symbol', batch)
    if (signal) query = query.abortSignal(signal)
    const { data, error } = await query
    if (error) {
      throw new Error(`Failed to read daily summary coverage: ${error.message}`)
    }
    rows.push(...(data ?? []))
  }
  signal?.throwIfAborted()

  const generated = new Set<string>()
  const noResult = new Set<string>()
  const rejected = new Set<string>()
  for (const row of rows) {
    if (row.summary_text?.trim()) generated.add(row.symbol)
    else if (row.no_summary_reason === 'validation_rejected') {
      rejected.add(row.symbol)
    } else {
      noResult.add(row.symbol)
    }
  }
  const completed = new Set([...generated, ...noResult])
  return {
    completedSymbols: Array.from(completed),
    generatedSymbols: Array.from(generated),
    noResultSymbols: Array.from(noResult),
    validationRejectedSymbols: Array.from(rejected),
  }
}

export async function generateDailySummaryBatch(input: {
  marketDate: string
  symbols: string[]
  /** Full run universe when `symbols` contains only the current retry batch. */
  runSymbols?: string[]
  runId: string
  limit?: number
  concurrency?: number
  perSymbolTimeoutMs?: number
  model?: string
  force?: boolean
  signal?: AbortSignal
  /** Persist retry bookkeeping after the exact batch is known, before work starts. */
  onBatchDispatched?: (symbols: string[]) => Promise<void>
}): Promise<DailySummaryBatchResult> {
  input.signal?.throwIfAborted()
  const normalized = uniqueSymbols(input.symbols)
  const coverage = input.force
    ? {
        completedSymbols: [],
        generatedSymbols: [],
        noResultSymbols: [],
        validationRejectedSymbols: [],
      }
    : await getDailySummaryCoverage(input.marketDate, normalized, input.signal)
  input.signal?.throwIfAborted()
  const completed = new Set(coverage.completedSymbols)
  const attemptedSymbols = normalized
    .filter((symbol) => !completed.has(symbol))
    .slice(0, Math.max(1, Math.min(50, input.limit ?? 24)))
  const generatedSymbols: string[] = []
  const noResultSymbols: string[] = []
  const failed: Array<{ symbol: string; error: string }> = []

  if (attemptedSymbols.length === 0) {
    return { attemptedSymbols, generatedSymbols, noResultSymbols, failed }
  }

  const supabase = getServiceClient()
  const model =
    input.model ??
    process.env.WIIM_SUMMARY_MODEL ??
    process.env.OPENAI_MODEL ??
    'gpt-5-nano'
  let existingRunQuery = supabase
    .from('wiim_summary_runs')
    .select('run_date, tickers')
    .eq('run_id', input.runId)
  if (input.signal) {
    existingRunQuery = existingRunQuery.abortSignal(input.signal)
  }
  const { data: existingRun, error: existingRunError } =
    await existingRunQuery.maybeSingle()
  if (existingRunError) {
    throw new Error(
      `Failed to inspect daily summary run: ${existingRunError.message}`,
    )
  }
  const existingSymbols =
    existingRun?.run_date === input.marketDate ? existingRun.tickers : []
  const runSymbols = mergeWiimSummaryRunSymbols(
    existingSymbols,
    input.runSymbols ?? normalized,
  )
  input.signal?.throwIfAborted()
  let runUpsert = supabase.from('wiim_summary_runs').upsert({
    run_id: input.runId,
    run_date: input.marketDate,
    ticker_count: runSymbols.length,
    tickers: runSymbols,
    model,
    config_version: WIIM_SUMMARY_CONFIG_VERSION,
  })
  if (input.signal) runUpsert = runUpsert.abortSignal(input.signal)
  const { error: runError } = await runUpsert
  if (runError) {
    throw new Error(`Failed to record daily summary run: ${runError.message}`)
  }

  input.signal?.throwIfAborted()
  await input.onBatchDispatched?.([...attemptedSymbols])
  input.signal?.throwIfAborted()

  await runPool(
    attemptedSymbols,
    Math.max(1, Math.min(6, input.concurrency ?? 4)),
    async (symbol) => {
      try {
        input.signal?.throwIfAborted()
        const summary = await withAbortTimeout(
          (signal) => generateStockWhyMovingSummary({
            symbol,
            summaryDate: input.marketDate,
            model,
            signal,
          }),
          input.perSymbolTimeoutMs ?? 45_000,
          symbol,
          input.signal,
        )
        input.signal?.throwIfAborted()
        await storeGeneratedWhyMovingSummary(
          summary,
          input.runId,
          input.signal,
        )
        input.signal?.throwIfAborted()
        if (summary.summaryText) generatedSymbols.push(symbol)
        else noResultSymbols.push(symbol)
      } catch (error) {
        if (input.signal?.aborted) throw input.signal.reason
        failed.push({
          symbol,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
  )

  input.signal?.throwIfAborted()

  return { attemptedSymbols, generatedSymbols, noResultSymbols, failed }
}
