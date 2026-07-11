import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

interface DebugMeta {
  symbol?: string
  reason?: string
  htmlLength?: number
  markers?: Record<string, boolean>
}

async function main() {
  const debugDir = process.argv[2]
  if (!debugDir) {
    throw new Error('Usage: npx tsx scripts/summarize-finviz-debug.ts <debug-dir>')
  }

  const entries = await readdir(debugDir)
  const jsonFiles = entries.filter((entry) => entry.endsWith('.json')).sort()

  const markerCounts = new Map<string, number>()
  const reasonCounts = new Map<string, number>()
  const lengthBands = new Map<string, number>()
  const symbols = new Set<string>()

  for (const file of jsonFiles) {
    const raw = await readFile(join(debugDir, file), 'utf8')
    const meta = JSON.parse(raw) as DebugMeta
    if (meta.symbol) symbols.add(meta.symbol)

    const reason = meta.reason ?? 'unknown'
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1)

    const length = meta.htmlLength ?? 0
    const band = length < 5_000
      ? '<5k'
      : length < 20_000
        ? '5k-20k'
        : length < 100_000
          ? '20k-100k'
          : '>=100k'
    lengthBands.set(band, (lengthBands.get(band) ?? 0) + 1)

    for (const [marker, present] of Object.entries(meta.markers ?? {})) {
      if (!present) continue
      markerCounts.set(marker, (markerCounts.get(marker) ?? 0) + 1)
    }
  }

  const payload = {
    debugDir,
    captureCount: jsonFiles.length,
    uniqueSymbols: symbols.size,
    reasons: Object.fromEntries([...reasonCounts.entries()].sort((a, b) => b[1] - a[1])),
    htmlLengthBands: Object.fromEntries([...lengthBands.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    markerPresence: Object.fromEntries([...markerCounts.entries()].sort((a, b) => b[1] - a[1])),
  }

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
