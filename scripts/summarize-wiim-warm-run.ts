import { readFile } from 'node:fs/promises'

import {
  buildWarmRunComparisonRow,
  formatWarmRunComparison,
  type WarmRunComparisonRow,
} from '../lib/wiim/warm'

async function readJsonFile(path: string): Promise<Record<string, unknown>> {
  const raw = await readFile(path, 'utf8')
  return JSON.parse(raw) as Record<string, unknown>
}

async function main() {
  const paths = process.argv.slice(2).filter((token) => !token.startsWith('--'))
  if (paths.length === 0) {
    throw new Error('Usage: npx tsx scripts/summarize-wiim-warm-run.ts <report.json> [report2.json ...]')
  }

  const rows: WarmRunComparisonRow[] = []
  for (const path of paths) {
    const payload = await readJsonFile(path)
    rows.push(buildWarmRunComparisonRow(path, payload))
  }

  process.stdout.write(`${formatWarmRunComparison(rows)}\n`)

  if (rows.length > 1) {
    const best = [...rows].sort((a, b) => a.errorRate - b.errorRate)[0]
    process.stdout.write(`\nBest error rate: ${best.label} (${best.errorRate.toFixed(3)})\n`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
