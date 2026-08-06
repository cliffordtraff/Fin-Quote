import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

import { fetchTickerNews } from '@/lib/newsletter/fetch-context'
import { getProvider, type ProviderNews, type ProviderQuote } from '@/lib/providers'
import { getSP500Constituent, isSP500, normalizeSP500Symbol } from '@/lib/sp500'
import type { StockWhyMovingResult } from '@/lib/stock-why-moving'
import { isNewsletterSourceEntityMatch } from '@/lib/newsletter/source-integrity'

export const WIIM_SUMMARY_CONFIG_VERSION = 'fin-quote-daily-v2'
export const WIIM_SUMMARY_NEWS_LOOKBACK_DAYS = 7
export const WIIM_SUMMARY_MAX_CHARACTERS = 280

const SEC_NEWS_FORMS = new Set(['8-K', '10-Q', '10-K', '6-K'])

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
  selectedSourceIndex: number | null
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
  if (normalized.length <= WIIM_SUMMARY_MAX_CHARACTERS) return normalized

  const candidate = normalized.slice(0, WIIM_SUMMARY_MAX_CHARACTERS - 3).trim()
  const lastSpace = candidate.lastIndexOf(' ')
  const truncated = (lastSpace > 0 ? candidate.slice(0, lastSpace) : candidate)
    .replace(/[,:;]$/, '')
  return `${truncated}...`
}

function resolveEntityAnchoredSummary(input: {
  value: unknown
  symbol: string
  companyName: string
  sourceMatchesEntity: boolean
}): string | null {
  const summary = normalizeSummaryText(input.value)
  if (!summary || !input.sourceMatchesEntity) return null

  return isNewsletterSourceEntityMatch({
    ticker: input.symbol,
    companyName: input.companyName,
    text: summary,
  })
    ? summary
    : null
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

function easternCalendarDate(value: string): string | null {
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized)
  const date = new Date(hasZone ? normalized : `${normalized}Z`)
  if (Number.isNaN(date.getTime())) return null

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  return year && month && day ? `${year}-${month}-${day}` : null
}

export function filterTimelySummaryNews(
  news: ProviderNews[],
  summaryDate: string,
  lookbackDays = WIIM_SUMMARY_NEWS_LOOKBACK_DAYS,
): ProviderNews[] {
  return news.filter((item) =>
    isSummaryTimestampFresh(item.publishedDate, summaryDate, lookbackDays),
  )
}

function isSummaryTimestampFresh(
  value: string,
  summaryDate: string,
  lookbackDays: number,
): boolean {
  const summaryTime = Date.parse(`${summaryDate}T12:00:00Z`)
  const articleDate = easternCalendarDate(value)
  if (!Number.isFinite(summaryTime) || !articleDate) return false
  const articleTime = Date.parse(`${articleDate}T12:00:00Z`)
  const ageInDays = Math.round((summaryTime - articleTime) / 86_400_000)
  return ageInDays >= 0 && ageInDays <= lookbackDays
}

export function filterEntityMatchedSummaryNews(
  news: ProviderNews[],
  symbol: string,
  companyName: string,
): ProviderNews[] {
  return news.filter((item) =>
    isNewsletterSourceEntityMatch({
      ticker: symbol,
      companyName,
      text: `${item.title} ${item.text ?? ''}`,
    }),
  )
}

export function hasRecentEntityMatchedSummaryNews(
  news: ProviderNews[],
  symbol: string,
  companyName: string,
  summaryDate: string,
): boolean {
  return filterTimelySummaryNews(
    filterEntityMatchedSummaryNews(news, symbol, companyName),
    summaryDate,
    2,
  ).length > 0
}

export function mergeSummaryNews(
  ...collections: ProviderNews[][]
): ProviderNews[] {
  const deduplicated = new Map<string, ProviderNews>()
  for (const item of collections.flat()) {
    const normalizedUrl = item.url?.trim().toLowerCase()
    const normalizedTitle = item.title.replace(/\s+/g, ' ').trim().toLowerCase()
    const key = normalizedUrl || `${normalizedTitle}|${item.publishedDate}`
    if (!key || deduplicated.has(key)) continue
    deduplicated.set(key, item)
  }
  return [...deduplicated.values()].sort((a, b) => {
    const aTime = Date.parse(a.publishedDate)
    const bTime = Date.parse(b.publishedDate)
    return (Number.isFinite(bTime) ? bTime : 0) -
      (Number.isFinite(aTime) ? aTime : 0)
  })
}

