import type {
  EditorialChartTemplate,
  FundamentalsEditorialChartTemplate,
  NewsletterContext,
  NewsletterFinancialPoint,
  NewsletterPeriodType,
  PriceEditorialChartTemplate,
} from './types'

type MetricPoint = { year: number; label: string; value: number | null }

const FUNDAMENTAL_METRIC_EXTRACTORS: Record<
  string,
  (point: NewsletterFinancialPoint) => number | null
> = {
  revenue: (p) => p.revenue ?? null,
  net_income: (p) => p.netIncome ?? null,
  operating_income: (p) =>
    p.revenue != null && p.operatingMargin != null
      ? (p.revenue * p.operatingMargin) / 100
      : null,
  gross_margin: (p) => p.grossMargin ?? null,
  operating_margin: (p) => p.operatingMargin ?? null,
  free_cash_flow: (p) => p.freeCashFlow ?? null,
  eps: (p) => p.eps ?? null,
  debt_to_equity_ratio: () => null,
  rd_pct_revenue: () => null,
}

function extractSeries(
  metricId: string,
  points: NewsletterFinancialPoint[],
): MetricPoint[] {
  const extractor = FUNDAMENTAL_METRIC_EXTRACTORS[metricId]
  if (!extractor) return []
  return points.map((p) => ({
    year: p.year,
    label: p.periodLabel,
    value: extractor(p),
  }))
}

function nonNull(series: MetricPoint[]): number[] {
  return series.map((p) => p.value).filter((v): v is number => v != null)
}

/**
 * Magnitude of the visible move in a window, normalized by the typical scale
 * of the series. Higher = the chart shows a bigger story. Returns 0 when the
 * window is empty or essentially flat.
 */
function storyMagnitude(values: number[]): number {
  if (values.length < 2) return 0
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min
  const median = medianAbs(values)
  if (median === 0) return 0
  return range / median
}

