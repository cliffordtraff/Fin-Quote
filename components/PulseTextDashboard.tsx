'use client'

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useTheme } from '@/components/ThemeProvider'
import { useMultiStream } from '@/lib/hooks/use-multi-stream'
import type { LiveStreamState } from '@/lib/hooks/use-live-stream'
import { FullDayCanvas } from '@/components/PulseTodayDashboard'

const SYMBOLS = ['GOOGL', 'AAPL', 'NVDA', 'TSLA'] as const

type SymbolKey = typeof SYMBOLS[number]
type ThemeMode = 'light' | 'dark'
type PulseChartAggregation = '1min' | '5min'

interface DayCandle {
  date: string
  open: number
  high: number
  low: number
  close: number
}

interface DayCandleData {
  candles: DayCandle[]
  previousClose: number | null
  changePct: number | null
}

interface PulseTextNewsItem {
  title: string
  publishedDate: string
  site: string
  url: string
}

interface PulseTextProfile {
  symbol: string
  companyName: string
  description: string
  sector: string | null
  industry: string | null
  exchange: string | null
  fullTimeEmployees: number | null
  ipoDate: string | null
  country: string | null
  city: string | null
}

interface PulseTextContext {
  news: PulseTextNewsItem[]
  profile: PulseTextProfile | null
}

interface CopyBlock {
  kicker: string
  title: string
  body: string
}

interface SymbolMeta {
  name: string
  accent: string
  soft: string
  glow: string
  gradient: string
  editorialLabel: string
  fallbackNews: string[]
  fallbackFacts: string[]
}

const SYMBOL_META: Record<SymbolKey, SymbolMeta> = {
  GOOGL: {
    name: 'Alphabet',
    accent: '#2563eb',
    soft: 'rgba(37, 99, 235, 0.16)',
    glow: 'rgba(37, 99, 235, 0.28)',
    gradient: 'linear-gradient(135deg, rgba(37,99,235,0.22), rgba(56,189,248,0.10) 45%, rgba(250,204,21,0.08))',
    editorialLabel: 'Search, cloud, and platform gravity',
    fallbackNews: [
      'Search monetization narrative remains the center of gravity',
      'Cloud profitability stays in focus when the tape firms up',
      'AI product cadence keeps the equity in conversation',
    ],
    fallbackFacts: [
      'Built around search, ads, cloud, and a broad platform stack.',
      'The chart works well for “ecosystem” storytelling because multiple engines matter at once.',
      'Its intraday narrative often toggles between AI optimism and ad-spend skepticism.',
    ],
  },
  AAPL: {
    name: 'Apple',
    accent: '#0f766e',
    soft: 'rgba(15, 118, 110, 0.16)',
    glow: 'rgba(15, 118, 110, 0.28)',
    gradient: 'linear-gradient(135deg, rgba(15,118,110,0.20), rgba(45,212,191,0.08) 45%, rgba(251,191,36,0.08))',
    editorialLabel: 'Ecosystem durability and margin discipline',
    fallbackNews: [
      'Hardware replacement-cycle headlines keep pulling on the tape',
      'Services mix usually becomes the “quality” frame inside the move',
      'Supply-chain or China headlines can reshape the whole chart mood quickly',
    ],
    fallbackFacts: [
      'The product story and the cash-flow story are both legible in one frame.',
      'This name is good for testing premium, calm, and editorial annotation styles.',
      'It supports “quiet power” overlays better than loud, high-volatility treatments.',
    ],
  },
  NVDA: {
    name: 'NVIDIA',
    accent: '#65a30d',
    soft: 'rgba(101, 163, 13, 0.16)',
    glow: 'rgba(101, 163, 13, 0.28)',
    gradient: 'linear-gradient(135deg, rgba(101,163,13,0.22), rgba(34,197,94,0.10) 45%, rgba(245,158,11,0.08))',
    editorialLabel: 'AI infrastructure as pure momentum theater',
    fallbackNews: [
      'Every headline tends to get translated into AI demand language',
      'Capex, supply, and hyperscaler spend cues dominate the story layer',
      'This is the cleanest canvas for high-energy annotation experiments',
    ],
    fallbackFacts: [
      'Strong momentum names let text behave more like live commentary than labels.',
      'Its chart can support dense story overlays without losing the sense of urgency.',
      'It is ideal for testing glow, pulse, and kinetic copy treatments.',
    ],
  },
  TSLA: {
    name: 'Tesla',
    accent: '#dc2626',
    soft: 'rgba(220, 38, 38, 0.16)',
    glow: 'rgba(220, 38, 38, 0.28)',
    gradient: 'linear-gradient(135deg, rgba(220,38,38,0.22), rgba(248,113,113,0.10) 45%, rgba(251,191,36,0.08))',
    editorialLabel: 'Narrative volatility and reflexive price action',
    fallbackNews: [
      'The headline layer often overwhelms the fundamentals layer intraday',
      'Macro, EV demand, and personality-driven narratives all hit the same tape',
      'Good symbol for testing louder copy treatments and stronger contrast',
    ],
    fallbackFacts: [
      'This is the best candidate for dramatic, tabloid, and high-contrast chart text.',
      'Story density is part of the product challenge here, not just a side effect.',
      'It rewards layouts that can separate signal, narrative, and spectacle.',
    ],
  },
}

