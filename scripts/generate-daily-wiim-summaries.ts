import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local', quiet: true })

import { createClient } from '@supabase/supabase-js'

import {
  generateStockWhyMovingSummary,
  getWiimSummaryDate,
  storeGeneratedWhyMovingSummary,
} from '../lib/generated-stock-why-moving'
import { SP500_SYMBOLS, normalizeSP500Symbol, isSP500 } from '../lib/sp500'

type ResultStatus = 'generated' | 'no_summary' | 'skipped_existing' | 'error' | 'timeout'

interface RunResult {
  symbol: string
  status: ResultStatus
  summaryText: string | null
  noSummaryReason: string | null
  errorMessage: string | null
  durationMs: number
  attempt: number
}

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>()

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) continue

    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      args.set(token, true)
      continue
    }

    args.set(token, next)
    i += 1
  }

  return args
}

function numberArg(value: string | boolean | undefined, fallback: number) {
  if (typeof value !== 'string') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>) {
  let nextIndex = 0

  async function runner() {
    while (nextIndex < items.length) {
      const current = nextIndex
      nextIndex += 1
      await worker(items[current], current)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runner()))
}

function patchFetchTimeout(defaultTimeoutMs: number) {
  if (defaultTimeoutMs <= 0) return

  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, init = {}) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), defaultTimeoutMs)
    const upstreamSignal = init.signal

    if (upstreamSignal) {
      if (upstreamSignal.aborted) controller.abort()
      else upstreamSignal.addEventListener('abort', () => controller.abort(), { once: true })
    }

    try {
      return await originalFetch(input, {
        ...init,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  if (timeoutMs <= 0) return promise

  let timeout: NodeJS.Timeout | null = null
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    }),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout)
  })
}

function createSupabaseWriteClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

async function getExistingGeneratedSymbols(input: {
  date: string
  symbols: string[]
  dryRun: boolean
  resume: boolean
}) {
  if (input.dryRun || !input.resume || input.symbols.length === 0) return new Set<string>()

  const supabase = createSupabaseWriteClient()
  if (!supabase) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  const existing = new Set<string>()

  for (let i = 0; i < input.symbols.length; i += 100) {
    const batch = input.symbols.slice(i, i + 100)
    const { data, error } = await supabase
      .from('stock_summaries')
      .select('symbol, no_summary_reason')
      .eq('summary_date', input.date)
      .eq('config_version', 'fin-quote-daily-v1')
      .in('symbol', batch)

    if (error) {
      throw new Error(`stock_summaries resume query failed: ${error.message}`)
    }

    for (const row of data || []) {
      if (row.no_summary_reason !== 'validation_rejected') {
        existing.add(row.symbol)
      }
    }
  }

  return existing
}

async function getMissingSymbolsForDate(input: {
  date: string
  symbols: string[]
  dryRun: boolean
}) {
  if (input.dryRun || input.symbols.length === 0) {
    return [...input.symbols]
  }

  const existing = await getExistingGeneratedSymbols({
    date: input.date,
    symbols: input.symbols,
    dryRun: input.dryRun,
    resume: true,
  })

  return input.symbols.filter((symbol) => !existing.has(symbol))
}

async function createSummaryRun(input: {
  runId: string
  date: string
  symbols: string[]
  model: string
  dryRun: boolean
}) {
  if (input.dryRun) return

  const supabase = createSupabaseWriteClient()
  if (!supabase) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  const { error } = await supabase.from('wiim_summary_runs').upsert({
    run_id: input.runId,
    run_date: input.date,
    ticker_count: input.symbols.length,
    tickers: input.symbols,
    model: input.model,
    config_version: 'fin-quote-daily-v1',
  })

  if (error) {
    throw new Error(`wiim_summary_runs insert failed: ${error.message}`)
  }
}

function writeProgress(message: string) {
  process.stderr.write(`[wiim:generate-daily] ${new Date().toISOString()} ${message}\n`)
}

function buildCounts(results: RunResult[]) {
  return {
    attemptedCount: results.filter((result) => result.status !== 'skipped_existing').length,
    generatedCount: results.filter((result) => result.status === 'generated').length,
    noSummaryCount: results.filter((result) => result.status === 'no_summary').length,
    skippedExistingCount: results.filter((result) => result.status === 'skipped_existing').length,
    errorCount: results.filter((result) => result.status === 'error').length,
    timeoutCount: results.filter((result) => result.status === 'timeout').length,
  }
}

