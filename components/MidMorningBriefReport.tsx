import Link from 'next/link'

import type { EconomicEvent } from '@/app/actions/economic-calendar'
import type { ForexBondData } from '@/app/actions/forex-bonds'
import type { GlobalIndexQuote } from '@/app/actions/global-indices'
import type {
  MidMorningBriefReport as MidMorningBriefReportData,
  MidMorningGeneratedSummary,
  MidMorningHeadline,
  MidMorningIndexSnapshot,
  MidMorningMover,
  MidMorningSector,
  MidMorningWiimCandidate,
  MorningFollowThrough,
} from '@/lib/mid-morning-brief'
import type {
  MidMorningTakeaway,
  MidMorningTone,
  MorningFollowThroughStatus,
} from '@/lib/mid-morning-brief-insights'

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

function parseEconomicDate(value: string): Date {
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  return new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized) ? normalized : `${normalized}Z`)
}

function formatEventTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: ET_TIME_ZONE,
  }).format(parseEconomicDate(value))
}

function formatSignedPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'n/a'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function formatPrice(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return 'n/a'
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function formatCompactCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'n/a'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function percentClass(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'text-gray-500 dark:text-gray-400'
  if (value > 0) return 'text-emerald-700 dark:text-emerald-400'
  if (value < 0) return 'text-red-700 dark:text-red-400'
  return 'text-gray-600 dark:text-gray-300'
}

function toneClasses(tone: MidMorningTone): string {
  if (tone === 'positive') return 'border-l-emerald-500'
  if (tone === 'negative') return 'border-l-red-500'
  if (tone === 'warning') return 'border-l-amber-500'
  return 'border-l-gray-400 dark:border-l-gray-500'
}

function statusClasses(status: MorningFollowThroughStatus): string {
  if (status === 'confirmed') {
    return 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
  }
  if (status === 'reversed') {
    return 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300'
  }
  if (status === 'fading') {
    return 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
  }
  return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
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

function IndexCell({ row }: { row: MidMorningIndexSnapshot }) {
  return (
    <div className="min-w-0 border-b border-gray-200 px-4 py-3 dark:border-gray-800 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <div className="truncate text-xs text-gray-500 dark:text-gray-400">{row.name}</div>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="truncate text-lg font-semibold tabular-nums text-gray-950 dark:text-white">
          {formatPrice(row.price)}
        </span>
        <span className={`shrink-0 text-xs font-semibold tabular-nums ${percentClass(row.dayChangePercent)}`}>
          {formatSignedPercent(row.dayChangePercent)}
        </span>
      </div>
      <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
        Since 9:30 <span className={percentClass(row.sinceOpenPercent)}>{formatSignedPercent(row.sinceOpenPercent)}</span>
      </div>
    </div>
  )
}

function Takeaways({ items }: { items: MidMorningTakeaway[] }) {
  return (
    <section aria-labelledby="mid-morning-takeaways">
      <SectionHeading id="mid-morning-takeaways" title="What Matters Now" detail="Live-session read" />
      <div className="divide-y divide-gray-200 border-y border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
        {items.map((item) => (
          <div
            key={item.label}
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

function PipelineStatus({ report }: { report: MidMorningBriefReportData }) {
  const { wiim, automation } = report
  return (
    <section
      aria-label="Mid-morning data status"
      className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
    >
      <div className="grid sm:grid-cols-2 xl:grid-cols-4">
        <StatusCell label="Morning baseline" value={formatTime(wiim.morningGeneratedAt)} detail={wiim.morningRunId || 'No run'} />
        <StatusCell label="Mid-morning WIIM" value={formatTime(wiim.midMorningGeneratedAt)} detail={wiim.midMorningRunId || 'No run'} />
        <StatusCell
          label="Finviz refresh"
          value={`${wiim.pipeline.finvizRefreshedCount}/${wiim.pipeline.candidateCount}`}
          detail={formatTime(wiim.pipeline.finvizRefreshedAt)}
        />
        <StatusCell
          label="Our summaries"
          value={`${wiim.pipeline.generatedSummaryCount}/${wiim.pipeline.candidateCount}`}
          detail={wiim.pipeline.summaryRunId || 'No run'}
        />
      </div>
      {automation ? (
        <div
          className={`flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-xs ${
            automation.status === 'failed'
              ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200'
              : automation.status === 'completed'
                ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200'
                : automation.status === 'partial'
                  ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
                : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200'
          }`}
        >
          <span className="font-semibold">
            Automation: {automation.stage.replaceAll('_', ' ')}
          </span>
          <span>
            Finviz {automation.finvizCompletedCount}/
            {automation.candidateCount} / Summaries{' '}
            {automation.summaryGeneratedCount}/5
          </span>
        </div>
      ) : null}
      {wiim.status !== 'ready' ? (
        <div className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          {wiim.error || 'The mid-morning WIIM snapshot is not available.'}
        </div>
      ) : (
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-gray-200 px-4 py-2 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
          <span>{report.breadth.covered}/{report.breadth.expected} S&amp;P constituents quoted</span>
          <span>{report.providerName} live market data</span>
          <span>Independent summaries updated {formatTime(wiim.pipeline.summariesGeneratedAt)}</span>
        </div>
      )}
    </section>
  )
}

function StatusCell({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="min-w-0 border-b border-gray-200 px-4 py-3 last:border-b-0 dark:border-gray-800 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 text-base font-semibold text-gray-950 dark:text-white">{value}</div>
      <div className="mt-1 truncate text-[11px] text-gray-500 dark:text-gray-400">{detail}</div>
    </div>
  )
}

function MorningDelta({ report }: { report: MidMorningBriefReportData['wiim'] }) {
  const delta = report.delta
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <div className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Top story</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-2xl font-semibold text-gray-950 dark:text-white">
            {report.topCandidate || 'n/a'}
          </span>
          {delta?.previousTopCandidate && delta.currentTopCandidate !== delta.previousTopCandidate ? (
            <span className="text-sm text-gray-600 dark:text-gray-300">
              replaced {delta.previousTopCandidate}
            </span>
          ) : (
            <span className="text-sm text-gray-600 dark:text-gray-300">unchanged from morning</span>
          )}
        </div>
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-800">
        <DeltaRow label="Entered top five" values={delta?.newlyEntered ?? []} empty="No new names" tone="positive" />
        <DeltaRow label="Dropped" values={delta?.dropped ?? []} empty="No names dropped" tone="negative" />
        <DeltaRow
          label="Rank changes"
          values={(delta?.rankChanges ?? []).map(
            (change) => `${change.ticker} #${change.previousRank} to #${change.currentRank}`,
          )}
          empty="No retained-name rank changes"
          tone="neutral"
        />
        <DeltaRow
          label="Contrarian read"
          values={report.bestContrarianCandidate ? [report.bestContrarianCandidate] : []}
          empty="No contrarian name"
          tone="warning"
        />
      </div>
    </div>
  )
}

function DeltaRow({
  label,
  values,
  empty,
  tone,
}: {
  label: string
  values: string[]
  empty: string
  tone: 'positive' | 'negative' | 'warning' | 'neutral'
}) {
  const valueClass =
    tone === 'positive'
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'negative'
        ? 'text-red-700 dark:text-red-400'
        : tone === 'warning'
          ? 'text-amber-700 dark:text-amber-400'
          : 'text-gray-800 dark:text-gray-200'
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[132px_minmax(0,1fr)]">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
      <span className={`text-sm font-medium ${values.length > 0 ? valueClass : 'text-gray-500 dark:text-gray-400'}`}>
        {values.length > 0 ? values.join(', ') : empty}
      </span>
    </div>
  )
}

function MorningFollowThroughTable({ rows }: { rows: MorningFollowThrough[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-950 dark:text-white">Morning Calls Now</h3>
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-800">
        {rows.map((row) => (
          <div
            key={row.ticker}
            className="grid gap-2 px-4 py-3 sm:grid-cols-[68px_92px_86px_86px_minmax(0,1fr)] sm:items-center"
          >
            <Link href={`/stock/${row.ticker}`} className="font-semibold text-sage-700 hover:underline dark:text-sage-300">
              {row.ticker}
            </Link>
            <span className={`w-fit rounded px-2 py-1 text-[11px] font-semibold capitalize ${statusClasses(row.status)}`}>
              {row.status}
            </span>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Morning <span className={`font-semibold tabular-nums ${percentClass(row.morningMovePercent)}`}>{formatSignedPercent(row.morningMovePercent)}</span>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Now <span className={`font-semibold tabular-nums ${percentClass(row.currentMovePercent)}`}>{formatSignedPercent(row.currentMovePercent)}</span>
            </div>
            <div className="min-w-0 text-xs text-gray-600 dark:text-gray-300">
              {row.currentRank ? `Now ranked #${row.currentRank}` : 'Outside the current top five'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SourceLinks({ candidate }: { candidate: MidMorningWiimCandidate }) {
  const seen = new Set<string>()
  const links = candidate.sourceRefs
    .filter((source): source is typeof source & { url: string } => Boolean(source.url))
    .map((source) => {
      if (source.kind === 'finviz') return { ...source, displayLabel: 'Finviz' }
      try {
        return { ...source, displayLabel: new URL(source.url).hostname.replace(/^www\./, '') }
      } catch {
        return { ...source, displayLabel: source.kind }
      }
    })
    .filter((source) => {
      if (seen.has(source.displayLabel)) return false
      seen.add(source.displayLabel)
      return true
    })
    .slice(0, 4)

  if (links.length === 0) return null
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {links.map((source) => (
        <a
          key={`${source.kind}-${source.url}`}
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className="max-w-[180px] truncate text-sage-700 hover:underline dark:text-sage-300"
        >
          {source.displayLabel}
        </a>
      ))}
    </div>
  )
}

function GeneratedSummary({
  summary,
  currentMovePercent,
}: {
  summary: MidMorningGeneratedSummary | null
  currentMovePercent: number | null
}) {
  const summaryMove = summary?.quoteMovePercent
  const directionMismatch =
    summaryMove != null
    && currentMovePercent != null
    && Math.abs(summaryMove) >= 0.5
    && Math.abs(currentMovePercent) >= 0.5
    && Math.sign(summaryMove) !== Math.sign(currentMovePercent)

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Our independent read</h4>
        <span className="text-[11px] text-gray-500 dark:text-gray-400">{summary?.model || 'No model result'}</span>
      </div>
      <p className="mt-2 text-sm leading-5 text-gray-800 dark:text-gray-200">
        {summary?.text || 'No clear independent catalyst summary is available.'}
      </p>
      {summary?.keyFact ? (
        <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">{summary.keyFact}</p>
      ) : null}
      {directionMismatch ? (
        <p className="mt-2 border-l-2 border-amber-500 pl-3 text-xs leading-5 text-amber-800 dark:text-amber-300">
          The quote direction changed after this summary was generated. Use the current move shown above.
        </p>
      ) : null}
    </div>
  )
}

function WiimCandidate({ candidate }: { candidate: MidMorningWiimCandidate }) {
  return (
    <article className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800 sm:px-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">#{candidate.rank}</span>
              <Link
                href={`/stock/${candidate.ticker}`}
                className="text-lg font-semibold text-sage-700 hover:underline dark:text-sage-300"
              >
                {candidate.ticker}
              </Link>
              <span className="truncate text-sm text-gray-500 dark:text-gray-400">{candidate.name}</span>
            </div>
            <h3 className="mt-1 text-sm font-semibold leading-5 text-gray-950 dark:text-white">
              {candidate.headline}
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-3 sm:pl-4">
            <span className={`text-base font-semibold tabular-nums ${percentClass(candidate.currentMovePercent)}`}>
              {formatSignedPercent(candidate.currentMovePercent)}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">{candidate.confidenceScore} score</span>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          <span>{candidate.morningRank ? `Morning rank #${candidate.morningRank}` : 'New since morning'}</span>
          <span>{candidate.candidateType.replaceAll('_', ' ')}</span>
          <span>{candidate.stateLabel}</span>
        </div>
      </div>
      <div className="grid gap-5 px-4 py-4 sm:px-5 lg:grid-cols-2 lg:gap-8">
        <GeneratedSummary
          summary={candidate.generatedSummary}
          currentMovePercent={candidate.currentMovePercent}
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Finviz catalyst</h4>
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              {formatTime(candidate.finvizSummary?.fetchedAt ?? null)}
            </span>
          </div>
          <p className="mt-2 text-sm leading-5 text-gray-800 dark:text-gray-200">
            {candidate.finvizSummary?.text || candidate.finvizSummary?.headline || 'No Finviz catalyst is available.'}
          </p>
        </div>
      </div>
      <div className="border-t border-gray-200 px-4 py-2.5 dark:border-gray-800 sm:px-5">
        <SourceLinks candidate={candidate} />
      </div>
    </article>
  )
}

function SectorTable({ rows }: { rows: MidMorningSector[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="grid grid-cols-[minmax(0,1fr)_80px] border-b border-gray-200 px-4 py-2 text-[11px] font-semibold uppercase text-gray-500 dark:border-gray-800 dark:text-gray-400">
        <span>Sector</span>
        <span className="text-right">Today</span>
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-800">
        {rows.map((row) => (
          <div key={row.name} className="grid grid-cols-[minmax(0,1fr)_80px] gap-3 px-4 py-2.5">
            <span className="truncate text-sm text-gray-800 dark:text-gray-200">{row.name}</span>
            <span className={`text-right text-sm font-semibold tabular-nums ${percentClass(row.changePercent)}`}>
              {formatSignedPercent(row.changePercent)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Movers({ title, rows }: { title: string; rows: MidMorningMover[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-950 dark:text-white">{title}</h3>
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-800">
        {rows.map((row) => (
          <Link
            key={row.symbol}
            href={`/stock/${row.symbol}`}
            className="grid grid-cols-[68px_minmax(0,1fr)_82px] items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <span className="font-semibold text-sage-700 dark:text-sage-300">{row.symbol}</span>
            <span className="truncate text-xs text-gray-500 dark:text-gray-400">{row.name}</span>
            <span className={`text-right text-sm font-semibold tabular-nums ${percentClass(row.changePercent)}`}>
              {formatSignedPercent(row.changePercent)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

function EconomicClock({
  completed,
  upcoming,
}: {
  completed: EconomicEvent[]
  upcoming: EconomicEvent[]
}) {
  const rows = [
    ...completed.map((event) => ({ event, state: 'Released' })),
    ...upcoming.map((event) => ({ event, state: 'Ahead' })),
  ]
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-950 dark:text-white">Macro Clock</h3>
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-800">
        {completed.length === 0 ? (
          <p className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
            No listed high-impact US release has occurred since the morning report.
          </p>
        ) : null}
        {rows.map(({ event, state }) => (
          <div key={`${event.date}-${event.event}`} className="grid grid-cols-[72px_minmax(0,1fr)_68px] gap-3 px-4 py-3">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{formatEventTime(event.date)}</span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-950 dark:text-white">{event.event}</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {event.actual != null
                  ? `Actual ${event.actual}${event.unit || ''} / Est. ${event.estimate ?? 'n/a'}${event.unit || ''}`
                  : `Est. ${event.estimate ?? 'n/a'}${event.unit || ''} / Prev. ${event.previous ?? 'n/a'}${event.unit || ''}`}
              </div>
            </div>
            <span className={`text-right text-[11px] font-semibold ${state === 'Ahead' ? 'text-amber-700 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'}`}>
              {state}
            </span>
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="px-4 py-5 text-sm text-gray-500 dark:text-gray-400">No US macro events are listed for today.</p>
        ) : null}
      </div>
    </div>
  )
}

function EarningsTape({ report }: { report: MidMorningBriefReportData }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-950 dark:text-white">Earnings Tape</h3>
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-800">
        {report.reportedEarnings.slice(0, 5).map((item) => (
          <div key={item.symbol} className="grid grid-cols-[64px_minmax(0,1fr)_76px] gap-3 px-4 py-3">
            <Link href={`/stock/${item.symbol}`} className="font-semibold text-sage-700 hover:underline dark:text-sage-300">
              {item.symbol}
            </Link>
            <div className="min-w-0 text-xs text-gray-500 dark:text-gray-400">
              EPS {item.eps ?? 'n/a'} vs {item.epsEstimated ?? 'n/a'} / Revenue {formatCompactCurrency(item.revenue)}
            </div>
            <span className={`text-right text-sm font-semibold tabular-nums ${percentClass(item.movePercent)}`}>
              {formatSignedPercent(item.movePercent)}
            </span>
          </div>
        ))}
        {report.remainingEarnings.map((item) => (
          <div key={item.symbol} className="grid grid-cols-[64px_minmax(0,1fr)_76px] gap-3 bg-amber-50/60 px-4 py-3 dark:bg-amber-950/20">
            <Link href={`/stock/${item.symbol}`} className="font-semibold text-sage-700 hover:underline dark:text-sage-300">
              {item.symbol}
            </Link>
            <div className="min-w-0 text-xs text-gray-600 dark:text-gray-300">
              After close / EPS est. {item.epsEstimated ?? 'n/a'} / Revenue est. {formatCompactCurrency(item.revenueEstimated)}
            </div>
            <span className="text-right text-[11px] font-semibold text-amber-700 dark:text-amber-400">Ahead</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RatesAndFx({ rows }: { rows: ForexBondData[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-950 dark:text-white">Rates and FX</h3>
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-800">
        {rows.map((row) => (
          <div key={row.symbol} className="grid grid-cols-[minmax(0,1fr)_88px_78px] gap-3 px-4 py-2.5">
            <span className="truncate text-sm text-gray-800 dark:text-gray-200">{row.name}</span>
            <span className="text-right text-sm tabular-nums text-gray-700 dark:text-gray-300">{formatPrice(row.price, 3)}</span>
            <span className={`text-right text-sm font-semibold tabular-nums ${percentClass(row.changesPercentage)}`}>
              {formatSignedPercent(row.changesPercentage)}
            </span>
          </div>
        ))}
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
        {rows.map((row) => (
          <div key={row.market} className="grid grid-cols-[minmax(0,1fr)_88px_78px] gap-3 px-4 py-2.5">
            <span className="truncate text-sm text-gray-800 dark:text-gray-200">{row.market}</span>
            <span className="truncate text-right text-xs text-gray-500 dark:text-gray-400">{row.name}</span>
            <span className={`text-right text-sm font-semibold tabular-nums ${percentClass(row.changesPercentage)}`}>
              {formatSignedPercent(row.changesPercentage)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Headlines({ rows }: { rows: MidMorningHeadline[] }) {
  return (
    <div className="divide-y divide-gray-200 border-y border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
      {rows.map((item) => (
        <a
          key={item.url}
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="grid gap-1 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 md:grid-cols-[96px_72px_minmax(0,1fr)] md:gap-4"
        >
          <span className="truncate text-xs font-medium text-gray-500 dark:text-gray-400">{item.site || 'News'}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{formatTime(item.publishedAt).replace(' EDT', '').replace(' EST', '')}</span>
          <span className="text-sm font-medium leading-5 text-gray-950 dark:text-white">{item.title}</span>
        </a>
      ))}
    </div>
  )
}

export default function MidMorningBriefReport({ report }: { report: MidMorningBriefReportData }) {
  const breadthDirection = report.breadth.advancers - report.breadth.decliners

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8">
      <header className="mb-5 border-b border-gray-300 pb-5 dark:border-gray-700">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold text-sage-700 dark:text-sage-300">
              {formatDate(report.summaryDate)} / {report.sessionLabel}
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-gray-950 dark:text-white">Mid-Morning Brief</h1>
            <p className="mt-1 max-w-3xl text-sm text-gray-600 dark:text-gray-300">
              What the opening tape confirmed, what changed from the morning report, and what can still move the market today.
            </p>
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400 lg:text-right">
            <div>Updated {formatTime(report.generatedAt)}</div>
            <div className="mt-1">
              <Link href="/dashboard/morning-brief" className="text-sage-700 hover:underline dark:text-sage-300">
                Open Morning Brief
              </Link>
            </div>
          </div>
        </div>
      </header>

      {report.sourceErrors.length > 0 ? (
        <div className="mb-5 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Unavailable or partial sources: {report.sourceErrors.join(', ')}.
        </div>
      ) : null}

      <section aria-label="Live market snapshot" className="mb-6 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="grid sm:grid-cols-2 xl:grid-cols-6">
          {report.indices.map((row) => <IndexCell key={row.symbol} row={row} />)}
          <div className="min-w-0 px-4 py-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">S&amp;P breadth</div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <span className={`text-lg font-semibold tabular-nums ${breadthDirection >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                {report.breadth.advancers} / {report.breadth.decliners}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">adv / dec</span>
            </div>
            <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
              {report.breadth.upTwoPercent} up 2% / {report.breadth.downTwoPercent} down 2%
            </div>
          </div>
        </div>
      </section>

      <div className="mb-7">
        <Takeaways items={report.takeaways} />
      </div>

      <div className="mb-7">
        <PipelineStatus report={report} />
      </div>

      <section className="mb-8">
        <SectionHeading title="What Changed From Morning" detail="Persisted pre-open baseline versus current tape" />
        <div className="grid gap-4 xl:grid-cols-[minmax(300px,0.72fr)_minmax(0,1.28fr)]">
          <MorningDelta report={report.wiim} />
          <MorningFollowThroughTable rows={report.wiim.morningFollowThrough} />
        </div>
      </section>

      <section className="mb-8">
        <SectionHeading title="Live Leadership" detail={`${report.breadth.covered}/${report.breadth.expected} constituents covered`} />
        <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.7fr)_minmax(0,1.3fr)]">
          <SectorTable rows={report.sectors} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Movers title="S&P 500 Gainers" rows={report.gainers} />
            <Movers title="S&P 500 Losers" rows={report.losers} />
          </div>
        </div>
      </section>

      <section className="mb-8" aria-labelledby="wiim-mid-heading">
        <SectionHeading
          id="wiim-mid-heading"
          title="WIIM Mid-Morning Report"
          detail={report.wiim.topCandidate ? `Top pick ${report.wiim.topCandidate} / Contrarian ${report.wiim.bestContrarianCandidate || 'n/a'}` : 'No completed run'}
        />
        <div className="space-y-3">
          {report.wiim.candidates.length > 0 ? (
            report.wiim.candidates.map((candidate) => (
              <WiimCandidate key={`${candidate.rank}-${candidate.ticker}`} candidate={candidate} />
            ))
          ) : (
            <div className="border-y border-gray-200 bg-white px-4 py-8 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
              No ranked mid-morning WIIM candidates are stored for today.
            </div>
          )}
        </div>
      </section>

      <section className="mb-8">
        <SectionHeading title="Rest Of Day Risk" detail="Scheduled catalysts still capable of resetting the tape" />
        <div className="grid gap-4 xl:grid-cols-2">
          <EconomicClock completed={report.completedEconomicEvents} upcoming={report.upcomingEconomicEvents} />
          <EarningsTape report={report} />
        </div>
      </section>

      <section className="mb-8">
        <SectionHeading title="Cross-Asset Context" detail="Rates, currencies, and completed global sessions" />
        <div className="grid gap-4 xl:grid-cols-2">
          <RatesAndFx rows={report.forexBonds} />
          <GlobalMarkets rows={report.globalMarkets} />
        </div>
      </section>

      <section className="mb-8">
        <SectionHeading title="Headline Update" detail={`${report.headlines.length} current stories`} />
        <Headlines rows={report.headlines} />
      </section>
    </div>
  )
}