const EMPTY_STREAM: LiveStreamState = {
  candles: [],
  liveCandle: undefined,
  lastPrice: null,
  lastChange: null,
  lastChangePct: null,
  previousClose: null,
  dayHigh: null,
  dayLow: null,
  connected: false,
  error: null,
}

function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--'
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatPct(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function formatCompactNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--'
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function shorten(text: string | null | undefined, limit = 120) {
  if (!text) return ''
  if (text.length <= limit) return text
  return `${text.slice(0, limit).trimEnd()}...`
}

function formatNewsTime(value: string | null | undefined) {
  if (!value) return 'Now'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Now'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function sortCandles(candles: DayCandle[]) {
  return [...candles].sort((a, b) => a.date.localeCompare(b.date))
}

function useDayCandles(symbols: readonly string[]): Record<string, DayCandleData> {
  const [data, setData] = useState<Record<string, DayCandleData>>({})

  useEffect(() => {
    let cancelled = false

    async function fetchAll() {
      const results = await Promise.allSettled(
        symbols.map(async (symbol) => {
          const res = await fetch(`/api/stock-intraday/${symbol}?interval=1`)
          if (!res.ok) return null
          return { symbol, json: await res.json() }
        }),
      )

      if (cancelled) return

      const next: Record<string, DayCandleData> = {}
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          const candles = sortCandles((result.value.json.todayOHLC ?? []) as DayCandle[])
          const previousClose = result.value.json.previousClose ?? null
          const lastClose = candles[candles.length - 1]?.close ?? null
          const changePct = previousClose && lastClose
            ? ((lastClose - previousClose) / previousClose) * 100
            : null

          next[result.value.symbol] = {
            candles,
            previousClose,
            changePct,
          }
        }
      }

      setData(next)
    }

    fetchAll()
    const id = window.setInterval(fetchAll, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [symbols])

  return data
}

function usePulseTextContext(symbol: SymbolKey) {
  const [context, setContext] = useState<PulseTextContext | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    fetch(`/api/pulse-text-context/${symbol}`)
      .then(async (res) => {
        if (!res.ok) return null
        return res.json() as Promise<PulseTextContext>
      })
      .then((data) => {
        if (cancelled) return
        setContext(data)
      })
      .catch(() => {
        if (!cancelled) setContext(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [symbol])

  return { context, loading }
}

function cycleStyle(index: number, total: number, duration = 14): CSSProperties {
  const slice = duration / Math.max(total, 1)
  return {
    animationDelay: `${(slice * index).toFixed(2)}s`,
    animationDuration: `${duration}s`,
  }
}

function useSymbolNarrative(
  symbol: SymbolKey,
  dayData: DayCandleData | undefined,
  stream: LiveStreamState,
  context: PulseTextContext | null,
) {
  return useMemo(() => {
    const meta = SYMBOL_META[symbol]
    const candles = dayData?.candles ?? []
    const previousClose = dayData?.previousClose ?? stream.previousClose ?? null
    const lastPrice = stream.lastPrice ?? candles[candles.length - 1]?.close ?? null
    const open = candles[0]?.open ?? null
    const changePct = stream.lastChangePct ?? dayData?.changePct ?? null
    const dayHigh = stream.dayHigh ?? (candles.length > 0 ? Math.max(...candles.map((c) => c.high)) : null)
    const dayLow = stream.dayLow ?? (candles.length > 0 ? Math.min(...candles.map((c) => c.low)) : null)
    const rangePct = previousClose && dayHigh !== null && dayLow !== null
      ? ((dayHigh - dayLow) / previousClose) * 100
      : null
    const distanceToHighPct = lastPrice !== null && dayHigh !== null && dayHigh !== 0
      ? ((dayHigh - lastPrice) / dayHigh) * 100
      : null
    const distanceToLowPct = lastPrice !== null && dayLow !== null && lastPrice !== 0
      ? ((lastPrice - dayLow) / lastPrice) * 100
      : null
    const sessionDriftPct = lastPrice !== null && open !== null && open !== 0
      ? ((lastPrice - open) / open) * 100
      : null
    const locationInRange = lastPrice !== null && dayHigh !== null && dayLow !== null && dayHigh !== dayLow
      ? ((lastPrice - dayLow) / (dayHigh - dayLow)) * 100
      : null
    const positionLabel = locationInRange !== null
      ? locationInRange >= 67
        ? 'upper third'
        : locationInRange <= 33
          ? 'lower third'
          : 'middle third'
      : 'forming'

    const news = context?.news?.length
      ? context.news
      : meta.fallbackNews.map((title) => ({
          title,
          publishedDate: '',
          site: 'Demo',
          url: '#',
        }))

    const companyName = context?.profile?.companyName || meta.name
    const profileDescription = shorten(context?.profile?.description, 180) || meta.editorialLabel
    const profileBits = [
      context?.profile?.sector ? `Sector: ${context.profile.sector}` : null,
      context?.profile?.industry ? `Industry: ${context.profile.industry}` : null,
      context?.profile?.exchange ? `Exchange: ${context.profile.exchange}` : null,
      context?.profile?.country ? `Based in ${context.profile.country}` : null,
      context?.profile?.fullTimeEmployees ? `${formatCompactNumber(context.profile.fullTimeEmployees)} employees` : null,
      context?.profile?.ipoDate ? `IPO ${context.profile.ipoDate}` : null,
    ].filter(Boolean) as string[]

    const funFacts = Array.from(new Set([
      ...(profileBits.length > 0 ? profileBits : meta.fallbackFacts),
      ...meta.fallbackFacts,
    ])).slice(0, 5)

    const metricBlocks: CopyBlock[] = [
      {
        kicker: 'Range',
        title: rangePct !== null ? `${rangePct.toFixed(2)}%` : '--',
        body: 'Session expansion. This wants a structural frame, not a news frame.',
      },
      {
        kicker: 'Open Drift',
        title: sessionDriftPct !== null ? formatPct(sessionDriftPct) : '--',
        body: 'Move from the open. Good candidate for a bottom-third subtitle treatment.',
      },
      {
        kicker: 'Distance To HOD',
        title: distanceToHighPct !== null ? `${distanceToHighPct.toFixed(2)}%` : '--',
        body: 'Use this when you want the chart to feel like it is leaning into a ceiling.',
      },
      {
        kicker: 'Location',
        title: locationInRange !== null ? `${locationInRange.toFixed(0)} / 100` : '--',
        body: 'Turns the day into a spatial story: upper shelf, middle chop, or low-stress near the floor.',
      },
    ]

    const tradingFacts: CopyBlock[] = [
      {
        kicker: 'Today',
        title: `${symbol} is ${changePct !== null && changePct >= 0 ? 'working higher' : 'leaning lower'}`,
        body: changePct !== null
          ? `Trading ${formatPct(changePct)} versus prior close with ${rangePct !== null ? `${rangePct.toFixed(2)}% session range.` : 'range still forming.'}`
          : 'The tape is still warming up; keep the copy light until the structure firms up.',
      },
      {
        kicker: 'Pressure',
        title: distanceToHighPct !== null && distanceToHighPct < 0.35 ? 'Crowding the high of day' : 'Still carrying headroom',
        body: distanceToHighPct !== null
          ? `${distanceToHighPct.toFixed(2)}% from HOD and ${distanceToLowPct?.toFixed(2) ?? '--'}% from LOD.`
          : 'No clean read on pressure yet.',
      },
      {
        kicker: 'Design Use',
        title: 'These lines belong on the tape itself',
        body: 'This treatment is for compact, decision-support copy: one fact, one emotion, one clear placement.',
      },
    ]

    return {
      meta,
      companyName,
      profileDescription,
      profileBits,
      news: news.slice(0, 3),
      funFacts,
      metricBlocks,
      tradingFacts,
      changePct,
      lastPrice,
      previousClose,
      dayHigh,
      dayLow,
      rangePct,
      distanceToHighPct,
      distanceToLowPct,
      sessionDriftPct,
      locationInRange,
      positionLabel,
    }
  }, [context, dayData, stream, symbol])
}

function ExperimentCardShell({
  eyebrow,
  title,
  body,
  accent,
  children,
  className = '',
}: {
  eyebrow: string
  title: string
  body: string
  accent: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={`rounded-[28px] border border-gray-200/80 bg-white/90 p-4 shadow-[0_20px_70px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-gray-900/80 ${className}`}
      style={{ boxShadow: `0 24px 90px color-mix(in srgb, ${accent} 16%, transparent)` }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500 dark:text-gray-400">
            {eyebrow}
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
        </div>
        <div
          className="mt-1 h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: accent, boxShadow: `0 0 18px ${accent}` }}
        />
      </div>
      <p className="mb-4 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-300">{body}</p>
      {children}
    </section>
  )
}

function ChartStage({
  dayData,
  narrative,
  theme,
  glow,
  chartAggregation,
  chartLineMode,
  children,
  minHeight = 320,
}: {
  dayData: DayCandleData | undefined
  narrative: ReturnType<typeof useSymbolNarrative>
  theme: ThemeMode
  glow: string
  chartAggregation: PulseChartAggregation
  chartLineMode: boolean
  children: ReactNode
  minHeight?: number
}) {
  const isDark = theme === 'dark'
  const chartHeight = minHeight

  return (
    <div
      className="relative overflow-hidden rounded-[24px] border border-gray-200/80 bg-white dark:border-gray-700 dark:bg-gray-900"
      style={{
        height: chartHeight,
      }}
    >
      <div className="absolute inset-0 z-0">
        <FullDayCanvas
          candles={dayData?.candles ?? []}
          previousClose={dayData?.previousClose ?? narrative.previousClose}
          lastPrice={narrative.lastPrice}
          dayHigh={narrative.dayHigh}
          dayLow={narrative.dayLow}
          lineMode={chartLineMode}
          aggregation={chartAggregation}
          theme={theme}
          chartHeight={chartHeight}
        />
      </div>
      <div
        className="pointer-events-none absolute inset-x-6 top-6 z-10 h-24 rounded-full blur-3xl"
        style={{ background: glow, opacity: isDark ? 0.5 : 0.24 }}
      />
      <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent_22%,transparent_72%,rgba(15,23,42,0.12))] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.05),transparent_24%,transparent_74%,rgba(2,6,23,0.42))]" />
      {children}
    </div>
  )
}

