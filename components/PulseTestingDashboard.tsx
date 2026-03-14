'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Liveline } from 'liveline'
import { useTheme } from '@/components/ThemeProvider'
import { useReplay } from '@/lib/hooks/use-replay'
import type { ReplayConfig, ReplaySpeed } from '@/lib/hooks/use-replay'
import type { StreamCandle } from '@/lib/hooks/use-live-stream'

type ThemeMode = 'light' | 'dark'
type ExperimentId =
  | 'theater-moments'
  | 'level-tension'
  | 'ghost-trail'
  | 'compression-state'
  | 'failure-signatures'
  | 'volume-shock'
  | 'momentum-anatomy'
  | 'camera-modes'
  | 'replay-chapters'
  | 'hidden-future'
  | 'comparative-ghosts'
  | 'decision-mode'
type PredictionChoice = 'break' | 'reject' | 'chop'
type SetupDirection = 'up' | 'down'

interface DayCandle {
  date: string
  open: number
  high: number
  low: number
  close: number
}

interface SessionContext {
  todayOHLC: DayCandle[]
  yesterdayOHLC: DayCandle[]
  previousClose: number | null
}

interface ExperimentMeta {
  id: ExperimentId
  title: string
  description: string
  lookFor: string
  tag: string
}

interface ChapterMarker {
  id: string
  title: string
  description: string
  index: number
  color: string
}

interface LevelInfo {
  label: 'HOD' | 'LOD' | 'Prev Close'
  value: number
  color: string
}

interface FailureSignal {
  kind: 'none' | 'failed-breakout' | 'failed-breakdown' | 'clean-breakout' | 'clean-breakdown'
  level: number | null
  strength: number
}

interface TheaterEvent {
  title: string
  description: string
  color: string
  intensity: number
}

interface ReplayView {
  revealed: StreamCandle[]
  lastCandle: StreamCandle | null
  lastPrice: number | null
  previousClose: number | null
  dayHigh: number | null
  dayLow: number | null
  nearestLevel: LevelInfo | null
  levelTension: number
  volumeShock: number
  compression: number
  speedScore: number
  accelScore: number
  extensionScore: number
  speed: number
  acceleration: number
  failureSignal: FailureSignal
  theaterEvent: TheaterEvent
  chapters: ChapterMarker[]
  activeChapter: ChapterMarker | null
  recentLine: number[]
  sessionLine: number[]
  shiftedLineData: { time: number; value: number }[]
  shiftedCandles: { time: number; open: number; high: number; low: number; close: number }[]
  shiftedLiveCandle:
    | { time: number; open: number; high: number; low: number; close: number }
    | undefined
  shiftedLineValue: number | undefined
  recentVolumes: number[]
  progressPct: number
  timeShift: number
  currentTime: string
  setupDirection: SetupDirection
}

interface PredictionEntry {
  id: number
  choice: PredictionChoice
  setupLabel: string
  setupDirection: SetupDirection
  startIndex: number
  settleIndex: number
  startPrice: number
  resolved: boolean
  result: PredictionChoice | null
}

const DEFAULT_REPLAY_CONFIG: ReplayConfig = {
  symbol: 'GOOGL',
  date: '2026-03-13',
  from: '09:30',
  to: '16:00',
  timeframe: '1s',
}

const SPEED_OPTIONS: ReplaySpeed[] = [1, 2, 5, 10]

const EXPERIMENTS: ExperimentMeta[] = [
  {
    id: 'theater-moments',
    title: 'Theater Moments',
    description: 'Escalate the stage when the tape hits a truly important inflection.',
    lookFor: 'Use spotlight, headline, and scale changes only when the event model says attention should narrow.',
    tag: 'Attention',
  },
  {
    id: 'level-tension',
    title: 'Level Tension',
    description: 'Make HOD, LOD, and previous close feel magnetic as price leans into them.',
    lookFor: 'The chart should feel tighter and more unstable as distance to the nearest key level shrinks.',
    tag: 'Structure',
  },
  {
    id: 'ghost-trail',
    title: 'Ghost Trail',
    description: 'Leave a fading memory of the last burst so acceleration is legible at a glance.',
    lookFor: 'You should be able to feel pace changes without reading a number or a tooltip.',
    tag: 'Motion',
  },
  {
    id: 'compression-state',
    title: 'Compression State',
    description: 'Visually coil the chart when the tape is tightening before a move.',
    lookFor: 'The chart should calm down and tighten before it releases into expansion.',
    tag: 'Motion',
  },
  {
    id: 'failure-signatures',
    title: 'Failure Signatures',
    description: 'Give failed breaks and clean breaks distinct personalities instead of one generic flash.',
    lookFor: 'A fakeout should feel sharp and fractured, not just red after being green.',
    tag: 'Structure',
  },
  {
    id: 'volume-shock',
    title: 'Volume Shock',
    description: 'Translate relative volume bursts into energy, pressure, and aftershock.',
    lookFor: 'This is where Liveline particles and shake should actually earn their keep.',
    tag: 'Energy',
  },
  {
    id: 'momentum-anatomy',
    title: 'Momentum Anatomy',
    description: 'Separate speed, acceleration, and extension so the move has shape, not just direction.',
    lookFor: 'You should be able to tell whether the move is fast, getting faster, or simply extended.',
    tag: 'Read',
  },
  {
    id: 'camera-modes',
    title: 'Camera Modes',
    description: 'Test follow-price, anchor-level, and centered framing on the same tape.',
    lookFor: 'Different framing should materially change what feels important in the move.',
    tag: 'Framing',
  },
  {
    id: 'replay-chapters',
    title: 'Replay Chapters',
    description: 'Turn replay into a story timeline instead of one long scrubber.',
    lookFor: 'Markers should let you jump to the moments that actually matter in the day.',
    tag: 'Replay',
  },
  {
    id: 'hidden-future',
    title: 'Hidden Future',
    description: 'Keep the unrevealed tape masked so replay feels like decision-making, not a movie.',
    lookFor: 'The future should feel present enough to matter, but inaccessible enough to preserve tension.',
    tag: 'Replay',
  },
  {
    id: 'comparative-ghosts',
    title: 'Comparative Ghosts',
    description: 'Overlay a prior session shape so the current replay has a visual benchmark.',
    lookFor: 'The ghost should add context without making the current tape hard to read.',
    tag: 'Context',
  },
  {
    id: 'decision-mode',
    title: 'Decision Mode',
    description: 'Pause the tape mentally and make a call before the next few bars resolve it.',
    lookFor: 'This turns replay into a training tool instead of a passive animation.',
    tag: 'Interaction',
  },
]

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function downsample<T>(items: T[], maxPoints = 240) {
  if (items.length <= maxPoints) return items
  const step = items.length / maxPoints
  return Array.from({ length: maxPoints }, (_, index) => items[Math.floor(index * step)]).filter(Boolean) as T[]
}

function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--'
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatPct(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function formatClock(unixSeconds: number | null | undefined) {
  if (unixSeconds === null || unixSeconds === undefined || !Number.isFinite(unixSeconds)) return '--:--:--'
  const d = new Date(unixSeconds * 1000)
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

function getRange(values: number[], fallback = 0) {
  if (values.length === 0) {
    return { min: fallback - 1, max: fallback + 1 }
  }
  let min = Infinity
  let max = -Infinity
  for (const value of values) {
    if (value < min) min = value
    if (value > max) max = value
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: fallback - 1, max: fallback + 1 }
  }
  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.01, 1)
    return { min: min - pad, max: max + pad }
  }
  return { min, max }
}

