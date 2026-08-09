'use client'

import { useEffect, useState } from 'react'
import { PULSE_TEXT_SYMBOLS, type PulseTextSymbol } from '@/lib/pulse-text-context'
import {
  parsePulseDayCandlePayload,
  type PulseDayCandleData,
} from '@/lib/pulse-market-data-contract'

export const PULSE_TEXT_DAY_POLL_INTERVAL_MS = 60_000
export const PULSE_TEXT_DAY_REQUEST_DEADLINE_MS = 15_000
const PULSE_TEXT_FOCUS_DEDUPE_MS = 250

type PulseDayMap = Partial<Record<PulseTextSymbol, PulseDayCandleData>>

interface ActiveFanout {
  controller: AbortController
  deadline: ReturnType<typeof setTimeout> | null
}

function isPageVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden'
}

function monotonicNow(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

function waitForSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()

  return new Promise<T>((resolve, reject) => {
    let settled = false
    const handleAbort = () => {
      if (settled) return
      settled = true
      reject(signal.reason)
    }

    signal.addEventListener('abort', handleAbort, { once: true })
    promise.then(
      (value) => {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', handleAbort)
        resolve(value)
      },
      (error: unknown) => {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', handleAbort)
        reject(error)
      },
    )
  })
}

function isDeadlineAbort(signal: AbortSignal): boolean {
  return signal.aborted && signal.reason instanceof DOMException
    && signal.reason.name === 'TimeoutError'
}

async function fetchPulseDaySymbol(
  symbol: PulseTextSymbol,
  signal: AbortSignal,
): Promise<PulseDayCandleData> {
  signal.throwIfAborted()
  const response = await waitForSignal(
    fetch(`/api/stock-intraday/${symbol}?interval=1`, { signal }),
    signal,
  )
  signal.throwIfAborted()
  if (!response.ok) {
    throw new Error(`Pulse day-candle request failed with status ${response.status}.`)
  }
  const rawPayload: unknown = await waitForSignal(response.json(), signal)
  signal.throwIfAborted()
  const parsed = parsePulseDayCandlePayload(rawPayload, symbol)
  if (!parsed) throw new Error('Pulse day-candle response was malformed.')
  return parsed
}

/**
 * A fixed four-symbol, one-generation-at-a-time poller for Pulse Text.
 *
 * The active logical fanout owns its slot until all four requests settle or the
 * client deadline aborts them. Hiding or unmounting fences commits; returning
 * to the page starts one fresh fanout even when transport ignores abort.
 */
export function usePulseTextDayCandles(): PulseDayMap {
  const [data, setData] = useState<PulseDayMap>({})

  useEffect(() => {
    let mounted = true
    let generation = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    let active: ActiveFanout | null = null
    let suppressFocusUntil = Number.NEGATIVE_INFINITY

    const clearPollTimer = () => {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    }

    const abortActive = (reason: DOMException) => {
      clearPollTimer()
      if (!active) return
      if (active.deadline !== null) {
        clearTimeout(active.deadline)
        active.deadline = null
      }
      active.controller.abort(reason)
    }

    const schedule = () => {
      clearPollTimer()
      if (!mounted || !isPageVisible() || active) return
      timer = setTimeout(() => {
        timer = null
        run()
      }, PULSE_TEXT_DAY_POLL_INTERVAL_MS)
    }

    const run = () => {
      if (!mounted || !isPageVisible() || active) return
      clearPollTimer()

      const runGeneration = ++generation
      const controller = new AbortController()
      const activeFanout: ActiveFanout = {
        controller,
        deadline: setTimeout(() => {
          activeFanout.deadline = null
          controller.abort(new DOMException(
            'Pulse day-candle client deadline elapsed.',
            'TimeoutError',
          ))
        }, PULSE_TEXT_DAY_REQUEST_DEADLINE_MS),
      }
      active = activeFanout

      void Promise.allSettled(
        PULSE_TEXT_SYMBOLS.map(async (symbol) => ({
          symbol,
          value: await fetchPulseDaySymbol(symbol, controller.signal),
        })),
      ).then((results) => {
        if (
          !mounted ||
          !isPageVisible() ||
          generation !== runGeneration ||
          (controller.signal.aborted && !isDeadlineAbort(controller.signal))
        ) {
          return
        }

        setData((current) => {
          if (
            !mounted ||
            !isPageVisible() ||
            generation !== runGeneration ||
            (controller.signal.aborted && !isDeadlineAbort(controller.signal))
          ) {
            return current
          }
          const next = { ...current }
          for (const result of results) {
            if (result.status !== 'fulfilled') continue
            next[result.value.symbol] = result.value.value
          }
          return next
        })
      }).finally(() => {
        if (activeFanout.deadline !== null) {
          clearTimeout(activeFanout.deadline)
          activeFanout.deadline = null
        }
        if (active === activeFanout) active = null
        if (!mounted || !isPageVisible()) return

        if (generation !== runGeneration) {
          // A visibility or focus transition superseded this generation.
          // Start the requested generation now.
          run()
          return
        }
        schedule()
      })
    }

    const handleVisibilityChange = () => {
      if (!isPageVisible()) {
        generation += 1
        abortActive(new DOMException('Pulse Text became hidden.', 'AbortError'))
        return
      }
      suppressFocusUntil = monotonicNow() + PULSE_TEXT_FOCUS_DEDUPE_MS
      run()
    }
    const handleFocus = () => {
      if (!isPageVisible() || monotonicNow() < suppressFocusUntil) return
      suppressFocusUntil = monotonicNow() + PULSE_TEXT_FOCUS_DEDUPE_MS
      generation += 1
      if (active) {
        abortActive(new DOMException('Pulse Text regained focus.', 'AbortError'))
      } else {
        run()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    run()

    return () => {
      mounted = false
      generation += 1
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      abortActive(new DOMException('Pulse Text unmounted.', 'AbortError'))
    }
  }, [])

  return data
}
