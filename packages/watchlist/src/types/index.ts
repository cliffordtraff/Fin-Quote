export interface Stock {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  volume: number
  bid: number
  ask: number
  bidSize: number
  askSize: number
  dayLow: number
  dayHigh: number
  weekLow52: number
  weekHigh52: number
  marketCap: number
  peRatio: number | null
  eps: number | null
  dividendYield: number | null
  exDividendDate: string | null
  lastUpdated?: Date
  extendedHoursQuote?: ExtendedHoursQuote | null
}

// Extended hours quote data
export interface ExtendedHoursQuote {
  symbol: string
  price: number
  change: number
  changePercent: number
  timestamp: string
  session: 'pre-market' | 'after-hours'
}

// Type for merged stock data with dividend info and news
export interface MergedStock extends Stock {
  dividendYield: number | null  // Explicitly nullable
  exDividendDate: string | null
  yieldBasis: 'TTM' | 'forward' | 'estimated' | 'unknown'
  dividendDataFresh: boolean    // Indicates if dividend data is current
  news?: NewsArticle | null     // Most relevant news article
  newsCount?: number            // Total number of matched articles
}

// Type for dividend data from API/cache
export interface DividendData {
  symbol: string
  dividendYield: number | null
  exDividendDate: string | null
  yieldBasis?: 'TTM' | 'forward' | 'estimated' | 'unknown'
  lastUpdated?: string
  annualDividend?: number
  paymentFrequency?: string
}

// News Types for WSJ Integration
export interface NewsArticle {
  id: string  // URL hash for deduplication
  headline: string
  description: string  // RSS-provided summary/description
  canonicalUrl: string  // Cleaned URL
  sourceDomain: string  // e.g., 'wsj.com'
  source: 'WSJ' | 'NYT' | 'Yahoo' | 'Bloomberg' | 'Reuters'
  isPaywalled: boolean
  publishedAt: Date
  normalizedTitle: string  // For clustering
  normalizedDescription: string  // For better matching
  entities?: EntityMatch[]  // NER results from headline + description
  eventType?: 'earnings' | 'guidance' | 'lawsuit' | 'product' | 'macro'
  clusterId?: string  // Group similar articles
  matchedTickers?: TickerMatch[]
  confidence?: number  // Overall match confidence
  // Optional metadata commonly present in RSS feeds (used for scoring)
  author?: string
  categories?: string[]
  relevanceScore?: number
  isArchived?: boolean  // Indicates if article is from archive (7-day retention)
  // Topic classification fields (NEW)
  topics?: string[]  // AI-classified topics (1-3 topics)
  feedTopic?: string  // Feed-level category (e.g., 'Markets' from WSJ markets feed)
  topicsClassified?: boolean  // True after GPT classification complete
  classificationMetadata?: TopicClassificationMetadata
  // Macro attribution fields (v2.0.0)
  scope?: 'macro' | 'sector' | 'company' | 'other'  // Article scope for macro attribution
  macroEventType?: 'trade_tariff' | 'fed_policy' | 'geopolitical' | 'economic_data' | 'financial_stress' | 'policy' | null
}

export interface TopicClassificationMetadata {
  model: string  // e.g., 'gpt-4o-mini'
  promptVersion: string  // e.g., '1.0'
  classifiedAt: Date
  idempotencyKey: string  // Hash of headline + description + source
  confidence?: number  // Optional confidence score
}

export interface TickerMatch {
  symbol: string
  confidence: number
  matchType: 'exact' | 'company' | 'executive' | 'product' | 'context' | 'entity'
  matchedTerms: string[]
  entityConfidence?: number  // From NER
  matchReason?: string  // Simple explanation of why it matched
}

export interface EntityMatch {
  text: string
  type: 'ORG' | 'PERSON' | 'LOCATION' | 'MONEY' | 'DATE' | 'PRODUCT'
  confidence: number
  symbol?: string  // Mapped ticker if applicable
}

export interface CompanyMapping {
  symbol: string
  primary: string
  aliases: string[]
  executives: string[]
  products: string[]
  contextPositive: string[]
  contextNegative: string[]
}

export interface NewsCache {
  articles: NewsArticle[]
  lastUpdated: Date
  etag?: string
  lastModified?: string
}

export interface Watchlist {
  id: string
  name: string
  symbols: string[]
  createdAt: Date
  updatedAt: Date
}

export interface WatchlistSettings {
  showExtendedHours?: boolean
  columnWidths?: Record<string, number>
  fontScale?: number
}

// Watchlist Item Types
export type WatchlistItemType = 'stock' | 'header'

export interface WatchlistItem {
  type: WatchlistItemType
  symbol: string  // For stocks: ticker, for headers: display text
}

export interface WatchlistStock extends WatchlistItem {
  type: 'stock'
  symbol: string  // e.g., "AAPL"
  tvSymbol?: string  // e.g., "NASDAQ:AAPL" - TradingView format
  exchange?: string  // e.g., "NASDAQ"
  companyName?: string  // e.g., "Apple Inc"
  isADR?: boolean  // Is this an ADR?
}

export interface WatchlistHeader extends WatchlistItem {
  type: 'header'
  symbol: string  // User-defined header text, e.g., "Tech Stocks"
  id?: string     // Optional unique ID for tracking
}

export type WatchlistEntry = WatchlistStock | WatchlistHeader

export interface WatchlistTab {
  name: string
  symbols?: string[]  // Deprecated, for backward compatibility
  items?: WatchlistEntry[]  // New format
}

export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
}

export interface QuoteData {
  symbol: string
  price: number
  change: number
  changePercent: number
  volume: number
  latestTradingDay: string
  bid?: number
  ask?: number
  bidSize?: number
  askSize?: number
  weekHigh52?: number
  weekLow52?: number
  marketCap?: number
}

export interface CompanyData {
  symbol: string
  name: string
  description?: string
  sector?: string
  industry?: string
  marketCap?: number
  peRatio?: number
  eps?: number
  dividendYield?: number
  exDividendDate?: string
}

// Unified API Response Types
export interface UnifiedStockResponse {
  data: {
    quotes?: Record<string, Stock>
    dividends?: Record<string, DividendData>
    news?: Record<string, NewsArticle[]>
    metadata?: Record<string, CompanyData>
  }
  status: {
    source: 'live' | 'cached' | 'mock' | 'error' | 'firestore-cache' | 'stale-cache' | 'mixed'
    timestamp: string
    requestedSymbols: string[]
    returnedSymbols: string[]
    errors: string[]
    warnings: string[]
    cacheTTL?: number
    responseTime?: number
  }
}
