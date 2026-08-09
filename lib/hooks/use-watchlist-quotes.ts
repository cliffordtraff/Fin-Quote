'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { StockData } from '@/app/actions/stocks'
import { fetchWatchlistQuoteBatch } from '@/lib/dashboard/watchlist-quotes-client'

export const WATCHLIST_QUOTE_REFRESH_INTERVAL_MS = 60_000
export const WATCHLIST_QUOTE_CLIENT_DEADLINE_MS = 8_000
const WATCHLIST_QUOTE_FOCUS_DEDUPE_MS = 250

type QuoteMap = Record<string, StockData>

interface PendingAdd {
  deadlineAt: number
  resolve: (quote: StockData | null) => void
  settled: boolean
  symbol: string
  timer: ReturnType<typeof setTimeout>
}

interface RefreshIntent {
  generation: number
  kind: 'refresh'
  symbolsKey: string
}

interface AddIntent {
  add: PendingAdd
  generation: number
  kind: 'add'
}

type RequestIntent = RefreshIntent | AddIntent

interface ActiveRequest {
  controller: AbortController
  deadline: ReturnType<typeof setTimeout> | null
  intent: RequestIntent
  logicalSettled: boolean
  physicalSettled: boolean
  symbols: string[]
}

export interface WatchlistBatchQuoteState {
  loadSymbol: (symbol: string) => Promise<StockData | null>
  quotes: QuoteMap
  retry: () => void
  status:
    | 'idle'
    | 'loading'
    | 'ready'
    | 'refreshing'
    | 'unavailable'
    | 'stale'
}

function isVisible(): boolean {
  return document.visibilityState === 'visible'
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason
    ?? new DOMException('Watchlist quote request was aborted.', 'AbortError')
}

/** Settle on abort even when a mocked or non-conforming transport ignores it. */
function waitForSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortReason(signal))

  return new Promise<T>((resolve, reject) => {
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', handleAbort)
      callback()
    }
    const handleAbort = () => finish(() => reject(abortReason(signal)))

    signal.addEventListener('abort', handleAbort, { once: true })
    promise.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    )
  })
}

function filterQuoteMap(current: QuoteMap, symbols: readonly string[]): QuoteMap {
  const next: QuoteMap = {}
  let changed = false
  for (const symbol of symbols) {
    const quote = current[symbol]
    if (quote) {
      next[symbol] = quote
    } else {
      changed = true
    }
  }
  if (Object.keys(current).length !== Object.keys(next).length) changed = true
  return changed ? next : current
}

/**
 * One physical batch at a time. Abort settles the logical caller immediately,
 * while a transport that ignores abort continues holding the physical slot so
 * focus, visibility, and timer events cannot create overlapping requests.
 */
