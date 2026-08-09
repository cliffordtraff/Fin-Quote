import { describe, expect, it } from 'vitest'
import {
  mergePulseStreamCandles,
  normalizePulseStreamCandles,
  parsePulseDayCandlePayload,
  parsePulseLiveStreamBackfillPayload,
  parsePulseStreamEvent,
  PULSE_CANDLE_MAX_ROWS,
} from '@/lib/pulse-market-data-contract'

function streamCandle(time: number, close = 101) {
  return {
    time,
    open: 100,
    high: Math.max(102, close),
    low: 99,
    close,
    volume: 10,
  }
}

function dayCandle(date: string, close = 101) {
  return {
    date,
    open: 100,
    high: Math.max(102, close),
    low: 99,
    close,
  }
}

describe('Pulse market-data runtime contract', () => {
  it('requires exact day-payload identity and rejects malformed or incoherent rows', () => {
    const valid = {
      symbol: 'AAPL',
      todayOHLC: [dayCandle('2026-08-09 09:31:00')],
      previousClose: 98,
    }
    expect(parsePulseDayCandlePayload(valid, 'AAPL')).toMatchObject({
      previousClose: 98,
      changePct: (3 / 98) * 100,
    })
    expect(parsePulseDayCandlePayload({ ...valid, symbol: 'NVDA' }, 'AAPL'))
      .toBeNull()
    expect(parsePulseDayCandlePayload({
      ...valid,
      todayOHLC: [{ ...valid.todayOHLC[0], high: 90 }],
    }, 'AAPL')).toBeNull()
    expect(parsePulseDayCandlePayload({
      ...valid,
      todayOHLC: [{ ...valid.todayOHLC[0], close: Number.NaN }],
    }, 'AAPL')).toBeNull()
    expect(parsePulseDayCandlePayload({
      ...valid,
      todayOHLC: [dayCandle('2026-02-30 09:31:00')],
    }, 'AAPL')).toBeNull()
  })

  it('sorts, deduplicates, and caps day rows at the latest 500 candles', () => {
    const rows = Array.from({ length: 510 }, (_, index) =>
      dayCandle(`2026-08-09 ${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}:00`, 100 + index / 100)
    ).reverse()
    // Keep generated hours inside the parser's 00-23 bound.
    const parsed = parsePulseDayCandlePayload({
      symbol: 'AAPL',
      todayOHLC: rows,
      previousClose: 100,
    }, 'AAPL')

    expect(parsed?.candles).toHaveLength(PULSE_CANDLE_MAX_ROWS)
    expect(parsed?.candles[0].date).toBe('2026-08-09 00:10:00')
    expect(parsed?.candles.at(-1)?.date).toBe('2026-08-09 08:29:00')
  })

  it('strictly validates backfill identity, nullable prices, and bounded rows', () => {
    const valid = {
      symbol: 'AAPL',
      candles: [streamCandle(1_786_276_800)],
      previousClose: 98,
      dayHigh: 103,
      dayLow: 97,
    }
    expect(parsePulseLiveStreamBackfillPayload(valid, 'AAPL')).toEqual(valid)
    expect(parsePulseLiveStreamBackfillPayload({ ...valid, symbol: 'NVDA' }, 'AAPL'))
      .toBeNull()
    expect(parsePulseLiveStreamBackfillPayload({ ...valid, dayHigh: 90 }, 'AAPL'))
      .toBeNull()
    expect(parsePulseLiveStreamBackfillPayload({
      ...valid,
      candles: Array.from({ length: PULSE_CANDLE_MAX_ROWS + 1 }, (_, index) =>
        streamCandle(1_786_276_800 + index)
      ),
    }, 'AAPL')).toBeNull()
  })

  it('rejects wrong-symbol/malformed SSE and merges newer timestamp collisions', () => {
    const symbols = new Set(['AAPL'])
    expect(parsePulseStreamEvent({
      symbol: 'NVDA',
      ...streamCandle(1_786_276_800),
    }, symbols)).toBeNull()
    expect(parsePulseStreamEvent({
      symbol: 'AAPL',
      ...streamCandle(1_786_276_800),
      low: 200,
    }, symbols)).toBeNull()

    const older = [streamCandle(1_786_276_801, 101), streamCandle(1_786_276_800, 100)]
    const newer = [streamCandle(1_786_276_801, 105)]
    expect(mergePulseStreamCandles(older, newer).map((candle) => [
      candle.time,
      candle.close,
    ])).toEqual([
      [1_786_276_800, 100],
      [1_786_276_801, 105],
    ])
    expect(normalizePulseStreamCandles(older)?.map((candle) => candle.time))
      .toEqual([1_786_276_800, 1_786_276_801])
  })
})
