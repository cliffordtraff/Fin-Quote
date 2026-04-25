import { EDITORIAL_TEMPLATES } from './editorial-templates'
import type {
  FeaturedStock,
  NewsletterChartSpec,
  NewsletterContext,
  TemplateSelection,
  GeneratedCopy,
  MarketContext,
  StockPickerResult,
  TodayQuote,
  StockNewsItem,
} from './types'
import { isPriceNewsletterChartSpec } from './chart-spec'

type SelectionEditorialContext = Pick<
  FeaturedStock,
  'ticker' | 'name' | 'changesPercentage' | 'editorialHook' | 'topHeadlines'
>

function getTemplateDescriptions(): string {
  return EDITORIAL_TEMPLATES.map(
    (template) =>
      template.mode === 'price'
        ? `- id: "${template.id}"\n  mode: price\n  label: ${template.label}\n  chartSetup: ${template.chartType}, ${template.interval}, ${template.range}\n  description: ${template.description}\n  whenToUse: ${template.whenToUse}`
        : `- id: "${template.id}"\n  mode: fundamentals\n  label: ${template.label}\n  metrics: ${template.metrics.join(', ')}\n  supportedPeriods: ${template.supportedPeriods.join(', ')}\n  defaultPeriod: ${template.defaultPeriodType}\n  description: ${template.description}\n  whenToUse: ${template.whenToUse}`,
  ).join('\n\n')
}

function stringifyPromptData(value: unknown): string {
  return JSON.stringify(value)
}

const SELECTION_ANNUAL_POINTS = 4
const SELECTION_QUARTERLY_POINTS = 4
const COPY_FUNDAMENTALS_POINTS = 5

type PromptMetricId =
  | 'revenue'
  | 'net_income'
  | 'operating_income'
  | 'gross_margin'
  | 'operating_margin'
  | 'free_cash_flow'
  | 'eps'

function isPromptMetricId(value: string): value is PromptMetricId {
  return [
    'revenue',
    'net_income',
    'operating_income',
    'gross_margin',
    'operating_margin',
    'free_cash_flow',
    'eps',
  ].includes(value)
}

function getPromptMetricValue(
  point: NewsletterContext['financials'][number],
  metricId: PromptMetricId,
): number | null {
  switch (metricId) {
    case 'revenue':
      return point.revenue ?? null
    case 'net_income':
      return point.netIncome ?? null
    case 'operating_income':
      return point.revenue != null && point.operatingMargin != null
        ? Number(((point.revenue * point.operatingMargin) / 100).toFixed(2))
        : null
    case 'gross_margin':
      return point.grossMargin ?? null
    case 'operating_margin':
      return point.operatingMargin ?? null
    case 'free_cash_flow':
      return point.freeCashFlow ?? null
    case 'eps':
      return point.eps ?? null
    default:
      return null
  }
}

function summarizeFinancialPoints(
  points: NewsletterContext['financials'],
  options?: {
    limit?: number
    metrics?: string[]
  },
) {
  const limit = options?.limit ?? points.length
  const selectedMetrics = (options?.metrics ?? [
    'revenue',
    'net_income',
    'gross_margin',
    'operating_margin',
    'free_cash_flow',
    'eps',
  ]).filter(isPromptMetricId)

  return points.slice(-limit).map((point) => ({
    period: point.periodLabel,
    ...(point.fiscalQuarter != null ? { fiscalQuarter: point.fiscalQuarter } : {}),
    metrics: Object.fromEntries(
      selectedMetrics.map((metricId) => [metricId, getPromptMetricValue(point, metricId)]),
    ),
  }))
}

function buildSelectionDataSnapshot(context: NewsletterContext) {
  return {
    annualHighlights: context.highlights,
    quarterlyHighlights: context.quarterlyHighlights,
    annualRecent: summarizeFinancialPoints(context.financials, {
      limit: SELECTION_ANNUAL_POINTS,
    }),
    quarterlyRecent: summarizeFinancialPoints(context.quarterlyFinancials, {
      limit: SELECTION_QUARTERLY_POINTS,
    }),
    ...(context.priceContext ? { priceContext: context.priceContext } : {}),
  }
}

