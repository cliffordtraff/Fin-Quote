// Market Summary loading steps
export type LoadingStep =
  | 'checking-cache'
  | 'fetching-market-data'
  | 'searching-web'
  | 'analyzing-trends'
  | 'generating-summary'
  | 'complete'

export const LOADING_STEPS: LoadingStep[] = [
  'checking-cache',
  'fetching-market-data',
  'searching-web',
  'analyzing-trends',
  'generating-summary',
]

export const LOADING_MESSAGES: Record<LoadingStep, string> = {
  'checking-cache': 'Checking for cached summary...',
  'fetching-market-data': 'Gathering market data...',
  'searching-web': 'Searching the web for market news...',
  'analyzing-trends': 'Analyzing market trends and themes...',
  'generating-summary': 'Writing market summary...',
  'complete': 'Done!',
}

// Market Trends (bullet points) loading steps
export type TrendsLoadingStep =
  | 'gathering-data'
  | 'analyzing-sectors'
  | 'identifying-movers'
  | 'searching-catalysts'
  | 'generating-insights'
  | 'complete'

export const TRENDS_LOADING_STEPS: TrendsLoadingStep[] = [
  'gathering-data',
  'analyzing-sectors',
  'identifying-movers',
  'searching-catalysts',
  'generating-insights',
]

export const TRENDS_LOADING_MESSAGES: Record<TrendsLoadingStep, string> = {
  'gathering-data': 'Gathering market data...',
  'analyzing-sectors': 'Analyzing sector performance...',
  'identifying-movers': 'Identifying top movers...',
  'searching-catalysts': 'Searching for market catalysts...',
  'generating-insights': 'Generating trend insights...',
  'complete': 'Done!',
}
