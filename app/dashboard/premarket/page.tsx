import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { getPremarketBrief, type CatalystItem, type PremarketBriefRow, type PremarketMover } from '@/lib/premarket-brief'

export const revalidate = 300

function formatPct(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'n/a'
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`
}

function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'n/a'
  if (value >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
  return `$${value.toFixed(2)}`
}

function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'n/a'
  return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${dateStr}T12:00:00Z`))
}

function formatGeneratedAt(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  }).format(new Date(iso))
}

function pctClass(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'text-gray-500 dark:text-gray-400'
  if (value > 0) return 'text-green-600 dark:text-green-400'
  if (value < 0) return 'text-red-600 dark:text-red-400'
  return 'text-gray-600 dark:text-gray-300'
}

function barStyle(value: number | null | undefined): { width: string; marginLeft: string } {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return { width: '0%', marginLeft: '50%' }
  }

  const magnitude = Math.min(Math.abs(value), 5) * 10
  return value >= 0
    ? { width: `${magnitude}%`, marginLeft: '50%' }
    : { width: `${magnitude}%`, marginLeft: `${50 - magnitude}%` }
}

function SectionHeader({ title, eyebrow }: { title: string; eyebrow?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        {eyebrow ? <p className="text-xs font-medium uppercase tracking-wide text-sage-600 dark:text-sage-400">{eyebrow}</p> : null}
        <h2 className="text-lg font-semibold text-gray-950 dark:text-white">{title}</h2>
      </div>
    </div>
  )
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'red' | 'neutral' }) {
  const valueClass =
    tone === 'green'
      ? 'text-green-600 dark:text-green-400'
      : tone === 'red'
        ? 'text-red-600 dark:text-red-400'
        : 'text-gray-950 dark:text-white'

  return (
    <div className="rounded-lg border border-cream-300 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${valueClass}`}>{value}</div>
    </div>
  )
}

function MoveBar({ value }: { value: number | null | undefined }) {
  const style = barStyle(value)
  const color = value !== null && value !== undefined && value < 0 ? 'bg-red-500' : 'bg-green-500'

  return (
    <div className="relative h-2 w-full rounded-full bg-cream-200 dark:bg-gray-800">
      <div className="absolute left-1/2 top-0 h-2 w-px bg-gray-300 dark:bg-gray-600" />
      <div className={`absolute top-0 h-2 rounded-full ${color}`} style={style} />
    </div>
  )
}