function buildCopyDataSnapshot(
  context: NewsletterContext,
  chartSpec: NewsletterChartSpec,
  fundamentalsPeriod: 'annual' | 'quarterly',
) {
  if (isPriceNewsletterChartSpec(chartSpec)) {
    return {
      chartSpec,
      priceContext: context.priceContext ?? {},
      annualHighlights: context.highlights,
      quarterlyHighlights: context.quarterlyHighlights,
    }
  }

  return {
    chartSpec,
    highlights:
      fundamentalsPeriod === 'quarterly'
        ? context.quarterlyHighlights
        : context.highlights,
    series: summarizeFinancialPoints(
      fundamentalsPeriod === 'quarterly'
        ? context.quarterlyFinancials
        : context.financials,
      {
        limit: COPY_FUNDAMENTALS_POINTS,
        metrics: chartSpec.metrics,
      },
    ),
    ...(context.priceContext ? { priceContext: context.priceContext } : {}),
  }
}

// ---------------------------------------------------------------------------
// Stock picker prompt (Step 0)
// ---------------------------------------------------------------------------

/**
 * Build messages for the AI stock picker that selects the best stock
 * for today's newsletter from the most-active S&P 500 stocks.
 *
 * Uses a priority hierarchy:
 *   P1: Earnings in last 48h
 *   P2: Big move (>5%) + news catalyst
 *   P3: Trend/milestone/reversal
 *   P4: Biggest mover (fallback)
 *
 * Injects recent picks to avoid repetition and earnings data for context.
 */
