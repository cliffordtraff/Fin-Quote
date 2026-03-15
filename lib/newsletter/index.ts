// Types
export type {
  YearRangeStrategy,
  LastNYearsStrategy,
  AllAvailableStrategy,
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
  StockCandidate,
  StockNewsItem,
  MarketContext,
  StockPickerResult,
  TodayQuote,
  RecentPick,
  EarningsCandidate,
} from './types'

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

// AI orchestration
export { fetchNewsletterContext, fetchMarketContext, fetchTodayQuote, fetchTickerNews, fetchRecentPicks, recordPick, fetchEarningsContext, fetchGainersLosers } from './fetch-context'
export { captureChart, captureChartStandalone } from './capture'
export { assembleNewsletterHtml } from './assemble'
export { generateNewsletter } from './orchestrate'
export { publishChartImages } from './publish'
