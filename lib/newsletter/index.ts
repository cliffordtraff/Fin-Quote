// Types
export type {
  NewsletterPeriodType,
  NewsletterFormat,
  YearRangeStrategy,
  LastNYearsStrategy,
  AllAvailableStrategy,
  FundamentalsNewsletterChartSpec,
  PriceNewsletterChartSpec,
  NewsletterChartSpec,
  NewsletterPriceRange,
  NewsletterPriceInterval,
  NewsletterPriceChartType,
  EditorialChartTemplate,
  ResolveChartOptions,
  ResolvedChart,
  SlotName,
  LayoutSlot,
  NewsletterLayoutTemplate,
  NewsletterBlockContent,
  NewsletterBlock,
  NewsletterContext,
  NewsletterOptions,
  NewsletterResult,
  TemplateSelection,
  GeneratedCopy,
  FeaturedStock,
  StockCandidate,
  StockNewsItem,
  MarketContext,
  StockPickerResult,
  TodayQuote,
  RecentPick,
  EarningsCandidate,
  NewsletterDraftStatus,
  NewsletterDraftBlock,
  NewsletterDraftDocument,
  NewsletterDraftRecord,
  NewsletterDraftSummary,
} from './types'
export { isPriceNewsletterChartSpec } from './chart-spec'

// Editorial chart templates
export {
  EDITORIAL_TEMPLATES,
  EDITORIAL_TEMPLATE_IDS,
  getEditorialTemplate,
} from './editorial-templates'

// Newsletter layout templates
export {
  LAYOUT_TEMPLATES,
  LAYOUT_TEMPLATE_IDS,
  getLayoutTemplate,
} from './layout-templates'

// Resolver
export { resolveEditorialChart } from './resolve-chart'

// Block builder
export { buildNewsletterBlock } from './build-block'
export {
  DEFAULT_CHARTING_BASE_URL,
  getDefaultChartingBaseUrl,
  getDefaultPublicChartingBaseUrl,
  resolveChartingPlatformNewsletterChart,
} from './charting-platform-export'

// AI orchestration
export { fetchNewsletterContext, fetchMarketContext, fetchTodayQuote, fetchTickerNews, fetchRecentPicks, recordPick, fetchEarningsContext, fetchGainersLosers } from './fetch-context'
export { captureChart, captureChartStandalone } from './capture'
export { assembleNewsletterHtml, buildNewsletterIntroText } from './assemble'
export { generateNewsletter } from './orchestrate'
export {
  NewsletterDraftAuthError,
  NewsletterDraftNotFoundError,
  buildNewsletterDraftFromResult,
  normalizeNewsletterDraftDocument,
  renderNewsletterDraftPreviewHtml,
  listNewsletterDrafts,
  getNewsletterDraft,
  createNewsletterDraft,
  saveNewsletterDraft,
  regenerateNewsletterDraftChart,
} from './drafts'
export { publishChartImages } from './publish'
