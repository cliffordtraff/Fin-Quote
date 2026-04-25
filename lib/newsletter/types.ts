import type { ChartExportSpec } from '@/types/chart-export'

export type NewsletterPeriodType = 'annual' | 'quarterly'
export type NewsletterFormat = 'single_stock' | 'market_roundup'
export type NewsletterGenerationBackend = 'openai_api' | 'local_worker'
export type NewsletterModelBackend = 'openai_api' | 'ollama' | 'codex_cli'

// ---------------------------------------------------------------------------
// Year-range strategies — keep templates evergreen
// ---------------------------------------------------------------------------

/** Roll forward automatically: "last N years from today" */
export interface LastNYearsStrategy {
  kind: 'last_n_years'
  n: number
}

/** Show everything available */
export interface AllAvailableStrategy {
  kind: 'all_available'
}

export type YearRangeStrategy = LastNYearsStrategy | AllAvailableStrategy

// ---------------------------------------------------------------------------
// Newsletter chart modes
// ---------------------------------------------------------------------------

export type NewsletterPriceRange =
  | '1d'
  | '5d'
  | '1m'
  | '3m'
  | '6m'
  | '1y'
  | '2y'
  | '5y'

export type NewsletterPriceInterval =
  | '1sec'
  | '10sec'
  | '1min'
  | '2min'
  | '5min'
  | '15min'
  | '30min'
  | '1hour'
  | '4hour'
  | 'D'
  | 'W'
  | 'M'

export type NewsletterPriceChartType =
  | 'candles'
  | 'hollow-candles'
  | 'ohlc-bars'
  | 'line'
  | 'heikin-ashi'

export type NewsletterPriceStateSnapshot = Record<string, unknown>

export interface FundamentalsNewsletterChartSpec extends ChartExportSpec {
  mode?: 'fundamentals'
}

export interface PriceNewsletterChartSpec {
  mode: 'price'
  symbol: string
  range: NewsletterPriceRange
  interval: NewsletterPriceInterval
  chartType: NewsletterPriceChartType
  priceState?: NewsletterPriceStateSnapshot
  title?: string
  subtitle?: string
}

export type NewsletterChartSpec =
  | FundamentalsNewsletterChartSpec
  | PriceNewsletterChartSpec

// ---------------------------------------------------------------------------
// Editorial chart templates
// ---------------------------------------------------------------------------

interface EditorialChartTemplateBase {
  /** Unique template identifier (e.g. 'revenue_vs_net_income') */
  id: string

  /** Human-readable label (e.g. 'Revenue vs Net Income') */
  label: string

  /** One-sentence description of what the chart shows */
  description: string

  /** Guidance for an AI on when to pick this template */
  whenToUse: string

  /**
   * Title pattern with placeholders:
   *   fundamentals: {ticker}, {minYear}, {maxYear}
   *   price: {ticker}
   */
  titlePattern: string

  /** Subtitle pattern with the same placeholders */
  subtitlePattern: string
}

export interface FundamentalsEditorialChartTemplate
  extends EditorialChartTemplateBase {
  mode?: 'fundamentals'

  /** Metric IDs to plot */
  metrics: string[]

  /** Maximum metrics allowed (including overrides) */
  maxMetrics: number

  /** Default chart type */
  chartType: 'bar' | 'line' | 'area'

  /** Year range strategy */
  yearRange: YearRangeStrategy

  /** Optional alternate range strategy when the chart is rendered quarterly */
  quarterlyYearRange?: YearRangeStrategy

  /** Allowed periods for this template */
  supportedPeriods: NewsletterPeriodType[]

  /** Default period */
  defaultPeriodType: NewsletterPeriodType

  /** Whether price overlay is allowed */
  priceOverlayAllowed: boolean

  /** Whether price overlay is on by default */
  priceOverlayDefault: boolean

  /** Default colors keyed by metric ID */
  defaultColors: Record<string, string>
}

export interface PriceEditorialChartTemplate extends EditorialChartTemplateBase {
  mode: 'price'
  range: NewsletterPriceRange
  interval: NewsletterPriceInterval
  chartType: NewsletterPriceChartType
}

export type EditorialChartTemplate =
  | FundamentalsEditorialChartTemplate
  | PriceEditorialChartTemplate

// ---------------------------------------------------------------------------
// Resolver inputs / outputs
// ---------------------------------------------------------------------------

export interface ResolveChartOptions {
  /** Stock ticker (primary ticker when `stocks` is omitted) */
  ticker?: string

  /** Stock ticker symbols (primary first) */
  stocks?: string[]

  /** Override the year range */
  yearOverride?: { minYear: number; maxYear: number }

  /** Override the default period */
  periodType?: NewsletterPeriodType

  /** Override the chart title */
  titleOverride?: string

  /** Override the subtitle */
  subtitleOverride?: string

  /** Force price overlay on/off */
  showPriceOverride?: boolean