export function buildStockPickerMessages(
  market: MarketContext,
  generationPrompt?: string,
): Array<{ role: 'system' | 'user'; content: string }> {
  const systemParts = [
    'You are the editor of The Intraday, a financial newsletter.',
    'Pick ONE stock from the candidates below for today\'s newsletter.',
    '',
    '=== PRIORITY HIERARCHY (follow this order) ===',
    'P1 — EARNINGS: A company that reported earnings in the last 48 hours. Earnings are the strongest editorial hook — readers expect coverage of major reports.',
    'P2 — BIG MOVE + NEWS: A stock moving >5% with clear news explaining it (analyst upgrade/downgrade, product launch, regulation, M&A, etc.)',
    'P3 — TREND / MILESTONE: A well-known company hitting a notable price level, sector rotation story, or market-wide theme with a clear narrative.',
    'P4 — FALLBACK: If nothing above applies, pick the biggest absolute mover with any news. Avoid stocks with zero headlines.',
    '',
    'Additional rules:',
    '- Pick a company most readers would recognize',
    '- Financial charts (revenue, margins, cash flow) should add context to the story',
    '- Avoid: random volume spikes with no news, obscure names, trivial <2% moves on no news',
    '- If a user brief is provided, prioritize candidates that clearly match it, but do not force a bad fit.',
    '',
  ]

  // Recent picks section
  if (market.recentPicks && market.recentPicks.length > 0) {
    systemParts.push('=== RECENT PICKS (avoid repeats) ===')
    systemParts.push('These stocks were recently featured. Do NOT pick them again unless an extraordinary event (earnings, >10% move, major news) justifies it:')
    const now = new Date()
    for (const pick of market.recentPicks) {
      const daysAgo = Math.round(
        (now.getTime() - new Date(pick.pickedAt).getTime()) / (1000 * 60 * 60 * 24),
      )
      systemParts.push(`  - ${pick.ticker} (${pick.name}) — ${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago`)
    }
    systemParts.push('')
  }

  systemParts.push(
    'Output JSON only:',
    '{ "symbol": "...", "name": "...", "editorialHook": "1-2 sentences explaining why this stock is today\'s pick", "subjectLine": "short punchy email subject < 60 chars", "pickSource": "earnings|big_mover|news_catalyst|fallback" }',
  )

  // User message: earnings section first, then candidates
  const userParts: string[] = []

  // Earnings section
  if (market.earningsReports && market.earningsReports.length > 0) {
    userParts.push('=== RECENT EARNINGS REPORTS ===')
    for (const e of market.earningsReports) {
      const label = e.hoursAgo > 0 ? `reported ~${e.hoursAgo}h ago` : `reports in ~${Math.abs(e.hoursAgo)}h`

      let resultStr = ''
      if (e.eps !== null && e.epsEstimated !== null) {
        const epsBeat = e.eps >= e.epsEstimated ? 'BEAT' : 'MISSED'
        resultStr += `EPS: $${e.eps} vs $${e.epsEstimated} est (${epsBeat})`
      }
      if (e.revenue !== null && e.revenueEstimated !== null) {
        const revBeat = e.revenue >= e.revenueEstimated ? 'BEAT' : 'MISSED'
        const revB = (e.revenue / 1e9).toFixed(2)
        const revEstB = (e.revenueEstimated / 1e9).toFixed(2)
        if (resultStr) resultStr += ', '
        resultStr += `Revenue: $${revB}B vs $${revEstB}B est (${revBeat})`
      }

      userParts.push(`${e.symbol} — ${label}${resultStr ? ` | ${resultStr}` : ''}`)
    }
    userParts.push('')
  }

  // Candidates section
  if (generationPrompt?.trim()) {
    userParts.push('=== USER BRIEF ===')
    userParts.push(generationPrompt.trim())
    userParts.push('')
  }

  userParts.push(`=== TODAY'S CANDIDATES (${new Date().toISOString().slice(0, 10)}) ===`)
  userParts.push('')

  const candidateBlocks = market.candidates.map((c) => {
    const headlines = (market.newsBySymbol[c.symbol] || [])
      .slice(0, 5)
      .map((n, i) => `    ${i + 1}. "${n.title}" — ${n.site}, ${n.publishedDate}`)
      .join('\n')

    return [
      `${c.symbol} — ${c.name}`,
      `  Price: $${c.price.toFixed(2)}, Change: ${c.changesPercentage >= 0 ? '+' : ''}${c.changesPercentage.toFixed(2)}%`,
      headlines ? `  Headlines:\n${headlines}` : '  Headlines: (none)',
    ].join('\n')
  })

  userParts.push(...candidateBlocks)

  return [
    { role: 'system' as const, content: systemParts.join('\n') },
    { role: 'user' as const, content: userParts.join('\n\n') },
  ]
}

