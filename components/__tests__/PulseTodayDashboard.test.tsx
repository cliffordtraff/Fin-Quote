import { fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildPulseReplayConfig,
  buildPulseSessionLevels,
  getSessionExtremesForCandles,
  getSessionWindowForCandles,
  mergeLatestDayCandlesWithStream,
  PulseTodayCard,
  useReplayAdaptiveCandles,
} from '@/components/PulseTodayDashboard'
import type { LiveStreamState, StreamCandle } from '@/lib/hooks/use-live-stream'
import type { ReplayState } from '@/lib/hooks/use-replay'

vi.mock('liveline', () => ({
  Liveline: () => null,
}))

const emptyStream: LiveStreamState = {
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

function replayStateAt(allCandles: StreamCandle[], revealedCount: number): ReplayState {
  const liveCandle = revealedCount > 0 ? allCandles[revealedCount - 1] : undefined
  const lastPrice = liveCandle?.close ?? null

  return {
    allCandles,
    candles: allCandles.slice(0, Math.max(0, revealedCount - 1)),
    liveCandle,
    lastPrice,
    lastChange: lastPrice === null ? null : lastPrice - 100,
    lastChangePct: lastPrice === null ? null : lastPrice - 100,
    previousClose: 100,
    connected: false,
    error: null,
    mode: 'animated',
    status: 'paused',
    speed: 100,
    totalCandles: allCandles.length,
    revealedCount,
    replayStartTime: null,
    replayEndTime: null,
    replayCurrentTime: null,
    replayProgress: 0,
    play: () => {},
    pause: () => {},
    reset: () => {},
    skip: () => {},
    seek: () => {},
    seekTime: () => {},
    setSpeed: () => {},
    setMode: () => {},
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PulseTodayCard detail chart', () => {
  it('moves focus to the restored Hide control after showing the chart on mobile', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })))

    render(
      <PulseTodayCard
        symbol="AAPL"
        dayData={undefined}
        stream1s={emptyStream}
        stream10s={emptyStream}
        theme="light"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Hide detail chart' }))

    const showButton = screen.getByRole('button', { name: 'Show detail chart' })
    expect(showButton).toHaveFocus()
    fireEvent.click(showButton)

    expect(screen.getByRole('button', { name: 'Hide detail chart' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Display the detail chart as a line' })).not.toHaveFocus()
  })
})

describe('buildPulseReplayConfig', () => {
  it('replays the selected symbol on the latest completed trading day without auto-playing', () => {
    expect(buildPulseReplayConfig(' clro ', new Date('2026-03-27T21:00:00Z'))).toEqual({
      symbol: 'CLRO',
      date: '2026-03-27',
      from: '09:30',
      to: '16:00',
      timeframe: '1s',
      autoPlay: false,
    })
  })

  it('uses the prior completed session while the cash market is still open', () => {
    expect(buildPulseReplayConfig('AAPL', new Date('2026-03-27T15:00:00Z')).date).toBe('2026-03-26')
  })

  it('rolls weekend replay requests back to the latest trading day', () => {
    expect(buildPulseReplayConfig('AAPL', new Date('2026-03-29T15:00:00Z')).date).toBe('2026-03-27')
  })

  it('ends replay at 1pm on a completed early-close session', () => {
    expect(buildPulseReplayConfig('AAPL', new Date('2026-11-27T19:00:00Z'))).toMatchObject({
      date: '2026-11-27',
      from: '09:30',
      to: '13:00',
    })
  })
})