interface EditorialVariant {
  id: string
  eyebrow: string
  cardTitle: string
  cardBody: string
  word: string
  heroTag: string
  heroTitle: string
  heroBody: string
  railTitle: string
  railItems: { label: string; value: string }[]
  footer: string
  notes: string[]
  rotationLabel: string
  chartAggregation: PulseChartAggregation
  chartLineMode: boolean
  chip?: string
  quote?: string
  stat?: string
  align?: 'top' | 'bottom'
  minHeight?: number
  fullWidth?: boolean
}

function buildEditorialVariants(narrative: ReturnType<typeof useSymbolNarrative>, symbol: SymbolKey): EditorialVariant[] {
  const latestNews = narrative.news[0]
  const moreNews = narrative.news.slice(1).map((item) => `${item.site || 'News'}: ${shorten(item.title, 68)}`)
  const commonRail = [
    { label: 'Last', value: formatPrice(narrative.lastPrice) },
    { label: 'Prev Close', value: formatPrice(narrative.previousClose) },
    { label: 'Range', value: narrative.rangePct !== null ? `${narrative.rangePct.toFixed(2)}%` : '--' },
  ]

  return [
    {
      id: 'cover-story',
      eyebrow: 'Version 01',
      cardTitle: 'Cover Story',
      cardBody: 'The baseline editorial version: large headline, restrained right rail, and a chart that behaves like mood and evidence at the same time.',
      word: 'Cover',
      heroTag: 'Editorial Hero',
      heroTitle: narrative.meta.editorialLabel,
      heroBody: `${narrative.companyName} works well for this because the market already trades it like a narrative object, not just a line on a chart.`,
      railTitle: 'Session Markers',
      railItems: [
        ...commonRail,
        { label: 'Position', value: narrative.positionLabel },
      ],
      footer: 'Use this when the copy is the product and the chart is there to keep the prose honest.',
      notes: [
        `Change ${formatPct(narrative.changePct)}`,
        `Day high ${formatPrice(narrative.dayHigh)}`,
        `Day low ${formatPrice(narrative.dayLow)}`,
      ],
      rotationLabel: 'Supporting lines',
      chartAggregation: '5min',
      chartLineMode: true,
      chip: narrative.companyName,
      align: 'bottom',
      minHeight: 460,
      fullWidth: true,
    },
    {
      id: 'news-lead',
      eyebrow: 'Version 02',
      cardTitle: 'News Lead',
      cardBody: 'This keeps the editorial language but turns the chart into a front page. The lead headline is literal, the right rail is metadata, and the lower band is supporting coverage.',
      word: 'News',
      heroTag: 'Lead Story',
      heroTitle: shorten(latestNews?.title, 92) || `${narrative.companyName} is back in the headline cycle`,
      heroBody: 'If recent news is the text source, this is the cleanest mapping: one lead line, one deck, and a few supporting bullets that live like cover lines.',
      railTitle: 'News Desk',
      railItems: [
        { label: 'Source', value: latestNews?.site || 'Market feed' },
        { label: 'Published', value: formatNewsTime(latestNews?.publishedDate) },
        { label: 'Last', value: formatPrice(narrative.lastPrice) },
        { label: 'Change', value: formatPct(narrative.changePct) },
      ],
      footer: 'Good for headline-heavy names where the text itself should feel immediate and time-stamped.',
      notes: moreNews.length > 0 ? moreNews : [
        'Second headline becomes the lower-third support line.',
        'Third headline can rotate in as a competing angle.',
        'Source and publish time belong in the rail, not the hero.',
      ],
      rotationLabel: 'Secondary coverage',
      chartAggregation: '1min',
      chartLineMode: false,
      chip: `${symbol} News`,
      align: 'top',
      minHeight: 420,
    },
    {
      id: 'transcript-voice',
      eyebrow: 'Version 03',
      cardTitle: 'Transcript Voice',
      cardBody: 'This version imagines earnings-call excerpts embedded into the editorial system. The quote gets the hero slot, and the explanatory context moves into the deck and side rail.',
      word: 'Voice',
      heroTag: 'Call Mode',
      heroTitle: 'Management language can become the headline',
      heroBody: 'Instead of treating transcript excerpts like annotations, this layout promotes them into cover copy. Guidance, demand, margin, and capex can each own a different card.',
      railTitle: 'Transcript Slots',
      railItems: [
        { label: 'Open', value: 'Prepared remarks' },
        { label: 'Middle', value: 'Guidance change' },
        { label: 'Close', value: 'Q&A tension' },
        { label: 'Backdrop', value: narrative.positionLabel },
      ],
      footer: 'Use the chart as emotional context while the quote itself carries the narrative weight.',
      notes: [
        'Prepared remarks as headline',
        'Guidance line as deck',
        'Analyst question as sidebar',
      ],
      rotationLabel: 'Quote treatments',
      chartAggregation: '5min',
      chartLineMode: false,
      chip: `${symbol} Call`,
      quote: narrative.profileDescription,
      align: 'bottom',
      minHeight: 440,
    },
    {
      id: 'numbers-issue',
      eyebrow: 'Version 04',
      cardTitle: 'Numbers Issue',
      cardBody: 'This is the stat-led editorial take. One big number anchors the story, then the deck explains why that number matters to the session.',
      word: 'Data',
      heroTag: 'Numbers',
      heroTitle: 'Let the tape be summarized by one hard number',
      heroBody: 'Good for sessions where one metric should own the story: range expansion, open drift, distance to HOD, or where price is sitting inside the day range.',
      railTitle: 'Data Rail',
      railItems: [
        { label: 'Open Drift', value: formatPct(narrative.sessionDriftPct) },
        { label: 'To HOD', value: narrative.distanceToHighPct !== null ? `${narrative.distanceToHighPct.toFixed(2)}%` : '--' },
        { label: 'To LOD', value: narrative.distanceToLowPct !== null ? `${narrative.distanceToLowPct.toFixed(2)}%` : '--' },
        { label: 'Position', value: narrative.positionLabel },
      ],
      footer: 'This is the version to use when you want the editorial treatment without losing analytical density.',
      notes: narrative.metricBlocks.map((block) => `${block.kicker}: ${block.title}`),
      rotationLabel: 'Metric overlays',
      chartAggregation: '1min',
      chartLineMode: false,
      chip: `${symbol} Metrics`,
      stat: narrative.rangePct !== null ? `${narrative.rangePct.toFixed(2)}%` : formatPct(narrative.changePct),
      align: 'top',
      minHeight: 430,
    },
    {
      id: 'tape-brief',
      eyebrow: 'Version 05',
      cardTitle: 'Tape Brief',
      cardBody: 'A market-brief version of the editorial style. Instead of company identity or headlines, the card is driven by what the stock is doing right now.',
      word: 'Tape',
      heroTag: 'Market Brief',
      heroTitle: `${symbol} is trading in the ${narrative.positionLabel}`,
      heroBody: narrative.rangePct !== null
        ? `The session has stretched ${narrative.rangePct.toFixed(2)}% so far. Price is ${narrative.distanceToHighPct?.toFixed(2) ?? '--'}% from HOD and ${narrative.distanceToLowPct?.toFixed(2) ?? '--'}% from LOD.`
        : 'The tape is still forming, so this version should stay sparse until the structure becomes real.',
      railTitle: 'Tape Read',
      railItems: [
        { label: 'Last', value: formatPrice(narrative.lastPrice) },
        { label: 'Change', value: formatPct(narrative.changePct) },
        { label: 'High', value: formatPrice(narrative.dayHigh) },
        { label: 'Low', value: formatPrice(narrative.dayLow) },
      ],
      footer: 'Best for intraday storytelling, market summaries, and “what matters right now” overlays.',
      notes: narrative.tradingFacts.map((block) => `${block.kicker}: ${block.title}`),
      rotationLabel: 'Live observations',
      chartAggregation: '1min',
      chartLineMode: true,
      chip: `${symbol} Brief`,
      align: 'bottom',
      minHeight: 430,
    },
    {
      id: 'identity-feature',
      eyebrow: 'Version 06',
      cardTitle: 'Identity Feature',
      cardBody: 'This turns company context into the editorial system. It is less about what happened in the last fifteen minutes and more about what kind of story this symbol naturally wants to tell.',
      word: 'Lore',
      heroTag: 'Identity',
      heroTitle: `${narrative.companyName} as a chart-story canvas`,
      heroBody: narrative.profileDescription,
      railTitle: 'Company File',
      railItems: [
        { label: 'Theme', value: narrative.meta.name },
        { label: 'Sector', value: narrative.profileBits[0]?.replace('Sector: ', '') || '--' },
        { label: 'Industry', value: narrative.profileBits[1]?.replace('Industry: ', '') || '--' },
        { label: 'IPO', value: narrative.profileBits.find((bit) => bit.startsWith('IPO '))?.replace('IPO ', '') || '--' },
      ],
      footer: 'This is the slower, more atmospheric version for fun facts, company identity, and long-lived explanatory copy.',
      notes: narrative.funFacts,
      rotationLabel: 'Ambient context',
      chartAggregation: '5min',
      chartLineMode: true,
      chip: `${symbol} Identity`,
      align: 'top',
      minHeight: 420,
    },
  ]
}

