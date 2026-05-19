import dotenv from 'dotenv'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { getProvider } from '../lib/providers'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const model = process.env.OPENAI_MODEL || 'gpt-5-nano'

if (!supabaseUrl || !supabaseKey || !process.env.OPENAI_API_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or OPENAI_API_KEY')
  process.exit(1)
}

const args = new Map<string, string>()
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i], process.argv[i + 1])
}

const limit = Number(args.get('--limit') || 50)
const sinceMinutes = Number(args.get('--since-minutes') || 90)
const configVersion = args.get('--config-version') || 'codex-ad-hoc-v1'
const runId = `run_${new Date().toISOString().replace(/[:.]/g, '-')}_${configVersion}`

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const provider = getProvider()

type FinvizRow = {
  symbol: string
  display_text: string | null
  headline: string | null
  summary: string | null
  bullet_points: unknown
  source_timestamp: string | null
  fetched_at: string
}

function parseJsonObject(text: string): any {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/)
    if (!match) throw new Error(`No JSON object in response: ${trimmed.slice(0, 200)}`)
    return JSON.parse(match[0])
  }
}

async function generateSummary(row: FinvizRow) {
  const [quote, news] = await Promise.all([
    provider.getQuote(row.symbol).catch(() => null),
    provider.getNews(row.symbol, 8).catch(() => []),
  ])

  const newsBrief = news.map((item, index) => ({
    n: index + 1,
    title: item.title,
    site: item.site,
    publishedDate: item.publishedDate,
    text: item.text?.slice(0, 500) || '',
  }))

  const prompt = `You write stock "why is it moving" summaries.

Use only the quote and news context below. Do not use or infer from Finviz.
Return strict JSON with:
{
  "summary": string | null,
  "no_summary_reason": string | null,
  "top_event": string | null,
  "reason_type": "earnings" | "analyst_action" | "macro" | "deal" | "product" | "legal" | "capital_return" | "management" | "other" | "unclear"
}

Rules:
- Write one plain sentence, under 35 words.
- Prefer concrete, timely catalysts over generic stock commentary.
- If the context does not show a clear catalyst, set summary to null.

Symbol: ${row.symbol}
Quote: ${quote ? JSON.stringify({
    price: quote.price,
    change: quote.change,
    changesPercentage: quote.changesPercentage,
    volume: quote.volume,
  }) : 'unavailable'}
News: ${JSON.stringify(newsBrief)}
`

  const response = await openai.responses.create({
    model,
    input: prompt,
  })

  const parsed = parseJsonObject(response.output_text || '')
  return {
    summary: typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : null,
    noSummaryReason: typeof parsed.no_summary_reason === 'string' ? parsed.no_summary_reason : null,
    topEvent: typeof parsed.top_event === 'string' ? parsed.top_event : null,
    reasonType: typeof parsed.reason_type === 'string' ? parsed.reason_type : 'unclear',
    quote,
    news,
  }
}

async function evaluateAgainstFinviz(row: FinvizRow, generatedSummary: string | null, topEvent: string | null) {
  const prompt = `Compare our stock "why moving" summary against the Finviz catalyst.

Return strict JSON:
{
  "topic_match": boolean,
  "score": number,
  "bucket": "A" | "B" | "C",
  "feedback": string,
  "miss_reason": "none" | "coverage_gap" | "eventType" | "tickerRelevance" | "temporalAlignment" | "sourceQuality" | "macro_vs_company_confusion" | "direction_mismatch" | "unclear"
}

Scoring:
- 85-100: same core catalyst
- 60-84: related but incomplete or slightly different emphasis
- 25-59: different catalyst, but plausible company context
- 0-24: no useful match or no generated summary
Bucket A means match, B means wrong/weak pick, C means no usable generated summary.

Symbol: ${row.symbol}
Finviz catalyst: ${row.display_text}
Our summary: ${generatedSummary || ''}
Our top event: ${topEvent || ''}
`

  const response = await openai.responses.create({
    model,
    input: prompt,
  })

  const parsed = parseJsonObject(response.output_text || '')
  // summary_evals.score is narrower than a generic 0-100 integer; 100 overflows.
  const score = Math.max(0, Math.min(99, Number(parsed.score) || 0))
  return {
    topicMatch: Boolean(parsed.topic_match),
    score,
    bucket: ['A', 'B', 'C'].includes(parsed.bucket) ? parsed.bucket : (score >= 80 ? 'A' : generatedSummary ? 'B' : 'C'),
    feedback: typeof parsed.feedback === 'string' ? parsed.feedback : '',
    missReason: typeof parsed.miss_reason === 'string' ? parsed.miss_reason : 'unclear',
  }
}