function decodeSecHtml(value: string): string {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_match, code) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&nbsp;|&ensp;|&emsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function selectSecFilingDocument(
  names: string[],
  primaryDocument: string,
): string | null {
  const html = names.filter((name) => /\.html?$/i.test(name))
  const scored = html
    .map((name) => ({
      name,
      score:
        /(?:ex(?:hibit)?[-_.]?)?99[-_.]?0?1/i.test(name) || /ex991/i.test(name)
          ? 100
          : /(?:ex(?:hibit)?[-_.]?)?99/i.test(name)
            ? 80
            : name === primaryDocument
              ? 60
              : 0,
    }))
    .sort((a, b) => b.score - a.score)
  return scored[0]?.score ? scored[0].name : null
}

function secNewsTitle(companyName: string, form: string, text: string): string {
  const companyLead = companyName
    .replace(/,?\s+(?:incorporated|inc\.?|corp(?:oration)?\.?|plc|ltd\.?)$/i, '')
    .trim()
  const match = text.match(
    new RegExp(
      `${companyLead.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^.!?]{0,120}?(?:results|earnings|guidance)`,
      'i',
    ),
  )
  if (match) return match[0].replace(/\s+/g, ' ').trim()
  return `${companyLead} reports a new ${form} filing to the SEC`
}

async function fetchRecentSecCompanyNews(input: {
  symbol: string
  companyName: string
  summaryDate: string
  signal?: AbortSignal
}): Promise<ProviderNews[]> {
  const constituent = getSP500Constituent(input.symbol)
  const cik = constituent?.cik?.replace(/^0+/, '')
  if (!cik) return []

  const headers = {
    'User-Agent':
      process.env.SEC_USER_AGENT?.trim() ||
      'The Intraday contact@theintraday.com',
    Accept: 'application/json, text/html;q=0.9',
    'Accept-Encoding': 'gzip, deflate',
  }
  const submissionsResponse = await fetch(
    `https://data.sec.gov/submissions/CIK${cik.padStart(10, '0')}.json`,
    { headers, signal: input.signal, cache: 'no-store' },
  )
  if (!submissionsResponse.ok) return []
  const submissions = await submissionsResponse.json() as {
    filings?: {
      recent?: {
        accessionNumber?: string[]
        acceptanceDateTime?: string[]
        form?: string[]
        primaryDocument?: string[]
      }
    }
  }
  const recent = submissions.filings?.recent
  if (!recent) return []

  const filings = (recent.form ?? [])
    .map((form, index) => ({
      form,
      accessionNumber: recent.accessionNumber?.[index] ?? '',
      acceptedAt: recent.acceptanceDateTime?.[index] ?? '',
      primaryDocument: recent.primaryDocument?.[index] ?? '',
    }))
    .filter(
      (filing) =>
        SEC_NEWS_FORMS.has(filing.form) &&
        filing.accessionNumber &&
        isSummaryTimestampFresh(filing.acceptedAt, input.summaryDate, 7),
    )
    .slice(0, 3)

  const results: ProviderNews[] = []
  for (const filing of filings) {
    input.signal?.throwIfAborted()
    const accession = filing.accessionNumber.replace(/-/g, '')
    const archiveBase = `https://www.sec.gov/Archives/edgar/data/${cik}/${accession}`
    const indexResponse = await fetch(`${archiveBase}/index.json`, {
      headers,
      signal: input.signal,
      cache: 'no-store',
    })
    if (!indexResponse.ok) continue
    const index = await indexResponse.json() as {
      directory?: { item?: Array<{ name?: string }> }
    }
    const document = selectSecFilingDocument(
      (index.directory?.item ?? []).flatMap((item) =>
        item.name ? [item.name] : [],
      ),
      filing.primaryDocument,
    )
    if (!document) continue
    const documentUrl = `${archiveBase}/${document}`
    const documentResponse = await fetch(documentUrl, {
      headers,
      signal: input.signal,
      cache: 'no-store',
    })
    if (!documentResponse.ok) continue
    const text = decodeSecHtml(await documentResponse.text())
    if (text.length < 120) continue
    results.push({
      title: secNewsTitle(input.companyName, filing.form, text),
      text: text.slice(0, 8_000),
      url: documentUrl,
      image: null,
      publishedDate: filing.acceptedAt,
      site: 'SEC',
      symbol: input.symbol,
    })
  }
  return results
}

