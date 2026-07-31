import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import sharp from 'sharp'
import type { Database } from '@/lib/database.types'
import { isDailySummaryDirectionCompatible } from '@/lib/newsletter/daily-selection'
import type { NewsletterDraftDocument } from '@/lib/newsletter/types'

config({ path: '.env.local' })

interface Args {
  runId: string
  expectedCount: number | null
  requireReady: boolean
}

interface StoredLocalDraft {
  id: string
  status: string
  subject_line: string
  preview_html: string
  draft_json: NewsletterDraftDocument
}

function parseArgs(argv: string[]): Args {
  let runId = ''
  let expectedCount: number | null = null
  let requireReady = false

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--run-id') {
      runId = argv[index + 1]?.trim() ?? ''
      index += 1
    } else if (value === '--expect') {
      const parsed = Number(argv[index + 1])
      if (!Number.isInteger(parsed) || parsed < 30 || parsed > 50) {
        throw new Error('--expect must be an integer between 30 and 50')
      }
      expectedCount = parsed
      index += 1
    } else if (value === '--require-ready') {
      requireReady = true
    }
  }

  if (!runId) {
    throw new Error(
      'Usage: npm run newsletter:verify-daily -- --run-id <uuid> [--expect 40] [--require-ready]',
    )
  }
  return { runId, expectedCount, requireReady }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function sourceIsCurrent(sourceRefs: unknown, marketDate: string): boolean {
  if (!Array.isArray(sourceRefs)) return false
  const marketDay = Date.parse(`${marketDate}T12:00:00Z`)
  return sourceRefs.some((source) => {
    if (!isRecord(source)) return false
    if (!['earnings', 'finviz', 'news'].includes(String(source.kind))) {
      return false
    }
    const publishedAt =
      typeof source.publishedAt === 'string' ? source.publishedAt : ''
    const publishedDay = Date.parse(`${publishedAt.slice(0, 10)}T12:00:00Z`)
    if (!Number.isFinite(publishedDay)) return false
    const ageDays = Math.round((marketDay - publishedDay) / 86_400_000)
    return ageDays >= -1 && ageDays <= 2
  })
}

function plainText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function readLocalDraft(
  sessionId: string,
  draftId: string,
): StoredLocalDraft {
  const path = resolve('.newsletter-drafts', sessionId, `${draftId}.json`)
  if (!existsSync(path)) {
    throw new Error(`missing local draft file ${path}`)
  }
  return JSON.parse(readFileSync(path, 'utf8')) as StoredLocalDraft
}