export function buildMarketRoundupStockSelectionMessages(
  market: MarketContext,
  roundupSize: number,
  generationPrompt: string,
): Array<{ role: 'system' | 'user'; content: string }> {
  const systemParts = [
    'You are the editor of The Intraday, a financial newsletter.',
    `Pick ${roundupSize} stocks for a market roundup newsletter.`,
    'Follow the user brief when it is clearly supported by the candidate list and headlines.',
    'Only choose symbols from the provided candidates.',
    'Prefer recognizable names with a coherent shared theme, catalyst, or market angle.',
    'If the brief is too narrow, unsupported, or incomplete, choose the closest strong matches and then fill the roundup with the strongest remaining editorial names.',
    'Avoid repeating recently featured stocks unless fresh earnings, a major move, or clear new headlines justify it.',
    '',
    'Output JSON only:',
    '{ "selections": [{ "symbol": "...", "reason": "1 sentence" }] }',
  ]

  if (market.recentPicks && market.recentPicks.length > 0) {
    systemParts.push(
      '',
      'Recent picks to avoid when possible:',
      ...market.recentPicks.map((pick) => `- ${pick.ticker} (${pick.name})`),
    )
  }

  const userParts: string[] = [
    '=== USER BRIEF ===',
    generationPrompt.trim(),
    '',
  ]

  if (market.earningsReports && market.earningsReports.length > 0) {
    userParts.push(
      '=== RECENT EARNINGS REPORTS ===',
      ...market.earningsReports.map((entry) => {
        const timing = entry.hoursAgo > 0
          ? `reported ~${entry.hoursAgo}h ago`
          : `reports in ~${Math.abs(entry.hoursAgo)}h`
        return `${entry.symbol} — ${timing}`
      }),
      '',
    )
  }

  userParts.push(`=== TODAY'S CANDIDATES (${new Date().toISOString().slice(0, 10)}) ===`)
  userParts.push('')

  const candidateBlocks = market.candidates.map((candidate) => {
    const headlines = (market.newsBySymbol[candidate.symbol] || [])
      .slice(0, 4)
      .map((headline, index) => `    ${index + 1}. "${headline.title}" — ${headline.site}, ${headline.publishedDate}`)
      .join('\n')

    return [
      `${candidate.symbol} — ${candidate.name}`,
      `  Price: $${candidate.price.toFixed(2)}, Change: ${candidate.changesPercentage >= 0 ? '+' : ''}${candidate.changesPercentage.toFixed(2)}%`,
      headlines ? `  Headlines:\n${headlines}` : '  Headlines: (none)',
    ].join('\n')
  })

  userParts.push(...candidateBlocks)

  return [
    { role: 'system' as const, content: systemParts.join('\n') },
    { role: 'user' as const, content: userParts.join('\n\n') },
  ]
}

export function parseMarketRoundupStockSelections(
  responseText: string,
  market: MarketContext,
  roundupSize: number,
): string[] {
  const candidateSymbols = new Set(market.candidates.map((candidate) => candidate.symbol))

  try {
    const parsed = JSON.parse(responseText)
    const rawSelections = Array.isArray(parsed.selections)
      ? parsed.selections
      : Array.isArray(parsed.symbols)
        ? parsed.symbols.map((symbol: string) => ({ symbol }))
        : []

    const deduped = new Set<string>()
    for (const selection of rawSelections) {
      const symbol =
        typeof selection?.symbol === 'string'
          ? selection.symbol.trim().toUpperCase()
          : ''
      if (!symbol || !candidateSymbols.has(symbol) || deduped.has(symbol)) continue
      deduped.add(symbol)
      if (deduped.size >= roundupSize) break
    }

    return Array.from(deduped)
  } catch {
    return []
  }
}

/**
 * Parse and validate the AI stock picker response.
 * Falls back to the candidate with the biggest absolute % move.
 */
export function parseStockPickerResult(
  responseText: string,
  market: MarketContext,
): StockPickerResult {
  const candidateSymbols = new Set(market.candidates.map((c) => c.symbol))

  let symbol: string | undefined
  let name: string | undefined
  let editorialHook = ''
  let subjectLine = ''
  let pickSource: StockPickerResult['pickSource']

  try {
    const parsed = JSON.parse(responseText)
    symbol = parsed.symbol?.toUpperCase()
    name = parsed.name
    editorialHook = parsed.editorialHook || ''
    subjectLine = parsed.subjectLine || ''
    if (['earnings', 'big_mover', 'news_catalyst', 'fallback'].includes(parsed.pickSource)) {
      pickSource = parsed.pickSource
    }
  } catch {
    // Fall through to fallback
  }

  // Validate the AI pick exists in candidates
  if (!symbol || !candidateSymbols.has(symbol)) {
    // Fallback: biggest absolute mover
    const sorted = [...market.candidates].sort(
      (a, b) => Math.abs(b.changesPercentage) - Math.abs(a.changesPercentage),
    )
    const fallback = sorted[0]
    symbol = fallback.symbol
    name = fallback.name
    editorialHook = `${fallback.name} moved ${fallback.changesPercentage >= 0 ? '+' : ''}${fallback.changesPercentage.toFixed(1)}% today.`
    pickSource = 'fallback'
  }

  const candidate = market.candidates.find((c) => c.symbol === symbol)!
  const topHeadlines = (market.newsBySymbol[symbol] || []).slice(0, 3)
  const resolvedName = name || candidate.name

  return {
    ticker: symbol,
    name: resolvedName,
    changesPercentage: candidate.changesPercentage,
    editorialHook,
    subjectLine: subjectLine || `${symbol}: ${editorialHook}`.slice(0, 60),
    topHeadlines,
    pickSource,
  }
}

