import type { ChartExportSpec } from '@/types/chart-export'

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
// Editorial chart templates
// ---------------------------------------------------------------------------

export interface EditorialChartTemplate {
  /** Unique template identifier (e.g. 'revenue_vs_net_income') */
  id: string

  /** Human-readable label (e.g. 'Revenue vs Net Income') */
  label: string

  /** One-sentence description of what the chart shows */
  description: string

  /** Guidance for an AI on when to pick this template */
  whenToUse: string

  /** Metric IDs to plot */
  metrics: string[]

  /** Maximum metrics allowed (including overrides) */
  maxMetrics: number

  /** Default chart type */
  chartType: 'bar' | 'line' | 'area'

  /** Year range strategy */
  yearRange: YearRangeStrategy

  /** Default period */
  periodType: 'annual' | 'quarterly'

  /** Whether price overlay is allowed */
  priceOverlayAllowed: boolean

  /** Whether price overlay is on by default */
  priceOverlayDefault: boolean

  /**
   * Title pattern with placeholders: {ticker}, {minYear}, {maxYear}
   * Example: '{ticker} Revenue vs Net Income ({minYear}–{maxYear})'
   */
  titlePattern: string

  /** Subtitle pattern with the same placeholders */
  subtitlePattern: string

  /** Default colors keyed by metric ID */
  defaultColors: Record<string, string>
}

// ---------------------------------------------------------------------------
// Resolver inputs / outputs
// ---------------------------------------------------------------------------

export interface ResolveChartOptions {
  /** Stock ticker (required) */
  ticker: string

  /** Override the year range */
  yearOverride?: { minYear: number; maxYear: number }

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

  /** A fully-formed ChartExportSpec ready for buildExportUrl() */
  spec: ChartExportSpec

  /** Pre-built export URL (relative) */
  exportUrl: string
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

/** Result of the AI stock picker step */
export interface StockPickerResult {
  ticker: string
  name: string
  changesPercentage: number
  editorialHook: string
  subjectLine: string
  topHeadlines: StockNewsItem[]
  pickSource?: 'earnings' | 'big_mover' | 'news_catalyst' | 'fallback'
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

/** Financial data gathered for the LLM to reason about */
export interface NewsletterContext {
  ticker: string
  financials: Array<{
    year: number
    revenue: number
    netIncome: number
    grossMargin: number
    operatingMargin: number
    freeCashFlow: number
    eps: number
  }>
  /** Pre-computed highlights so the LLM doesn't have to do math */
  highlights: {
    revenueGrowthYoY: number | null
    netIncomeGrowthYoY: number | null
    grossMarginLatest: number | null
    operatingMarginLatest: number | null
    fcfLatest: number | null
  }
  /** Present when the stock was auto-picked (no --ticker override) */
  stockPickerResult?: StockPickerResult
}

/** Options for the newsletter generation pipeline */
export interface NewsletterOptions {
  /** Base URL of the running app (default: 'http://localhost:3000') */
  baseUrl?: string
  /** Directory for saved chart PNGs (default: './public/newsletter-charts') */
  outputDir?: string
  /** Maximum number of chart sections (default: 3) */
  maxCharts?: number
  /** Upload chart PNGs to Supabase Storage and rewrite image URLs to public URLs */
  publish?: boolean
}

/** Result returned by generateNewsletter() */
export interface NewsletterResult {
  ticker: string
  generatedAt: string
  subjectLine: string
  selections: Array<{ templateId: string; reason: string }>
  blocks: NewsletterBlock[]
  fullHtml: string
  chartPaths: string[]
  htmlPath: string
  /** Full-page preview screenshot of the assembled newsletter */
  previewPath: string
  timings: Record<string, number>
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
}

/** AI copy generation output */
export interface GeneratedCopy {
  headline: string
  body: string
  caption: string
}