function medianAbs(values: number[]): number {
  const abs = values.map((v) => Math.abs(v)).filter((v) => v > 0)
  if (abs.length === 0) return 0
  const sorted = [...abs].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

/**
 * Per-metric score in [0, ~2]. Combines:
 *   - story magnitude (range / scale) over the relevant window
 *   - recent acceleration vs. earlier baseline
 *   - coverage penalty when the series is sparse
 */
function scoreMetricSeries(series: MetricPoint[], windowSize = 7): number {
  const recent = series.slice(-windowSize)
  const values = nonNull(recent)
  if (values.length < 3) return 0

  const coverage = values.length / recent.length
  const magnitude = storyMagnitude(values)

  const splitIdx = Math.max(2, Math.floor(values.length / 2))
  const earlier = values.slice(0, splitIdx)
  const later = values.slice(splitIdx)
  const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length
  const laterAvg = later.reduce((a, b) => a + b, 0) / later.length
  const baseline = medianAbs(values)
  const accel = baseline === 0 ? 0 : Math.abs(laterAvg - earlierAvg) / baseline

  return coverage * (magnitude + accel * 0.5)
}

interface FundamentalsScoreComponents {
  metric: string
  metricScore: number
  divergenceBonus: number
}

export interface TemplateScore {
  templateId: string
  score: number
  reason: string
}

function scoreFundamentalsTemplate(
  template: FundamentalsEditorialChartTemplate,
  context: NewsletterContext,
  periodType: NewsletterPeriodType,
): { score: number; components: FundamentalsScoreComponents } {
  const points =
    periodType === 'quarterly' ? context.quarterlyFinancials : context.financials
  const windowSize = periodType === 'quarterly' ? 12 : 7

  const perMetric = template.metrics.map((m) => {
    const series = extractSeries(m, points)
    return { metric: m, score: scoreMetricSeries(series, windowSize) }
  })
  const bestMetric = perMetric.reduce(
    (best, cur) => (cur.score > best.score ? cur : best),
    { metric: template.metrics[0] ?? '', score: 0 },
  )

  // Divergence bonus when the template's story IS the gap between two metrics.
  let divergenceBonus = 0
  if (template.metrics.length === 2) {
    const seriesA = extractSeries(template.metrics[0], points)
    const seriesB = extractSeries(template.metrics[1], points)
    const ratios: number[] = []
    for (let i = 0; i < Math.min(seriesA.length, seriesB.length); i++) {
      const a = seriesA[i]?.value
      const b = seriesB[i]?.value
      if (a == null || b == null || a === 0) continue
      ratios.push(b / a)
    }
    if (ratios.length >= 3) {
      const min = Math.min(...ratios)
      const max = Math.max(...ratios)
      divergenceBonus = max - min // 0..~1 typically
    }
  }

  const score = bestMetric.score + divergenceBonus * 0.4
  return {
    score,
    components: {
      metric: bestMetric.metric,
      metricScore: Number(bestMetric.score.toFixed(3)),
      divergenceBonus: Number(divergenceBonus.toFixed(3)),
    },
  }
}

function scorePriceTemplate(
  template: PriceEditorialChartTemplate,
  context: NewsletterContext,
): { score: number; components: { rangeReturn: number | null } } {
  const pc = context.priceContext
  if (!pc) return { score: 0, components: { rangeReturn: null } }

  let ret: number | null = null
  switch (template.range) {
    case '1m':
      ret = pc.return1m
      break
    case '6m':
      ret = pc.return6m
      break
    case '1y':
      ret = pc.return1y
      break
    default:
      ret = pc.return6m ?? pc.return1y ?? pc.return1m
  }

  if (ret == null) return { score: 0, components: { rangeReturn: null } }
  // Map |return| to a roughly 0..2 scale: 10% move ≈ 0.5, 25% ≈ 1.25, 50%+ ≈ 2.0
  const score = Math.min(2, Math.abs(ret) / 0.2)
  return { score, components: { rangeReturn: Number(ret.toFixed(4)) } }
}

/**
 * Score every editorial template against the data in `context`. Returns scores
 * sorted descending. Fundamentals templates are scored against their preferred
 * period type (annual or quarterly per template default).
 */
export function rankTemplates(
  templates: EditorialChartTemplate[],
  context: NewsletterContext,
): TemplateScore[] {
  const scored = templates.map((t): TemplateScore => {
    if (t.mode === 'price') {
      const { score, components } = scorePriceTemplate(t, context)
      return {
        templateId: t.id,
        score,
        reason:
          components.rangeReturn != null
            ? `${(components.rangeReturn * 100).toFixed(1)}% move over ${t.range}`
            : 'no price data',
      }
    }
    const { score, components } = scoreFundamentalsTemplate(
      t,
      context,
      t.defaultPeriodType,
    )
    return {
      templateId: t.id,
      score,
      reason: `${components.metric} signal=${components.metricScore}${components.divergenceBonus > 0 ? `, divergence=${components.divergenceBonus}` : ''}`,
    }
  })

  return scored.sort((a, b) => b.score - a.score)
}

/**
 * Pick the data-interesting subset of templates to show the LLM. Returns the
 * templates themselves, preserving input objects. Keeps at minimum `minKeep`
 * fundamentals and `minKeepPrice` price templates so the LLM always has both
 * surfaces available.
 */
export function pickRankedTemplates(
  templates: EditorialChartTemplate[],
  context: NewsletterContext,
  topK: number,
  options: { minKeepFundamentals?: number; minKeepPrice?: number } = {},
): { templates: EditorialChartTemplate[]; scores: TemplateScore[] } {
  const minF = options.minKeepFundamentals ?? 1
  const minP = options.minKeepPrice ?? 1
  const ranked = rankTemplates(templates, context)

  const fund = ranked.filter(
    (r) => templates.find((t) => t.id === r.templateId)?.mode !== 'price',
  )
  const price = ranked.filter(
    (r) => templates.find((t) => t.id === r.templateId)?.mode === 'price',
  )

  const picked = new Set<string>()
  ranked.slice(0, topK).forEach((r) => picked.add(r.templateId))
  fund.slice(0, minF).forEach((r) => picked.add(r.templateId))
  price.slice(0, minP).forEach((r) => picked.add(r.templateId))

  const pickedTemplates = templates.filter((t) => picked.has(t.id))
  const pickedScores = ranked.filter((r) => picked.has(r.templateId))
  return { templates: pickedTemplates, scores: pickedScores }
}

// ---------------------------------------------------------------------------
// Year-range selection (data-driven)
// ---------------------------------------------------------------------------

/**
 * Pick the window where the template's primary metric shows the most visible
 * story. Bounded between `minWidth` and the template's hinted N. Returns null
 * if there isn't enough data to choose intelligently — caller should fall back
 * to the template's default range.
 */
export function pickFundamentalsYearRange(
  template: FundamentalsEditorialChartTemplate,
  context: NewsletterContext,
  periodType: NewsletterPeriodType,
  minWidth = 3,
): { minYear: number; maxYear: number } | null {
  const points =
    periodType === 'quarterly' ? context.quarterlyFinancials : context.financials
  if (points.length === 0) return null

  const rangeStrategy =
    periodType === 'quarterly' && template.quarterlyYearRange
      ? template.quarterlyYearRange
      : template.yearRange

  const maxYear = points[points.length - 1]?.year
  if (maxYear == null) return null

  const hintN =
    rangeStrategy.kind === 'last_n_years' ? rangeStrategy.n : Math.min(15, points.length)
  const maxWidth = Math.max(minWidth, Math.min(hintN, points.length))

  // Score the primary (most-moving) metric across candidate windows.
  const primaryMetric = template.metrics[0]
  if (!primaryMetric) return null
  const series = extractSeries(primaryMetric, points)
  if (nonNull(series).length < minWidth) return null

  const candidateWidths = uniqueAsc([minWidth, 5, 7, 10, maxWidth]).filter(
    (w) => w >= minWidth && w <= maxWidth,
  )

  let bestWidth = maxWidth
  let bestScore = -Infinity
  for (const width of candidateWidths) {
    const window = series.slice(-width)
    const values = nonNull(window)
    if (values.length < minWidth) continue
    const fitness = windowFitness(values)
    if (fitness > bestScore) {
      bestScore = fitness
      bestWidth = width
    }
  }

  const window = series.slice(-bestWidth)
  const minYear = window[0]?.year ?? maxYear - bestWidth + 1
  return { minYear, maxYear }
}

/**
 * How well a window frames the story. Rewards big moves relative to the
 * chart's vertical scale, and penalizes windows where most of the points sit
 * on a flat baseline at the bottom (a long flat line with a tail at the end
 * is a worse frame than the tail alone).
 */
function windowFitness(values: number[]): number {
  if (values.length < 2) return 0
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min
  if (max === 0 || range === 0) return 0
  const moveShare = range / Math.abs(max)
  const flatPoints = values.filter((v) => Math.abs(v - min) <= 0.1 * range).length
  const flatShare = flatPoints / values.length
  return moveShare * (1 - flatShare)
}

function uniqueAsc(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b)
}
