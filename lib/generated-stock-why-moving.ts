import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

import { getProvider, type ProviderNews, type ProviderQuote } from '@/lib/providers'
import { getSP500Constituent, isSP500, normalizeSP500Symbol } from '@/lib/sp500'
import type { StockWhyMovingResult } from '@/lib/stock-why-moving'

export type GeneratedWhyMovingReasonType =
  | 'earnings'
  | 'analyst_action'
  | 'macro'
  | 'deal'
  | 'product'
  | 'legal'
  | 'capital_return'
  | 'management'
  | 'price_action'
  | 'other'
  | 'unclear'

export interface GeneratedWhyMovingSummary {
  symbol: string
  summaryDate: string
  summaryText: string | null
  keyFact: string | null
  reasonType: GeneratedWhyMovingReasonType
  noSummaryReason: string | null
  model: string
  quote: ProviderQuote | null
  news: ProviderNews[]
}

interface StockSummaryRow {
  symbol: string
  summary_date: string
  summary_text: string | null
  model: string | null
  generated_at: string
  no_summary_reason: string | null
  metadata: {
    key_fact?: string | null
    reason_type?: string | null
    source?: string | null
  } | null
}

function createSupabaseReadClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
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

export function getWiimSummaryDate(now = new Date()): string {
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const year = et.getFullYear()
  const month = String(et.getMonth() + 1).padStart(2, '0')
  const day = String(et.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeSummaryText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return null
  return normalized.length > 220 ? `${normalized.slice(0, 217).trim()}...` : normalized
}

function extractJsonCandidate(text: string): string {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const match = trimmed.match(/\{[\s\S]*\}/)
  if (!match) {
    throw new Error(`No JSON object in model response: ${trimmed.slice(0, 200)}`)
  }

  return match[0]
}

function sanitizeJsonCandidate(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
    .replace(/\\(?!["\\/bfnrtu])/g, '\\\\')
    .replace(/,\s*([}\]])/g, '$1')
}

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    const extracted = extractJsonCandidate(trimmed)

    try {
      return JSON.parse(extracted) as Record<string, unknown>
    } catch {
      return JSON.parse(sanitizeJsonCandidate(extracted)) as Record<string, unknown>
    }
  }
}

function mapReasonType(value: unknown): GeneratedWhyMovingReasonType {
  const reason = typeof value === 'string' ? value : 'unclear'
  const allowed = new Set<GeneratedWhyMovingReasonType>([
    'earnings',
    'analyst_action',
    'macro',
    'deal',
    'product',
    'legal',
    'capital_return',
    'management',
    'price_action',
    'other',
    'unclear',
  ])
  return allowed.has(reason as GeneratedWhyMovingReasonType)
    ? reason as GeneratedWhyMovingReasonType
    : 'unclear'
}

function buildPrompt(input: {
  symbol: string
  name: string
  quote: ProviderQuote | null
  news: ProviderNews[]
}) {
  const newsBrief = input.news.slice(0, 8).map((item, index) => ({
    n: index + 1,
    title: item.title,
    site: item.site,
    publishedDate: item.publishedDate,
    text: item.text?.slice(0, 500) || '',
  }))

  return `You write concise "Why Is It Moving" summaries for S&P 500 stocks.

Use only the quote and news context below. Do not use Finviz.
Return strict JSON:
{
  "summary": string | null,
  "key_fact": string | null,
  "reason_type": "earnings" | "analyst_action" | "macro" | "deal" | "product" | "legal" | "capital_return" | "management" | "price_action" | "other" | "unclear",
  "no_summary_reason": string | null
}

Rules:
- Write one useful sentence, under 35 words.
- Explain the likely current catalyst, not the company's business model.
- Prefer concrete timely catalysts: earnings, guidance, analyst action, deal, regulatory/legal, product launch, management change, capital return, or sector/macro read-through.
- If there is no clear catalyst in the provided context, set summary to null and no_summary_reason to "no_clear_catalyst".
- If the price move is small and the news is generic, set summary to null and no_summary_reason to "quiet_tape".

Symbol: ${input.symbol}
Company: ${input.name}
Quote: ${input.quote ? JSON.stringify({
    price: input.quote.price,
    change: input.quote.change,
    changesPercentage: input.quote.changesPercentage,
    volume: input.quote.volume ?? null,
  }) : 'unavailable'}
News: ${JSON.stringify(newsBrief)}
`
}

