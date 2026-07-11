import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local', quiet: true })

import { fetchWiimCandidates } from '../lib/wiim'
import {
  mergeWarmRetryResults,
  resolveWarmProfile,
  summarizeWarmResults,
  warmSymbol,
  WIIM_WARM_RETRY_PROFILE,
  type WarmResult,
} from '../lib/wiim/warm'
import { SP500_SYMBOLS, normalizeSP500Symbol } from '../lib/sp500'

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

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size))
  }
  return batches
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

async function warmBatch(
  batchSymbols: string[],
  options: {
    dryRun: boolean
    forceRefresh: boolean
    perSymbolPauseMs: number
    jitterMs: number
    pass: 1 | 2
  },
): Promise<WarmResult[]> {
  const results: WarmResult[] = []

  for (const symbol of batchSymbols) {
    results.push(await warmSymbol(symbol, options))
  }

  return results
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const limit = Number(args.get('--limit') || 25)
  const profileName = String(args.get('--profile') || 'balanced')
  const profile = resolveWarmProfile(profileName)
  const concurrency = Math.max(1, Math.min(6, Number(args.get('--concurrency') || profile.concurrency)))
  const batchSize = Math.max(1, Math.min(50, Number(args.get('--batch-size') || profile.batchSize)))
  const perSymbolPauseMs = Math.max(0, Number(args.get('--per-symbol-pause-ms') || profile.perSymbolPauseMs))
  const jitterMs = Math.max(0, Number(args.get('--jitter-ms') || profile.jitterMs))
  const dryRun = Boolean(args.get('--dry-run'))
  const allSp500 = Boolean(args.get('--all-sp500'))
  const forceRefresh = Boolean(args.get('--force-refresh'))
  const retryErrors = args.has('--no-retry-errors') ? false : Boolean(args.get('--retry-errors') ?? allSp500)
  const rawSymbols = String(args.get('--symbols') || '')
  const debugDir = String(args.get('--debug-dir') || '')

  if (debugDir) {
    process.env.FINVIZ_DEBUG_DIR = debugDir
  }

  const explicitSymbols = rawSymbols
    .split(',')
    .map((symbol) => normalizeSP500Symbol(symbol))
    .filter((symbol): symbol is string => Boolean(symbol))

  const fetched = explicitSymbols.length > 0 || allSp500 ? null : await fetchWiimCandidates()
  const symbols = explicitSymbols.length > 0
    ? Array.from(new Set(explicitSymbols))
    : allSp500
      ? Array.from(SP500_SYMBOLS).sort((a, b) => a.localeCompare(b))
      : (fetched?.candidates ?? [])
          .slice()
          .sort((a, b) => Math.abs(b.changesPercentage) - Math.abs(a.changesPercentage))
          .slice(0, limit)
          .map((candidate) => candidate.symbol)

  const startedAt = Date.now()
  const batches = chunk(symbols, batchSize)
  const batchSummaries: Array<{
    batchIndex: number
    symbols: string[]
    successCount: number
    notFoundCount: number
    errorCount: number
    skippedFreshCount: number
  }> = []
  let results: WarmResult[] = []

  await runPool(batches, concurrency, async (batchSymbols, index) => {
    const batchResults = await warmBatch(batchSymbols, {
      dryRun,
      forceRefresh,
      perSymbolPauseMs,
      jitterMs,
      pass: 1,
    })
    results.push(...batchResults)
    batchSummaries.push({
      batchIndex: index + 1,
      symbols: batchSymbols,
      successCount: batchResults.filter((item) => item.status === 'found').length,
      notFoundCount: batchResults.filter((item) => item.status === 'not_found').length,
      errorCount: batchResults.filter((item) => item.status === 'error').length,
      skippedFreshCount: batchResults.filter((item) => item.status === 'skipped_fresh').length,
    })
  })

  batchSummaries.sort((a, b) => a.batchIndex - b.batchIndex)

  let retryPass: WarmResult[] = []
  if (retryErrors && !dryRun) {
    const errorSymbols = results.filter((item) => item.status === 'error').map((item) => item.symbol)
    if (errorSymbols.length > 0) {
      retryPass = await warmBatch(errorSymbols, {
        dryRun: false,
        forceRefresh: true,
        perSymbolPauseMs: WIIM_WARM_RETRY_PROFILE.perSymbolPauseMs,
        jitterMs: WIIM_WARM_RETRY_PROFILE.jitterMs,
        pass: 2,
      })
      results = mergeWarmRetryResults(results, retryPass)
    }
  }

  const summary = summarizeWarmResults(results)
  const payload = {
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    warmedCount: summary.warmedCount,
    candidateUniverseCount: fetched?.candidates.length ?? null,
    universeMode: explicitSymbols.length > 0 ? 'explicit_symbols' : allSp500 ? 'all_sp500' : 'wiim_candidates',
    profile: profileName,
    limit,
    concurrency,
    batchSize,
    batchCount: batches.length,
    perSymbolPauseMs,
    jitterMs,
    dryRun,
    forceRefresh,
    retryErrors,
    retryPassCount: retryPass.length,
    successCount: summary.successCount,
    notFoundCount: summary.notFoundCount,
    errorCount: summary.errorCount,
    skippedFreshCount: summary.skippedFreshCount,
    errorRate: summary.errorRate,
    errorSymbols: summary.errorSymbols,
    symbols,
    batchSummaries,
    retryPass,
    results,
  }

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
