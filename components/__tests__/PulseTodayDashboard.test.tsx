import { describe, expect, it } from 'vitest'
import {
  buildPulseSessionLevels,
  getSessionExtremesForCandles,
  getSessionWindowForCandles,
  mergeLatestDayCandlesWithStream,
} from '@/components/PulseTodayDashboard'

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

  it('keeps regular-session HOD/LOD while also surfacing premarket carryover levels', () => {
    const levels = buildPulseSessionLevels([
      { date: '2026-03-27 04:25:00', high: 282.4, low: 277.6 },
      { date: '2026-03-27 09:35:00', high: 281.8, low: 280.2 },
      { date: '2026-03-27 10:10:00', high: 283.1, low: 279.9 },
    ])

    expect(levels.activeSession).toBe('cash')
    expect(levels.lines).toEqual([
      expect.objectContaining({ label: 'HOD', value: 283.1, tone: 'high', emphasis: 'primary' }),
      expect.objectContaining({ label: 'LOD', value: 279.9, tone: 'low', emphasis: 'primary' }),
      expect.objectContaining({ label: 'Premarket HOD', value: 282.4, tone: 'high', emphasis: 'secondary' }),
      expect.objectContaining({ label: 'Premarket LOD', value: 277.6, tone: 'low', emphasis: 'secondary' }),
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
