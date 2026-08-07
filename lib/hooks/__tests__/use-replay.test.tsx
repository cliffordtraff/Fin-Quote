import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useReplay, type ReplayConfig } from '@/lib/hooks/use-replay'
import type { StreamCandle } from '@/lib/hooks/use-live-stream'

const BASE_CONFIG: ReplayConfig = {
  symbol: 'AAPL',
  date: '2026-07-10',
  from: '09:30',
  to: '16:00',
  timeframe: '1s',
  autoPlay: false,
}

function makeCandles(count: number): StreamCandle[] {
  return Array.from({ length: count }, (_, index) => ({
    time: 1_720_000_000 + index,
    open: 100 + index,
    high: 101 + index,
    low: 99 + index,
    close: 100.5 + index,
    volume: 1000 + index,
  }))
}

function jsonResponse(payload: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response
}

describe('useReplay', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('passes a new requestId through on retry and surfaces the API JSON error', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(jsonResponse(
        { error: 'Second-level replay requires the Massive data provider.' },
        { ok: false, status: 501 },
      ))
      .mockResolvedValueOnce(jsonResponse({
        candles: makeCandles(3),
        previousClose: 99,
      }))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const { result, rerender } = renderHook(
      ({ config }: { config: ReplayConfig }) => useReplay(config),
      { initialProps: { config: { ...BASE_CONFIG, requestId: 101 } } },
    )

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toBe('Second-level replay requires the Massive data provider.')

    rerender({ config: { ...BASE_CONFIG, requestId: 102 } })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.error).toBeNull()
    expect(result.current.totalCandles).toBe(3)

    const firstUrl = new URL(String(fetchMock.mock.calls[0][0]), 'http://localhost')
    const retryUrl = new URL(String(fetchMock.mock.calls[1][0]), 'http://localhost')
    expect(firstUrl.searchParams.get('requestId')).toBe('101')
    expect(retryUrl.searchParams.get('requestId')).toBe('102')
  })

  it('keeps an empty replay ready even when auto-play is enabled', async () => {
    const sessionStart = 1_720_000_000
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      candles: [],
      previousClose: 99,
      startTime: sessionStart,
      endTime: sessionStart + 60,
    }))

    const { result } = renderHook(() => useReplay({
      ...BASE_CONFIG,
      autoPlay: true,
    }))

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.totalCandles).toBe(0)

    act(() => result.current.play())
    expect(result.current.status).toBe('ready')
    expect(result.current.replayCurrentTime).toBe(sessionStart)
  })

  it('pauses a ready replay after skipping and a completed replay after skipping backward', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      candles: makeCandles(5),
      previousClose: 99,
    }))

    const { result } = renderHook(() => useReplay(BASE_CONFIG))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    act(() => result.current.skip(2))
    expect(result.current.revealedCount).toBe(2)
    expect(result.current.status).toBe('paused')

    act(() => result.current.seek(5))
    expect(result.current.status).toBe('done')

    act(() => result.current.skip(-1))
    expect(result.current.revealedCount).toBe(4)
    expect(result.current.status).toBe('paused')
  })

  it('keeps playing when skip is used during active playback', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      candles: makeCandles(10),
      previousClose: 99,
    }))

    const { result } = renderHook(() => useReplay(BASE_CONFIG))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    act(() => result.current.play())
    expect(result.current.status).toBe('playing')

    act(() => result.current.skip(2))
    expect(result.current.revealedCount).toBe(2)
    expect(result.current.status).toBe('playing')
  })

  it('batches elapsed candle advancement at 100x instead of scheduling every candle', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      candles: makeCandles(100),
      previousClose: 99,
    }))

    const { result } = renderHook(() => useReplay(BASE_CONFIG))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    vi.useFakeTimers()

    act(() => {
      result.current.setSpeed(100)
      result.current.play()
    })
    expect(result.current.status).toBe('playing')

    act(() => vi.advanceTimersByTime(50))
    expect(result.current.revealedCount).toBe(5)

    act(() => vi.advanceTimersByTime(50))
    expect(result.current.revealedCount).toBe(10)
    expect(result.current.status).toBe('playing')
  })

  it('advances and skips by market time when second aggregates are sparse', async () => {
    const openingTime = 1_720_000_000
    const sparseCandles = makeCandles(3).map((candle, index) => ({
      ...candle,
      time: [openingTime, openingTime + 45, openingTime + 120][index],
    }))
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      candles: sparseCandles,
      previousClose: 99,
    }))

    const { result } = renderHook(() => useReplay(BASE_CONFIG))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.replayStartTime).toBe(openingTime)
    expect(result.current.replayEndTime).toBe(openingTime + 121)
    expect(result.current.replayCurrentTime).toBe(openingTime)
    expect(result.current.replayProgress).toBe(0)
    vi.useFakeTimers()

    act(() => result.current.play())

    act(() => vi.advanceTimersByTime(1_000))
    expect(result.current.revealedCount).toBe(1)
    expect(result.current.replayCurrentTime).toBe(openingTime + 1)
    expect(result.current.replayProgress).toBeCloseTo(1 / 121)

    // There are no trades for the next 44 seconds, so the second array entry
    // must not appear merely because another scheduler tick fired.
    act(() => vi.advanceTimersByTime(44_000))
    expect(result.current.revealedCount).toBe(1)
    expect(result.current.replayCurrentTime).toBe(openingTime + 45)
    expect(result.current.replayProgress).toBeCloseTo(45 / 121)

    act(() => vi.advanceTimersByTime(1_000))
    expect(result.current.revealedCount).toBe(2)

    act(() => {
      result.current.reset()
      result.current.setSpeed(100)
      result.current.play()
    })
    act(() => vi.advanceTimersByTime(450))
    expect(result.current.revealedCount).toBe(1)
    act(() => vi.advanceTimersByTime(50))
    expect(result.current.revealedCount).toBe(2)

    const replayMidpoint = ((result.current.replayStartTime ?? 0) + (result.current.replayEndTime ?? 0)) / 2
    act(() => result.current.seekTime(replayMidpoint))
    expect(result.current.revealedCount).toBe(2)
    expect(result.current.replayCurrentTime).toBe(replayMidpoint)
    expect(result.current.replayProgress).toBeCloseTo(0.5)
    expect(result.current.status).toBe('paused')

    act(() => result.current.reset())
    act(() => result.current.skip(60))
    expect(result.current.revealedCount).toBe(2)
    expect(result.current.liveCandle?.time).toBe(openingTime + 45)
    expect(result.current.status).toBe('paused')
  })

  it('uses exact session bounds across leading and trailing quiet periods', async () => {
    const sessionStart = 1_720_000_000
    const sessionEnd = sessionStart + 120
    const quietSessionCandles = makeCandles(2).map((candle, index) => ({
      ...candle,
      time: [sessionStart + 30, sessionStart + 60][index],
    }))
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      candles: quietSessionCandles,
      previousClose: 99,
      startTime: sessionStart,
      endTime: sessionEnd,
    }))

    const { result } = renderHook(() => useReplay(BASE_CONFIG))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.replayStartTime).toBe(sessionStart)
    expect(result.current.replayEndTime).toBe(sessionEnd)
    expect(result.current.replayCurrentTime).toBe(sessionStart)
    vi.useFakeTimers()

    act(() => result.current.play())
    act(() => vi.advanceTimersByTime(29_000))
    expect(result.current.revealedCount).toBe(0)
    expect(result.current.replayProgress).toBeCloseTo(29 / 120)

    act(() => vi.advanceTimersByTime(1_000))
    expect(result.current.revealedCount).toBe(0)

    act(() => vi.advanceTimersByTime(1_000))
    expect(result.current.revealedCount).toBe(1)

    act(() => vi.advanceTimersByTime(29_000))
    expect(result.current.revealedCount).toBe(1)

    act(() => vi.advanceTimersByTime(1_000))
    expect(result.current.revealedCount).toBe(2)
    expect(result.current.status).toBe('playing')
    expect(result.current.replayProgress).toBeCloseTo(61 / 120)

    // Revealing the final trade must not finish a session that has a quiet
    // trailing minute remaining.
    act(() => vi.advanceTimersByTime(58_000))
    expect(result.current.revealedCount).toBe(2)
    expect(result.current.status).toBe('playing')
    expect(result.current.replayProgress).toBeCloseTo(119 / 120)

    act(() => vi.advanceTimersByTime(1_000))
    expect(result.current.status).toBe('done')
    expect(result.current.replayCurrentTime).toBe(sessionEnd)
    expect(result.current.replayProgress).toBe(1)

    act(() => result.current.play())
    expect(result.current.status).toBe('playing')
    expect(result.current.revealedCount).toBe(0)
    expect(result.current.replayCurrentTime).toBe(sessionStart)
    expect(result.current.replayProgress).toBe(0)

    act(() => result.current.seek(quietSessionCandles.length))
    expect(result.current.revealedCount).toBe(2)
    expect(result.current.replayCurrentTime).toBe(sessionStart + 61)
    expect(result.current.status).toBe('paused')

    act(() => result.current.seekTime(sessionEnd + 1_000))
    expect(result.current.replayCurrentTime).toBe(sessionEnd)
    expect(result.current.status).toBe('done')

    act(() => result.current.seekTime(sessionStart - 1_000))
    expect(result.current.replayCurrentTime).toBe(sessionStart)
    expect(result.current.revealedCount).toBe(0)
    expect(result.current.status).toBe('paused')
  })

  it.each([
    ['1s' as const, 1],
    ['10s' as const, 10],
  ])('does not reveal a %s aggregate before its bucket completes', async (timeframe, durationSeconds) => {
    const sessionStart = 1_720_000_000
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      candles: [{ ...makeCandles(1)[0], time: sessionStart }],
      previousClose: 99,
      startTime: sessionStart,
      endTime: sessionStart + durationSeconds + 10,
    }))

    const replayConfig: ReplayConfig = { ...BASE_CONFIG, timeframe }
    const { result } = renderHook(() => useReplay(replayConfig))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    vi.useFakeTimers()

    act(() => result.current.play())
    act(() => vi.advanceTimersByTime(durationSeconds * 1000 - 250))
    expect(result.current.revealedCount).toBe(0)
    expect(result.current.lastPrice).toBeNull()

    act(() => vi.advanceTimersByTime(250))
    expect(result.current.revealedCount).toBe(1)
    expect(result.current.lastPrice).toBe(100.5)
    expect(result.current.status).toBe('playing')

    act(() => result.current.reset())
    act(() => result.current.seekTime(sessionStart + durationSeconds - 0.25))
    expect(result.current.revealedCount).toBe(0)
    act(() => result.current.seekTime(sessionStart + durationSeconds))
    expect(result.current.revealedCount).toBe(1)

    act(() => result.current.reset())
    act(() => result.current.skip(durationSeconds - 0.25))
    expect(result.current.revealedCount).toBe(0)
    act(() => result.current.skip(0.25))
    expect(result.current.revealedCount).toBe(1)
  })
})