interface EditorialOverlayLayout {
  badges: string
  ghost: string
  hero: string
  rail: string
  notes: string
  footer: string
  scrim: string
  quote?: string
  stat?: string
}

const EDITORIAL_OVERLAY_LAYOUTS: Record<string, EditorialOverlayLayout> = {
  'cover-story': {
    badges: 'left-5 top-5 sm:left-8 sm:top-8',
    ghost: 'left-4 top-14 sm:left-8 sm:top-16 text-[clamp(74px,15vw,210px)]',
    hero: 'left-5 right-5 bottom-5 sm:left-8 sm:right-[292px] sm:bottom-8 lg:max-w-[620px]',
    rail: 'hidden lg:block right-6 top-6 w-[224px]',
    notes: 'hidden md:block left-5 top-24 sm:left-8 sm:top-28 w-[260px]',
    footer: 'hidden lg:block right-6 bottom-6 w-[220px]',
    scrim: 'bg-[linear-gradient(125deg,rgba(255,255,255,0.52)_0%,rgba(255,255,255,0.14)_38%,transparent_70%)] dark:bg-[linear-gradient(125deg,rgba(8,12,20,0.82)_0%,rgba(8,12,20,0.32)_42%,transparent_72%)]',
  },
  'news-lead': {
    badges: 'left-5 top-5 sm:left-8 sm:top-8',
    ghost: 'right-4 top-10 sm:right-8 sm:top-12 text-[clamp(66px,13vw,156px)]',
    hero: 'left-5 right-5 top-24 sm:left-8 sm:right-[282px] sm:top-28 lg:max-w-[560px]',
    rail: 'hidden lg:block right-6 top-6 w-[220px]',
    notes: 'left-5 right-5 bottom-6 sm:left-8 sm:right-auto sm:w-[320px]',
    footer: 'hidden md:block right-5 bottom-6 sm:right-8 sm:w-[220px]',
    scrim: 'bg-[linear-gradient(150deg,rgba(255,255,255,0.54)_0%,rgba(255,255,255,0.16)_35%,transparent_66%)] dark:bg-[linear-gradient(150deg,rgba(8,12,20,0.84)_0%,rgba(8,12,20,0.36)_36%,transparent_70%)]',
  },
  'transcript-voice': {
    badges: 'left-5 top-5 sm:left-8 sm:top-8',
    ghost: 'left-1/2 top-8 -translate-x-1/2 text-[clamp(70px,14vw,174px)]',
    hero: 'left-5 right-5 bottom-6 sm:left-8 sm:right-[292px] sm:bottom-8 lg:max-w-[560px]',
    rail: 'hidden lg:block right-6 top-1/2 w-[220px] -translate-y-1/2',
    notes: 'hidden md:block right-6 top-24 w-[240px]',
    footer: 'hidden lg:block right-6 bottom-6 w-[220px]',
    quote: 'left-5 right-5 top-20 sm:left-8 sm:right-auto sm:w-[360px]',
    scrim: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.34)_0%,transparent_34%,rgba(255,255,255,0.16)_100%)] dark:bg-[linear-gradient(180deg,rgba(8,12,20,0.80)_0%,transparent_34%,rgba(8,12,20,0.34)_100%)]',
  },
  'numbers-issue': {
    badges: 'right-5 top-5 sm:right-8 sm:top-8',
    ghost: 'left-4 top-12 sm:left-8 sm:top-16 text-[clamp(64px,14vw,164px)]',
    hero: 'left-5 right-5 bottom-6 sm:left-8 sm:right-[286px] sm:bottom-8 lg:max-w-[520px]',
    rail: 'hidden lg:block right-5 top-20 sm:right-8 sm:top-24 w-[220px]',
    notes: 'hidden md:block md:right-8 md:bottom-8 md:w-[252px]',
    footer: 'hidden md:block left-5 top-5 sm:left-8 sm:top-8 w-[200px]',
    stat: 'left-5 top-20 sm:left-8 sm:top-24',
    scrim: 'bg-[linear-gradient(140deg,rgba(255,255,255,0.46)_0%,rgba(255,255,255,0.10)_32%,transparent_64%)] dark:bg-[linear-gradient(140deg,rgba(8,12,20,0.82)_0%,rgba(8,12,20,0.24)_34%,transparent_66%)]',
  },
  'tape-brief': {
    badges: 'left-5 top-5 sm:left-8 sm:top-8',
    ghost: 'right-4 bottom-8 sm:right-8 sm:bottom-10 text-[clamp(72px,14vw,186px)]',
    hero: 'left-5 right-5 bottom-6 sm:left-8 sm:right-[292px] sm:bottom-8',
    rail: 'hidden lg:block right-6 top-6 w-[220px]',
    notes: 'left-5 right-5 top-24 sm:left-8 sm:right-auto sm:w-[300px]',
    footer: 'hidden lg:block right-6 bottom-6 w-[220px]',
    scrim: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.42)_0%,transparent_38%,rgba(255,255,255,0.24)_100%)] dark:bg-[linear-gradient(180deg,rgba(8,12,20,0.76)_0%,transparent_40%,rgba(8,12,20,0.40)_100%)]',
  },
  'identity-feature': {
    badges: 'right-5 top-5 sm:right-8 sm:top-8',
    ghost: 'left-5 top-16 sm:left-8 sm:top-20 text-[clamp(68px,14vw,170px)]',
    hero: 'left-5 right-5 top-24 sm:left-8 sm:right-[302px] sm:top-28 lg:max-w-[520px]',
    rail: 'hidden lg:block right-6 bottom-6 w-[230px]',
    notes: 'left-5 right-5 bottom-6 sm:left-8 sm:right-auto sm:w-[320px]',
    footer: 'hidden md:block right-5 top-20 sm:right-8 sm:top-24 w-[220px]',
    scrim: 'bg-[linear-gradient(145deg,rgba(255,255,255,0.50)_0%,rgba(255,255,255,0.16)_34%,transparent_66%)] dark:bg-[linear-gradient(145deg,rgba(8,12,20,0.82)_0%,rgba(8,12,20,0.30)_34%,transparent_68%)]',
  },
}