async function inspectLocalChart(
  chartImageUrl: string,
): Promise<{ hash: string; width: number; height: number }> {
  const path = resolve('.newsletter-output', basename(chartImageUrl))
  if (!existsSync(path)) {
    throw new Error(`missing local chart image ${path}`)
  }
  if (statSync(path).size < 20_000) {
    throw new Error(`chart image is unexpectedly small: ${path}`)
  }

  const image = sharp(path)
  const [metadata, stats] = await Promise.all([
    image.metadata(),
    image.stats(),
  ])
  const width = metadata.width ?? 0
  const height = metadata.height ?? 0
  if (width < 1_200 || height < 675) {
    throw new Error(`chart image is undersized: ${width}x${height}`)
  }
  const visibleVariation = stats.channels
    .slice(0, 3)
    .some((channel) => channel.stdev > 4)
  if (!visibleVariation) {
    throw new Error('chart image appears blank or visually uniform')
  }

  return {
    hash: createHash('sha256').update(readFileSync(path)).digest('hex'),
    width,
    height,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing Supabase service configuration in .env.local')
  }

  const supabase = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const [{ data: run, error: runError }, { data: items, error: itemError }] =
    await Promise.all([
      supabase
        .from('newsletter_daily_runs')
        .select('*')
        .eq('id', args.runId)
        .single(),
      supabase
        .from('newsletter_daily_run_items')
        .select('*')
        .eq('run_id', args.runId)
        .order('rank', { ascending: true }),
    ])

  if (runError || !run) {
    throw new Error(`Could not load daily run: ${runError?.message}`)
  }
  if (itemError || !items) {
    throw new Error(`Could not load daily run items: ${itemError?.message}`)
  }

  const failures: string[] = []
  const expectedCount = args.expectedCount ?? run.target_count
  if (items.length !== expectedCount) {
    failures.push(`expected ${expectedCount} items, found ${items.length}`)
  }
  if (items.length < 30 || items.length > 50) {
    failures.push(`item count ${items.length} is outside the 30-50 contract`)
  }
  if (
    run.selected_count !== items.length ||
    run.generated_count !== items.length
  ) {
    failures.push(
      `run counters disagree: selected=${run.selected_count}, generated=${run.generated_count}, items=${items.length}`,
    )
  }
  if (run.attention_count !== 0 || run.failed_count !== 0) {
    failures.push(
      `run still has attention=${run.attention_count}, failed=${run.failed_count}`,
    )
  }

  const seenTickers = new Set<string>()
  const seenSubjects = new Set<string>()
  const seenChartHashes = new Set<string>()
  let minimumWidth = Number.POSITIVE_INFINITY
  let minimumHeight = Number.POSITIVE_INFINITY

  for (const [index, item] of items.entries()) {
    const prefix = `#${item.rank} ${item.ticker}`
    const expectedStatus = args.requireReady
      ? ['ready', 'published']
      : ['generated', 'ready', 'published']
    if (!expectedStatus.includes(item.status)) {
      failures.push(`${prefix}: unexpected item status ${item.status}`)
    }
    if (item.rank !== index + 1) {
      failures.push(`${prefix}: ranks are not contiguous`)
    }
    if (seenTickers.has(item.ticker)) {
      failures.push(`${prefix}: duplicate ticker`)
    }
    seenTickers.add(item.ticker)
    if (!item.subject_line?.trim()) {
      failures.push(`${prefix}: missing subject line`)
    } else if (seenSubjects.has(item.subject_line)) {
      failures.push(`${prefix}: duplicate subject line`)
    } else {
      seenSubjects.add(item.subject_line)
    }
    if (!item.draft_id || !item.chart_id || !item.chart_image_url) {
      failures.push(`${prefix}: missing draft or chart linkage`)
      continue
    }
    if (item.error_message) {
      failures.push(`${prefix}: still has error "${item.error_message}"`)
    }
    if (
      Number(item.relevance_score) < 58 ||
      item.quality_band !== 'strong'
    ) {
      failures.push(`${prefix}: did not pass the strong relevance gate`)
    }
    if (!sourceIsCurrent(item.source_refs_json, run.market_date)) {
      failures.push(`${prefix}: no current news, Finviz, or earnings evidence`)
    }
    if (item.summary_text.length < 30) {
      failures.push(`${prefix}: summary is too short`)
    }
    if (/(?:^|[^.])\.\.(?:$|[^.])/.test(item.summary_text)) {
      failures.push(`${prefix}: summary contains duplicate punctuation`)
    }
    if (/(?:\.{3}|…)$/.test(item.summary_text.trim())) {
      failures.push(`${prefix}: summary ends with truncated copy`)
    }
    if (
      !isDailySummaryDirectionCompatible(
        item.summary_text,
        item.ticker,
        item.move_percent == null ? null : Number(item.move_percent),
      )
    ) {
      failures.push(`${prefix}: summary contradicts the current move direction`)
    }

    if (!run.owner_id) {
      try {
        const draft = readLocalDraft(run.session_id, item.draft_id)
        const document = draft.draft_json
        const block = document.blocks[0]
        const source = document.source
        if (
          source?.type !== 'daily_batch' ||
          source.dailyBatch.runId !== run.id ||
          source.dailyBatch.itemId !== item.id ||
          source.dailyBatch.ticker !== item.ticker
        ) {
          failures.push(`${prefix}: draft provenance does not match the run item`)
        }
        if (
          source?.type !== 'daily_batch' ||
          source.automationStatus !== 'complete'
        ) {
          failures.push(`${prefix}: draft automation is not complete`)
        }
        if (!block || block.chartNeedsRegeneration || !block.chartImageUrl) {
          failures.push(`${prefix}: draft chart is not review-ready`)
          continue
        }
        const body = plainText(block.body)
        for (const label of [
          'What happened:',
          'Why it matters:',
          'What to watch:',
        ]) {
          if (!body.includes(label)) {
            failures.push(`${prefix}: draft body is missing "${label}"`)
          }
        }
        if (/(?:^|[^.])\.\.(?:$|[^.])/.test(body)) {
          failures.push(`${prefix}: draft body contains duplicate punctuation`)
        }
        if (/(?:\.{3}|…)(?:\s|$)/.test(body)) {
          failures.push(`${prefix}: draft body contains truncated copy`)
        }
        if (!draft.preview_html.includes(block.chartImageUrl)) {
          failures.push(`${prefix}: rendered preview does not include its chart`)
        }
        const chart = await inspectLocalChart(block.chartImageUrl)
        minimumWidth = Math.min(minimumWidth, chart.width)
        minimumHeight = Math.min(minimumHeight, chart.height)
        if (seenChartHashes.has(chart.hash)) {
          failures.push(`${prefix}: chart image duplicates another issue`)
        }
        seenChartHashes.add(chart.hash)
      } catch (error) {
        failures.push(
          `${prefix}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  }

  const report = {
    runId: run.id,
    marketDate: run.market_date,
    status: run.status,
    items: items.length,
    ready: run.ready_count,
    attention: run.attention_count,
    failed: run.failed_count,
    uniqueTickers: seenTickers.size,
    uniqueSubjects: seenSubjects.size,
    inspectedLocalCharts: seenChartHashes.size,
    minimumChartDimensions:
      seenChartHashes.size > 0 ? `${minimumWidth}x${minimumHeight}` : null,
    requireReady: args.requireReady,
    passed: failures.length === 0,
  }

  console.log(JSON.stringify(report, null, 2))
  if (failures.length > 0) {
    console.error('\nVerification failures:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