  /** Override default colors */
  colorsOverride?: Record<string, string>
}

export interface ResolvedChart {
  /** The template that was used */
  templateId: string

  /** A fully-formed newsletter chart spec ready for capture/rendering */
  spec: NewsletterChartSpec
}

// ---------------------------------------------------------------------------
// Newsletter layout templates
// ---------------------------------------------------------------------------

/** Named slot that a layout template defines */
export type SlotName =
  | 'heading'
  | 'body'
  | 'chart'
  | 'caption'
  | 'cta'
  | 'footer'

export interface LayoutSlot {
  name: SlotName
  required: boolean
}

export interface NewsletterLayoutTemplate {
  /** Unique layout ID */
  id: string

  /** Human-readable label */
  label: string

  /** Ordered list of slots */
  slots: LayoutSlot[]
}

// ---------------------------------------------------------------------------
// Newsletter block content & output
// ---------------------------------------------------------------------------

export interface NewsletterBlockContent {
  heading?: string
  body?: string
  chartImageUrl?: string
  chartAlt?: string
  chartExportUrl?: string
  caption?: string
  ctaText?: string
  ctaUrl?: string
  footer?: string
}

export interface NewsletterBlock {
  /** The layout used */
  layoutId: string

  /** Structured content (for further processing / serialization) */
  data: NewsletterBlockContent

  /** Email-safe HTML fragment with inline styles */
  html: string
}

// ---------------------------------------------------------------------------
// AI stock picker types
// ---------------------------------------------------------------------------

/** A candidate stock from the most-active list */
export interface StockCandidate {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
}

/** A single news article for a stock */
export interface StockNewsItem {
  title: string
  text: string
  url: string
  publishedDate: string
  site: string
}

/** A stock that was previously picked for a newsletter */
export interface RecentPick {
  ticker: string
  name: string
  pickedAt: string
}

/** A company that recently reported earnings */
export interface EarningsCandidate {
  symbol: string
  date: string
  time: string
  eps: number | null
  epsEstimated: number | null
  revenue: number | null
  revenueEstimated: number | null
  /** Negative = reported N hours ago, positive = reports in N hours */
  hoursAgo: number
}

/** Market context gathered for the AI stock picker */
export interface MarketContext {
  candidates: StockCandidate[]
  newsBySymbol: Record<string, StockNewsItem[]>
  recentPicks?: RecentPick[]
  earningsReports?: EarningsCandidate[]
  gainersLosers?: StockCandidate[]
}

export interface FeaturedStock {
  ticker: string
  name: string
  changesPercentage: number
  editorialHook: string
  topHeadlines: StockNewsItem[]
  pickSource?: 'earnings' | 'big_mover' | 'news_catalyst' | 'fallback'
}

/** Result of the AI stock picker step */
export interface StockPickerResult extends FeaturedStock {
  subjectLine: string
}

// ---------------------------------------------------------------------------
// Today's quote (for intro block)
// ---------------------------------------------------------------------------

/** Today's trading data for the newsletter intro */
export interface TodayQuote {
  ticker: string
  name: string
  price: number
  change: number
  changesPercentage: number
  marketCap?: number
  pe?: number
  yearHigh?: number
  yearLow?: number
  ytdReturn?: number
}

// ---------------------------------------------------------------------------
// AI orchestration types
// ---------------------------------------------------------------------------

export interface NewsletterFinancialPoint {
  year: number
  periodLabel: string
  revenue: number
  netIncome: number
  grossMargin: number
  operatingMargin: number
  freeCashFlow: number | null
  eps: number
  fiscalQuarter?: number | null
  fiscalLabel?: string | null
}

export interface NewsletterHighlights {
  revenueGrowthYoY: number | null
  netIncomeGrowthYoY: number | null
  grossMarginLatest: number | null
  operatingMarginLatest: number | null
  fcfLatest: number | null
}

/** Financial data gathered for the LLM to reason about */
export interface NewsletterContext {
  ticker: string
  financials: NewsletterFinancialPoint[]
  quarterlyFinancials: NewsletterFinancialPoint[]
  /** Pre-computed highlights so the LLM doesn't have to do math */
  highlights: NewsletterHighlights
  quarterlyHighlights: NewsletterHighlights & {
    latestPeriodLabel: string | null
  }
  priceContext?: {
    latestClose: number | null
    latestDate: string | null
    return1m: number | null
    return3m: number | null
    return6m: number | null
    return1y: number | null
    high52Week: number | null
    low52Week: number | null
    distanceTo52WeekHigh: number | null
    distanceTo52WeekLow: number | null
    sma50: number | null
    sma200: number | null
    above50DaySma: boolean | null
    above200DaySma: boolean | null
  }
  /** Present when the stock was auto-picked (no --ticker override) */
  stockPickerResult?: StockPickerResult
}