function buildPrompt(input: {
  symbol: string
  name: string
  summaryDate: string
  quote: ProviderQuote | null
  news: ProviderNews[]
}) {
  const newsBrief = input.news.slice(0, 16).map((item, index) => ({
    n: index + 1,
    title: item.title,
    site: item.site,
    publishedDate: item.publishedDate,
    text: item.text?.slice(0, item.site === 'SEC' ? 2_000 : 500) || '',
  }))

  return `You write concise "Why Is It Moving" summaries for S&P 500 stocks.

Use only the quote and news context below. Do not use Finviz.
Return strict JSON:
{
  "summary": string | null,
  "key_fact": string | null,
  "reason_type": "earnings" | "analyst_action" | "macro" | "deal" | "product" | "legal" | "capital_return" | "management" | "price_action" | "other" | "unclear",
  "no_summary_reason": string | null,
  "source_index": number | null
}

Rules:
- Write one useful sentence, under 35 words.
- Explain the likely current catalyst, not the company's business model.
- The report date is ${input.summaryDate} in America/New_York.
- The quote is the provider's latest regular-session quote and may not include extended-hours trading.
- Do not say shares rose, fell, gained, slipped, or otherwise infer current direction from that quote. State the supported event and why it matters.
- Use only news published within the supplied seven-day window. Never revive an older event from memory.
- Prefer concrete timely catalysts: earnings, guidance, analyst action, deal, regulatory/legal, product launch, management change, capital return, or sector/macro read-through.
- If there is no clear catalyst in the provided context, set summary to null and no_summary_reason to "no_clear_catalyst".
- If the price move is small and the news is generic, set summary to null and no_summary_reason to "quiet_tape".
- When summary is not null, source_index is required and must be the 1-based n field of the single news item that best supports it.
- Never select a source about a similarly named product or another company. The source must identify ${input.name} or ${input.symbol}.
- When summary is not null, explicitly identify ${input.name} or ${input.symbol} in the summary. Do not shorten the company name to a generic word.
- When summary is null, set source_index to null.

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
  signal?: AbortSignal
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
  const summaryDate = input.summaryDate ?? getWiimSummaryDate()
  // A provider's first page can contain several low-signal market recaps.
  // Keep enough current stories to reach primary earnings releases without
  // relaxing the seven-day freshness or entity-validation gates below.
  const newsFetchLimit = 20

  const [quote, news] = await Promise.all([
    provider.getQuote(symbol).catch(() => null),
    provider.getNews(symbol, newsFetchLimit).catch(() => []),
  ])
  const entityMatchedPrimaryNews = filterEntityMatchedSummaryNews(
    news,
    symbol,
    name,
  )
  let timelyNews = filterTimelySummaryNews(
    entityMatchedPrimaryNews,
    summaryDate,
  )
  const hasRecentPrimaryNews = hasRecentEntityMatchedSummaryNews(
    news,
    symbol,
    name,
    summaryDate,
  )

  if (!hasRecentPrimaryNews) {
    const fallbackNews = await fetchTickerNews(
      symbol,
      newsFetchLimit,
      input.signal,
    ).catch((error) => {
      if (input.signal?.aborted) throw input.signal.reason ?? error
      return []
    })
    const timelyFallbackNews = filterTimelySummaryNews(
      filterEntityMatchedSummaryNews(
        fallbackNews.map((item) => ({
          ...item,
          image: null,
          symbol,
        })),
        symbol,
        name,
      ),
      summaryDate,
    )
    if (timelyFallbackNews.length > 0) {
      timelyNews = mergeSummaryNews(timelyFallbackNews, timelyNews)
    }
  }

  if (
    filterTimelySummaryNews(timelyNews, summaryDate, 2).length === 0
  ) {
    const secNews = await fetchRecentSecCompanyNews({
      symbol,
      companyName: name,
      summaryDate,
      signal: input.signal,
    }).catch((error) => {
      if (input.signal?.aborted) throw input.signal.reason ?? error
      return []
    })
    const timelySecNews = filterTimelySummaryNews(
      filterEntityMatchedSummaryNews(secNews, symbol, name),
      summaryDate,
    )
    timelyNews = mergeSummaryNews(timelySecNews, timelyNews)
  }

  const response = await openai.responses.create(
    {
      model,
      input: buildPrompt({ symbol, name, summaryDate, quote, news: timelyNews }),
    },
    { signal: input.signal },
  )

  const parsed = parseJsonObject(response.output_text || '')
  const parsedSourceIndex = Number(parsed.source_index)
  const selectedSourceIndex =
    Number.isInteger(parsedSourceIndex) &&
    parsedSourceIndex >= 1 &&
    parsedSourceIndex <= timelyNews.length
      ? parsedSourceIndex - 1
      : null
  const selectedSource =
    selectedSourceIndex == null ? null : timelyNews[selectedSourceIndex]
  const sourceMatchesEntity = Boolean(
    selectedSource &&
      isNewsletterSourceEntityMatch({
        ticker: symbol,
        companyName: name,
        text: `${selectedSource.title} ${selectedSource.text ?? ''}`,
      }),
  )
  const proposedSummaryText = normalizeSummaryText(parsed.summary)
  const summaryText = resolveEntityAnchoredSummary({
    value: proposedSummaryText,
    symbol,
    companyName: name,
    sourceMatchesEntity,
  })
  const noSummaryReason = summaryText
    ? null
    : proposedSummaryText
      ? 'validation_rejected'
      : normalizeSummaryText(parsed.no_summary_reason) || 'no_clear_catalyst'

  return {
    symbol,
    summaryDate,
    summaryText,
    keyFact: normalizeSummaryText(parsed.key_fact),
    reasonType: mapReasonType(parsed.reason_type),
    noSummaryReason,
    model,
    quote,
    news: timelyNews,
    selectedSourceIndex: summaryText ? selectedSourceIndex : null,
  }
}

export async function storeGeneratedWhyMovingSummary(
  summary: GeneratedWhyMovingSummary,
  runId: string,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted()
  const supabase = createSupabaseWriteClient()
  if (!supabase) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  let insert = supabase.from('stock_summaries').insert({
    symbol: summary.symbol,
    summary_date: summary.summaryDate,
    run_id: runId,
    summary_text: summary.summaryText,
    model: summary.model,
    config_version: WIIM_SUMMARY_CONFIG_VERSION,
    winning_event: summary.selectedSourceIndex != null && summary.news[summary.selectedSourceIndex]
      ? {
          title: summary.news[summary.selectedSourceIndex].title,
          publisher: summary.news[summary.selectedSourceIndex].site,
          publishedDate: summary.news[summary.selectedSourceIndex].publishedDate,
          url: summary.news[summary.selectedSourceIndex].url,
        }
      : null,
    runner_up_event: summary.news.find((_, index) => index !== summary.selectedSourceIndex)
      ? {
          title: summary.news.find((_, index) => index !== summary.selectedSourceIndex)!.title,
          publisher: summary.news.find((_, index) => index !== summary.selectedSourceIndex)!.site,
          publishedDate: summary.news.find((_, index) => index !== summary.selectedSourceIndex)!.publishedDate,
          url: summary.news.find((_, index) => index !== summary.selectedSourceIndex)!.url,
        }
      : null,
    no_summary_reason: summary.noSummaryReason,
    activation_path: summary.summaryText ? 'fin_quote_generated_daily' : 'no_clear_catalyst',
    earnings_context: null,
    metadata: {
      source: 'fin_quote_generated_daily',
      key_fact: summary.keyFact,
      reason_type: summary.reasonType,
      selected_source_index: summary.selectedSourceIndex,
      quote: summary.quote,
      candidate_pool: summary.news.map((item) => ({
        title: item.title,
        publisher: item.site,
        publishedDate: item.publishedDate,
        url: item.url,
      })),
    },
  })
  if (signal) insert = insert.abortSignal(signal)
  const { error } = await insert

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
  normalizeSummaryText,
  parseJsonObject,
  decodeSecHtml,
  selectSecFilingDocument,
  secNewsTitle,
  mergeSummaryNews,
  resolveEntityAnchoredSummary,
}