function OverlayTextBlock({
  className = '',
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`pointer-events-none absolute z-20 ${className}`}>
      {children}
    </div>
  )
}

function ModernEditorialVariantCard({
  narrative,
  dayData,
  theme,
  variant,
}: {
  narrative: ReturnType<typeof useSymbolNarrative>
  dayData: DayCandleData | undefined
  theme: ThemeMode
  variant: EditorialVariant
}) {
  const layout = EDITORIAL_OVERLAY_LAYOUTS[variant.id] ?? EDITORIAL_OVERLAY_LAYOUTS['cover-story']
  const rotatingNotes = variant.notes.slice(0, 2)
  const rotationDuration = Math.max(16, rotatingNotes.length * 4.6)
  const headlineText = theme === 'dark'
    ? 'text-white [text-shadow:0_3px_18px_rgba(0,0,0,0.7)]'
    : 'text-slate-950 [text-shadow:0_2px_14px_rgba(255,255,255,0.9)]'
  const supportingText = theme === 'dark'
    ? 'text-white/78 [text-shadow:0_2px_14px_rgba(0,0,0,0.68)]'
    : 'text-slate-700 [text-shadow:0_2px_12px_rgba(255,255,255,0.92)]'
  const labelText = theme === 'dark'
    ? 'text-white/55 [text-shadow:0_2px_12px_rgba(0,0,0,0.62)]'
    : 'text-slate-600 [text-shadow:0_2px_12px_rgba(255,255,255,0.9)]'
  const railItems = variant.railItems.slice(0, variant.fullWidth ? 3 : 2)

  return (
    <ExperimentCardShell
      eyebrow={variant.eyebrow}
      title={variant.cardTitle}
      body={variant.cardBody}
      accent={narrative.meta.accent}
      className={variant.fullWidth ? 'xl:col-span-2' : ''}
    >
      <ChartStage
        dayData={dayData}
        narrative={narrative}
        theme={theme}
        glow={narrative.meta.glow}
        chartAggregation={variant.chartAggregation}
        chartLineMode={variant.chartLineMode}
        minHeight={variant.minHeight ?? 390}
      >
        <div className={`pointer-events-none absolute z-20 flex flex-wrap gap-x-3 gap-y-1 ${layout.badges}`}>
          <div className={`text-[10px] font-semibold uppercase tracking-[0.28em] ${labelText}`}>
            {variant.chip || narrative.companyName}
          </div>
          <div className={`text-[10px] font-medium uppercase tracking-[0.22em] ${labelText}`}>
            {variant.heroTag}
          </div>
          <div className={`text-[10px] font-medium uppercase tracking-[0.22em] ${labelText}`}>
            Pulse {variant.chartAggregation === '1min' ? '1m' : '5m'} {variant.chartLineMode ? 'Line' : 'Candles'}
          </div>
        </div>

        <div
          className={`pointer-events-none absolute font-semibold uppercase leading-none text-black/8 dark:text-white/8 ${layout.ghost}`}
          style={{ fontFamily: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif' }}
        >
          {variant.word}
        </div>

        {variant.stat && layout.stat && (
          <OverlayTextBlock className={layout.stat}>
            <div className={`text-[10px] font-semibold uppercase tracking-[0.24em] ${labelText}`}>
              {variant.heroTag}
            </div>
            <div className={`mt-2 text-[clamp(44px,6vw,72px)] font-semibold leading-none ${headlineText}`}>
              {variant.stat}
            </div>
          </OverlayTextBlock>
        )}

        {variant.quote && layout.quote && (
          <OverlayTextBlock className={layout.quote}>
            <div className={`text-[10px] font-semibold uppercase tracking-[0.22em] ${labelText}`}>
              Embedded Quote
            </div>
            <blockquote
              className={`mt-3 text-lg font-medium leading-7 ${headlineText}`}
              style={{ fontFamily: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif' }}
            >
              "{shorten(variant.quote, 120)}"
            </blockquote>
          </OverlayTextBlock>
        )}

        <OverlayTextBlock className={layout.hero}>
          <div className={`text-[10px] font-semibold uppercase tracking-[0.24em] ${labelText}`}>
            {variant.heroTag}
          </div>
          {!layout.quote && variant.quote && (
            <blockquote
              className={`mt-3 max-w-[420px] text-xl font-medium leading-8 ${headlineText}`}
              style={{ fontFamily: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif' }}
            >
              "{shorten(variant.quote, 120)}"
            </blockquote>
          )}
          <div
            className={`mt-3 max-w-[560px] text-[clamp(28px,4vw,54px)] font-semibold leading-[0.98] ${headlineText}`}
            style={{ fontFamily: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif' }}
          >
            {variant.heroTitle}
          </div>
          <p
            className={`mt-3 max-w-[420px] text-sm leading-6 ${supportingText}`}
            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          >
            {variant.heroBody}
          </p>
        </OverlayTextBlock>

        <OverlayTextBlock className={layout.rail}>
          <div className={`text-[10px] font-semibold uppercase tracking-[0.24em] ${labelText}`}>
            {variant.railTitle}
          </div>
          <div className="mt-3 space-y-2">
            {railItems.map((item) => (
              <div key={item.label}>
                <div className={`text-[10px] uppercase tracking-[0.2em] ${labelText}`}>{item.label}</div>
                <div className={`mt-0.5 text-base font-semibold ${headlineText}`}>{item.value}</div>
              </div>
            ))}
          </div>
        </OverlayTextBlock>

        {rotatingNotes.length > 0 && (
          <div className={`absolute z-20 ${layout.notes}`}>
            <div className={`mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] ${labelText}`}>
              {variant.rotationLabel}
            </div>
            <div className="relative h-[64px]">
              {rotatingNotes.map((note, index) => (
                <div
                  key={`${variant.id}-${index}-${note}`}
                  className="pulse-text-cycle absolute inset-0"
                  style={cycleStyle(index, rotatingNotes.length, rotationDuration)}
                >
                  <div
                    className={`max-w-[320px] text-sm leading-6 ${supportingText}`}
                    style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                  >
                    {note}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </ChartStage>
    </ExperimentCardShell>
  )
}

export default function PulseTextDashboard() {
  const { theme: rawTheme } = useTheme()
  const theme = (rawTheme === 'dark' ? 'dark' : 'light') as ThemeMode
  const [selectedSymbol, setSelectedSymbol] = useState<SymbolKey>('GOOGL')

  const streams = useMultiStream([...SYMBOLS], '1s')
  const dayMap = useDayCandles(SYMBOLS)
  const { context, loading } = usePulseTextContext(selectedSymbol)

  const stream = streams[selectedSymbol] ?? EMPTY_STREAM
  const dayData = dayMap[selectedSymbol]
  const narrative = useSymbolNarrative(selectedSymbol, dayData, stream, context)
  const editorialVariants = useMemo(
    () => buildEditorialVariants(narrative, selectedSymbol),
    [narrative, selectedSymbol],
  )

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[32px] border border-gray-200/80 bg-white/90 shadow-[0_32px_120px_rgba(15,23,42,0.10)] dark:border-white/10 dark:bg-gray-900/85">
        <div
          className="relative overflow-hidden px-6 py-6 sm:px-8"
          style={{ background: narrative.meta.gradient }}
        >
          <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.22),transparent_58%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_58%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex rounded-full border border-white/40 bg-white/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-gray-600 backdrop-blur-md dark:border-white/10 dark:bg-white/8 dark:text-gray-300">
                Pulse Text on Pulse Charts
              </div>
              <h1 className="max-w-2xl text-3xl font-semibold leading-tight text-gray-900 dark:text-white sm:text-4xl">
                The actual Pulse Today chart, six annotation treatments.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-gray-700 dark:text-gray-300">
                These versions now use the real Pulse Today canvas. The experiment is how editorial text,
                transcript copy, news, and metrics behave when they sit directly on top of the current pulse chart.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-[24px] border border-white/35 bg-white/55 p-4 backdrop-blur-md dark:border-white/10 dark:bg-white/6 sm:grid-cols-4">
              {[
                { label: 'Last', value: formatPrice(narrative.lastPrice) },
                { label: 'Change', value: formatPct(narrative.changePct) },
                { label: 'Range', value: narrative.rangePct !== null ? `${narrative.rangePct.toFixed(2)}%` : '--' },
                { label: 'Variants', value: loading ? 'Loading...' : `${editorialVariants.length} layouts` },
              ].map((item) => (
                <div key={item.label}>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">{item.label}</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative mt-6 flex flex-wrap gap-2">
            {SYMBOLS.map((symbol) => {
              const active = symbol === selectedSymbol
              return (
                <button
                  key={symbol}
                  onClick={() => setSelectedSymbol(symbol)}
                  className="rounded-full border px-3 py-1.5 text-sm font-medium transition-colors"
                  style={{
                    borderColor: active ? narrative.meta.accent : theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.10)',
                    background: active ? narrative.meta.soft : theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.58)',
                    color: active ? narrative.meta.accent : theme === 'dark' ? '#e5e7eb' : '#334155',
                  }}
                >
                  {symbol}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {editorialVariants.map((variant) => (
          <ModernEditorialVariantCard
            key={variant.id}
            narrative={narrative}
            dayData={dayData}
            theme={theme}
            variant={variant}
          />
        ))}
      </div>
    </div>
  )
}