function buildChapters(allCandles: StreamCandle[], timeframeSecs: number): ChapterMarker[] {
  if (allCandles.length === 0) return []

  const indexAtSecs = (secs: number) =>
    Math.max(0, Math.min(allCandles.length - 1, Math.round(secs / timeframeSecs)))
  const barsPerHour = Math.max(1, Math.round(3600 / timeframeSecs))

  const runningHigh: number[] = []
  const runningLow: number[] = []
  let currentHigh = -Infinity
  let currentLow = Infinity

  for (let i = 0; i < allCandles.length; i += 1) {
    currentHigh = Math.max(currentHigh, allCandles[i].high)
    currentLow = Math.min(currentLow, allCandles[i].low)
    runningHigh[i] = currentHigh
    runningLow[i] = currentLow
  }

  const openPrice = allCandles[0].open
  const driveEnd = indexAtSecs(15 * 60)
  const driveClose = allCandles[driveEnd]?.close ?? openPrice
  const openingDirection: SetupDirection = driveClose >= openPrice ? 'up' : 'down'

  let pullbackIdx = indexAtSecs(35 * 60)
  const retraceThreshold = openPrice * 0.0012
  for (let i = driveEnd + 1; i < Math.min(allCandles.length, indexAtSecs(120 * 60)); i += 1) {
    const retrace =
      openingDirection === 'up'
        ? driveClose - allCandles[i].close
        : allCandles[i].close - driveClose
    if (retrace > retraceThreshold) {
      pullbackIdx = i
      break
    }
  }

  let pressureIdx = indexAtSecs(120 * 60)
  for (let i = Math.max(pullbackIdx + 1, indexAtSecs(45 * 60)); i < allCandles.length; i += 1) {
    const priorHigh = runningHigh[i - 1] ?? allCandles[i].high
    const priorLow = runningLow[i - 1] ?? allCandles[i].low
    const close = allCandles[i].close
    const nearHigh = Math.abs(close - priorHigh) / close < 0.001
    const nearLow = Math.abs(close - priorLow) / close < 0.001
    if (nearHigh || nearLow) {
      pressureIdx = i
      break
    }
  }

  const powerHourIdx = Math.max(0, allCandles.length - barsPerHour)
  const closeIdx = allCandles.length - 1

  const raw: ChapterMarker[] = [
    {
      id: 'open-drive',
      title: 'Open Drive',
      description: 'The first directional shove away from the bell.',
      index: driveEnd,
      color: '#22c55e',
    },
    {
      id: 'first-pullback',
      title: 'First Pullback',
      description: 'Where the opening move first has to prove itself.',
      index: pullbackIdx,
      color: '#f59e0b',
    },
    {
      id: 'pressure-build',
      title: 'Pressure Build',
      description: 'The tape tightens into a decision point.',
      index: pressureIdx,
      color: '#8b5cf6',
    },
    {
      id: 'power-hour',
      title: 'Power Hour',
      description: 'Late-session moves deserve their own jump point.',
      index: powerHourIdx,
      color: '#3b82f6',
    },
    {
      id: 'closing-print',
      title: 'Close',
      description: 'The final minute and the day’s final statement.',
      index: closeIdx,
      color: '#ef4444',
    },
  ]

  const deduped: ChapterMarker[] = []
  for (const marker of raw) {
    const previous = deduped[deduped.length - 1]
    if (previous && previous.index === marker.index) continue
    deduped.push(marker)
  }
  return deduped
}

function detectFailureSignal(revealed: StreamCandle[]): FailureSignal {
  if (revealed.length < 4) {
    return { kind: 'none', level: null, strength: 0 }
  }

  const recent = revealed.slice(-30)
  let latest: FailureSignal = { kind: 'none', level: null, strength: 0 }

  for (let i = 3; i < recent.length; i += 1) {
    const history = recent.slice(0, i)
    const priorHigh = Math.max(...history.map((c) => c.high))
    const priorLow = Math.min(...history.map((c) => c.low))
    const candle = recent[i]
    const breakoutBuffer = priorHigh * 0.0006
    const breakdownBuffer = priorLow * 0.0006

    if (candle.high > priorHigh + breakoutBuffer) {
      const strength = clamp((candle.high - priorHigh) / (priorHigh * 0.004))
      latest = {
        kind: candle.close < priorHigh ? 'failed-breakout' : 'clean-breakout',
        level: priorHigh,
        strength,
      }
    }

    if (candle.low < priorLow - breakdownBuffer) {
      const strength = clamp((priorLow - candle.low) / (priorLow * 0.004))
      latest = {
        kind: candle.close > priorLow ? 'failed-breakdown' : 'clean-breakdown',
        level: priorLow,
        strength,
      }
    }
  }

  return latest
}

function resolvePrediction(
  allCandles: StreamCandle[],
  startIndex: number,
  settleIndex: number,
  startPrice: number,
  setupDirection: SetupDirection,
): PredictionChoice {
  const future = allCandles.slice(startIndex, Math.min(allCandles.length, settleIndex + 1))
  if (future.length === 0) return 'chop'

  const futureHigh = Math.max(...future.map((c) => c.high))
  const futureLow = Math.min(...future.map((c) => c.low))
  const upMove = (futureHigh - startPrice) / startPrice
  const downMove = (futureLow - startPrice) / startPrice

  if (setupDirection === 'up') {
    if (upMove >= 0.0025 && upMove >= Math.abs(downMove) * 1.15) return 'break'
    if (downMove <= -0.0015) return 'reject'
    return 'chop'
  }

  if (Math.abs(downMove) >= 0.0025 && Math.abs(downMove) >= upMove * 1.15) return 'break'
  if (upMove >= 0.0015) return 'reject'
  return 'chop'
}

function useSessionContext(symbol: string): SessionContext {
  const [data, setData] = useState<SessionContext>({
    todayOHLC: [],
    yesterdayOHLC: [],
    previousClose: null,
  })

  useEffect(() => {
    let cancelled = false

    async function fetchSession() {
      try {
        const res = await fetch(`/api/stock-intraday/${symbol}?interval=1`)
        if (!res.ok) return
        const json = await res.json()
        if (cancelled) return
        setData({
          todayOHLC: json.todayOHLC ?? [],
          yesterdayOHLC: json.yesterdayOHLC ?? [],
          previousClose: json.previousClose ?? null,
        })
      } catch {
        // Testing dashboard can tolerate missing context data.
      }
    }

    fetchSession()
    return () => {
      cancelled = true
    }
  }, [symbol])

  return data
}