async function main() {
  const since = new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('stock_why_moving_cache')
    .select('symbol, display_text, headline, summary, bullet_points, source_timestamp, fetched_at')
    .eq('status', 'found')
    .gte('fetched_at', since)
    .not('display_text', 'is', null)
    .order('symbol')
    .limit(limit)

  if (error) throw new Error(error.message)

  const rows = (data || []) as FinvizRow[]
  console.log(`Running WIIM generation/eval for ${rows.length} fresh Finviz rows`)
  console.log(`run_id=${runId}`)

  let matches = 0
  let scoreSum = 0
  let generatedCount = 0

  for (const [index, row] of rows.entries()) {
    try {
      const generated = await generateSummary(row)
      if (generated.summary) generatedCount++

      const { error: summaryInsertError } = await supabase.from('stock_summaries').insert({
        symbol: row.symbol,
        summary_date: new Date().toISOString().slice(0, 10),
        summary_text: generated.summary,
        model,
        config_version: configVersion,
        winning_event: generated.topEvent ? { title: generated.topEvent } : null,
        runner_up_event: null,
        no_summary_reason: generated.summary ? null : (generated.noSummaryReason || 'no_clear_catalyst'),
        activation_path: 'codex_ad_hoc_news',
        earnings_context: null,
        metadata: {
          run_id: runId,
          quote: generated.quote,
          candidate_pool: generated.news.map(item => ({
            title: item.title,
            publisher: item.site,
            publishedDate: item.publishedDate,
          })),
          reason_type: generated.reasonType,
          finviz_fetched_at: row.fetched_at,
        },
        run_id: runId,
      })
      if (summaryInsertError) throw new Error(`stock_summaries insert failed: ${summaryInsertError.message}`)

      const evaluation = await evaluateAgainstFinviz(row, generated.summary, generated.topEvent)
      if (evaluation.topicMatch) matches++
      scoreSum += evaluation.score

      const { error: evalInsertError } = await supabase.from('summary_evals').insert({
        symbol: row.symbol,
        summary_date: new Date().toISOString().slice(0, 10),
        config_version: configVersion,
        generated_summary: generated.summary || '',
        our_top_event: generated.topEvent || '',
        finviz_catalyst: row.display_text,
        topic_match: evaluation.topicMatch,
        score: evaluation.score,
        feedback: evaluation.feedback,
        signal_diagnosis: evaluation.missReason === 'none' ? '' : evaluation.missReason,
        eval_model: model,
        finviz_catalyst_type: null,
        bucket: evaluation.bucket,
        ranker_variant: 'codex_ad_hoc_news',
        benchmark_match: evaluation.topicMatch,
        explanation_quality_score: evaluation.score,
        miss_reason: evaluation.missReason === 'none' ? null : evaluation.missReason,
      })
      if (evalInsertError) throw new Error(`summary_evals insert failed: ${evalInsertError.message}`)

      console.log(
        `[${index + 1}/${rows.length}] ${row.symbol}: score=${evaluation.score} match=${evaluation.topicMatch} summary=${generated.summary ? 'yes' : 'no'}`
      )
    } catch (err) {
      console.error(`[${index + 1}/${rows.length}] ${row.symbol}: ${err instanceof Error ? err.message : err}`)
    }
  }

  console.log(JSON.stringify({
    runId,
    rows: rows.length,
    generatedCount,
    matches,
    avgScore: rows.length ? Number((scoreSum / rows.length).toFixed(1)) : 0,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