async function runSymbolPass(input: {
  symbols: string[]
  summaryDate: string
  model: string
  runId: string
  dryRun: boolean
  resume: boolean
  concurrency: number
  progressEvery: number
  perSymbolTimeoutMs: number
  attempt: number
}) {
  const existingSymbols = await getExistingGeneratedSymbols({
    date: input.summaryDate,
    symbols: input.symbols,
    dryRun: input.dryRun,
    resume: input.resume,
  })
  if (existingSymbols.size > 0) {
    writeProgress(`resume found ${existingSymbols.size} existing generated/no-summary rows for ${input.summaryDate} on attempt=${input.attempt}`)
  }

  const results: RunResult[] = []
  let completed = 0
  let generated = 0
  let noSummary = 0
  let skipped = 0
  let errors = 0
  let timeouts = 0

  await runPool(input.symbols, input.concurrency, async (symbol) => {
    const startedAt = Date.now()

    if (existingSymbols.has(symbol)) {
      skipped += 1
      completed += 1
      results.push({
        symbol,
        status: 'skipped_existing',
        summaryText: null,
        noSummaryReason: null,
        errorMessage: null,
        durationMs: Date.now() - startedAt,
        attempt: input.attempt,
      })

      if (completed % input.progressEvery === 0 || completed === input.symbols.length) {
        writeProgress(`progress ${completed}/${input.symbols.length} generated=${generated} no_summary=${noSummary} skipped=${skipped} errors=${errors} timeouts=${timeouts} attempt=${input.attempt}`)
      }
      return
    }

    try {
      const summary = await withTimeout(
        generateStockWhyMovingSummary({ symbol, summaryDate: input.summaryDate, model: input.model }),
        input.perSymbolTimeoutMs,
        symbol,
      )

      if (!input.dryRun) {
        await storeGeneratedWhyMovingSummary(summary, input.runId)
      }

      if (summary.summaryText) generated += 1
      else noSummary += 1

      results.push({
        symbol,
        status: summary.summaryText ? 'generated' : 'no_summary',
        summaryText: summary.summaryText,
        noSummaryReason: summary.noSummaryReason,
        errorMessage: null,
        durationMs: Date.now() - startedAt,
        attempt: input.attempt,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const isTimeout = errorMessage.includes('timed out') || errorMessage.includes('aborted')
      if (isTimeout) timeouts += 1
      else errors += 1

      results.push({
        symbol,
        status: isTimeout ? 'timeout' : 'error',
        summaryText: null,
        noSummaryReason: null,
        errorMessage,
        durationMs: Date.now() - startedAt,
        attempt: input.attempt,
      })
    } finally {
      completed += 1
      if (completed % input.progressEvery === 0 || completed === input.symbols.length) {
        writeProgress(`progress ${completed}/${input.symbols.length} generated=${generated} no_summary=${noSummary} skipped=${skipped} errors=${errors} timeouts=${timeouts} attempt=${input.attempt}`)
      }
    }
  })

  return results
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const summaryDate = String(args.get('--date') || getWiimSummaryDate())
  const model = String(args.get('--model') || process.env.WIIM_SUMMARY_MODEL || process.env.OPENAI_MODEL || 'gpt-5-nano')
  const dryRun = Boolean(args.get('--dry-run'))
  const allSp500 = Boolean(args.get('--all-sp500'))
  const resume = !Boolean(args.get('--no-resume'))
  const limit = Math.max(1, numberArg(args.get('--limit'), 25))
  const concurrency = Math.max(1, Math.min(8, numberArg(args.get('--concurrency'), 4)))
  const perSymbolTimeoutMs = Math.max(5_000, numberArg(args.get('--per-symbol-timeout-ms'), 90_000))
  const fetchTimeoutMs = Math.max(2_000, numberArg(args.get('--fetch-timeout-ms'), 45_000))
  const progressEvery = Math.max(1, numberArg(args.get('--progress-every'), 10))
  const verificationRetries = Math.max(0, numberArg(args.get('--verification-retries'), 2))
  const retryConcurrency = Math.max(1, Math.min(8, numberArg(args.get('--retry-concurrency'), Math.min(2, concurrency))))
  const retryPerSymbolTimeoutMs = Math.max(perSymbolTimeoutMs, numberArg(args.get('--retry-per-symbol-timeout-ms'), 120_000))
  const retryFetchTimeoutMs = Math.max(fetchTimeoutMs, numberArg(args.get('--retry-fetch-timeout-ms'), 60_000))
  const rawSymbols = String(args.get('--symbols') || '')
  const runId = String(args.get('--run-id') || `fin_quote_daily_${summaryDate}_${Date.now()}`)

  patchFetchTimeout(Math.max(fetchTimeoutMs, retryFetchTimeoutMs))

  const explicitSymbols = rawSymbols
    .split(',')
    .map((symbol) => normalizeSP500Symbol(symbol))
    .filter((symbol): symbol is string => Boolean(symbol && isSP500(symbol)))

  const symbols = explicitSymbols.length > 0
    ? Array.from(new Set(explicitSymbols))
    : allSp500
      ? Array.from(SP500_SYMBOLS).sort((a, b) => a.localeCompare(b))
      : Array.from(SP500_SYMBOLS).sort((a, b) => a.localeCompare(b)).slice(0, limit)

  writeProgress(`starting runId=${runId} date=${summaryDate} symbols=${symbols.length} concurrency=${concurrency} dryRun=${dryRun} resume=${resume}`)

  await createSummaryRun({ runId, date: summaryDate, symbols, model, dryRun })

  const shouldVerifyWrites = !dryRun
  const results: RunResult[] = []
  const attempts: Array<{
    attempt: number
    requestedSymbols: number
    missingBeforeAttempt: string[]
    missingAfterAttempt: string[]
    concurrency: number
    perSymbolTimeoutMs: number
    counts: ReturnType<typeof buildCounts>
  }> = []

  let missingSymbols = shouldVerifyWrites
    ? await getMissingSymbolsForDate({ date: summaryDate, symbols, dryRun })
    : []

  const initialResults = await runSymbolPass({
    symbols,
    summaryDate,
    model,
    runId,
    dryRun,
    resume,
    concurrency,
    progressEvery,
    perSymbolTimeoutMs,
    attempt: 1,
  })
  results.push(...initialResults)

  let missingAfterAttempt = shouldVerifyWrites
    ? await getMissingSymbolsForDate({ date: summaryDate, symbols, dryRun })
    : []
  attempts.push({
    attempt: 1,
    requestedSymbols: symbols.length,
    missingBeforeAttempt: missingSymbols,
    missingAfterAttempt,
    concurrency,
    perSymbolTimeoutMs,
    counts: buildCounts(initialResults),
  })

  missingSymbols = missingAfterAttempt

  for (let retryIndex = 0; shouldVerifyWrites && retryIndex < verificationRetries && missingSymbols.length > 0; retryIndex += 1) {
    const attemptNumber = retryIndex + 2
    writeProgress(`verification retry ${retryIndex + 1}/${verificationRetries} for ${missingSymbols.length} missing symbols: ${missingSymbols.join(',')}`)

    const retryResults = await runSymbolPass({
      symbols: missingSymbols,
      summaryDate,
      model,
      runId,
      dryRun,
      resume: false,
      concurrency: retryConcurrency,
      progressEvery: Math.min(progressEvery, Math.max(1, missingSymbols.length)),
      perSymbolTimeoutMs: retryPerSymbolTimeoutMs,
      attempt: attemptNumber,
    })
    results.push(...retryResults)

    missingAfterAttempt = await getMissingSymbolsForDate({ date: summaryDate, symbols, dryRun })
    attempts.push({
      attempt: attemptNumber,
      requestedSymbols: missingSymbols.length,
      missingBeforeAttempt: missingSymbols,
      missingAfterAttempt,
      concurrency: retryConcurrency,
      perSymbolTimeoutMs: retryPerSymbolTimeoutMs,
      counts: buildCounts(retryResults),
    })

    missingSymbols = missingAfterAttempt
  }

  results.sort((a, b) => {
    const symbolDelta = symbols.indexOf(a.symbol) - symbols.indexOf(b.symbol)
    return symbolDelta !== 0 ? symbolDelta : a.attempt - b.attempt
  })

  const counts = buildCounts(results)
  const verifiedStoredCount = shouldVerifyWrites
    ? symbols.length - missingSymbols.length
    : counts.generatedCount + counts.noSummaryCount + counts.skippedExistingCount

  const payload = {
    runId,
    summaryDate,
    model,
    dryRun,
    resume,
    symbolCount: symbols.length,
    ...counts,
    verificationRetries,
    attempts,
    verifiedComplete: shouldVerifyWrites ? missingSymbols.length === 0 : counts.errorCount === 0 && counts.timeoutCount === 0,
    verifiedStoredCount,
    missingSymbols,
    results,
  }

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)

  if (shouldVerifyWrites && missingSymbols.length > 0) {
    process.stderr.write(
      `[wiim:generate-daily] incomplete after retries; missing ${missingSymbols.length} symbols for ${summaryDate}: ${missingSymbols.join(',')}\n`,
    )
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
