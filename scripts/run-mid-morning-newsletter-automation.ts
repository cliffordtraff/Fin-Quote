import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local', quiet: true })

import { getNewsletterAutomationClock } from '../lib/newsletter/daily-automation'
import { advanceNewsletterMidMorningAutomation } from '../lib/newsletter/mid-morning-automation'

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>()
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      args.set(token, true)
    } else {
      args.set(token, next)
      index += 1
    }
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const marketDate = String(
    args.get('--date') || getNewsletterAutomationClock().marketDate,
  )
  const untilComplete = Boolean(args.get('--until-complete'))
  const retryFailed = Boolean(args.get('--retry-failed'))
  const maxInvocations = Math.max(
    1,
    Math.min(30, Number(args.get('--max-invocations') || 15)),
  )

  let invocation = 0
  while (invocation < maxInvocations) {
    const result = await advanceNewsletterMidMorningAutomation({
      marketDate,
      retryFailed,
    })
    if (result.claimed) invocation += 1
    process.stdout.write(
      `${JSON.stringify({
        invocation,
        claimed: result.claimed,
        action: result.action,
        status: result.run.status,
        stage: result.run.stage,
        finviz: `${result.run.finvizCompletedCount}/${result.run.candidateCount}`,
        summaries: `${result.run.summaryCompletedCount}/5`,
        meaningfulChange: result.run.meaningfulChange,
        error: result.run.lastError,
      })}\n`,
    )

    if (!result.claimed) {
      await new Promise((resolve) => setTimeout(resolve, 5_000))
      continue
    }
    if (!untilComplete) return
    if (
      result.run.status === 'completed' ||
      result.run.status === 'partial' ||
      result.run.status === 'failed'
    ) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw new Error(
    `Mid-morning automation did not finish within ${maxInvocations} invocations`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
