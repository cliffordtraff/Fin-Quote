import { EDITORIAL_TEMPLATES } from './editorial-templates'
import type {
  NewsletterContext,
  TemplateSelection,
  GeneratedCopy,
  MarketContext,
  StockPickerResult,
  TodayQuote,
  StockNewsItem,
} from './types'

// ---------------------------------------------------------------------------
// Stock picker prompt (Step 0)
// ---------------------------------------------------------------------------

/**
 * Build messages for the AI stock picker that selects the best stock
 * for today's newsletter from the most-active S&P 500 stocks.
 */
export function buildStockPickerMessages(
  market: MarketContext,
): Array<{ role: 'system' | 'user'; content: string }> {
  const system = [
    'You are the editor of The Intraday, a financial newsletter.',
    'Pick ONE stock from the candidates below for today\'s newsletter.',
    '',
    'Consider:',
    '1. Does the news explain the price move?',
    '2. Is this a company most readers would recognize?',
    '3. Would financial charts (revenue, margins, cash flow) add context?',
    '4. Is the price move significant enough to write about?',
    '',
    'Avoid: random volume spikes with no news, obscure names, trivial < 2% moves.',
    '',
    'Output JSON only:',
    '{ "symbol": "...", "name": "...", "editorialHook": "1-2 sentences explaining why this stock is today\'s pick", "subjectLine": "short punchy email subject < 60 chars" }',
  ].join('\n')

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

  const user = [
    `Today's most active S&P 500 stocks (${new Date().toISOString().slice(0, 10)}):`,
    '',
    ...candidateBlocks,
  ].join('\n\n')

  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ]
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

  try {
    const parsed = JSON.parse(responseText)
    symbol = parsed.symbol?.toUpperCase()
    name = parsed.name
    editorialHook = parsed.editorialHook || ''
    subjectLine = parsed.subjectLine || ''
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
): Array<{ role: 'system' | 'user'; content: string }> {
  const system = [
    'You are the editor of The Intraday, a financial newsletter.',
    'Write a 1-2 sentence editorial hook explaining why this stock is worth reading about today.',
    'Connect the price move to any available news. If no news explains it, note the move and set up the financial deep-dive.',
    '',
    'Output JSON only:',
    '{ "editorialHook": "1-2 sentences", "subjectLine": "short punchy email subject < 60 chars" }',
  ].join('\n')

  const sign = quote.changesPercentage >= 0 ? '+' : ''
  const dollarSign = quote.change >= 0 ? '+' : ''

  const headlineBlock = headlines.length > 0
    ? ['', 'Recent headlines:', ...headlines.map((h) => `- "${h.title}" — ${h.site}, ${h.publishedDate}`)].join('\n')
    : '\nNo recent headlines available.'

  const user = [
    `${quote.ticker} — ${quote.name}`,
    `Price: $${quote.price.toFixed(2)}, Change: ${dollarSign}$${Math.abs(quote.change).toFixed(2)} (${sign}${quote.changesPercentage.toFixed(2)}%)`,
    headlineBlock,
  ].join('\n')

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
): Array<{ role: 'system' | 'user'; content: string }> {
  const templateDescriptions = EDITORIAL_TEMPLATES.map(
    (t) =>
      `- id: "${t.id}"\n  label: ${t.label}\n  description: ${t.description}\n  whenToUse: ${t.whenToUse}`,
  ).join('\n\n')

  const system = [
    'You are a financial newsletter editor for The Intraday.',
    `Select ${maxSelections} chart templates that tell the most compelling visual story for this company.`,
    'Pick templates that highlight the most interesting or noteworthy trends in the data.',
    'Do NOT pick templates whose underlying data is flat or uninteresting.',
    '',
    'Respond with JSON only:',
    '{ "selections": [{ "templateId": "<id>", "reason": "<1 sentence editorial angle>" }] }',
  ].join('\n')

  const user = [
    `Company: ${context.ticker}`,
    '',
    '=== Financial Data (last 7 years) ===',
    JSON.stringify(context.financials, null, 2),
    '',
    '=== Highlights ===',
    JSON.stringify(context.highlights, null, 2),
    '',
    '=== Available Templates ===',
    templateDescriptions,
  ].join('\n')

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
  const parsed = JSON.parse(responseText)
  const selections: TemplateSelection[] = parsed.selections ?? []

  const validIds = new Set(EDITORIAL_TEMPLATES.map((t) => t.id))
  const validated = selections.filter((s) => validIds.has(s.templateId))

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
  stockPickerResult?: StockPickerResult,
): Array<{ role: 'system' | 'user'; content: string }> {
  const systemParts = [
    'You are a financial newsletter copywriter for The Intraday.',
    'Write concise, data-grounded copy for one chart section of a newsletter.',
    '',
    'Rules:',
    '- headline: 6-12 words, punchy, no ticker symbol, never abbreviate metric names (write "Free Cash Flow" not "FCF")',
    '- body: 1-2 sentences maximum. Be punchy.',
    '- Wrap the 2-3 most important numbers in **bold** markers (e.g. **$416.2B**)',
    '- Every sentence must contain at least one specific number from the data',
    '- caption: 1 sentence describing what the chart shows',
    '- All numbers MUST come from the provided data — never invent figures',
    '- Write in present tense for current state, past tense for trends',
    '- Do not use markdown formatting except for **bold** on key numbers',
    '',
    'Number formatting (CRITICAL):',
    '- Dollar values in the data are in MILLIONS. You MUST convert to human-readable format.',
    '- Values >= 1,000 → show as billions: 416161 → "$416.2B", 79024 → "$79.0B"',
    '- Values < 1,000 but >= 1 → show as millions: 823 → "$823M", 56.7 → "$56.7M"',
    '- Percentages: round to 2 decimal places, e.g. 46.91%',
    '- NEVER output raw numbers like "$416,161.0M" — always convert to $B first if >= 1,000',
  ]

  if (stockPickerResult) {
    systemParts.push(
      '- Weave the news angle into the body naturally — connect today\'s catalyst to the financial trends',
    )
  }

  systemParts.push(
    '',
    'Respond with JSON only:',
    '{ "headline": "...", "body": "...", "caption": "..." }',
  )

  const userParts = [
    `Company: ${context.ticker}`,
    `Chart template: ${templateLabel}`,
    `Editorial angle: ${editorialAngle}`,
    '',
    '=== Financial Data ===',
    JSON.stringify(context.financials, null, 2),
    '',
    '=== Highlights ===',
    JSON.stringify(context.highlights, null, 2),
  ]

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