// ---------------------------------------------------------------------------
// Market roundup intro prompt
// ---------------------------------------------------------------------------

export function buildMarketRoundupMessages(
  featuredStocks: FeaturedStock[],
  generationPrompt?: string,
): Array<{ role: 'system' | 'user'; content: string }> {
  const system = [
    'You are the editor of The Intraday, a financial newsletter.',
    'Write the subject line and intro for a multi-stock market roundup newsletter.',
    'The intro should be 1-2 sentences, mention at least 2 featured stocks, and frame why these names matter today.',
    'If there is a shared theme, mention it. If there is not, present the roundup as a broad market snapshot.',
    'If a user brief is provided, use it to shape the framing as long as it fits the featured stocks.',
    '',
    'Output JSON only:',
    '{ "subjectLine": "short punchy email subject < 70 chars", "introText": "1-2 sentences" }',
  ].join('\n')

  const userSections = []

  if (generationPrompt?.trim()) {
    userSections.push(
      '=== USER BRIEF ===',
      generationPrompt.trim(),
      '',
    )
  }

  userSections.push(
    `Featured stocks (${featuredStocks.length}):`,
    ...featuredStocks.map((stock) => {
      const sign = stock.changesPercentage >= 0 ? '+' : ''
      const firstHeadline = stock.topHeadlines[0]
      const headlineText = firstHeadline
        ? `"${firstHeadline.title}" — ${firstHeadline.site}`
        : 'No fresh headline available'
      return [
        `${stock.ticker} — ${stock.name}`,
        `Move: ${sign}${stock.changesPercentage.toFixed(2)}%`,
        `Angle: ${stock.editorialHook}`,
        `Top headline: ${headlineText}`,
      ].join('\n')
    }),
  )
  const user = userSections.join('\n\n')

  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ]
}

export function parseMarketRoundupIntro(
  responseText: string,
  featuredStocks: FeaturedStock[],
): { subjectLine: string; introText: string } {
  const fallbackSubject = `Market Roundup: ${featuredStocks
    .slice(0, 3)
    .map((stock) => stock.ticker)
    .join(', ')}`
  const fallbackIntro = `Today's market roundup covers ${featuredStocks
    .map((stock) => `${stock.name} (${stock.ticker})`)
    .join(', ')} after headline-driven moves across the tape.`

  try {
    const parsed = JSON.parse(responseText)
    const subjectLine =
      typeof parsed.subjectLine === 'string' && parsed.subjectLine.trim()
        ? parsed.subjectLine.trim()
        : fallbackSubject
    const introText =
      typeof parsed.introText === 'string' && parsed.introText.trim()
        ? parsed.introText.trim()
        : fallbackIntro
    return { subjectLine, introText }
  } catch {
    return { subjectLine: fallbackSubject, introText: fallbackIntro }
  }
}

// ---------------------------------------------------------------------------
// Editorial hook prompt (for manual tickers without a stock picker result)
// ---------------------------------------------------------------------------

/**
 * Build messages for generating an editorial hook for a manually-specified ticker.
 * Uses today's quote data and recent news.
 */