describe('useReplayAdaptiveCandles', () => {
  it('indexes a near-full session once and reveals completion without rescanning historical ticks', () => {
    const totalCandles = 6.5 * 60 * 60
    const sessionStart = Date.UTC(2026, 6, 10, 13, 30) / 1000
    let timestampReads = 0
    const allCandles: StreamCandle[] = Array.from({ length: totalCandles }, (_, index) => {
      const timestamp = sessionStart + index
      const isFinalCandle = index === totalCandles - 1
      const open = 100 + index / 100_000

      return {
        get time() {
          timestampReads += 1
          return timestamp
        },
        open,
        high: isFinalCandle ? 999 : open + 0.02,
        low: isFinalCandle ? 1 : open - 0.02,
        close: isFinalCandle ? 321 : open + 0.01,
      }
    })
    const nearCompleteReplay = replayStateAt(allCandles, totalCandles - 1)
    const { result, rerender } = renderHook(
      ({ replay }) => useReplayAdaptiveCandles(replay),
      { initialProps: { replay: nearCompleteReplay } },
    )

    expect(result.current.mode).toBe('1min')
    expect(result.current.dayData10s?.candles).toHaveLength(2_340)
    expect(result.current.dayData1min?.candles).toHaveLength(390)
    expect(result.current.dayData1min?.candles.at(-1)).not.toMatchObject({
      high: 999,
      low: 1,
      close: 321,
    })

    const completedReplay = replayStateAt(allCandles, totalCandles)
    timestampReads = 0
    rerender({ replay: completedReplay })

    expect(timestampReads).toBe(0)
    expect(result.current.dayData10s?.candles).toHaveLength(2_340)
    expect(result.current.dayData1min?.candles).toHaveLength(390)
    expect(result.current.dayData1min?.candles.at(-1)).toMatchObject({
      high: 999,
      low: 1,
      close: 321,
    })
  })
})

describe('getSessionWindowForCandles', () => {
  it('selects the premarket session before the open', () => {
    const session = getSessionWindowForCandles([
      { date: '2026-03-27 06:53:00' },
    ])

    expect(session.session).toBe('premarket')
    expect(session.startMinutes).toBe(240)
    expect(session.endMinutes).toBe(570)
  })

  it('selects the cash session during regular trading hours', () => {
    const session = getSessionWindowForCandles([
      { date: '2026-03-27 11:12:00' },
    ])

    expect(session.session).toBe('cash')
    expect(session.startMinutes).toBe(570)
    expect(session.endMinutes).toBe(960)
  })

  it('selects the afterhours session after the close', () => {
    const session = getSessionWindowForCandles([
      { date: '2026-03-27 17:08:00' },
    ])

    expect(session.session).toBe('afterhours')
    expect(session.startMinutes).toBe(960)
    expect(session.endMinutes).toBe(1200)
  })

  it('fills a shortened cash-session chart and starts afterhours at 1pm on an early close', () => {
    const cashSession = getSessionWindowForCandles([
      { date: '2026-11-27 12:59:59' },
    ])
    const afterhoursSession = getSessionWindowForCandles([
      { date: '2026-11-27 13:00:00' },
    ])

    expect(cashSession).toMatchObject({ session: 'cash', startMinutes: 570, endMinutes: 780 })
    expect(afterhoursSession).toMatchObject({ session: 'afterhours', startMinutes: 780, endMinutes: 1200 })
  })
})

describe('getSessionExtremesForCandles', () => {
  it('computes HOD/LOD from the active premarket session candles', () => {
    const extremes = getSessionExtremesForCandles([
      { date: '2026-03-27 04:12:00', high: 4.8, low: 3.9 },
      { date: '2026-03-27 04:45:00', high: 6.72, low: 4.6 },
      { date: '2026-03-27 06:59:00', high: 4.65, low: 4.12 },
    ])

    expect(extremes.session).toBe('premarket')
    expect(extremes.dayHigh).toBe(6.72)
    expect(extremes.dayLow).toBe(3.9)
  })

  it('ignores candles from other sessions when computing active-session extremes', () => {
    const extremes = getSessionExtremesForCandles([
      { date: '2026-03-27 09:31:00', high: 4.65, low: 4.2 },
      { date: '2026-03-27 10:15:00', high: 4.55, low: 4.1 },
      { date: '2026-03-27 16:10:00', high: 7.2, low: 4.0 },
    ])

    expect(extremes.session).toBe('afterhours')
    expect(extremes.dayHigh).toBe(7.2)
    expect(extremes.dayLow).toBe(4.0)
  })
})