/** Options for the newsletter generation pipeline */
export interface NewsletterOptions {
  /** Base URL of the running app (default: 'http://localhost:3000') */
  baseUrl?: string
  /** Base URL of the Charting Platform app used for chart capture and links */
  chartBaseUrl?: string
  /** Public Charting Platform URL used in final newsletter click-through links */
  publicChartBaseUrl?: string
  /** Directory for saved chart PNGs (default: './public/newsletter-charts') */
  outputDir?: string
  /** Maximum number of chart sections (default: 3) */
  maxCharts?: number
  /** Newsletter generation format. */
  format?: NewsletterFormat | 'auto'
  /** Number of featured stocks in market roundup mode. */
  roundupSize?: number
  /** Explicit featured tickers for market roundup regeneration/overrides. */
  featuredTickers?: string[]
  /** Optional user brief to steer stock selection, chart choice, and copy. */
  generationPrompt?: string
  /** Upload chart PNGs to Supabase Storage and rewrite image URLs to public URLs */
  publish?: boolean
  /** Editor-specific fast path: smaller chart captures and no preview screenshot unless overridden */
  editorMode?: boolean
  /** Skip the assembled newsletter preview PNG capture */
  skipPreviewCapture?: boolean
  /** Override chart capture width */
  chartRenderWidth?: number
  /** Override chart capture height */
  chartRenderHeight?: number
  /** Override the generation execution backend. */
  generationBackend?: NewsletterGenerationBackend
  /** Override the model backend used inside the generation pipeline. */
  modelBackend?: NewsletterModelBackend
}

/** Result returned by generateNewsletter() */
export interface NewsletterResult {
  ticker: string
  format: NewsletterFormat
  featuredTickers: string[]
  generationPrompt?: string
  generatedAt: string
  subjectLine: string
  selections: Array<{
    templateId: string
    reason: string
    periodType?: NewsletterPeriodType
    ticker?: string
  }>
  blocks: NewsletterBlock[]
  chartSpecs: NewsletterChartSpec[]
  fullHtml: string
  /** Beehiiv-compatible HTML snippet (no document wrapper, ready to paste) */
  beehiivHtml: string
  chartPaths: string[]
  htmlPath: string
  /** Path to Beehiiv-compatible HTML file */
  beehiivHtmlPath: string
  /** Full-page preview screenshot of the assembled newsletter */
  previewPath: string | null
  timings: Record<string, number>
  todayQuote?: TodayQuote
  editorialHook?: string
  /** True when the stock was auto-picked by AI (no --ticker override) */
  autoPickedStock: boolean
  /** Details of the AI stock pick (only present when autoPickedStock is true) */
  stockPickerResult?: StockPickerResult
  /** Map of local filename → public Supabase URL (only present when publish: true) */
  publishedUrls?: Record<string, string>
}

/** AI template selection output */
export interface TemplateSelection {
  templateId: string
  reason: string
  periodType?: NewsletterPeriodType
  ticker?: string
}

/** AI copy generation output */
export interface GeneratedCopy {
  headline: string
  body: string
  caption: string
}

// ---------------------------------------------------------------------------
// Newsletter draft editor types
// ---------------------------------------------------------------------------

export type NewsletterDraftStatus = 'draft' | 'published'

export interface NewsletterDraftBlock {
  id: string
  layoutId: string
  templateId: string
  selectionReason: string
  heading: string
  body: string
  chartImageUrl: string
  chartAlt: string
  chartExportUrl: string
  chartSpec: NewsletterChartSpec
  chartNeedsRegeneration: boolean
  caption?: string
  ctaText?: string
  ctaUrl?: string
  footer?: string
}

export interface NewsletterDraftStatsItem {
  label: string
  value: string
}

export interface NewsletterDraftStatsCard {
  items: NewsletterDraftStatsItem[]
}

export interface NewsletterDraftHeader {
  title: string
  dateText: string
  badgeText: string
  logoUrl?: string
  logoUrls?: string[]
}

export interface NewsletterDraftDocument {
  ticker: string
  format: NewsletterFormat
  featuredTickers: string[]
  manualDraft?: boolean
  generationPrompt?: string
  generatedAt: string
  subjectLine: string
  introText: string
  editorialHook?: string
  todayQuote?: TodayQuote
  header?: NewsletterDraftHeader
  statsCard?: NewsletterDraftStatsCard
  autoPickedStock: boolean
  stockPickerResult?: StockPickerResult
  blocks: NewsletterDraftBlock[]
}

export interface NewsletterDraftRecord {
  id: string
  ownerId: string | null
  ticker: string
  status: NewsletterDraftStatus
  subjectLine: string
  previewHtml: string
  draft: NewsletterDraftDocument
  createdAt: string
  updatedAt: string
}

export interface NewsletterDraftSummary {
  id: string
  ticker: string
  format: NewsletterFormat
  featuredTickers: string[]
  status: NewsletterDraftStatus
  subjectLine: string
  generatedAt: string
  blockCount: number
  createdAt: string
  updatedAt: string
}