export function buildEditorialHookMessages(
  quote: TodayQuote,
  headlines: StockNewsItem[],
  generationPrompt?: string,
): Array<{ role: 'system' | 'user'; content: string }> {
  const system = [
    'You are the editor of The Intraday, a financial newsletter.',
    'Write a 1-2 sentence editorial hook explaining why this stock is worth reading about today.',
    'Connect the price move to any available news. If no news explains it, note the move and set up the financial deep-dive.',
    'If a user brief is provided, use it to guide the framing when the available quote and headlines support it.',
    '',
    'Output JSON only:',
    '{ "editorialHook": "1-2 sentences", "subjectLine": "short punchy email subject < 60 chars" }',
  ].join('\n')

  const sign = quote.changesPercentage >= 0 ? '+' : ''
  const dollarSign = quote.change >= 0 ? '+' : ''

  const headlineBlock = headlines.length > 0
    ? ['', 'Recent headlines:', ...headlines.map((h) => `- "${h.title}" — ${h.site}, ${h.publishedDate}`)].join('\n')
    : '\nNo recent headlines available.'

  const userParts = [
    `${quote.ticker} — ${quote.name}`,
    `Price: $${quote.price.toFixed(2)}, Change: ${dollarSign}$${Math.abs(quote.change).toFixed(2)} (${sign}${quote.changesPercentage.toFixed(2)}%)`,
    headlineBlock,
  ]

  if (generationPrompt?.trim()) {
    userParts.push('', 'User brief:', generationPrompt.trim())
  }

  const user = userParts.join('\n')

  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ]
}

/**
 * Parse editorial hook response.
 */
export function parseEditorialHook(
  responseText: string,
  ticker?: string,
): { editorialHook: string; subjectLine: string } {
  try {
    const parsed = JSON.parse(responseText)
    const editorialHook = parsed.editorialHook || ''
    const subjectLine =
      parsed.subjectLine || (ticker ? `${ticker}: ${editorialHook}`.slice(0, 60) : editorialHook.slice(0, 60))
    return { editorialHook, subjectLine }
  } catch {
    return { editorialHook: '', subjectLine: '' }
  }
}

// ---------------------------------------------------------------------------
// Template selection prompt
// ---------------------------------------------------------------------------

/**
 * Build the messages for the LLM call that selects which editorial
 * chart templates tell the most compelling story for this company.
 */
export function buildTemplateSelectionMessages(
  context: NewsletterContext,
  maxSelections: number,
  options: {
    mode?: 'single_stock' | 'market_roundup'
    editorialContext?: SelectionEditorialContext
    generationPrompt?: string
  } = {},
): Array<{ role: 'system' | 'user'; content: string }> {
  const isRoundup = options.mode === 'market_roundup'
  const selectionSnapshot = buildSelectionDataSnapshot(context)

  const system = [
    'You are a financial newsletter editor for The Intraday.',
    `Select ${maxSelections} chart templates that tell the most compelling visual story for this company.`,
    'Pick templates that highlight the most interesting or noteworthy trends in the data.',
    'Do NOT pick templates whose underlying data is flat or uninteresting.',
    'Use price templates when recent market action is the clearest story, and fundamentals templates when the financial trend is stronger.',
    'For fundamentals templates, also choose the best periodType: annual or quarterly.',
    'Prefer quarterly when the story is tied to recent earnings, a fresh inflection, or a catalyst happening right now.',
    'Prefer annual when the chart is about a long-duration moat, decade-long compounding, or capital allocation over time.',
    'If a metric value is null, treat it as unavailable data, not as zero.',
    'If a user brief is provided, prefer templates that best match it without inventing a story the data does not support.',
    ...(isRoundup
      ? ['This is one slot inside a broader market roundup, so favor one clean, recent angle over a sprawling deep dive.']
      : []),
    '',
    'Respond with JSON only:',
    '{ "selections": [{ "templateId": "<id>", "periodType": "annual|quarterly (fundamentals only)", "reason": "<1 sentence editorial angle>" }] }',
  ].join('\n')

  const userParts = [
    `Company: ${context.ticker}`,
    '',
    '=== Editorial Data Snapshot ===',
    stringifyPromptData(selectionSnapshot),
  ]

  if (options.generationPrompt?.trim()) {
    userParts.push(
      '',
      '=== User Brief ===',
      options.generationPrompt.trim(),
    )
  }

  if (options.editorialContext) {
    const sign = options.editorialContext.changesPercentage >= 0 ? '+' : ''
    userParts.push(
      '',
      '=== Current Market Context ===',
      `Today's move: ${sign}${options.editorialContext.changesPercentage.toFixed(2)}%`,
      `Editorial hook: ${options.editorialContext.editorialHook}`,
    )

    if (options.editorialContext.topHeadlines.length > 0) {
      userParts.push(
        '',
        '=== Recent Headlines ===',
        ...options.editorialContext.topHeadlines.map(
          (headline) => `- "${headline.title}" — ${headline.site}, ${headline.publishedDate}`,
        ),
      )
    }
  }

  userParts.push(
    '',
    '=== Available Templates ===',
    getTemplateDescriptions(),
  )

  const user = userParts.join('\n')

  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ]
}

