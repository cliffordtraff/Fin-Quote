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
  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), items.length) },
      () => runner(),
    ),
  )
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout | null = null
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
        timeoutMs,
      )
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

export async function getDailySummaryCoverage(
  marketDate: string,
  symbols: string[],
): Promise<DailySummaryCoverage> {
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
    const batch = normalized.slice(index, index + 100)
    const { data, error } = await supabase
      .from('stock_summaries')
      .select('symbol, summary_text, no_summary_reason')
      .eq('summary_date', marketDate)
      .eq('config_version', WIIM_SUMMARY_CONFIG_VERSION)
      .in('symbol', batch)
    if (error) {
      throw new Error(`Failed to read daily summary coverage: ${error.message}`)
    }
    rows.push(...(data ?? []))
  }

  const generated = new Set<string>()
  const noResult = new Set<string>()
  const rejected = new Set<string>()
  for (const row of rows) {
    if (row.summary_text) generated.add(row.symbol)
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
}): Promise<DailySummaryBatchResult> {
  const normalized = uniqueSymbols(input.symbols)
  const coverage = input.force
    ? {
        completedSymbols: [],
        generatedSymbols: [],
        noResultSymbols: [],
        validationRejectedSymbols: [],
      }
    : await getDailySummaryCoverage(input.marketDate, normalized)
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
  const { data: existingRun, error: existingRunError } = await supabase
    .from('wiim_summary_runs')
    .select('run_date, tickers')
    .eq('run_id', input.runId)
    .maybeSingle()
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
  const { error: runError } = await supabase.from('wiim_summary_runs').upsert({
    run_id: input.runId,
    run_date: input.marketDate,
    ticker_count: runSymbols.length,
    tickers: runSymbols,
    model,
    config_version: WIIM_SUMMARY_CONFIG_VERSION,
  })
  if (runError) {
    throw new Error(`Failed to record daily summary run: ${runError.message}`)
  }

  await runPool(
    attemptedSymbols,
    Math.max(1, Math.min(6, input.concurrency ?? 4)),
    async (symbol) => {
      try {
        const summary = await withTimeout(
          generateStockWhyMovingSummary({
            symbol,
            summaryDate: input.marketDate,
            model,
          }),
          input.perSymbolTimeoutMs ?? 45_000,
          symbol,
        )
        await storeGeneratedWhyMovingSummary(summary, input.runId)
        if (summary.summaryText) generatedSymbols.push(symbol)
        else noResultSymbols.push(symbol)
      } catch (error) {
        failed.push({
          symbol,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
  )

  return { attemptedSymbols, generatedSymbols, noResultSymbols, failed }
}
