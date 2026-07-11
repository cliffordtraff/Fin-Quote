import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local', quiet: true })

import {
  completeWiimRun,
  computeWiimDelta,
  createWiimRun,
  fetchWiimCandidates,
  formatWiimBrief,
  getLatestWiimRun,
  rankWiimCandidates,
  storeWiimCandidates,
  summarizeWiimRun,
} from '../lib/wiim'

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

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const runType = (args.get('--run-type') || 'morning') as 'morning'
  const asJson = Boolean(args.get('--json'))
  const dryRun = Boolean(args.get('--dry-run'))
  const compareLatest = Boolean(args.get('--compare-latest'))
  const quietIfTrivial = Boolean(args.get('--quiet-if-trivial'))
  const label = String(args.get('--label') || 'WIIM Morning Brief')

  if (runType !== 'morning') {
    throw new Error(`Unsupported run type: ${runType}. Phase 1 only supports morning.`)
  }

  let runId: string | null = null

  try {
    const fetched = await fetchWiimCandidates()
    const topFive = rankWiimCandidates(fetched.candidates, 5)
    const latestRun = compareLatest ? await getLatestWiimRun(runType) : null
    const previousTopFive = Array.isArray(latestRun?.top_five_json) ? latestRun.top_five_json : []
    const delta = compareLatest && previousTopFive.length > 0
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
      },
    })

    summary.summaryText = formatWiimBrief({
      ...summary,
      metadata: {
        ...summary.metadata,
        label,
      },
    })

    if (!dryRun) {
      const run = await createWiimRun({
        runType,
        metadata: {
          marketCandidateCount: fetched.marketCandidateCount,
          candidateCount: fetched.candidates.length,
        },
      })
      runId = run.id

      await storeWiimCandidates(run.id, topFive)
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
          generatedAt: fetched.generatedAt,
          compareLatest,
          delta,
        },
      })
    }

    const shouldSuppressOutput = quietIfTrivial && compareLatest && delta && !delta.shouldNotify

    const payload = {
      runId,
      dryRun,
      suppressed: shouldSuppressOutput,
      ...summary,
    }

    if (asJson) {
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
      return
    }

    if (shouldSuppressOutput) {
      process.stdout.write('WIIM midday refresh: no meaningful change.\n')
      return
    }

    process.stdout.write(`${summary.summaryText}\n`)
    if (dryRun) {
      process.stdout.write('\n(dry run: no Supabase writes)\n')
    } else if (runId) {
      process.stdout.write(`\nStored as WIIM run ${runId}\n`)
    }
  } catch (error) {
    if (runId && !dryRun) {
      try {
        await completeWiimRun({
          runId,
          status: 'failed',
          metadata: {
            error: error instanceof Error ? error.message : String(error),
          },
        })
      } catch {
        // Ignore secondary failure so the real error still bubbles up.
      }
    }

    throw error
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
