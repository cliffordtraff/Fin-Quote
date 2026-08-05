import Link from 'next/link'
import { ArrowUpRight, BarChart3 } from 'lucide-react'
import type {
  DashboardChartOfTheDayPresentation,
  DashboardChartPoint,
  DashboardChartSeries,
  DashboardChartUnit,
} from '@/lib/dashboard/chart-of-the-day-presentation'

interface DashboardChartOfTheDayProps {
  presentation: DashboardChartOfTheDayPresentation
}

interface ChartPeriod {
  key: string
  label: string
  year: number
  fiscalQuarter: number | null
}

const VIEWBOX_WIDTH = 860
const VIEWBOX_HEIGHT = 390
const MARGIN = { top: 20, right: 62, bottom: 42, left: 68 }
const PLOT_WIDTH = VIEWBOX_WIDTH - MARGIN.left - MARGIN.right
const PLOT_HEIGHT = VIEWBOX_HEIGHT - MARGIN.top - MARGIN.bottom
const GRID_STEPS = 4

const BAR_CLASSES = [
  'fill-sage-500 dark:fill-sage-400',
  'fill-blue-500 dark:fill-blue-400',
  'fill-amber-500 dark:fill-amber-400',
] as const

const LINE_CLASSES = [
  'stroke-sage-600 dark:stroke-sage-300',
  'stroke-blue-600 dark:stroke-blue-300',
  'stroke-amber-600 dark:stroke-amber-300',
] as const

const DOT_CLASSES = [
  'fill-sage-600 stroke-white dark:fill-sage-300 dark:stroke-gray-900',
  'fill-blue-600 stroke-white dark:fill-blue-300 dark:stroke-gray-900',
  'fill-amber-600 stroke-white dark:fill-amber-300 dark:stroke-gray-900',
] as const

const LEGEND_CLASSES = [
  'bg-sage-500 dark:bg-sage-400',
  'bg-blue-500 dark:bg-blue-400',
  'bg-amber-500 dark:bg-amber-400',
] as const

