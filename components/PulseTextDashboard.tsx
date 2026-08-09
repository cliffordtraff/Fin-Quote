'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useTheme } from '@/components/ThemeProvider'
import { useMultiStream } from '@/lib/hooks/use-multi-stream'
import type { LiveStreamState } from '@/lib/hooks/use-live-stream'
import { FullDayCanvas } from '@/components/PulseTodayDashboard'
import { usePulseTextDayCandles } from '@/lib/hooks/use-pulse-text-day-candles'
import {
  PULSE_TEXT_SYMBOLS,
  parsePulseTextContext,
  type PulseTextContext,
  type PulseTextSymbol,
} from '@/lib/pulse-text-context'
import type { PulseDayCandleData } from '@/lib/pulse-market-data-contract'

const SYMBOLS = PULSE_TEXT_SYMBOLS
type SymbolKey = PulseTextSymbol
type ThemeMode = 'light' | 'dark'
type PulseChartAggregation = '1min' | '5min'

type DayCandleData = PulseDayCandleData

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

export function usePulseTextContext(symbol: SymbolKey) {
  const [contexts, setContexts] = useState<Partial<Record<SymbolKey, PulseTextContext>>>({})
  const [requestState, setRequestState] = useState({
    error: false,
    loading: false,
    symbol,
  })
  const generationRef = useRef(0)

  useEffect(() => {
    const controller = new AbortController()
    const generation = generationRef.current + 1
    generationRef.current = generation
    setRequestState({ error: false, loading: true, symbol })

    void (async () => {
      try {
        const response = await fetch(`/api/pulse-text-context/${symbol}`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('Pulse text context is unavailable.')
        const rawContext: unknown = await response.json()
        const parsed = parsePulseTextContext(rawContext, symbol)
        if (!parsed.ok) throw new Error('Pulse text context was malformed.')
        if (controller.signal.aborted || generation !== generationRef.current) return

        setContexts((current) => ({
          ...current,
          [symbol]: parsed.value,
        }))
      } catch {
        if (controller.signal.aborted || generation !== generationRef.current) return
        // Retain a previously completed context only for this same symbol.
        // A first-time failure remains null and the current symbol's authored
        // fallback copy is used instead.
        setRequestState({ error: true, loading: false, symbol })
        return
      }

      if (controller.signal.aborted || generation !== generationRef.current) return
      setRequestState({ error: false, loading: false, symbol })
    })()

    return () => {
      controller.abort(new DOMException('Pulse text symbol changed.', 'AbortError'))
    }
  }, [symbol])

  const isCurrentRequest = requestState.symbol === symbol
  return {
    context: contexts[symbol] ?? null,
    error: isCurrentRequest ? requestState.error : false,
    loading: isCurrentRequest ? requestState.loading : true,
  }
}

function cycleStyle(index: number, total: number, duration = 14): CSSProperties {
  const slice = duration / Math.max(total, 1)
  return {
    animationDelay: `${(slice * index).toFixed(2)}s`,
    animationDuration: `${duration}s`,
  }
}

export function derivePulseTextMarketValues(
  dayData: DayCandleData | undefined,
  stream: LiveStreamState,
) {
  const candles = dayData?.candles ?? []
  const previousClose = dayData?.previousClose ?? stream.previousClose ?? null
  const lastPrice = stream.lastPrice ?? candles[candles.length - 1]?.close ?? null
  const open = candles[0]?.open ?? null
  const candleHigh = candles.length > 0
    ? Math.max(...candles.map((candle) => candle.high))
    : null
  const candleLow = candles.length > 0
    ? Math.min(...candles.map((candle) => candle.low))
    : null
  const dayHigh = stream.dayHigh === null
    ? candleHigh
    : candleHigh === null
      ? stream.dayHigh
      : Math.max(stream.dayHigh, candleHigh)
  const dayLow = stream.dayLow === null
    ? candleLow
    : candleLow === null
      ? stream.dayLow
      : Math.min(stream.dayLow, candleLow)
  const changePct = lastPrice !== null && previousClose !== null && previousClose !== 0
    ? ((lastPrice - previousClose) / previousClose) * 100
    : stream.lastPrice !== null
      ? stream.lastChangePct
      : dayData?.changePct ?? stream.lastChangePct

  return {
    candles,
    changePct,
    dayHigh,
    dayLow,
    lastPrice,
    open,
    previousClose,
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
    const {
      changePct,
      dayHigh,
      dayLow,
      lastPrice,
      open,
      previousClose,
    } = derivePulseTextMarketValues(dayData, stream)
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
    { label: 'Change', value: formatPct(narrative.changePct) },
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
    hero: 'left-5 right-5 top-12 sm:left-8 sm:right-[292px] sm:top-14 lg:max-w-[620px]',
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
  lineModeOverride,
}: {
  narrative: ReturnType<typeof useSymbolNarrative>
  dayData: DayCandleData | undefined
  theme: ThemeMode
  variant: EditorialVariant
  lineModeOverride: boolean
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
        chartLineMode={lineModeOverride}
        minHeight={variant.minHeight ?? 390}
      >
        <div className={`pointer-events-none absolute z-20 flex flex-wrap gap-x-3 gap-y-1 ${layout.badges}`}>
          <div className={`text-[10px] font-semibold uppercase tracking-[0.28em] ${labelText}`}>
            {variant.chip || narrative.companyName}
          </div>
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
          {!layout.quote && variant.quote && (
            <blockquote
              className={`mt-3 max-w-[420px] text-xl font-medium leading-8 ${headlineText}`}
              style={{ fontFamily: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif' }}
            >
              "{shorten(variant.quote, 120)}"
            </blockquote>
          )}
          <div
            className={`mt-3 max-w-[560px] text-[clamp(14px,1.8vw,22px)] font-semibold leading-[1.2] ${headlineText}`}
            style={{ fontFamily: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif' }}
          >
            {variant.heroTitle}
          </div>
        </OverlayTextBlock>

        <OverlayTextBlock className={layout.rail}>
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
  const [lineMode, setLineMode] = useState(true)

  const streams = useMultiStream([...SYMBOLS], '1s')
  const dayMap = usePulseTextDayCandles()
  const { context } = usePulseTextContext(selectedSymbol)

  const stream = streams[selectedSymbol] ?? EMPTY_STREAM
  const dayData = dayMap[selectedSymbol]
  const narrative = useSymbolNarrative(selectedSymbol, dayData, stream, context)
  const editorialVariants = useMemo(
    () => buildEditorialVariants(narrative, selectedSymbol),
    [narrative, selectedSymbol],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
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
        <button
          onClick={() => setLineMode((v) => !v)}
          className="ml-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors"
          style={{
            borderColor: theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.10)',
            background: theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.58)',
            color: theme === 'dark' ? '#e5e7eb' : '#334155',
          }}
        >
          {lineMode ? 'Candlestick' : 'Line'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {editorialVariants.map((variant) => (
          <ModernEditorialVariantCard
            key={variant.id}
            narrative={narrative}
            dayData={dayData}
            theme={theme}
            variant={variant}
            lineModeOverride={lineMode}
          />
        ))}
      </div>
    </div>
  )
}