/**
 * Parse the LLM response for template selection.
 * Validates that returned template IDs actually exist.
 */
export function parseTemplateSelections(
  responseText: string,
  maxSelections: number,
): TemplateSelection[] {
  let parsed: { selections?: Array<Record<string, unknown>> } = {}
  try {
    parsed = JSON.parse(responseText)
  } catch {
    parsed = {}
  }

  const selections = Array.isArray(parsed.selections) ? parsed.selections : []
  const templatesById = new Map(
    EDITORIAL_TEMPLATES.map((template) => [template.id, template] as const),
  )

  const validated = selections.flatMap((selection) => {
    const templateId =
      typeof selection.templateId === 'string' ? selection.templateId : ''
    const template = templatesById.get(templateId)
    if (!template) return []

    const reason =
      typeof selection.reason === 'string' && selection.reason.trim()
        ? selection.reason.trim()
        : ''
    const ticker =
      typeof selection.ticker === 'string' && selection.ticker.trim()
        ? selection.ticker.trim().toUpperCase()
        : undefined

    if (template.mode === 'price') {
      return [{ templateId, reason, ticker }]
    }

    const rawPeriod =
      selection.periodType === 'quarterly' || selection.periodType === 'annual'
        ? selection.periodType
        : undefined
    const periodType =
      rawPeriod && template.supportedPeriods.includes(rawPeriod)
        ? rawPeriod
        : template.defaultPeriodType

    return [{ templateId, reason, periodType, ticker }]
  })

  return validated.slice(0, maxSelections)
}

// ---------------------------------------------------------------------------
// Copy generation prompt
// ---------------------------------------------------------------------------

/**
 * Build the messages for the LLM call that generates editorial copy
 * (headline, body, caption) for a single newsletter chart section.
 */