function formatCompactValue(value: number, unit: DashboardChartUnit): string {
  if (!Number.isFinite(value)) return '—'

  if (unit === 'currency') {
    const absolute = Math.abs(value)
    if (absolute >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(1)}T`
    if (absolute >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`
    if (absolute >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
    return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  }

  if (unit === 'price') {
    return `$${value.toLocaleString('en-US', {
      minimumFractionDigits: value < 10 ? 2 : 0,
      maximumFractionDigits: value < 10 ? 2 : 0,
    })}`
  }

  if (unit === 'percent') {
    const sign = value > 0 ? '+' : ''
    return `${sign}${value.toFixed(1)}%`
  }

  if (unit === 'shares') {
    const absolute = Math.abs(value)
    if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`
    if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  }

  return value.toLocaleString('en-US', { maximumFractionDigits: 1 })
}

function comparePeriods(left: ChartPeriod, right: ChartPeriod): number {
  if (left.year !== right.year) return left.year - right.year
  return (left.fiscalQuarter ?? 0) - (right.fiscalQuarter ?? 0)
}

function getPeriods(series: DashboardChartSeries[]): ChartPeriod[] {
  const periods = new Map<string, ChartPeriod>()
  series.forEach((item) => {
    item.points.forEach((point) => {
      periods.set(point.key, {
        key: point.key,
        label: point.label,
        year: point.year,
        fiscalQuarter: point.fiscalQuarter,
      })
    })
  })
  return Array.from(periods.values()).sort(comparePeriods)
}

function getDomain(values: number[], includeZero: boolean): [number, number] {
  if (values.length === 0) return [0, 1]

  let min = Math.min(...values)
  let max = Math.max(...values)
  if (includeZero) {
    min = Math.min(0, min)
    max = Math.max(0, max)
  } else {
    const padding = Math.max((max - min) * 0.08, Math.abs(max) * 0.02, 1)
    min -= padding
    max += padding
  }
  if (min === max) {
    const padding = Math.max(Math.abs(max) * 0.1, 1)
    min -= padding
    max += padding
  }
  return [min, max]
}

function scaleY(value: number, domain: [number, number]): number {
  const [min, max] = domain
  return MARGIN.top + ((max - value) / (max - min)) * PLOT_HEIGHT
}

function scaleX(index: number, count: number): number {
  if (count <= 1) return MARGIN.left + PLOT_WIDTH / 2
  return MARGIN.left + (index / (count - 1)) * PLOT_WIDTH
}

function getPointForPeriod(
  series: DashboardChartSeries,
  periodKey: string,
): DashboardChartPoint | undefined {
  return series.points.find((point) => point.key === periodKey)
}

function linePath(
  series: DashboardChartSeries,
  periods: ChartPeriod[],
  domain: [number, number],
): string {
  return periods
    .map((period, index) => {
      const point = getPointForPeriod(series, period.key)
      if (!point) return null
      const command = index === 0 || !periods
        .slice(0, index)
        .some((candidate) => getPointForPeriod(series, candidate.key))
        ? 'M'
        : 'L'
      return `${command}${scaleX(index, periods.length).toFixed(2)},${scaleY(point.value, domain).toFixed(2)}`
    })
    .filter(Boolean)
    .join(' ')
}

function ChartLegend({ series }: { series: DashboardChartSeries[] }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 px-4 pt-3 sm:px-5">
      {series.map((item, index) => {
        const latest = item.points[item.points.length - 1]
        return (
          <div key={item.id} className="flex min-w-0 items-center gap-2 text-xs">
            <span
              aria-hidden="true"
              className={`h-2.5 w-2.5 shrink-0 rounded-sm ${LEGEND_CLASSES[index % LEGEND_CLASSES.length]}`}
            />
            <span className="truncate text-gray-600 dark:text-gray-300">
              {item.label}
            </span>
            {latest ? (
              <span className="shrink-0 font-semibold tabular-nums text-gray-950 dark:text-white">
                {formatCompactValue(latest.value, item.unit)}
              </span>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function NativeChart({ presentation }: DashboardChartOfTheDayProps) {
  const periods = getPeriods(presentation.series)
  const primaryUnit = presentation.series.find((series) => series.id !== 'stock_price')?.unit
    ?? presentation.series[0]?.unit
    ?? 'number'
  const primarySeries = presentation.series.filter(
    (series) => series.id !== 'stock_price' && series.unit === primaryUnit,
  )
  const secondarySeries = presentation.series.filter(
    (series) => !primarySeries.includes(series),
  )
  const primaryDomain = getDomain(
    primarySeries.flatMap((series) => series.points.map((point) => point.value)),
    true,
  )
  const secondaryDomain = getDomain(
    secondarySeries.flatMap((series) => series.points.map((point) => point.value)),
    false,
  )
  const barSeries = presentation.series.filter((series) => series.kind === 'bar')
  const barStep = periods.length > 1 ? PLOT_WIDTH / (periods.length - 1) : PLOT_WIDTH
  const barGroupWidth = Math.min(46, Math.max(14, barStep * 0.62))
  const barWidth = Math.max(4, barGroupWidth / Math.max(barSeries.length, 1) - 2)
  const labelInterval = Math.max(1, Math.ceil(periods.length / 7))

  return (
    <div className="min-h-0 flex-1 px-2 pb-2 sm:px-3 sm:pb-3">
      <svg
        aria-label={`${presentation.title}. ${presentation.periodLabel}.`}
        className="h-full min-h-[300px] w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      >
        <desc>
          {presentation.series.map((series) => `${series.label}, ${series.points.length} observations`).join('. ')}
        </desc>

        {Array.from({ length: GRID_STEPS + 1 }, (_, index) => {
          const ratio = index / GRID_STEPS
          const y = MARGIN.top + ratio * PLOT_HEIGHT
          const value = primaryDomain[1] - ratio * (primaryDomain[1] - primaryDomain[0])
          return (
            <g key={`grid-${index}`}>
              <line
                className="stroke-gray-200 dark:stroke-gray-700"
                strokeWidth="1"
                x1={MARGIN.left}
                x2={VIEWBOX_WIDTH - MARGIN.right}
                y1={y}
                y2={y}
              />
              <text
                className="fill-gray-500 text-[11px] dark:fill-gray-400"
                dominantBaseline="middle"
                textAnchor="end"
                x={MARGIN.left - 10}
                y={y}
              >
                {formatCompactValue(value, primaryUnit)}
              </text>
            </g>
          )
        })}

        {secondarySeries.length > 0
          ? Array.from({ length: GRID_STEPS + 1 }, (_, index) => {
              const ratio = index / GRID_STEPS
              const y = MARGIN.top + ratio * PLOT_HEIGHT
              const value = secondaryDomain[1] - ratio * (secondaryDomain[1] - secondaryDomain[0])
              return (
                <text
                  key={`secondary-${index}`}
                  className="fill-gray-400 text-[10px] dark:fill-gray-500"
                  dominantBaseline="middle"
                  textAnchor="start"
                  x={VIEWBOX_WIDTH - MARGIN.right + 10}
                  y={y}
                >
                  {formatCompactValue(value, secondarySeries[0].unit)}
                </text>
              )
            })
          : null}

        {barSeries.flatMap((series, seriesIndex) => {
          const presentationIndex = presentation.series.indexOf(series)
          const domain = primarySeries.includes(series) ? primaryDomain : secondaryDomain
          const zeroY = scaleY(0, domain)
          return periods.flatMap((period, periodIndex) => {
            const point = getPointForPeriod(series, period.key)
            if (!point) return []
            const center = scaleX(periodIndex, periods.length)
            const groupOffset = (seriesIndex - (barSeries.length - 1) / 2) * (barWidth + 2)
            const pointY = scaleY(point.value, domain)
            return [(
              <rect
                key={`${series.id}-${period.key}`}
                className={`${BAR_CLASSES[presentationIndex % BAR_CLASSES.length]} opacity-90`}
                height={Math.max(1, Math.abs(zeroY - pointY))}
                rx="2"
                width={barWidth}
                x={center + groupOffset - barWidth / 2}
                y={Math.min(zeroY, pointY)}
              >
                <title>{`${series.label} · ${point.label}: ${formatCompactValue(point.value, series.unit)}`}</title>
              </rect>
            )]
          })
        })}

        {presentation.series.map((series, seriesIndex) => {
          if (series.kind === 'bar') return null
          const domain = primarySeries.includes(series) ? primaryDomain : secondaryDomain
          const path = linePath(series, periods, domain)
          if (!path) return null
          return (
            <g key={series.id}>
              <path
                className={`${LINE_CLASSES[seriesIndex % LINE_CLASSES.length]} fill-none`}
                d={path}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
              />
              {periods.map((period, periodIndex) => {
                const point = getPointForPeriod(series, period.key)
                if (!point) return null
                return (
                  <circle
                    key={`${series.id}-${period.key}`}
                    className={DOT_CLASSES[seriesIndex % DOT_CLASSES.length]}
                    cx={scaleX(periodIndex, periods.length)}
                    cy={scaleY(point.value, domain)}
                    r="3.5"
                    strokeWidth="2"
                  >
                    <title>{`${series.label} · ${point.label}: ${formatCompactValue(point.value, series.unit)}`}</title>
                  </circle>
                )
              })}
            </g>
          )
        })}

        {periods.map((period, index) => {
          const showLabel = index === 0
            || index === periods.length - 1
            || index % labelInterval === 0
          if (!showLabel) return null
          return (
            <text
              key={period.key}
              className="fill-gray-500 text-[11px] dark:fill-gray-400"
              textAnchor="middle"
              x={scaleX(index, periods.length)}
              y={VIEWBOX_HEIGHT - 13}
            >
              {period.label}
            </text>
          )
        })}
      </svg>
    </div>
  )
}

export default function DashboardChartOfTheDay({
  presentation,
}: DashboardChartOfTheDayProps) {
  const workspaceHref = `/workspace/fundamentals?symbol=${encodeURIComponent(presentation.symbol)}`
  const titleIncludesSymbol = presentation.title
    .toUpperCase()
    .includes(presentation.symbol.toUpperCase())
  const displayTitle = titleIncludesSymbol
    ? presentation.title
    : `${presentation.symbol} ${presentation.title}`

  return (
    <section className="flex min-h-[430px] min-w-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex min-h-11 items-center justify-between gap-3 px-4 pt-3 sm:px-5">
        <h2 className="min-w-0 truncate text-sm font-semibold text-gray-950 dark:text-white">
          {displayTitle}
          {' '}
          <span className="ml-2 font-normal text-gray-500 dark:text-gray-400">
            · {presentation.periodLabel}
          </span>
        </h2>
        <Link
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-gray-500 no-underline transition-colors hover:text-sage-700 dark:text-gray-400 dark:hover:text-sage-300"
          href={workspaceHref}
        >
          Open chart
          <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </div>

      {presentation.series.length > 0 ? (
        <>
          <ChartLegend series={presentation.series} />
          <NativeChart presentation={presentation} />
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2.5 text-[11px] text-gray-500 dark:border-gray-800 dark:text-gray-400 sm:px-5">
            <span>{presentation.indexed ? 'Indexed to first observation' : 'Fiscal-period values'}</span>
            <span>Source: company filings · market data</span>
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="rounded-full bg-gray-100 p-3 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            <BarChart3 aria-hidden="true" className="h-5 w-5" />
          </div>
          <p className="mt-4 text-sm font-semibold text-gray-900 dark:text-gray-100">
            Chart data is temporarily unavailable
          </p>
          <p className="mt-2 max-w-sm text-sm leading-6 text-gray-500 dark:text-gray-400">
            Open the full fundamentals workspace to continue researching {presentation.symbol}.
          </p>
          <Link
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-gray-950 px-3 py-2 text-sm font-semibold text-white no-underline hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
            href={workspaceHref}
          >
            Open fundamentals
            <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      )}
    </section>
  )
}