export function useWatchlistBatchQuotes(
  symbols: readonly string[],
  enabled: boolean,
  visibleListIdentity = JSON.stringify(symbols),
): WatchlistBatchQuoteState {
  const [quotes, setQuotes] = useState<QuoteMap>({})
  const [status, setStatus] = useState<WatchlistBatchQuoteState['status']>('idle')
  const replaceSymbolsRef = useRef<(
    next: string[],
    nextVisibleListIdentity: string,
  ) => void>(() => undefined)
  const loadSymbolRef = useRef<(symbol: string) => Promise<StockData | null>>(
    async () => null,
  )
  const retryRef = useRef<() => void>(() => undefined)
  const requestIdentity = JSON.stringify([visibleListIdentity, symbols])
  const symbolsRef = useRef(symbols)
  const visibleListIdentityRef = useRef(visibleListIdentity)
  symbolsRef.current = symbols
  visibleListIdentityRef.current = visibleListIdentity

  useEffect(() => {
    if (!enabled) {
      setQuotes({})
      setStatus('idle')
      replaceSymbolsRef.current = () => undefined
      loadSymbolRef.current = async () => null
      retryRef.current = () => undefined
      return
    }

    let mounted = true
    let generation = 0
    let desiredSymbols: string[] = []
    let desiredSymbolsKey = '[]'
    let desiredVisibleListIdentity = ''
    let quoteSnapshot: QuoteMap = {}
    let active: ActiveRequest | null = null
    let pendingAdd: PendingAdd | null = null
    let pendingRefresh = false
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    let suppressFocusUntil = Number.NEGATIVE_INFINITY

    const clearRefreshTimer = () => {
      if (refreshTimer === null) return
      clearTimeout(refreshTimer)
      refreshTimer = null
    }

    const hasCompleteLastGoodBatch = () => desiredSymbols.length > 0
      && desiredSymbols.every((symbol) => quoteSnapshot[symbol] !== undefined)

    const setQuoteState = (
      update: (current: QuoteMap) => QuoteMap,
    ) => {
      const next = update(quoteSnapshot)
      quoteSnapshot = next
      setQuotes(next)
    }

    const settleAdd = (add: PendingAdd, quote: StockData | null) => {
      if (add.settled) return
      add.settled = true
      clearTimeout(add.timer)
      add.resolve(quote)
    }

    const abortActive = (reason: DOMException) => {
      if (!active) return
      if (active.deadline !== null) {
        clearTimeout(active.deadline)
        active.deadline = null
      }
      active.controller.abort(reason)
    }

    const scheduleRefresh = () => {
      clearRefreshTimer()
      if (!mounted || !isVisible() || active || desiredSymbols.length === 0) {
        return
      }
      refreshTimer = setTimeout(() => {
        refreshTimer = null
        queueRefresh(false)
      }, WATCHLIST_QUOTE_REFRESH_INTERVAL_MS)
    }

    const releaseActive = (entry: ActiveRequest) => {
      if (active !== entry || !entry.logicalSettled || !entry.physicalSettled) {
        return
      }
      if (entry.deadline !== null) clearTimeout(entry.deadline)
      active = null

      if (!mounted || !isVisible()) return
      if (pendingAdd || pendingRefresh) {
        drain()
        return
      }
      scheduleRefresh()
    }

    const startRequest = (intent: RequestIntent, requestSymbols: string[]) => {
      if (!mounted || !isVisible() || active || requestSymbols.length === 0) {
        if (intent.kind === 'add') settleAdd(intent.add, null)
        return
      }

      const controller = new AbortController()
      const entry: ActiveRequest = {
        controller,
        deadline: null,
        intent,
        logicalSettled: false,
        physicalSettled: false,
        symbols: requestSymbols,
      }
      active = entry

      if (intent.kind === 'refresh') {
        setStatus(hasCompleteLastGoodBatch() ? 'refreshing' : 'loading')
      }

      if (intent.kind === 'refresh') {
        entry.deadline = setTimeout(() => {
          entry.deadline = null
          controller.abort(new DOMException(
            'Watchlist quote client deadline elapsed.',
            'TimeoutError',
          ))
        }, WATCHLIST_QUOTE_CLIENT_DEADLINE_MS)
      }

      const physicalPromise = fetchWatchlistQuoteBatch(
        requestSymbols,
        controller.signal,
      )
      const logicalPromise = waitForSignal(physicalPromise, controller.signal)

      void logicalPromise.then(
        (loadedQuotes) => {
          if (
            mounted
            && isVisible()
            && !controller.signal.aborted
            && intent.generation === generation
          ) {
            if (
              intent.kind === 'refresh'
              && intent.symbolsKey === desiredSymbolsKey
            ) {
              setQuoteState((current) => {
                const next = { ...filterQuoteMap(current, desiredSymbols) }
                for (const quote of loadedQuotes) next[quote.symbol] = quote
                return next
              })
              setStatus('ready')
            } else if (intent.kind === 'add') {
              const quote = loadedQuotes[0] ?? null
              if (quote?.symbol === intent.add.symbol) {
                setQuoteState((current) => ({
                  ...current,
                  [quote.symbol]: quote,
                }))
                settleAdd(intent.add, quote)
              } else {
                settleAdd(intent.add, null)
              }
            }
          } else if (intent.kind === 'add') {
            settleAdd(intent.add, null)
          }
        },
        () => {
          if (intent.kind === 'add') {
            settleAdd(intent.add, null)
          } else if (
            mounted
            && isVisible()
            && intent.generation === generation
            && intent.symbolsKey === desiredSymbolsKey
          ) {
            setStatus(hasCompleteLastGoodBatch() ? 'stale' : 'unavailable')
          }
        },
      ).finally(() => {
        entry.logicalSettled = true
        releaseActive(entry)
      })

      void physicalPromise.then(
        () => {
          entry.physicalSettled = true
          releaseActive(entry)
        },
        () => {
          entry.physicalSettled = true
          releaseActive(entry)
        },
      )
    }

    const drain = () => {
      if (!mounted || !isVisible() || active) return

      if (pendingAdd) {
        const add = pendingAdd
        pendingAdd = null
        if (add.settled || Date.now() >= add.deadlineAt) {
          settleAdd(add, null)
          drain()
          return
        }
        startRequest({ add, generation, kind: 'add' }, [add.symbol])
        return
      }

      if (!pendingRefresh || desiredSymbols.length === 0) {
        pendingRefresh = false
        scheduleRefresh()
        return
      }
      pendingRefresh = false
      startRequest(
        { generation, kind: 'refresh', symbolsKey: desiredSymbolsKey },
        [...desiredSymbols],
      )
    }

    const queueRefresh = (supersedeActive: boolean) => {
      clearRefreshTimer()
      if (!mounted || !isVisible() || desiredSymbols.length === 0) return
      generation += 1
      pendingRefresh = true
      setStatus(hasCompleteLastGoodBatch() ? 'refreshing' : 'loading')
      if (active && supersedeActive) {
        if (active.intent.kind === 'add') settleAdd(active.intent.add, null)
        abortActive(new DOMException(
          'Watchlist quote refresh was superseded.',
          'AbortError',
        ))
      }
      if (!active) drain()
    }

    replaceSymbolsRef.current = (nextSymbols, nextVisibleListIdentity) => {
      const nextKey = JSON.stringify(nextSymbols)
      const batchChanged = nextKey !== desiredSymbolsKey
      const visibleListChanged = nextVisibleListIdentity
        !== desiredVisibleListIdentity
      if (!batchChanged && !visibleListChanged) return

      desiredVisibleListIdentity = nextVisibleListIdentity

      if (pendingAdd) {
        settleAdd(pendingAdd, null)
        pendingAdd = null
      }
      if (active?.intent.kind === 'add') {
        generation += 1
        settleAdd(active.intent.add, null)
        abortActive(new DOMException(
          'The visible watchlist changed during quote validation.',
          'AbortError',
        ))
      }

      if (!batchChanged) return

      desiredSymbols = [...nextSymbols]
      desiredSymbolsKey = nextKey
      generation += 1
      pendingRefresh = desiredSymbols.length > 0 && isVisible()
      clearRefreshTimer()
      setQuoteState((current) => filterQuoteMap(current, desiredSymbols))
      setStatus(
        desiredSymbols.length === 0
          ? 'idle'
          : hasCompleteLastGoodBatch()
            ? 'refreshing'
            : 'loading',
      )

      if (active) {
        if (active.intent.kind === 'add') settleAdd(active.intent.add, null)
        abortActive(new DOMException(
          'Watchlist quote symbols changed.',
          'AbortError',
        ))
      } else {
        drain()
      }
    }

    loadSymbolRef.current = (symbol) => {
      if (!mounted || !isVisible() || pendingAdd) return Promise.resolve(null)

      return new Promise<StockData | null>((resolve) => {
        const add = {} as PendingAdd
        add.deadlineAt = Date.now() + WATCHLIST_QUOTE_CLIENT_DEADLINE_MS
        add.resolve = resolve
        add.settled = false
        add.symbol = symbol
        add.timer = setTimeout(() => {
          if (add.settled) return
          if (pendingAdd === add) pendingAdd = null
          if (active?.intent.kind === 'add' && active.intent.add === add) {
            abortActive(new DOMException(
              'Watchlist quote add deadline elapsed.',
              'TimeoutError',
            ))
          }
          settleAdd(add, null)
        }, WATCHLIST_QUOTE_CLIENT_DEADLINE_MS)

        pendingAdd = add
        clearRefreshTimer()
        drain()
      })
    }

    retryRef.current = () => {
      if (!mounted || !isVisible() || desiredSymbols.length === 0) return
      queueRefresh(true)
    }

    const handleVisibilityChange = () => {
      if (!isVisible()) {
        generation += 1
        pendingRefresh = false
        clearRefreshTimer()
        if (pendingAdd) {
          settleAdd(pendingAdd, null)
          pendingAdd = null
        }
        if (active?.intent.kind === 'add') settleAdd(active.intent.add, null)
        abortActive(new DOMException(
          'Watchlist quote polling became hidden.',
          'AbortError',
        ))
        setStatus(hasCompleteLastGoodBatch() ? 'ready' : 'idle')
        return
      }

      suppressFocusUntil = Date.now() + WATCHLIST_QUOTE_FOCUS_DEDUPE_MS
      queueRefresh(true)
    }

    const handleFocus = () => {
      if (!isVisible() || Date.now() < suppressFocusUntil) return
      suppressFocusUntil = Date.now() + WATCHLIST_QUOTE_FOCUS_DEDUPE_MS
      queueRefresh(true)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    return () => {
      mounted = false
      generation += 1
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      clearRefreshTimer()
      if (pendingAdd) settleAdd(pendingAdd, null)
      if (active?.intent.kind === 'add') settleAdd(active.intent.add, null)
      abortActive(new DOMException(
        'Watchlist quote polling unmounted.',
        'AbortError',
      ))
      replaceSymbolsRef.current = () => undefined
      loadSymbolRef.current = async () => null
      retryRef.current = () => undefined
    }
  }, [enabled])

  useEffect(() => {
    replaceSymbolsRef.current(
      [...symbolsRef.current],
      visibleListIdentityRef.current,
    )
  }, [requestIdentity])

  const loadSymbol = useCallback(
    (symbol: string) => loadSymbolRef.current(symbol),
    [],
  )
  const retry = useCallback(() => retryRef.current(), [])

  return { loadSymbol, quotes, retry, status }
}