export async function generateStockWhyMovingSummary(input: {
  symbol: string
  summaryDate?: string
  model?: string
}): Promise<GeneratedWhyMovingSummary> {
  const symbol = normalizeSP500Symbol(input.symbol)
  if (!symbol || !isSP500(symbol)) {
    throw new Error(`Not an active S&P 500 symbol: ${input.symbol}`)
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY')
  }

  const provider = getProvider()
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const model = input.model || process.env.WIIM_SUMMARY_MODEL || process.env.OPENAI_MODEL || 'gpt-5-nano'
  const name = getSP500Constituent(symbol)?.name ?? symbol

  const [quote, news] = await Promise.all([
    provider.getQuote(symbol).catch(() => null),
    provider.getNews(symbol, 8).catch(() => []),
  ])

  const response = await openai.responses.create({
    model,
    input: buildPrompt({ symbol, name, quote, news }),
  })

  const parsed = parseJsonObject(response.output_text || '')
  const summaryText = normalizeSummaryText(parsed.summary)
  const noSummaryReason = summaryText
    ? null
    : normalizeSummaryText(parsed.no_summary_reason) || 'no_clear_catalyst'

  return {
    symbol,
    summaryDate: input.summaryDate ?? getWiimSummaryDate(),
    summaryText,
    keyFact: normalizeSummaryText(parsed.key_fact),
    reasonType: mapReasonType(parsed.reason_type),
    noSummaryReason,
    model,
    quote,
    news,
  }
}

export async function storeGeneratedWhyMovingSummary(summary: GeneratedWhyMovingSummary, runId: string) {
  const supabase = createSupabaseWriteClient()
  if (!supabase) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  const { error } = await supabase.from('stock_summaries').insert({
    symbol: summary.symbol,
    summary_date: summary.summaryDate,
    run_id: runId,
    summary_text: summary.summaryText,
    model: summary.model,
    config_version: 'fin-quote-daily-v1',
    winning_event: summary.news[0]
      ? {
          title: summary.news[0].title,
          publisher: summary.news[0].site,
          publishedDate: summary.news[0].publishedDate,
          url: summary.news[0].url,
        }
      : null,
    runner_up_event: summary.news[1]
      ? {
          title: summary.news[1].title,
          publisher: summary.news[1].site,
          publishedDate: summary.news[1].publishedDate,
          url: summary.news[1].url,
        }
      : null,
    no_summary_reason: summary.noSummaryReason,
    activation_path: summary.summaryText ? 'fin_quote_generated_daily' : 'no_clear_catalyst',
    earnings_context: null,
    metadata: {
      source: 'fin_quote_generated_daily',
      key_fact: summary.keyFact,
      reason_type: summary.reasonType,
      quote: summary.quote,
      candidate_pool: summary.news.map((item) => ({
        title: item.title,
        publisher: item.site,
        publishedDate: item.publishedDate,
        url: item.url,
      })),
    },
  })

  if (error) {
    throw new Error(`stock_summaries insert failed for ${summary.symbol}: ${error.message}`)
  }
}

export async function getGeneratedStockWhyMovingSummary(symbolInput: string, summaryDate = getWiimSummaryDate()) {
  const symbol = normalizeSP500Symbol(symbolInput)
  if (!symbol || !isSP500(symbol)) return null

  const supabase = createSupabaseReadClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('stock_summaries')
    .select('symbol, summary_date, summary_text, model, generated_at, no_summary_reason, metadata')
    .eq('symbol', symbol)
    .eq('summary_date', summaryDate)
    .or('no_summary_reason.is.null,no_summary_reason.neq.validation_rejected')
    .order('generated_at', { ascending: false })
    .limit(1)

  if (error || !Array.isArray(data) || !data[0]) return null
  return data[0] as StockSummaryRow
}

export async function getGeneratedStockWhyMovingData(symbol: string): Promise<StockWhyMovingResult | null> {
  const row = await getGeneratedStockWhyMovingSummary(symbol)
  if (!row?.summary_text) return null

  return {
    symbol: row.symbol,
    status: 'found',
    displayText: row.summary_text,
    headline: row.summary_text,
    summary: row.summary_text,
    bulletPoints: [],
    sentiment: null,
    source: row.metadata?.source ?? 'fin_quote_generated_daily',
    sourceTimestamp: row.generated_at,
    isCatalyst: true,
    sourceUrl: '',
    fetchedAt: row.generated_at,
    errorMessage: null,
  }
}

export const __testOnly = {
  parseJsonObject,
}