function useReplayView(replay: ReturnType<typeof useReplay>): ReplayView {
  return useMemo(() => {
    const revealed = replay.liveCandle ? [...replay.candles, replay.liveCandle] : [...replay.candles]
    const lastCandle = revealed[revealed.length - 1] ?? null

    let dayHigh = -Infinity
    let dayLow = Infinity
    for (const candle of revealed) {
      dayHigh = Math.max(dayHigh, candle.high)
      dayLow = Math.min(dayLow, candle.low)
    }

    const lastPrice = replay.lastPrice ?? lastCandle?.close ?? null
    const previousClose = replay.previousClose
    const levelCandidates: LevelInfo[] = []
    if (Number.isFinite(dayHigh)) levelCandidates.push({ label: 'HOD', value: dayHigh, color: '#22c55e' })
    if (Number.isFinite(dayLow)) levelCandidates.push({ label: 'LOD', value: dayLow, color: '#ef4444' })
    if (previousClose !== null) {
      levelCandidates.push({ label: 'Prev Close', value: previousClose, color: '#f59e0b' })
    }

    let nearestLevel: LevelInfo | null = null
    if (lastPrice !== null && levelCandidates.length > 0) {
      nearestLevel = levelCandidates.reduce((closest, level) => {
        if (!closest) return level
        const currentDistance = Math.abs(lastPrice - level.value)
        const bestDistance = Math.abs(lastPrice - closest.value)
        return currentDistance < bestDistance ? level : closest
      }, null as LevelInfo | null)
    }

    const levelTension =
      lastPrice !== null && nearestLevel
        ? clamp(1 - Math.abs(lastPrice - nearestLevel.value) / (lastPrice * 0.0035))
        : 0

    const recentWindow = revealed.slice(-40)
    const recentRanges: number[] = []
    for (let i = Math.max(0, revealed.length - 240); i + 40 <= revealed.length; i += 20) {
      const sample = revealed.slice(i, i + 40)
      const sampleHigh = Math.max(...sample.map((c) => c.high))
      const sampleLow = Math.min(...sample.map((c) => c.low))
      recentRanges.push(sampleHigh - sampleLow)
    }
    const currentRange =
      recentWindow.length > 0
        ? Math.max(...recentWindow.map((c) => c.high)) - Math.min(...recentWindow.map((c) => c.low))
        : 0
    const baselineRange = average(recentRanges.slice(0, -1)) || currentRange || 1
    const compression = clamp(1 - currentRange / baselineRange)

    const previousStep =
      revealed.length >= 2 ? revealed[revealed.length - 1].close - revealed[revealed.length - 2].close : 0
    const twoBackStep =
      revealed.length >= 3 ? revealed[revealed.length - 2].close - revealed[revealed.length - 3].close : 0
    const speed = previousStep
    const acceleration = previousStep - twoBackStep
    const rawSteps = []
    for (let i = Math.max(1, revealed.length - 40); i < revealed.length; i += 1) {
      rawSteps.push(Math.abs(revealed[i].close - revealed[i - 1].close))
    }
    const typicalStep = average(rawSteps) || Math.max(Math.abs(speed), 0.01)
    const speedScore = clamp(Math.abs(speed) / (typicalStep * 4))
    const accelScore = clamp(Math.abs(acceleration) / (typicalStep * 4))
    const extensionScore =
      previousClose && lastPrice
        ? clamp(Math.abs((lastPrice - previousClose) / previousClose) / 0.02)
        : 0

    const recentVolumes = revealed
      .slice(-30)
      .map((c) => c.volume ?? 0)
      .filter((value) => value > 0)
    const baselineVolume = average(recentVolumes.slice(0, -1)) || recentVolumes[recentVolumes.length - 1] || 1
    const currentVolume = recentVolumes[recentVolumes.length - 1] ?? 0
    const volumeShock = clamp((currentVolume / baselineVolume - 1) / 3)

    const failureSignal = detectFailureSignal(revealed)

    const theaterEvent: TheaterEvent = (() => {
      if (failureSignal.kind === 'failed-breakout' || failureSignal.kind === 'failed-breakdown') {
        return {
          title: failureSignal.kind === 'failed-breakout' ? 'Failed Breakout' : 'Failed Breakdown',
          description: 'This should feel sharp, unstable, and impossible to miss.',
          color: '#ef4444',
          intensity: Math.max(0.6, failureSignal.strength),
        }
      }
      if (volumeShock > 0.65) {
        return {
          title: 'Volume Shock',
          description: 'Relative volume should amplify motion and attention together.',
          color: '#3b82f6',
          intensity: volumeShock,
        }
      }
      if (levelTension > 0.6 && nearestLevel) {
        return {
          title: `${nearestLevel.label} Under Pressure`,
          description: 'The stage should narrow as price leans into a key level.',
          color: nearestLevel.color,
          intensity: levelTension,
        }
      }
      if (speedScore > 0.55 || accelScore > 0.55) {
        return {
          title: 'Momentum Expansion',
          description: 'The tape is stretching and deserves more visual energy.',
          color: speed >= 0 ? '#22c55e' : '#ef4444',
          intensity: Math.max(speedScore, accelScore),
        }
      }
      return {
        title: 'Tape In Balance',
        description: 'Baseline state. Save the drama for when structure actually changes.',
        color: '#64748b',
        intensity: 0.22,
      }
    })()

    const latestOriginal = lastCandle?.time ?? 0
    const timeShift = latestOriginal ? Math.floor(Date.now() / 1000) - latestOriginal : 0
    const shiftedCandles = replay.candles.map((c) => ({
      time: c.time + timeShift,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }))
    const shiftedLiveCandle = replay.liveCandle
      ? {
          time: replay.liveCandle.time + timeShift,
          open: replay.liveCandle.open,
          high: replay.liveCandle.high,
          low: replay.liveCandle.low,
          close: replay.liveCandle.close,
        }
      : undefined
    const shiftedLineData = revealed.map((c) => ({
      time: c.time + timeShift,
      value: c.close,
    }))
    const shiftedLineValue = shiftedLiveCandle?.close ?? shiftedLineData[shiftedLineData.length - 1]?.value

    const timeframeSecs = DEFAULT_REPLAY_CONFIG.timeframe === '10s' ? 10 : 1
    const chapters = buildChapters(replay.allCandles, timeframeSecs)
    const activeChapter =
      chapters
        .slice()
        .reverse()
        .find((chapter) => replay.revealedCount - 1 >= chapter.index) ?? null

    const progressPct =
      replay.totalCandles > 0 ? Math.round((replay.revealedCount / replay.totalCandles) * 100) : 0

    let setupDirection: SetupDirection = 'up'
    if (nearestLevel?.label === 'LOD') setupDirection = 'down'
    else if (nearestLevel?.label === 'Prev Close' && previousClose !== null && lastPrice !== null) {
      setupDirection = lastPrice >= previousClose ? 'up' : 'down'
    }

    return {
      revealed,
      lastCandle,
      lastPrice,
      previousClose,
      dayHigh: Number.isFinite(dayHigh) ? dayHigh : null,
      dayLow: Number.isFinite(dayLow) ? dayLow : null,
      nearestLevel,
      levelTension,
      volumeShock,
      compression,
      speedScore,
      accelScore,
      extensionScore,
      speed,
      acceleration,
      failureSignal,
      theaterEvent,
      chapters,
      activeChapter,
      recentLine: revealed.slice(-180).map((c) => c.close),
      sessionLine: downsample(replay.allCandles, 360).map((c) => c.close),
      shiftedLineData,
      shiftedCandles,
      shiftedLiveCandle,
      shiftedLineValue,
      recentVolumes,
      progressPct,
      timeShift,
      currentTime: formatClock(lastCandle?.time ?? null),
      setupDirection,
    }
  }, [
    replay.allCandles,
    replay.candles,
    replay.liveCandle,
    replay.lastPrice,
    replay.previousClose,
    replay.revealedCount,
    replay.totalCandles,
  ])
}