describe('buildPulseSessionLevels', () => {
  it('labels active premarket extremes as premarket HOD and LOD', () => {
    const levels = buildPulseSessionLevels([
      { date: '2026-03-27 04:12:00', high: 281.2, low: 279.1 },
      { date: '2026-03-27 07:18:00', high: 282.4, low: 277.6 },
    ])

    expect(levels.activeSession).toBe('premarket')
    expect(levels.lines).toEqual([
      expect.objectContaining({ label: 'Premarket HOD', value: 282.4, tone: 'high', emphasis: 'primary' }),
      expect.objectContaining({ label: 'Premarket LOD', value: 277.6, tone: 'low', emphasis: 'primary' }),
    ])
  })

  it('drops premarket carryover levels once the cash session starts', () => {
    const levels = buildPulseSessionLevels([
      { date: '2026-03-27 04:25:00', high: 282.4, low: 277.6 },
      { date: '2026-03-27 09:35:00', high: 281.8, low: 280.2 },
      { date: '2026-03-27 10:10:00', high: 283.1, low: 279.9 },
    ])

    expect(levels.activeSession).toBe('cash')
    expect(levels.lines).toEqual([
      expect.objectContaining({ label: 'HOD', value: 283.1, tone: 'high', emphasis: 'primary' }),
      expect.objectContaining({ label: 'LOD', value: 279.9, tone: 'low', emphasis: 'primary' }),
    ])
  })

  it('reuses cash-session HOD and LOD during after-hours without creating after-hours or premarket labels', () => {
    const levels = buildPulseSessionLevels([
      { date: '2026-03-27 04:25:00', high: 282.4, low: 277.6 },
      { date: '2026-03-27 09:35:00', high: 281.8, low: 280.2 },
      { date: '2026-03-27 10:10:00', high: 283.1, low: 279.9 },
      { date: '2026-03-27 16:15:00', high: 282.2, low: 281.4 },
      { date: '2026-03-27 17:05:00', high: 282.6, low: 281.1 },
    ])

    expect(levels.activeSession).toBe('afterhours')
    expect(levels.lines).toEqual([
      expect.objectContaining({ label: 'HOD', value: 283.1, tone: 'high', emphasis: 'primary' }),
      expect.objectContaining({ label: 'LOD', value: 279.9, tone: 'low', emphasis: 'primary' }),
    ])
  })
})

describe('mergeLatestDayCandlesWithStream', () => {
  it('promotes the latest stream session date over stale intraday base candles', () => {
    const merged = mergeLatestDayCandlesWithStream(
      [
        { date: '2026-03-26 09:30:00', open: 0.39, high: 0.4, low: 0.38, close: 0.385 },
        { date: '2026-03-26 09:31:00', open: 0.385, high: 0.39, low: 0.381, close: 0.382 },
      ],
      [
        { time: Date.UTC(2026, 2, 27, 11, 55, 0) / 1000, open: 0.36, high: 0.39, low: 0.355, close: 0.385 },
        { time: Date.UTC(2026, 2, 27, 11, 55, 10) / 1000, open: 0.385, high: 0.4, low: 0.38, close: 0.398 },
      ],
      { time: Date.UTC(2026, 2, 27, 11, 56, 5) / 1000, open: 0.398, high: 0.402, low: 0.396, close: 0.401 },
    )

    expect(merged.map((candle) => candle.date)).toEqual([
      '2026-03-27 07:55:00',
      '2026-03-27 07:56:00',
    ])
    expect(merged[0]).toMatchObject({ open: 0.36, high: 0.4, low: 0.355, close: 0.398 })
    expect(merged[1]).toMatchObject({ open: 0.398, high: 0.402, low: 0.396, close: 0.401 })
  })

  it('overrides same-minute base candles with stream-derived buckets on the latest date', () => {
    const merged = mergeLatestDayCandlesWithStream(
      [
        { date: '2026-03-27 07:54:00', open: 0.35, high: 0.36, low: 0.349, close: 0.355 },
        { date: '2026-03-27 07:55:00', open: 0.355, high: 0.36, low: 0.352, close: 0.353 },
      ],
      [
        { time: Date.UTC(2026, 2, 27, 11, 55, 0) / 1000, open: 0.37, high: 0.395, low: 0.368, close: 0.392 },
      ],
    )

    expect(merged.map((candle) => candle.date)).toEqual([
      '2026-03-27 07:54:00',
      '2026-03-27 07:55:00',
    ])
    expect(merged[1]).toMatchObject({ open: 0.37, high: 0.395, low: 0.368, close: 0.392 })
  })
})
