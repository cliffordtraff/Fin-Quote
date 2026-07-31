import Link from 'next/link'

import type { EarningsData } from '@/app/actions/earnings-calendar'
import type { EconomicEvent } from '@/app/actions/economic-calendar'
import type { ForexBondData } from '@/app/actions/forex-bonds'
import type { GlobalIndexQuote } from '@/app/actions/global-indices'
import type {
  MorningBriefReport as MorningBriefReportData,
  MorningBriefWiimCandidate,
} from '@/lib/morning-brief'
import type { MorningBriefTakeaway, MorningBriefTone } from '@/lib/morning-brief-insights'
import type { PremarketBriefRow, PremarketMover } from '@/lib/premarket-brief'

const ET_TIME_ZONE = 'America/New_York'

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`))
}

function formatTime(iso: string | null): string {
  if (!iso) return 'Not available'
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: ET_TIME_ZONE,
    timeZoneName: 'short',
  }).format(new Date(iso))
}

function parseUtcDate(value: string): Date {
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized)
  return new Date(hasZone ? normalized : `${normalized}Z`)
}

function formatEventTime(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: ET_TIME_ZONE,
  }).format(parseUtcDate(date))
}

function formatSignedPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'n/a'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function formatPrice(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'n/a'
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function percentClass(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'text-gray-500 dark:text-gray-400'
  }
  if (value > 0) return 'text-emerald-700 dark:text-emerald-400'
  if (value < 0) return 'text-red-700 dark:text-red-400'
  return 'text-gray-600 dark:text-gray-300'
}

function toneClasses(tone: MorningBriefTone): string {
  if (tone === 'positive') return 'border-l-emerald-500'
  if (tone === 'negative') return 'border-l-red-500'
  if (tone === 'warning') return 'border-l-amber-500'
  return 'border-l-gray-400 dark:border-l-gray-500'
}

function SectionHeading({
  id,
  title,
  detail,
}: {
  id?: string
  title: string
  detail?: string
}) {
  return (
    <div className="mb-3 flex min-w-0 items-end justify-between gap-4">
      <h2 id={id} className="text-base font-semibold text-gray-950 dark:text-white">{title}</h2>
      {detail ? (
        <p className="min-w-0 truncate text-right text-xs text-gray-500 dark:text-gray-400">
          {detail}
        </p>
      ) : null}
    </div>
  )
}

function SnapshotCell({
  label,
  value,
  change,
  secondary,
}: {
  label: string
  value: string
  change?: number | null
  secondary?: string
}) {
  return (
    <div className="min-w-0 border-b border-gray-200 px-4 py-3 last:border-b-0 dark:border-gray-800 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <div className="truncate text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="truncate text-lg font-semibold tabular-nums text-gray-950 dark:text-white">
          {value}
        </span>
        {change !== undefined ? (
          <span className={`shrink-0 text-xs font-semibold tabular-nums ${percentClass(change)}`}>
            {formatSignedPercent(change)}
          </span>
        ) : secondary ? (
          <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">
            {secondary}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function Takeaways({ items }: { items: MorningBriefTakeaway[] }) {
  return (
    <section aria-labelledby="morning-takeaways">
      <SectionHeading id="morning-takeaways" title="What Matters Now" detail={`${items.length} opening signals`} />
      <div className="divide-y divide-gray-200 border-y border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
        {items.map((item) => (
          <div
            key={`${item.label}-${item.text}`}
            className={`grid gap-1 border-l-4 px-4 py-3 md:grid-cols-[132px_minmax(0,1fr)] md:gap-5 ${toneClasses(item.tone)}`}
          >
            <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">{item.label}</div>
            <p className="text-sm leading-5 text-gray-700 dark:text-gray-300">{item.text}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function PipelineStatus({ report }: { report: MorningBriefReportData['wiim'] }) {
  const summary = report.summaryCoverage
  const finviz = report.finvizCoverage
  const ready = report.status === 'ready'

  return (
    <section aria-label="WIIM pipeline status" className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="grid sm:grid-cols-2 xl:grid-cols-4">
        <SnapshotCell
          label="Morning WIIM run"
          value={ready ? `Ready · ${formatTime(report.generatedAt)}` : report.status === 'missing' ? 'Not run today' : 'Unavailable'}
        />
        <SnapshotCell
          label="Finviz refresh"
          value={`${finviz.attempted}/${finviz.expected}`}
          secondary={
            finviz.attempted > 0
              ? `${finviz.found} catalysts`
              : 'No data'
          }
        />
        <SnapshotCell
          label="Our summaries"
          value={`${summary.stored}/${summary.expected || summary.stored}`}
          secondary={
            summary.expected > 0
              ? `${Math.round((summary.stored / summary.expected) * 100)}% complete`
              : 'No run'
          }
        />
        <SnapshotCell
          label="Summary model"
          value={summary.model || 'Not available'}
        />
      </div>
      {!ready ? (
        <div className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          {report.error || 'No completed WIIM morning run is stored for today.'}
        </div>
      ) : (
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-gray-200 px-4 py-2 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
          <span>{finviz.found} Finviz catalysts</span>
          <span>{finviz.notFound} normal pages without a catalyst</span>
          {finviz.errors > 0 ? <span>{finviz.errors} scrape errors</span> : null}
          {finviz.missing > 0 ? (
            <span>
              {finviz.missing} unavailable ({finviz.missingSymbols.join(', ')})
            </span>
          ) : (
            <span>Full Finviz coverage</span>
          )}
          <span>{summary.generated} generated summaries</span>
          <span>{summary.noClearCatalyst} no-clear-catalyst results</span>
        </div>
      )}
    </section>
  )
}

function SourceLinks({ candidate }: { candidate: MorningBriefWiimCandidate }) {
  const seenLabels = new Set<string>()
  const links = candidate.sourceRefs
    .filter((source): source is typeof source & { url: string } => Boolean(source.url))
    .map((source) => {
      if (source.kind === 'finviz') return { ...source, displayLabel: 'Finviz' }

      try {
        const hostname = new URL(source.url).hostname.replace(/^www\./, '')
        return { ...source, displayLabel: hostname }
      } catch {
        return { ...source, displayLabel: source.kind }
      }
    })
    .filter((source) => {
      if (seenLabels.has(source.displayLabel)) return false
      seenLabels.add(source.displayLabel)
      return true
    })
    .slice(0, 3)
  if (links.length === 0) return null

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {links.map((source, index) => (
        <span key={`${source.kind}-${source.url}-${index}`} className="inline-flex min-w-0 items-center gap-2">
          <span aria-hidden="true">·</span>
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="max-w-[160px] truncate text-sage-700 hover:underline dark:text-sage-300"
          >
            {source.displayLabel}
          </a>
        </span>
      ))}
    </div>
  )
}

function WiimCandidate({ candidate }: { candidate: MorningBriefWiimCandidate }) {
  const generated = candidate.generatedSummary
  const finviz = candidate.finvizSummary
  const generatedMove = generated?.quoteMovePercent
  const moveMismatch =
    generatedMove !== null
    && generatedMove !== undefined
    && candidate.movePercent !== null
    && Math.abs(generatedMove) >= 0.25
    && Math.abs(candidate.movePercent) >= 0.25
    && Math.sign(generatedMove) !== Math.sign(candidate.movePercent)

  return (
    <article className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="grid gap-3 px-4 py-4 md:grid-cols-[36px_88px_minmax(0,1fr)_92px] md:items-start">
        <div className="flex h-8 w-8 items-center justify-center rounded border border-gray-300 bg-gray-50 text-sm font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
          {candidate.rank}
        </div>
        <div>
          <Link
            href={`/stock/${candidate.ticker}`}
            className="text-base font-semibold text-sage-700 hover:underline dark:text-sage-300"
          >
            {candidate.ticker}
          </Link>
          <div className={`mt-0.5 text-xs font-semibold tabular-nums ${percentClass(candidate.movePercent)}`}>
            {formatSignedPercent(candidate.movePercent)}
          </div>
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-5 text-gray-950 dark:text-white">
            {candidate.headline}
          </h3>
          <p className="mt-1 text-sm leading-5 text-gray-600 dark:text-gray-300">
            {candidate.whyItMatters}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span>{candidate.candidateType.replaceAll('_', ' ')}</span>
            <span aria-hidden="true">·</span>
            <span>{candidate.stateLabel}</span>
            <SourceLinks candidate={candidate} />
          </div>
        </div>
        <div className="md:text-right">
          <div className="text-2xl font-semibold tabular-nums text-gray-950 dark:text-white">
            {Math.round(candidate.confidenceScore)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">confidence</div>
        </div>
      </div>

      <div className="grid border-t border-gray-200 dark:border-gray-800 lg:grid-cols-2">
        <div className="px-4 py-3 lg:border-r lg:border-gray-200 dark:lg:border-gray-800">
          <div className="mb-1 text-xs font-semibold text-gray-700 dark:text-gray-200">Our read</div>
          <p className="text-sm leading-5 text-gray-700 dark:text-gray-300">
            {generated
              ? generated.text || 'No clear catalyst was supported by our quote and timely news context.'
              : 'No independently generated summary is stored for today.'}
          </p>
          {generated?.keyFact ? (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Key fact: {generated.keyFact}</p>
          ) : null}
          {moveMismatch ? (
            <p className="mt-2 border-l-2 border-amber-500 pl-2 text-xs leading-4 text-amber-800 dark:text-amber-300">
              Regular-session input was {formatSignedPercent(generatedMove)}; the current WIIM move is {formatSignedPercent(candidate.movePercent)}.
            </p>
          ) : null}
        </div>
        <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-800 lg:border-t-0">
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">Finviz catalyst</span>
            {finviz?.sourceUrl ? (
              <a
                href={finviz.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-sage-700 hover:underline dark:text-sage-300"
              >
                Source
              </a>
            ) : null}
          </div>
          <p className="text-sm leading-5 text-gray-700 dark:text-gray-300">
            {finviz?.text || finviz?.headline || 'No Finviz catalyst payload was available in today’s refresh.'}
          </p>
        </div>
      </div>
    </article>
  )
}

function EconomicClock({
  events,
  summaryDate,
}: {
  events: EconomicEvent[]
  summaryDate: string
}) {
  const today = events.filter((event) => event.date.startsWith(summaryDate))
  const displayEvents = today.length > 0 ? today : events.slice(0, 5)

  return (
    <section>
      <SectionHeading
        title="Macro Clock"
        detail={today.length > 0 ? `${today.length} events today` : 'Next scheduled events'}
      />
      <div className="divide-y divide-gray-200 border-y border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
        {displayEvents.length === 0 ? (
          <p className="px-4 py-5 text-sm text-gray-500 dark:text-gray-400">Economic calendar unavailable.</p>
        ) : (
          displayEvents.map((event, index) => (
            <div key={`${event.date}-${event.event}-${index}`} className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 px-4 py-3">
              <div className="text-xs font-semibold tabular-nums text-gray-700 dark:text-gray-200">
                {formatEventTime(event.date)}
              </div>
              <div className="min-w-0">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <p className="text-sm font-medium leading-5 text-gray-950 dark:text-white">{event.event}</p>
                  <span className={`shrink-0 text-[11px] font-semibold ${event.impact === 'High' ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
                    {event.impact}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-500 dark:text-gray-400">
                  {event.previous !== null ? <span>Prev {event.previous}{event.unit}</span> : null}
                  {event.estimate !== null ? <span>Est {event.estimate}{event.unit}</span> : null}
                  {event.actual !== null ? <span>Actual {event.actual}{event.unit}</span> : null}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function earningsTimeLabel(time: EarningsData['time']): string {
  if (time === 'bmo') return 'Before open'
  if (time === 'amc') return 'After close'
  if (time === 'dmh') return 'During market'
  return 'Time TBD'
}

function EarningsWatch({
  earnings,
  summaryDate,
}: {
  earnings: EarningsData[]
  summaryDate: string
}) {
  const today = earnings.filter((earning) => earning.date === summaryDate)
  const displayEarnings = today.length > 0 ? today : earnings.slice(0, 8)

  return (
    <section>
      <SectionHeading
        title="Earnings Watch"
        detail={today.length > 0 ? `${today.length} reporting today` : 'Next reporters'}
      />
      <div className="divide-y divide-gray-200 border-y border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
        {displayEarnings.length === 0 ? (
          <p className="px-4 py-5 text-sm text-gray-500 dark:text-gray-400">Earnings calendar unavailable.</p>
        ) : (
          displayEarnings.slice(0, 10).map((earning) => (
            <Link
              key={`${earning.symbol}-${earning.date}`}
              href={`/stock/${earning.symbol}`}
              className="flex items-center justify-between gap-4 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <div className="min-w-0">
                <span className="font-semibold text-sage-700 dark:text-sage-300">{earning.symbol}</span>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">{earning.name}</p>
              </div>
              <span className="shrink-0 text-xs text-gray-600 dark:text-gray-300">
                {earningsTimeLabel(earning.time)}
              </span>
            </Link>
          ))
        )}
      </div>
    </section>
  )
}

function TapeTable({
  title,
  rows,
}: {
  title: string
  rows: PremarketBriefRow[]
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-950 dark:text-white">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[440px] text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 dark:bg-gray-800/70 dark:text-gray-400">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Market</th>
              <th className="px-4 py-2 text-right font-medium">Last</th>
              <th className="px-4 py-2 text-right font-medium">Overnight</th>
              <th className="px-4 py-2 text-right font-medium">Prior</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {rows.map((row) => {
              const currentMove = row.premarketChangePct ?? row.currentChangePct
              return (
                <tr key={row.symbol}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-950 dark:text-white">{row.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{row.symbol}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-200">
                    {formatPrice(row.price)}
                  </td>
                  <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${percentClass(currentMove)}`}>
                    {formatSignedPercent(currentMove)}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${percentClass(row.yesterdayChangePct)}`}>
                    {formatSignedPercent(row.yesterdayChangePct)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function GlobalMarkets({ rows }: { rows: GlobalIndexQuote[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-950 dark:text-white">Global Sessions</h3>
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-800">
        {rows.length === 0 ? (
          <p className="px-4 py-5 text-sm text-gray-500 dark:text-gray-400">Global market data unavailable.</p>
        ) : (
          rows.map((row) => (
            <div key={row.market} className="grid grid-cols-[minmax(0,1fr)_88px_74px] items-center gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium text-gray-950 dark:text-white">{row.market}</div>
                <div className="truncate text-xs text-gray-500 dark:text-gray-400">{row.name}</div>
              </div>
              <div className="text-right tabular-nums text-gray-700 dark:text-gray-200">{formatPrice(row.price)}</div>
              <div className={`text-right font-semibold tabular-nums ${percentClass(row.changesPercentage)}`}>
                {formatSignedPercent(row.changesPercentage)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function RatesAndFx({ rows }: { rows: ForexBondData[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-950 dark:text-white">Rates &amp; FX</h3>
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-800">
        {rows.length === 0 ? (
          <p className="px-4 py-5 text-sm text-gray-500 dark:text-gray-400">Rates and FX data unavailable.</p>
        ) : (
          rows.map((row) => (
            <div key={row.symbol} className="grid grid-cols-[minmax(0,1fr)_84px_74px] items-center gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium text-gray-950 dark:text-white">{row.name}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{row.symbol}</div>
              </div>
              <div className="text-right tabular-nums text-gray-700 dark:text-gray-200">
                {formatPrice(row.price, row.symbol.startsWith('^') ? 3 : 4)}
              </div>
              <div className={`text-right font-semibold tabular-nums ${percentClass(row.changesPercentage)}`}>
                {formatSignedPercent(row.changesPercentage)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function Movers({
  title,
  rows,
}: {
  title: string
  rows: PremarketMover[]
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-950 dark:text-white">{title}</h3>
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-800">
        {rows.length === 0 ? (
          <p className="px-4 py-5 text-sm text-gray-500 dark:text-gray-400">
            No extended-hours movers are available.
          </p>
        ) : (
          rows.slice(0, 8).map((row) => (
            <Link
              key={row.symbol}
              href={`/stock/${row.symbol}`}
              className="grid grid-cols-[72px_minmax(0,1fr)_88px] items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <span className="font-semibold text-sage-700 dark:text-sage-300">{row.symbol}</span>
              <span className="truncate text-xs text-gray-500 dark:text-gray-400">{row.name}</span>
              <span className={`text-right text-sm font-semibold tabular-nums ${percentClass(row.changesPercentage)}`}>
                {formatSignedPercent(row.changesPercentage)}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}

export default function MorningBriefReport({ report }: { report: MorningBriefReportData }) {
  const { premarket, wiim } = report
  const spx = premarket.indexRows.find((row) => row.symbol === '^GSPC')
  const nasdaq = premarket.indexRows.find((row) => row.symbol === '^IXIC')
  const vix = premarket.indexRows.find((row) => row.symbol === '^VIX')
  const tenYear = report.forexBonds.find((row) => row.symbol === '^TNX')

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8">
      <header className="mb-5 border-b border-gray-300 pb-5 dark:border-gray-700">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold text-sage-700 dark:text-sage-300">
              {formatDate(report.summaryDate)} · {premarket.sessionLabel}
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-gray-950 dark:text-white">Morning Brief</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              The overnight tape, today’s scheduled risk, and the stories most likely to matter at the open.
            </p>
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400 lg:text-right">
            <div>Updated {formatTime(report.generatedAt)}</div>
            <div>{premarket.currentTimeET} ET · {premarket.dataProviderName} market data</div>
          </div>
        </div>
      </header>

      <section aria-label="Opening market snapshot" className="mb-6 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="grid sm:grid-cols-2 xl:grid-cols-4">
          <SnapshotCell
            label="S&P 500"
            value={formatPrice(spx?.price)}
            change={spx?.premarketChangePct ?? spx?.currentChangePct}
          />
          <SnapshotCell
            label="Nasdaq"
            value={formatPrice(nasdaq?.price)}
            change={nasdaq?.premarketChangePct ?? nasdaq?.currentChangePct}
          />
          <SnapshotCell
            label="VIX"
            value={formatPrice(vix?.price)}
            change={vix?.premarketChangePct ?? vix?.currentChangePct}
          />
          <SnapshotCell
            label="10-Year Treasury"
            value={tenYear ? `${formatPrice(tenYear.price, 3)}%` : 'n/a'}
            change={tenYear?.changesPercentage}
          />
        </div>
      </section>

      <div className="mb-7">
        <Takeaways items={report.takeaways} />
      </div>

      <div className="mb-7">
        <PipelineStatus report={wiim} />
      </div>

      <div className="mb-8 grid gap-7 xl:grid-cols-[minmax(0,1.75fr)_minmax(320px,0.75fr)]">
        <section aria-labelledby="wiim-heading">
          <SectionHeading
            id="wiim-heading"
            title="WIIM Morning Report"
            detail={wiim.topCandidate ? `Top pick ${wiim.topCandidate} · Contrarian ${wiim.bestContrarianCandidate || 'n/a'}` : 'No completed run'}
          />
          <div className="space-y-3">
            {wiim.candidates.length === 0 ? (
              <div className="border-y border-gray-200 bg-white px-4 py-8 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                No ranked WIIM candidates are stored for today.
              </div>
            ) : (
              wiim.candidates.map((candidate) => (
                <WiimCandidate key={`${candidate.rank}-${candidate.ticker}`} candidate={candidate} />
              ))
            )}
          </div>
        </section>

        <aside className="space-y-7">
          <EconomicClock events={report.economicEvents} summaryDate={report.summaryDate} />
          <EarningsWatch earnings={report.earnings} summaryDate={report.summaryDate} />
        </aside>
      </div>

      <section className="mb-8">
        <SectionHeading title="Overnight Tape" detail="Prior close into pre-market" />
        <div className="grid gap-4 xl:grid-cols-2">
          <TapeTable title="Index Setup" rows={premarket.indexRows} />
          <TapeTable title="US Futures" rows={premarket.futuresRows} />
        </div>
      </section>

      <section className="mb-8">
        <SectionHeading title="Cross-Asset Context" detail="Global sessions, rates, and currencies" />
        <div className="grid gap-4 xl:grid-cols-2">
          <GlobalMarkets rows={report.globalMarkets} />
          <RatesAndFx rows={report.forexBonds} />
        </div>
      </section>

      <section className="mb-8">
        <SectionHeading title="Pre-Market Movers" detail="Largest extended-hours moves" />
        <div className="grid gap-4 xl:grid-cols-2">
          <Movers title="Gainers" rows={premarket.premarketGainers} />
          <Movers title="Losers" rows={premarket.premarketLosers} />
        </div>
      </section>

      <section className="mb-8">
        <SectionHeading title="Headline Queue" detail={`${premarket.marketNews.length} market stories`} />
        <div className="divide-y divide-gray-200 border-y border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
          {premarket.marketNews.length === 0 ? (
            <p className="px-4 py-5 text-sm text-gray-500 dark:text-gray-400">Market headlines unavailable.</p>
          ) : (
            premarket.marketNews.map((item, index) => (
              <a
                key={`${item.url}-${index}`}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="grid gap-1 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 md:grid-cols-[100px_minmax(0,1fr)] md:gap-4"
              >
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{item.site || 'News'}</span>
                <span className="text-sm font-medium leading-5 text-gray-950 dark:text-white">{item.title}</span>
              </a>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