function BriefTable({ rows, compact = false }: { rows: PremarketBriefRow[]; compact?: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg border border-cream-300 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-cream-50 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Ticker</th>
              <th className="px-3 py-2 text-right font-medium">Price</th>
              <th className="px-3 py-2 text-right font-medium">Yesterday</th>
              <th className="px-3 py-2 text-right font-medium">After Hours</th>
              <th className="px-3 py-2 text-right font-medium">Pre-Market</th>
              <th className="px-3 py-2 text-right font-medium">5D</th>
              <th className="px-3 py-2 text-right font-medium">10D High</th>
              <th className="px-3 py-2 text-right font-medium">Volume</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-200 dark:divide-gray-800">
            {rows.map((row) => (
              <tr key={row.symbol} className="hover:bg-cream-50/70 dark:hover:bg-gray-800/60">
                <td className="px-3 py-2">
                  <Link href={`/stock/${row.symbol}`} className="font-semibold text-sage-700 dark:text-sage-300">
                    {row.symbol}
                  </Link>
                  {!compact ? <div className="max-w-[180px] truncate text-xs text-gray-500 dark:text-gray-400">{row.name}</div> : null}
                </td>
                <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">{formatPrice(row.price)}</td>
                <td className={`px-3 py-2 text-right font-medium ${pctClass(row.yesterdayChangePct)}`}>{formatPct(row.yesterdayChangePct)}</td>
                <td className={`px-3 py-2 text-right font-medium ${pctClass(row.afterHoursChangePct)}`}>{formatPct(row.afterHoursChangePct)}</td>
                <td className="px-3 py-2 text-right">
                  <div className={`mb-1 font-medium ${pctClass(row.premarketChangePct ?? row.currentChangePct)}`}>
                    {formatPct(row.premarketChangePct ?? row.currentChangePct)}
                  </div>
                  <MoveBar value={row.premarketChangePct ?? row.currentChangePct} />
                </td>
                <td className={`px-3 py-2 text-right font-medium ${pctClass(row.fiveDayChangePct)}`}>{formatPct(row.fiveDayChangePct)}</td>
                <td className={`px-3 py-2 text-right font-medium ${pctClass(row.distanceFromTenDayHighPct)}`}>{formatPct(row.distanceFromTenDayHighPct)}</td>
                <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">{formatCompact(row.volume)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MoversTable({ title, movers, type }: { title: string; movers: PremarketMover[]; type: 'up' | 'down' }) {
  return (
    <div className="rounded-lg border border-cream-300 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="border-b border-cream-300 px-4 py-3 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      </div>
      <div className="divide-y divide-cream-200 dark:divide-gray-800">
        {movers.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No live mover data yet.</div>
        ) : (
          movers.slice(0, 10).map((mover) => (
            <Link
              key={mover.symbol}
              href={`/stock/${mover.symbol}`}
              className="flex items-center justify-between gap-4 px-4 py-2 hover:bg-cream-50 dark:hover:bg-gray-800"
            >
              <div className="min-w-0">
                <div className="font-semibold text-sage-700 dark:text-sage-300">{mover.symbol}</div>
                <div className="truncate text-xs text-gray-500 dark:text-gray-400">{mover.name}</div>
              </div>
              <div className="min-w-[92px] text-right">
                <div className="text-sm text-gray-900 dark:text-gray-100">{formatPrice(mover.price)}</div>
                <div className={`text-sm font-semibold ${type === 'up' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {formatPct(mover.changesPercentage)}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}

function CatalystList({ catalysts }: { catalysts: CatalystItem[] }) {
  return (
    <div className="rounded-lg border border-cream-300 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="border-b border-cream-300 px-4 py-3 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Top Pre-Market Catalysts</h3>
      </div>
      <div className="divide-y divide-cream-200 dark:divide-gray-800">
        {catalysts.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No catalyst headlines available yet.</div>
        ) : (
          catalysts.map((item) => (
            <div key={item.symbol} className="px-4 py-3">
              <div className="mb-1 flex items-center justify-between gap-3">
                <Link href={`/stock/${item.symbol}`} className="font-semibold text-sage-700 dark:text-sage-300">
                  {item.symbol}
                </Link>
                <span className={`text-sm font-semibold ${pctClass(item.changesPercentage)}`}>{formatPct(item.changesPercentage)}</span>
              </div>
              {item.url && item.headline ? (
                <a href={item.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-gray-900 hover:text-sage-700 dark:text-gray-100 dark:hover:text-sage-300">
                  {item.headline}
                </a>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">No obvious fresh headline found from provider news.</p>
              )}
              {item.source ? <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.source}</div> : null}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function SP500Table({ title, rows, type }: { title: string; rows: Array<{ symbol: string; name: string; price: number; changesPercentage: number }>; type: 'up' | 'down' }) {
  return (
    <div className="rounded-lg border border-cream-300 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="border-b border-cream-300 px-4 py-3 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      </div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-cream-200 dark:divide-gray-800">
          {rows.slice(0, 10).map((row) => (
            <tr key={row.symbol} className="hover:bg-cream-50 dark:hover:bg-gray-800">
              <td className="px-4 py-2">
                <Link href={`/stock/${row.symbol}`} className="font-semibold text-sage-700 dark:text-sage-300">{row.symbol}</Link>
                <div className="max-w-[170px] truncate text-xs text-gray-500 dark:text-gray-400">{row.name}</div>
              </td>
              <td className="px-4 py-2 text-right text-gray-900 dark:text-gray-100">{formatPrice(row.price)}</td>
              <td className={`px-4 py-2 text-right font-semibold ${type === 'up' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatPct(row.changesPercentage)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default async function PremarketPage() {
  const brief = await getPremarketBrief()
  const semiStats = brief.semiRead.stats

  return (
    <AppShell
      showFooter
      mainClassName="mx-auto w-full max-w-[1500px] min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8"
    >
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-sage-600 dark:text-sage-400">Market Brief</p>
            <h1 className="text-3xl font-semibold text-gray-950 dark:text-white">Pre-Market Sheet</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-300">
              Generated {formatGeneratedAt(brief.generatedAt)}. Previous regular session: {formatDate(brief.previousTradingDate)}.
              Current trading date: {formatDate(brief.tradingDate)}. Session: {brief.sessionLabel} at {brief.currentTimeET} ET.
            </p>
          </div>
          <div className="rounded-lg border border-cream-300 bg-white px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
            Live source: {brief.dataProviderName} for quotes, with FMP extended-hours movers when available.
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Semi Advancers" value={`${semiStats.advancers}`} tone="green" />
          <StatTile label="Semi Decliners" value={`${semiStats.decliners}`} tone="red" />
          <StatTile label="Avg Semi Pre-Market" value={formatPct(semiStats.averagePremarketPct)} tone={brief.semiRead.tone === 'pullback' ? 'red' : brief.semiRead.tone === 'risk-on' ? 'green' : 'neutral'} />
          <StatTile label="Near 10D High" value={`${semiStats.nearTenDayHighCount}`} />
        </div>

        <section className="mb-8">
          <div className="rounded-lg border border-cream-300 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <div className="mb-2 flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${brief.semiRead.tone === 'pullback' ? 'bg-red-500' : brief.semiRead.tone === 'risk-on' ? 'bg-green-500' : 'bg-yellow-500'}`} />
              <h2 className="text-lg font-semibold text-gray-950 dark:text-white">Semiconductor Read</h2>
            </div>
            <p className="text-sm leading-6 text-gray-700 dark:text-gray-300">{brief.semiRead.summary}</p>
          </div>
        </section>

        <section className="mb-8">
          <SectionHeader title="Index And Futures Setup" eyebrow="Yesterday into overnight" />
          <div className="grid gap-4 xl:grid-cols-2">
            <BriefTable rows={brief.indexRows} compact />
            <BriefTable rows={brief.futuresRows} compact />
          </div>
        </section>

        <section className="mb-8">
          <SectionHeader title="Magnificent 7" eyebrow="Regular session, after hours, pre-market" />
          <BriefTable rows={brief.mag7Rows} />
        </section>

        <section className="mb-8">
          <SectionHeader title="Semiconductor Watch" eyebrow="Topping and pullback clues" />
          <BriefTable rows={brief.semiconductorRows} />
        </section>

        <section className="mb-8">
          <SectionHeader title="Largest Pre-Market Movers" eyebrow="Extended-hours tape" />
          <div className="grid gap-4 lg:grid-cols-3">
            <MoversTable title="Pre-Market Gainers" movers={brief.premarketGainers} type="up" />
            <MoversTable title="Pre-Market Losers" movers={brief.premarketLosers} type="down" />
            <CatalystList catalysts={brief.catalysts} />
          </div>
        </section>

        <section className="mb-8">
          <SectionHeader title="S&P 500 Movers" eyebrow="Current quote snapshot" />
          <div className="grid gap-4 lg:grid-cols-2">
            <SP500Table title="S&P 500 Gainers" rows={brief.sp500Gainers} type="up" />
            <SP500Table title="S&P 500 Losers" rows={brief.sp500Losers} type="down" />
          </div>
        </section>

        <section className="mb-8">
          <SectionHeader title="Yesterday After-Hours Movers" eyebrow="Latest extended-hours lists" />
          <div className="grid gap-4 lg:grid-cols-2">
            <MoversTable title="After-Hours Gainers" movers={brief.afterHoursGainers} type="up" />
            <MoversTable title="After-Hours Losers" movers={brief.afterHoursLosers} type="down" />
          </div>
        </section>

        {brief.marketNews.length > 0 ? (
          <section className="mb-8">
            <SectionHeader title="Market Headlines" eyebrow="Provider news" />
            <div className="grid gap-3 md:grid-cols-2">
              {brief.marketNews.map((item) => (
                <a
                  key={`${item.url}-${item.title}`}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-cream-300 bg-white p-4 hover:border-sage-400 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-sage-500"
                >
                  <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">{item.site || 'News'}</div>
                  <h3 className="text-sm font-semibold leading-5 text-gray-950 dark:text-white">{item.title}</h3>
                </a>
              ))}
            </div>
          </section>
        ) : null}
    </AppShell>
  )
}