export function buildCopyGenerationMessages(
  context: NewsletterContext,
  templateId: string,
  templateLabel: string,
  editorialAngle: string,
  chartSpec: NewsletterChartSpec,
  stockPickerResult?: SelectionEditorialContext,
  generationPrompt?: string,
  options: {
    mode?: 'single_stock' | 'market_roundup'
  } = {},
): Array<{ role: 'system' | 'user'; content: string }> {
  const isPriceChart = isPriceNewsletterChartSpec(chartSpec)
  const isRoundupSlot = options.mode === 'market_roundup'
  const fundamentalsPeriod =
    !isPriceChart && chartSpec.periodType === 'quarterly'
      ? 'quarterly'
      : 'annual'
  const copySnapshot = buildCopyDataSnapshot(context, chartSpec, fundamentalsPeriod)
  const systemParts = [
    'You are a financial newsletter copywriter for The Intraday.',
    'Write concise, data-grounded copy for one chart section of a newsletter.',
    '',
    'Rules:',
    '- headline: 6-12 words, punchy, never abbreviate metric names (write "Free Cash Flow" not "FCF")',
    '- body: 1-2 sentences maximum. Be punchy.',
    '- Wrap the 2-3 most important numbers in **bold** markers (e.g. **$416.2B**)',
    '- Every sentence must contain at least one specific number from the data',
    '- caption: 1 sentence describing what the chart shows',
    '- All numbers MUST come from the provided data — never invent figures',
    '- If a value is null or missing, treat it as unavailable. Never rewrite null as 0, $0, or 0%.',
    '- Write in present tense for current state, past tense for trends',
    '- Do not use markdown formatting except for **bold** on key numbers',
    '',
  ]

  if (isRoundupSlot) {
    systemParts.push(
      '- This section is part of a market roundup. Explicitly name the company or ticker in the headline or the first sentence of the body.',
      '- Prefer the company name in the headline when it reads naturally; ticker is acceptable if shorter.',
    )
  } else {
    systemParts.push(
      '- Do not force the ticker symbol into the headline unless it improves clarity.',
    )
  }

  if (isPriceChart) {
    systemParts.push(
      'Number formatting (CRITICAL):',
      '- Price values are in USD per share, not millions. Show as "$214.53".',
      '- Returns and distances should be formatted as percentages with 2 decimal places.',
      '- Prefer using the provided range return, latest close, 52-week high/low, and moving-average context.',
    )
  } else {
    systemParts.push(
      'Number formatting (CRITICAL):',
      '- Dollar values in the data are in MILLIONS. You MUST convert to human-readable format.',
      '- Values >= 1,000 → show as billions: 416161 → "$416.2B", 79024 → "$79.0B"',
      '- Values < 1,000 but >= 1 → show as millions: 823 → "$823M", 56.7 → "$56.7M"',
      '- Percentages: round to 2 decimal places, e.g. 46.91%',
      '- NEVER output raw numbers like "$416,161.0M" — always convert to $B first if >= 1,000',
    )
  }

  if (stockPickerResult) {
    systemParts.push(
      '- Weave the news angle into the body naturally — connect today\'s catalyst to the financial trends',
    )
  }

  if (generationPrompt?.trim()) {
    systemParts.push(
      '- If a user brief is provided, align the framing to it without inventing unsupported claims.',
    )
  }

  systemParts.push(
    '',
    'Respond with JSON only:',
    '{ "headline": "...", "body": "...", "caption": "..." }',
  )

  const userParts = [
    `Company: ${stockPickerResult?.name ? `${stockPickerResult.name} (${context.ticker})` : context.ticker}`,
    `Chart template: ${templateLabel} (${templateId})`,
    `Editorial angle: ${editorialAngle}`,
    '',
    '=== Chart Data Snapshot ===',
    stringifyPromptData(copySnapshot),
  ]

  if (isPriceChart) {
    userParts.push(
      '',
      'Price charts use the priceContext above. Focus on return, range, and moving-average context.',
    )
  } else {
    userParts.push(
      '',
      `The snapshot above only includes the ${fundamentalsPeriod} metrics needed for this chart.`,
    )
  }

  if (generationPrompt?.trim()) {
    userParts.push(
      '',
      '=== User Brief ===',
      generationPrompt.trim(),
    )
  }
  if (stockPickerResult) {
    const sign = stockPickerResult.changesPercentage >= 0 ? '+' : ''
    userParts.push(
      '',
      '=== Current Market Context ===',
      `Today's move: ${sign}${stockPickerResult.changesPercentage.toFixed(2)}%`,
      `Editorial hook: ${stockPickerResult.editorialHook}`,
    )

    if (stockPickerResult.topHeadlines.length > 0) {
      userParts.push(
        '',
        '=== Recent Headlines ===',
        ...stockPickerResult.topHeadlines.map(
          (h) => `- "${h.title}" — ${h.site}, ${h.publishedDate}`,
        ),
      )
    }
  }

  return [
    { role: 'system' as const, content: systemParts.join('\n') },
    { role: 'user' as const, content: userParts.join('\n') },
  ]
}

/**
 * Parse the LLM response for copy generation.
 */
export function parseCopyGeneration(responseText: string): GeneratedCopy {
  const parsed = JSON.parse(responseText)
  return {
    headline: parsed.headline ?? '',
    body: parsed.body ?? '',
    caption: parsed.caption ?? '',
  }
}