function MetricBar({
  label,
  value,
  color,
  caption,
}: {
  label: string
  value: number
  color: string
  caption: string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] font-medium text-gray-600 dark:text-gray-300">
        <span>{label}</span>
        <span>{caption}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-200/80 dark:bg-gray-700/80 overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${Math.round(clamp(value) * 100)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

function SelectorCard({
  meta,
  active,
  onClick,
}: {
  meta: ExperimentMeta
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-2xl border p-3 transition-all ${
        active
          ? 'border-sage-500 bg-white shadow-sm dark:border-sage-400 dark:bg-gray-800'
          : 'border-gray-200/80 bg-white/70 hover:border-sage-300 hover:bg-white dark:border-gray-700 dark:bg-gray-800/60 dark:hover:border-sage-500'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sage-700 dark:text-sage-300">
          {meta.tag}
        </span>
        {active && (
          <span className="rounded-full bg-sage-500 px-2 py-0.5 text-[10px] font-semibold text-white">
            Active
          </span>
        )}
      </div>
      <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{meta.title}</div>
      <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">{meta.description}</p>
    </button>
  )
}

function buildLinePath(series: number[], width: number, height: number, yMin: number, yMax: number, pad = 20) {
  if (series.length === 0) return ''
  const drawableW = width - pad * 2
  const drawableH = height - pad * 2
  const range = yMax - yMin || 1
  return series
    .map((value, index) => {
      const x = pad + (series.length === 1 ? drawableW / 2 : (index / (series.length - 1)) * drawableW)
      const y = pad + (1 - (value - yMin) / range) * drawableH
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

function SvgLineChart({
  primary,
  secondary,
  theme,
  height = 220,
  color = '#22c55e',
  secondaryColor = '#94a3b8',
  ghostLayers = 0,
  anchorValue,
  rangeMode = 'auto',
  centerValue,
  showFill = false,
  bands = 0,
  bandStep = 0,
  maskFraction,
  maskLabel,
  secondaryDashed = true,
}: {
  primary: number[]
  secondary?: number[]
  theme: ThemeMode
  height?: number
  color?: string
  secondaryColor?: string
  ghostLayers?: number
  anchorValue?: number | null
  rangeMode?: 'auto' | 'anchor' | 'centered'
  centerValue?: number | null
  showFill?: boolean
  bands?: number
  bandStep?: number
  maskFraction?: number
  maskLabel?: string
  secondaryDashed?: boolean
}) {
  const gradientId = useId()
  const width = 600
  const values = [...primary, ...(secondary ?? [])]
  if (anchorValue !== null && anchorValue !== undefined) values.push(anchorValue)
  if (centerValue !== null && centerValue !== undefined) values.push(centerValue)

  if (primary.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-2xl border border-dashed border-gray-300 text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500">
        Waiting for replay bars...
      </div>
    )
  }

  let { min, max } = getRange(values, primary[primary.length - 1] ?? 0)
  if (rangeMode === 'anchor' && anchorValue !== null && anchorValue !== undefined) {
    const focused = [...primary, anchorValue]
    const focusedRange = getRange(focused, anchorValue)
    min = focusedRange.min
    max = focusedRange.max
  } else if (rangeMode === 'centered' && centerValue !== null && centerValue !== undefined) {
    const centeredRange = getRange(values, centerValue)
    const radius = Math.max(
      Math.abs(centeredRange.max - centerValue),
      Math.abs(centeredRange.min - centerValue),
      0.5,
    )
    min = centerValue - radius
    max = centerValue + radius
  }

  const bandValues =
    bands > 0 && bandStep > 0 && primary.length > 0
      ? Array.from({ length: bands }, (_, index) => {
          const offset = index - (bands - 1) / 2
          return primary[primary.length - 1] + offset * bandStep
        })
      : []

  const primaryPath = buildLinePath(primary, width, height, min, max)
  const secondaryPath = secondary ? buildLinePath(secondary, width, height, min, max) : ''
  const anchorY =
    anchorValue !== null && anchorValue !== undefined
      ? 20 + (1 - (anchorValue - min) / (max - min || 1)) * (height - 40)
      : null
  const maskX =
    maskFraction !== undefined
      ? 20 + clamp(maskFraction) * (width - 40)
      : null

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white/95 dark:border-gray-700 dark:bg-gray-900/70">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1">
            <stop offset="0%" stopColor={theme === 'dark' ? 'rgba(15, 23, 42, 0.15)' : 'rgba(255,255,255,0.18)'} />
            <stop offset="100%" stopColor={theme === 'dark' ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255,255,255,0.94)'} />
          </linearGradient>
        </defs>

        {Array.from({ length: 4 }).map((_, index) => {
          const y = 20 + (index / 3) * (height - 40)
          return (
            <line
              key={index}
              x1={20}
              x2={width - 20}
              y1={y}
              y2={y}
              stroke={theme === 'dark' ? 'rgba(100,116,139,0.22)' : 'rgba(148,163,184,0.22)'}
              strokeDasharray="3 6"
            />
          )
        })}

        {bandValues.map((value, index) => {
          const y = 20 + (1 - (value - min) / (max - min || 1)) * (height - 40)
          return (
            <line
              key={`band-${index}`}
              x1={20}
              x2={width - 20}
              y1={y}
              y2={y}
              stroke={theme === 'dark' ? 'rgba(148,163,184,0.22)' : 'rgba(100,116,139,0.18)'}
              strokeDasharray="2 5"
            />
          )
        })}

        {anchorY !== null && (
          <line
            x1={20}
            x2={width - 20}
            y1={anchorY}
            y2={anchorY}
            stroke={theme === 'dark' ? 'rgba(250,204,21,0.55)' : 'rgba(245,158,11,0.55)'}
            strokeDasharray="8 6"
            strokeWidth={2}
          />
        )}

        {ghostLayers > 0 &&
          Array.from({ length: ghostLayers }).map((_, index) => {
            const truncated = primary.slice(0, Math.max(primary.length - (index + 1) * 10, 2))
            const ghostPath = buildLinePath(truncated, width, height, min, max)
            return (
              <path
                key={`ghost-${index}`}
                d={ghostPath}
                fill="none"
                stroke={color}
                strokeWidth={4 - index * 0.4}
                opacity={0.18 - index * 0.03}
                transform={`translate(${(index + 1) * 5} ${(index + 1) * 2})`}
              />
            )
          })}

        {showFill && (
          <path
            d={`${primaryPath} L ${width - 20} ${height - 20} L 20 ${height - 20} Z`}
            fill={theme === 'dark' ? 'rgba(34,197,94,0.10)' : 'rgba(34,197,94,0.08)'}
          />
        )}

        {secondaryPath && (
          <path
            d={secondaryPath}
            fill="none"
            stroke={secondaryColor}
            strokeWidth={2}
            strokeDasharray={secondaryDashed ? '9 7' : undefined}
            opacity={0.8}
          />
        )}

        <path d={primaryPath} fill="none" stroke={color} strokeWidth={3} />

        {primary.length > 0 && (
          <circle
            cx={width - 20}
            cy={20 + (1 - (primary[primary.length - 1] - min) / (max - min || 1)) * (height - 40)}
            r={5}
            fill={color}
          />
        )}

        {maskX !== null && (
          <>
            <rect x={maskX} y={0} width={width - maskX} height={height} fill={`url(#${gradientId})`} />
            <line x1={maskX} x2={maskX} y1={0} y2={height} stroke="rgba(124, 58, 237, 0.5)" strokeDasharray="6 6" />
            {maskLabel && (
              <text
                x={maskX + 12}
                y={28}
                fill={theme === 'dark' ? '#e5e7eb' : '#374151'}
                fontSize="12"
                fontWeight="600"
              >
                {maskLabel}
              </text>
            )}
          </>
        )}
      </svg>
    </div>
  )
}

function ChapterTimeline({
  chapters,
  progressPct,
  totalCandles,
  onSeek,
}: {
  chapters: ChapterMarker[]
  progressPct: number
  totalCandles: number
  onSeek: (index: number) => void
}) {
  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white/95 p-4 dark:border-gray-700 dark:bg-gray-900/70">
      <div className="relative h-2 rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-sage-500 via-emerald-500 to-cyan-500"
          style={{ width: `${progressPct}%` }}
        />
        {chapters.map((chapter) => {
          const left = totalCandles > 1 ? (chapter.index / (totalCandles - 1)) * 100 : 0
          return (
            <button
              key={chapter.id}
              onClick={() => onSeek(chapter.index)}
              className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm dark:border-gray-900"
              style={{ left: `${left}%`, backgroundColor: chapter.color }}
              aria-label={`Seek to ${chapter.title}`}
            />
          )
        })}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {chapters.map((chapter) => (
          <button
            key={chapter.id}
            onClick={() => onSeek(chapter.index)}
            className="rounded-xl border border-gray-200/80 p-3 text-left transition-colors hover:border-sage-300 hover:bg-sage-50 dark:border-gray-700 dark:hover:border-sage-500 dark:hover:bg-gray-800"
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: chapter.color }}>
              Chapter
            </div>
            <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{chapter.title}</div>
            <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">{chapter.description}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function PulseTestingDashboard() {
  const { theme: rawTheme } = useTheme()
  const theme = (rawTheme === 'dark' ? 'dark' : 'light') as ThemeMode

  const replay = useReplay(DEFAULT_REPLAY_CONFIG)
  const session = useSessionContext(DEFAULT_REPLAY_CONFIG.symbol)
  const view = useReplayView(replay)

  const [activeExperiment, setActiveExperiment] = useState<ExperimentId>('theater-moments')
  const [predictions, setPredictions] = useState<PredictionEntry[]>([])
  const scrubBarRef = useRef<HTMLDivElement>(null)
  const wasPlayingRef = useRef(false)

  const activeMeta = EXPERIMENTS.find((experiment) => experiment.id === activeExperiment) ?? EXPERIMENTS[0]
  const activeExperimentIndex = EXPERIMENTS.findIndex((experiment) => experiment.id === activeExperiment)
  const previousExperiment = useCallback(() => {
    const nextIndex = activeExperimentIndex <= 0 ? EXPERIMENTS.length - 1 : activeExperimentIndex - 1
    setActiveExperiment(EXPERIMENTS[nextIndex].id)
  }, [activeExperimentIndex])
  const nextExperiment = useCallback(() => {
    const nextIndex = activeExperimentIndex >= EXPERIMENTS.length - 1 ? 0 : activeExperimentIndex + 1
    setActiveExperiment(EXPERIMENTS[nextIndex].id)
  }, [activeExperimentIndex])

  const visibleToday = useMemo(() => {
    if (session.todayOHLC.length === 0) return []
    const visibleCount = Math.max(
      1,
      Math.round((view.progressPct / 100) * session.todayOHLC.length),
    )
    return session.todayOHLC.slice(0, visibleCount)
  }, [session.todayOHLC, view.progressPct])

  const comparativeToday = visibleToday.map((candle) => candle.close)
  const comparativeYesterday = session.yesterdayOHLC.map((candle) => candle.close)
  const normalizedToday = useMemo(() => {
    if (comparativeToday.length === 0) return []
    const base = comparativeToday[0]
    return comparativeToday.map((value) => ((value - base) / base) * 100)
  }, [comparativeToday])
  const normalizedYesterday = useMemo(() => {
    if (comparativeYesterday.length === 0) return []
    const base = comparativeYesterday[0]
    return comparativeYesterday.map((value) => ((value - base) / base) * 100)
  }, [comparativeYesterday])

  const setupLabel = view.nearestLevel
    ? view.setupDirection === 'up'
      ? `Pressure into ${view.nearestLevel.label}`
      : `Leaning on ${view.nearestLevel.label}`
    : 'Tape setup'

  const submitPrediction = useCallback(
    (choice: PredictionChoice) => {
      const startPrice = view.lastPrice
      if (startPrice === null) return
      const startIndex = Math.max(0, replay.revealedCount - 1)
      const settleIndex = Math.min(replay.allCandles.length - 1, startIndex + 90)
      setPredictions((current) => [
        {
          id: Date.now(),
          choice,
          setupLabel,
          setupDirection: view.setupDirection,
          startIndex,
          settleIndex,
          startPrice,
          resolved: false,
          result: null,
        },
        ...current,
      ].slice(0, 6))
    },
    [replay.allCandles.length, replay.revealedCount, setupLabel, view.lastPrice, view.setupDirection],
  )

  useEffect(() => {
    setPredictions((current) =>
      current.map((prediction) => {
        if (prediction.resolved || replay.revealedCount - 1 < prediction.settleIndex) return prediction
        return {
          ...prediction,
          resolved: true,
          result: resolvePrediction(
            replay.allCandles,
            prediction.startIndex,
            prediction.settleIndex,
            prediction.startPrice,
            prediction.setupDirection,
          ),
        }
      }),
    )
  }, [replay.allCandles, replay.revealedCount])

  const seekFromPointer = useCallback(
    (clientX: number) => {
      const bar = scrubBarRef.current
      if (!bar || replay.totalCandles === 0) return
      const rect = bar.getBoundingClientRect()
      const fraction = clamp((clientX - rect.left) / rect.width)
      const index = Math.round(fraction * replay.totalCandles)
      replay.seek(index)
    },
    [replay.seek, replay.totalCandles],
  )

  const handleScrubStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      wasPlayingRef.current = replay.status === 'playing'
      if (replay.status === 'playing') replay.pause()
      seekFromPointer(e.clientX)

      const handleMove = (event: MouseEvent) => seekFromPointer(event.clientX)
      const handleUp = () => {
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
        if (wasPlayingRef.current) replay.play()
      }

      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    },
    [replay.pause, replay.play, replay.status, seekFromPointer],
  )

  const isPaused = replay.status !== 'playing'
  const primaryColor = (view.lastPrice ?? 0) >= (view.previousClose ?? 0) ? '#22c55e' : '#ef4444'
  const theaterStyle = view.theaterEvent.intensity > 0.5
    ? {
        animation: 'pulse-testing-spotlight 2.8s ease-in-out infinite',
        boxShadow: `0 0 0 1px ${view.theaterEvent.color}33, 0 20px 60px ${view.theaterEvent.color}22`,
      }
    : undefined
  const tensionStyle =
    view.levelTension > 0.7
      ? ({ animation: 'pulse-testing-shake 0.55s linear infinite' } as const)
      : undefined
  const shockStyle =
    view.volumeShock > 0.6
      ? ({ animation: 'pulse-testing-ripple 1.9s ease-out infinite' } as const)
      : undefined

  function renderStage() {
    switch (activeExperiment) {
      case 'theater-moments':
        return (
          <div
            className="relative overflow-hidden rounded-[28px] border border-gray-200/80 bg-gray-950 p-4 dark:border-gray-700"
            style={{
              background: `radial-gradient(circle at 18% 22%, ${view.theaterEvent.color}33 0%, rgba(15,23,42,0.8) 32%, rgba(2,6,23,0.96) 100%)`,
              ...theaterStyle,
            }}
          >
            <div className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/80">
              Featured Stage
            </div>
            <div className="relative z-10 mb-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">
                Current cue
              </div>
              <h3 className="mt-2 text-2xl font-semibold text-white">{view.theaterEvent.title}</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">{view.theaterEvent.description}</p>
            </div>
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-2">
              <Liveline
                data={view.shiftedLineData}
                value={view.shiftedLineValue ?? 0}
                mode="candle"
                candles={view.shiftedCandles}
                liveCandle={view.shiftedLiveCandle}
                lineData={view.shiftedLineData}
                lineValue={view.shiftedLineValue}
                lineMode={false}
                window={120}
                theme={theme}
                color={view.theaterEvent.color}
                grid={true}
                badge={true}
                scrub={true}
                fill={true}
                pulse={true}
                momentum={true}
                paused={isPaused}
                loading={replay.status === 'loading'}
                degen={{
                  scale: 1.5 + view.theaterEvent.intensity * 3,
                  downMomentum: true,
                }}
                referenceLine={
                  view.nearestLevel
                    ? { value: view.nearestLevel.value, label: view.nearestLevel.label }
                    : undefined
                }
                formatValue={formatPrice}
                formatTime={(time) => formatClock(time - view.timeShift)}
                padding={{ top: 16, right: 70, bottom: 28, left: 16 }}
              />
              <div className="absolute bottom-4 left-4 right-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-white/85">
                  Replay clock {view.currentTime}
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-white/85">
                  Level tension {Math.round(view.levelTension * 100)}%
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-white/85">
                  Volume shock {Math.round(view.volumeShock * 100)}%
                </span>
              </div>
            </div>
          </div>
        )

      case 'level-tension':
        return (
          <div
            className="relative overflow-hidden rounded-[28px] border border-gray-200/80 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
            style={tensionStyle}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sage-700 dark:text-sage-300">
                  Magnetic read
                </div>
                <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                  {view.nearestLevel ? `${view.nearestLevel.label} in play` : 'Waiting for a key level'}
                </div>
              </div>
              {view.nearestLevel && (
                <div
                  className="rounded-full px-3 py-1 text-xs font-semibold text-white"
                  style={{ backgroundColor: view.nearestLevel.color }}
                >
                  ${formatPrice(view.nearestLevel.value)}
                </div>
              )}
            </div>
            <Liveline
              data={view.shiftedLineData}
              value={view.shiftedLineValue ?? 0}
              window={90}
              theme={theme}
              color={primaryColor}
              grid={true}
              badge={true}
              scrub={true}
              fill={true}
              pulse={true}
              momentum={true}
              paused={isPaused}
              loading={replay.status === 'loading'}
              referenceLine={
                view.nearestLevel
                  ? { value: view.nearestLevel.value, label: view.nearestLevel.label }
                  : undefined
              }
              formatValue={formatPrice}
              formatTime={(time) => formatClock(time - view.timeShift)}
              padding={{ top: 12, right: 66, bottom: 28, left: 14 }}
            />
            <div className="mt-4 space-y-3">
              <MetricBar
                label="Tension"
                value={view.levelTension}
                color={view.nearestLevel?.color ?? '#64748b'}
                caption={`${Math.round(view.levelTension * 100)}%`}
              />
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  view.dayHigh !== null ? { label: 'HOD', value: view.dayHigh, color: '#22c55e' } : null,
                  view.dayLow !== null ? { label: 'LOD', value: view.dayLow, color: '#ef4444' } : null,
                  view.previousClose !== null ? { label: 'Prev Close', value: view.previousClose, color: '#f59e0b' } : null,
                ]
                  .filter(Boolean)
                  .map((level) => (
                    <div
                      key={level!.label}
                      className="rounded-xl border border-gray-200/80 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/80"
                    >
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: level!.color }}>
                        {level!.label}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">${formatPrice(level!.value)}</div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )

      case 'ghost-trail':
        return (
          <div className="space-y-4 rounded-[28px] border border-gray-200/80 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <SvgLineChart
              primary={view.recentLine}
              theme={theme}
              color={primaryColor}
              ghostLayers={4}
              showFill={true}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-gray-200/80 bg-gray-50 p-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-300">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Trail logic</div>
                <div className="mt-2">Each ghost layer is an older path with lower opacity and slight drift.</div>
              </div>
              <div className="rounded-2xl border border-gray-200/80 bg-gray-50 p-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-300">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current feel</div>
                <div className="mt-2">This makes acceleration visible even before the last few bars fully resolve.</div>
              </div>
              <div className="rounded-2xl border border-gray-200/80 bg-gray-50 p-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-300">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Best use</div>
                <div className="mt-2">Fast tape, pullback depth, and momentum rollover.</div>
              </div>
            </div>
          </div>
        )

      case 'compression-state': {
        const recentRange = getRange(view.recentLine, view.lastPrice ?? 0)
        const bandStep = ((recentRange.max - recentRange.min) || 1) * (0.04 + (1 - view.compression) * 0.12)
        return (
          <div className="space-y-4 rounded-[28px] border border-gray-200/80 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <SvgLineChart
              primary={view.recentLine}
              theme={theme}
              color={primaryColor}
              bands={5}
              bandStep={bandStep}
              showFill={true}
            />
            <div className="rounded-2xl border border-dashed border-sage-300 bg-sage-50/70 p-4 dark:border-sage-700 dark:bg-sage-900/10">
              <MetricBar
                label="Compression"
                value={view.compression}
                color="#14b8a6"
                caption={`${Math.round(view.compression * 100)}%`}
              />
              <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
                High compression means the recent range is much smaller than its own recent baseline. The bands collapse toward price as the coil tightens.
              </p>
            </div>
          </div>
        )
      }

      case 'failure-signatures': {
        const failureBanner =
          view.failureSignal.kind === 'none'
            ? 'No failure signature yet. Waiting for a clean break or sharp rejection.'
            : view.failureSignal.kind === 'failed-breakout'
              ? 'Failed breakout: structure should snap from expansion into recoil.'
              : view.failureSignal.kind === 'failed-breakdown'
                ? 'Failed breakdown: downside attempt rejected back into range.'
                : view.failureSignal.kind === 'clean-breakout'
                  ? 'Clean breakout: structure should feel decisive and orderly.'
                  : 'Clean breakdown: downside follow-through still owns the tape.'

        const bannerColor =
          view.failureSignal.kind === 'failed-breakout' || view.failureSignal.kind === 'failed-breakdown'
            ? '#ef4444'
            : view.failureSignal.kind === 'clean-breakout'
              ? '#22c55e'
              : view.failureSignal.kind === 'clean-breakdown'
                ? '#f97316'
                : '#64748b'

        return (
          <div className="space-y-4 rounded-[28px] border border-gray-200/80 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <div
              className="rounded-2xl border p-4 text-sm leading-6"
              style={{
                borderColor: `${bannerColor}55`,
                background:
                  view.failureSignal.kind === 'failed-breakout' || view.failureSignal.kind === 'failed-breakdown'
                    ? 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(255,255,255,0))'
                    : 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(255,255,255,0))',
              }}
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: bannerColor }}>
                Signature
              </div>
              <div className="mt-2 text-base font-semibold text-gray-900 dark:text-white">{failureBanner}</div>
            </div>
            <SvgLineChart
              primary={view.recentLine}
              theme={theme}
              color={bannerColor}
              anchorValue={view.failureSignal.level}
              showFill={true}
            />
          </div>
        )
      }

      case 'volume-shock':
        return (
          <div className="relative space-y-4 rounded-[28px] border border-gray-200/80 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <div className="absolute inset-4 rounded-[24px] border border-cyan-300/30" style={shockStyle} />
            <div className="relative">
              <Liveline
                data={view.shiftedLineData}
                value={view.shiftedLineValue ?? 0}
                window={90}
                theme={theme}
                color="#38bdf8"
                grid={true}
                badge={true}
                scrub={true}
                fill={true}
                pulse={true}
                momentum={true}
                paused={isPaused}
                loading={replay.status === 'loading'}
                degen={{
                  scale: 1 + view.volumeShock * 4,
                  downMomentum: true,
                }}
                formatValue={formatPrice}
                formatTime={(time) => formatClock(time - view.timeShift)}
                padding={{ top: 12, right: 66, bottom: 28, left: 14 }}
              />
            </div>
            <div className="grid h-16 grid-cols-12 items-end gap-1 rounded-2xl border border-gray-200/80 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/80">
              {view.recentVolumes.slice(-12).map((volume, index, volumes) => {
                const maxVolume = Math.max(...volumes, 1)
                return (
                  <div
                    key={index}
                    className="rounded-t-md bg-cyan-400/80 transition-[height] duration-300"
                    style={{ height: `${Math.max(8, (volume / maxVolume) * 100)}%` }}
                  />
                )
              })}
            </div>
          </div>
        )

      case 'momentum-anatomy':
        return (
          <div className="space-y-4 rounded-[28px] border border-gray-200/80 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <SvgLineChart primary={view.recentLine} theme={theme} color={primaryColor} showFill={true} />
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-gray-200/80 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/80">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-600">Speed</div>
                <div className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{view.speed.toFixed(3)}</div>
                <MetricBar label="Normalized" value={view.speedScore} color="#0ea5e9" caption={`${Math.round(view.speedScore * 100)}%`} />
              </div>
              <div className="rounded-2xl border border-gray-200/80 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/80">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-600">Acceleration</div>
                <div className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{view.acceleration.toFixed(3)}</div>
                <MetricBar label="Normalized" value={view.accelScore} color="#8b5cf6" caption={`${Math.round(view.accelScore * 100)}%`} />
              </div>
              <div className="rounded-2xl border border-gray-200/80 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/80">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-600">Extension</div>
                <div className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  {view.previousClose && view.lastPrice ? formatPct(((view.lastPrice - view.previousClose) / view.previousClose) * 100) : '--'}
                </div>
                <MetricBar label="Normalized" value={view.extensionScore} color="#f59e0b" caption={`${Math.round(view.extensionScore * 100)}%`} />
              </div>
            </div>
          </div>
        )

      case 'camera-modes': {
        const centeredValue =
          view.dayHigh !== null && view.dayLow !== null
            ? (view.dayHigh + view.dayLow) / 2
            : view.lastPrice ?? 0
        return (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-3 rounded-[28px] border border-gray-200/80 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <div className="text-sm font-semibold text-gray-900 dark:text-white">Follow Price</div>
              <SvgLineChart primary={view.recentLine} theme={theme} color={primaryColor} />
              <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
                Keeps the latest move dominant. Best when speed matters more than context.
              </p>
            </div>
            <div className="space-y-3 rounded-[28px] border border-gray-200/80 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <div className="text-sm font-semibold text-gray-900 dark:text-white">Anchor Level</div>
              <SvgLineChart
                primary={view.recentLine}
                theme={theme}
                color={primaryColor}
                rangeMode="anchor"
                anchorValue={view.nearestLevel?.value}
              />
              <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
                Keeps the key level visible so you feel the relationship, not just the motion.
              </p>
            </div>
            <div className="space-y-3 rounded-[28px] border border-gray-200/80 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <div className="text-sm font-semibold text-gray-900 dark:text-white">Centered</div>
              <SvgLineChart
                primary={view.recentLine}
                theme={theme}
                color={primaryColor}
                rangeMode="centered"
                centerValue={centeredValue}
              />
              <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
                Useful when you want balanced context instead of emotional framing.
              </p>
            </div>
          </div>
        )
      }

      case 'replay-chapters':
        return (
          <div className="space-y-4 rounded-[28px] border border-gray-200/80 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <SvgLineChart primary={view.sessionLine} theme={theme} color={primaryColor} maskFraction={view.progressPct / 100} maskLabel="Future tape" />
            <ChapterTimeline
              chapters={view.chapters}
              progressPct={view.progressPct}
              totalCandles={replay.totalCandles}
              onSeek={replay.seek}
            />
          </div>
        )

      case 'hidden-future':
        return (
          <div className="space-y-4 rounded-[28px] border border-gray-200/80 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <SvgLineChart
              primary={session.todayOHLC.map((candle) => candle.close)}
              theme={theme}
              color={primaryColor}
              maskFraction={view.progressPct / 100}
              maskLabel="Unrevealed tape"
              showFill={true}
            />
            <div className="rounded-2xl border border-dashed border-violet-300 bg-violet-50/70 p-4 text-sm leading-6 text-gray-600 dark:border-violet-800 dark:bg-violet-900/10 dark:text-gray-300">
              The revealed tape rides on the left. Everything to the right is deliberately fogged so the replay still feels like a real decision path.
            </div>
          </div>
        )

      case 'comparative-ghosts':
        return (
          <div className="space-y-4 rounded-[28px] border border-gray-200/80 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <SvgLineChart
              primary={normalizedToday}
              secondary={normalizedYesterday}
              theme={theme}
              color={primaryColor}
              secondaryColor={theme === 'dark' ? '#94a3b8' : '#64748b'}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-gray-200/80 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/80">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Today</div>
                <div className="mt-2 text-base font-semibold text-gray-900 dark:text-white">
                  {normalizedToday.length > 0 ? formatPct(normalizedToday[normalizedToday.length - 1]) : '--'}
                </div>
              </div>
              <div className="rounded-2xl border border-gray-200/80 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/80">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Yesterday ghost</div>
                <div className="mt-2 text-base font-semibold text-gray-900 dark:text-white">
                  {normalizedYesterday.length > 0 ? formatPct(normalizedYesterday[normalizedYesterday.length - 1]) : '--'}
                </div>
              </div>
            </div>
          </div>
        )

      case 'decision-mode':
        return (
          <div className="space-y-4 rounded-[28px] border border-gray-200/80 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <div className="rounded-[24px] border border-sage-300 bg-sage-50/80 p-4 dark:border-sage-700 dark:bg-sage-900/10">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sage-700 dark:text-sage-300">Current prompt</div>
              <div className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
                {view.setupDirection === 'up' ? `${setupLabel}. What happens next?` : `${setupLabel}. Does it break or bounce?`}
              </div>
              <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                Lock a call for the next 90 seconds of replay. The result resolves automatically once the tape reaches the horizon.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {([
                  { choice: 'break', label: 'Break' },
                  { choice: 'reject', label: 'Reject' },
                  { choice: 'chop', label: 'Chop' },
                ] as const).map((option) => (
                  <button
                    key={option.choice}
                    onClick={() => submitPrediction(option.choice)}
                    className="rounded-full border border-sage-400 px-4 py-2 text-sm font-semibold text-sage-700 transition-colors hover:bg-sage-100 dark:border-sage-600 dark:text-sage-200 dark:hover:bg-sage-800/40"
                  >
                    {option.label}
                  </button>
                ))}
                <button
                  onClick={() => setPredictions([])}
                  className="rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Clear Calls
                </button>
              </div>
            </div>

            <Liveline
              data={view.shiftedLineData}
              value={view.shiftedLineValue ?? 0}
              window={90}
              theme={theme}
              color={primaryColor}
              grid={true}
              badge={true}
              scrub={true}
              fill={true}
              pulse={true}
              momentum={true}
              paused={isPaused}
              loading={replay.status === 'loading'}
              referenceLine={
                view.nearestLevel
                  ? { value: view.nearestLevel.value, label: view.nearestLevel.label }
                  : undefined
              }
              formatValue={formatPrice}
              formatTime={(time) => formatClock(time - view.timeShift)}
              padding={{ top: 12, right: 66, bottom: 28, left: 14 }}
            />

            <div className="space-y-3">
              {predictions.length === 0 && (
                <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  No calls logged yet.
                </div>
              )}
              {predictions.map((prediction) => (
                <div
                  key={prediction.id}
                  className="flex flex-col gap-3 rounded-2xl border border-gray-200/80 bg-gray-50 px-4 py-3 text-sm dark:border-gray-700 dark:bg-gray-800/80 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white">
                      {prediction.setupLabel} · {prediction.choice.toUpperCase()}
                    </div>
                    <div className="mt-1 text-gray-600 dark:text-gray-300">
                      Starts at {formatClock(replay.allCandles[prediction.startIndex]?.time)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!prediction.resolved && (
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                        Pending
                      </span>
                    )}
                    {prediction.resolved && (
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          prediction.result === prediction.choice
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                        }`}
                      >
                        {prediction.result === prediction.choice ? 'Correct' : `Resolved ${prediction.result?.toUpperCase()}`}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )

      default:
        return null
    }
  }

  const liveRead = (() => {
    switch (activeExperiment) {
      case 'theater-moments':
        return `${view.theaterEvent.title} is driving the stage right now. This is where you decide whether the app should actually steal focus.`
      case 'level-tension':
        return view.nearestLevel
          ? `GOOGL is ${Math.abs((view.lastPrice ?? 0) - view.nearestLevel.value).toFixed(2)} away from ${view.nearestLevel.label}.`
          : 'Waiting for enough replay bars to establish structure.'
      case 'ghost-trail':
        return 'The trail is strongest when the latest move is extending quickly enough to leave a visible afterimage.'
      case 'compression-state':
        return `Recent range is running at roughly ${Math.round((1 - view.compression) * 100)}% of its baseline width.`
      case 'failure-signatures':
        return view.failureSignal.kind === 'none'
          ? 'No clean signature yet. Watch for how the next new extreme resolves.'
          : `Latest signature: ${view.failureSignal.kind.replace('-', ' ')}.`
      case 'volume-shock':
        return `Current shock read is ${Math.round(view.volumeShock * 100)}. Use this to decide how aggressive the degen layer should be.`
      case 'momentum-anatomy':
        return `Speed ${view.speed.toFixed(3)}, acceleration ${view.acceleration.toFixed(3)}. They should not always tell the same story.`
      case 'camera-modes':
        return 'Anchor mode is usually most useful when the tape is leaning into a level. Follow mode is best when speed dominates.'
      case 'replay-chapters':
        return view.activeChapter
          ? `Current chapter: ${view.activeChapter.title}. Marker clicks jump the replay clock, not just the UI.`
          : 'Replay has not reached the first chapter marker yet.'
      case 'hidden-future':
        return 'The future section stays visible enough to imply missing information, but not readable enough to spoil the tape.'
      case 'comparative-ghosts':
        return 'The ghost line is normalized from the opening print so shape matters more than raw price level.'
      case 'decision-mode':
        return 'The goal here is to make calls before the next few bars resolve the setup.'
      default:
        return ''
    }
  })()

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-gray-200/80 bg-gradient-to-br from-white via-cream-100 to-sage-50 px-5 py-5 shadow-sm dark:border-gray-700 dark:bg-gradient-to-br dark:from-gray-900 dark:via-gray-900 dark:to-sage-950/20">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sage-700 dark:text-sage-300">
              Pulse Testing
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
              GOOGL replay lab for Friday, March 13, 2026
            </h1>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
              This tab runs a single shared GOOGL replay tape and lets you test the chart ideas one at a time instead of mixing them into one noisy surface.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[380px]">
            <div className="rounded-2xl border border-gray-200/80 bg-white/90 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/90">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Replay clock</div>
              <div className="mt-2 text-base font-semibold text-gray-900 dark:text-white">{view.currentTime}</div>
            </div>
            <div className="rounded-2xl border border-gray-200/80 bg-white/90 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/90">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Progress</div>
              <div className="mt-2 text-base font-semibold text-gray-900 dark:text-white">{view.progressPct}%</div>
            </div>
            <div className="rounded-2xl border border-gray-200/80 bg-white/90 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/90">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Status</div>
              <div className="mt-2 text-base font-semibold capitalize text-gray-900 dark:text-white">{replay.status}</div>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-[24px] border border-sage-200 bg-white/90 px-4 py-3 dark:border-sage-800/40 dark:bg-gray-900/60">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="flex items-center gap-3">
              <button
                onClick={() => (replay.status === 'playing' ? replay.pause() : replay.play())}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-sage-600 text-white transition-colors hover:bg-sage-700"
              >
                {replay.status === 'playing' ? (
                  <svg width="10" height="12" viewBox="0 0 10 12">
                    <rect x="1" y="1" width="3" height="10" fill="currentColor" />
                    <rect x="6" y="1" width="3" height="10" fill="currentColor" />
                  </svg>
                ) : (
                  <svg width="10" height="12" viewBox="0 0 10 12">
                    <polygon points="1,0 10,6 1,12" fill="currentColor" />
                  </svg>
                )}
              </button>
              <button
                onClick={replay.reset}
                className="text-xs font-semibold text-sage-700 transition-colors hover:text-sage-900 dark:text-sage-300 dark:hover:text-sage-100"
              >
                Reset
              </button>
              <div className="h-5 w-px bg-sage-200 dark:bg-sage-800/50" />
              <button
                onClick={() => replay.skip(-5)}
                className="text-xs font-semibold text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              >
                -5s
              </button>
              <button
                onClick={() => replay.skip(5)}
                className="text-xs font-semibold text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              >
                +5s
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex overflow-hidden rounded border border-sage-300 dark:border-sage-700">
                {SPEED_OPTIONS.map((speed) => (
                  <button
                    key={speed}
                    onClick={() => replay.setSpeed(speed)}
                    className={`px-2 py-1 text-[10px] font-semibold transition-colors ${
                      replay.speed === speed
                        ? 'bg-sage-600 text-white'
                        : 'text-sage-700 hover:bg-sage-100 dark:text-sage-300 dark:hover:bg-sage-900/30'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>

              <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                Shared tape: {DEFAULT_REPLAY_CONFIG.symbol} · {DEFAULT_REPLAY_CONFIG.from} to {DEFAULT_REPLAY_CONFIG.to}
              </div>
            </div>

            <div
              ref={scrubBarRef}
              onMouseDown={handleScrubStart}
              className="flex h-5 flex-1 cursor-pointer items-center xl:ml-2"
            >
              <div className="relative h-1.5 w-full rounded-full bg-sage-200 dark:bg-sage-900/40">
                <div className="h-full rounded-full bg-sage-500" style={{ width: `${view.progressPct}%` }} />
                <div
                  className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-white bg-sage-600 shadow-sm dark:border-gray-900"
                  style={{ left: `calc(${view.progressPct}% - 6px)` }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {EXPERIMENTS.map((experiment) => (
          <SelectorCard
            key={experiment.id}
            meta={experiment}
            active={experiment.id === activeExperiment}
            onClick={() => setActiveExperiment(experiment.id)}
          />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_340px]">
        <div className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sage-700 dark:text-sage-300">
                Active Experiment
              </div>
              <h2 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{activeMeta.title}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-300">{activeMeta.description}</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={previousExperiment}
                className="rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Previous
              </button>
              <button
                onClick={nextExperiment}
                className="rounded-full border border-sage-400 px-4 py-2 text-sm font-semibold text-sage-700 transition-colors hover:bg-sage-100 dark:border-sage-600 dark:text-sage-200 dark:hover:bg-sage-900/30"
              >
                Next
              </button>
            </div>
          </div>

          {renderStage()}
        </div>

        <aside className="space-y-4">
          <div className="rounded-[28px] border border-gray-200/80 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">What to watch</div>
            <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">{activeMeta.lookFor}</p>
          </div>

          <div className="rounded-[28px] border border-gray-200/80 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Live read</div>
            <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">{liveRead}</p>
          </div>

          <div className="rounded-[28px] border border-gray-200/80 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Signal stack</div>
            <div className="mt-4 space-y-4">
              <MetricBar
                label="Level tension"
                value={view.levelTension}
                color={view.nearestLevel?.color ?? '#64748b'}
                caption={`${Math.round(view.levelTension * 100)}%`}
              />
              <MetricBar
                label="Volume shock"
                value={view.volumeShock}
                color="#38bdf8"
                caption={`${Math.round(view.volumeShock * 100)}%`}
              />
              <MetricBar
                label="Compression"
                value={view.compression}
                color="#14b8a6"
                caption={`${Math.round(view.compression * 100)}%`}
              />
              <MetricBar
                label="Momentum"
                value={Math.max(view.speedScore, view.accelScore)}
                color={view.speed >= 0 ? '#22c55e' : '#ef4444'}
                caption={`${Math.round(Math.max(view.speedScore, view.accelScore) * 100)}%`}
              />
            </div>
          </div>

          <div className="rounded-[28px] border border-gray-200/80 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Current context</div>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-gray-200/80 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/80">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Price</div>
                <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                  ${formatPrice(view.lastPrice)}
                </div>
                {view.previousClose !== null && view.lastPrice !== null && (
                  <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    {formatPct(((view.lastPrice - view.previousClose) / view.previousClose) * 100)}
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-gray-200/80 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/80">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Nearest level</div>
                <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                  {view.nearestLevel ? `${view.nearestLevel.label} · $${formatPrice(view.nearestLevel.value)}` : '--'}
                </div>
              </div>
              <div className="rounded-2xl border border-gray-200/80 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/80">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Active chapter</div>
                <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                  {view.activeChapter?.title ?? 'Before first marker'}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </div>
  )
}
