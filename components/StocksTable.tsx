'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from 'react'
import type { StockData } from '@/app/actions/stocks'
import TickerLink from '@/components/TickerLink'
import type { AccountWatchlistStatus } from '@/components/useAccountWatchlist'
import {
  MAX_WATCHLIST_SYMBOLS,
  normalizeWatchlistSymbols,
} from '@/lib/dashboard/watchlist-contract'
import {
  isValidStockPageSymbol,
  normalizeMarketSymbol,
} from '@/lib/market-symbol'
import { useWatchlistBatchQuotes } from '@/lib/hooks/use-watchlist-quotes'

interface StocksTableProps {
  stocks: StockData[]
  symbols?: string[] | null
  onSymbolsChange?: (symbols: string[]) => void
  editingDisabled?: boolean
  syncStatus?: AccountWatchlistStatus
  syncMessage?: string | null
  syncCacheAvailable?: boolean
  syncCanRetry?: boolean
  onSyncRetry?: () => void
}

interface QuoteResponse {
  price: number
  change: number
  changesPercentage: number
}

const UNUSUAL_MOVE_THRESHOLD = 3

async function fetchWatchlistQuote(symbol: string): Promise<StockData | null> {
  try {
    const response = await fetch(`/api/quote/${encodeURIComponent(symbol)}`)
    if (!response.ok) return null
    const quote = (await response.json()) as QuoteResponse
    return {
      symbol,
      name: symbol,
      price: quote.price,
      change: quote.change,
      changePercent: quote.changesPercentage,
    }
  } catch {
    return null
  }
}

function isWatchlistQuoteBatchEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_WATCHLIST_SYNC === 'true'
}

export default function StocksTable({
  stocks,
  symbols,
  onSymbolsChange,
  editingDisabled = false,
  syncStatus = 'local',
  syncMessage = null,
  syncCacheAvailable = true,
  syncCanRetry = false,
  onSyncRetry,
}: StocksTableProps) {
  const [legacyCustomQuotes, setLegacyCustomQuotes] = useState<Record<string, StockData>>({})
  const [isAdding, setIsAdding] = useState(false)
  const [newSymbol, setNewSymbol] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [draggedSymbol, setDraggedSymbol] = useState<string | null>(null)
  const baseQuotes = useMemo(
    () => Object.fromEntries(stocks.map((stock) => [
      normalizeMarketSymbol(stock.symbol),
      { ...stock, symbol: normalizeMarketSymbol(stock.symbol) },
    ])),
    [stocks],
  )
  const visibleSymbols = normalizeWatchlistSymbols(
    symbols ?? stocks.map((stock) => stock.symbol),
  )
  const visibleSymbolsIdentity = JSON.stringify(visibleSymbols)
  const visibleSymbolsRef = useRef(visibleSymbols)
  const previousVisibleSymbolsIdentityRef = useRef(visibleSymbolsIdentity)
  const listGenerationRef = useRef(0)
  const editingDisabledRef = useRef(editingDisabled)
  visibleSymbolsRef.current = visibleSymbols
  editingDisabledRef.current = editingDisabled

  useEffect(() => {
    if (previousVisibleSymbolsIdentityRef.current === visibleSymbolsIdentity) return
    previousVisibleSymbolsIdentityRef.current = visibleSymbolsIdentity
    listGenerationRef.current += 1
  }, [visibleSymbolsIdentity])

  const batchEnabled = isWatchlistQuoteBatchEnabled()
  const batchSymbols = visibleSymbols.filter((symbol) => !baseQuotes[symbol])
  const {
    loadSymbol: loadBatchSymbol,
    quotes: batchCustomQuotes,
    retry: retryBatchQuotes,
    status: batchQuoteStatus,
  } = useWatchlistBatchQuotes(
    batchSymbols,
    batchEnabled,
    visibleSymbolsIdentity,
  )
  const customQuotes = batchEnabled ? batchCustomQuotes : legacyCustomQuotes
  const missingSymbols = visibleSymbols.filter(
    (symbol) => !baseQuotes[symbol] && !customQuotes[symbol],
  )
  const missingSymbolsKey = missingSymbols.join(',')

  useEffect(() => {
    if (batchEnabled || !missingSymbolsKey) return
    let disposed = false

    void Promise.all(
      missingSymbolsKey.split(',').map((symbol) => fetchWatchlistQuote(symbol)),
    ).then((quotes) => {
      if (disposed) return
      setLegacyCustomQuotes((current) => ({
        ...current,
        ...Object.fromEntries(
          quotes
            .filter((quote): quote is StockData => quote !== null)
            .map((quote) => [quote.symbol, quote]),
        ),
      }))
    })

    return () => {
      disposed = true
    }
  }, [batchEnabled, missingSymbolsKey])

  const visibleStocks = visibleSymbols.flatMap((symbol) => {
    const stock = baseQuotes[symbol] ?? customQuotes[symbol]
    return stock ? [stock] : []
  })
  const alertCount = visibleStocks.filter(
    (stock) => Math.abs(stock.changePercent) >= UNUSUAL_MOVE_THRESHOLD,
  ).length
  const syncBusy = syncStatus === 'loading' || syncStatus === 'saving'
  const syncLabel = syncStatus === 'loading'
    ? 'Loading account'
    : syncStatus === 'saving'
      ? 'Saving'
      : syncStatus === 'ready'
        ? 'Account synced'
        : syncStatus === 'conflict'
          ? 'Changed elsewhere'
          : syncStatus === 'uncertain'
            ? 'Save uncertain'
            : syncStatus === 'unavailable'
              ? 'Sync unavailable'
              : null

  function updateSymbols(nextSymbols: string[]) {
    if (editingDisabledRef.current) return
    const normalized = normalizeWatchlistSymbols(nextSymbols)
    visibleSymbolsRef.current = normalized
    previousVisibleSymbolsIdentityRef.current = JSON.stringify(normalized)
    listGenerationRef.current += 1
    onSymbolsChange?.(normalized)
  }

  async function addSymbol(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (editingDisabledRef.current) return
    const symbol = normalizeMarketSymbol(newSymbol)
    setAddError(null)

    if (!isValidStockPageSymbol(symbol)) {
      setAddError('Enter a valid stock ticker symbol.')
      return
    }
    if (visibleSymbols.includes(symbol)) {
      setAddError(`${symbol} is already in the watchlist.`)
      return
    }
    if (visibleSymbols.length >= MAX_WATCHLIST_SYMBOLS) {
      setAddError(`Watchlists can contain up to ${MAX_WATCHLIST_SYMBOLS} symbols.`)
      return
    }

    const submittedGeneration = listGenerationRef.current
    setAdding(true)
    const quote = batchEnabled
      ? await loadBatchSymbol(symbol)
      : await fetchWatchlistQuote(symbol)
    setAdding(false)

    const currentSymbols = visibleSymbolsRef.current
    if (editingDisabledRef.current) {
      setAddError('Wait for account sync to finish, then add the ticker again.')
      return
    }
    if (listGenerationRef.current !== submittedGeneration) {
      setAddError('The watchlist changed while that quote loaded. Add it again.')
      return
    }
    if (!quote) {
      setAddError(`No quote was found for ${symbol}.`)
      return
    }
    if (currentSymbols.includes(symbol)) {
      setAddError(`${symbol} is already in the watchlist.`)
      return
    }
    if (currentSymbols.length >= MAX_WATCHLIST_SYMBOLS) {
      setAddError(`Watchlists can contain up to ${MAX_WATCHLIST_SYMBOLS} symbols.`)
      return
    }

    if (!batchEnabled) {
      setLegacyCustomQuotes((current) => ({ ...current, [symbol]: quote }))
    }
    updateSymbols([...currentSymbols, symbol])
    setNewSymbol('')
    setIsAdding(false)
  }

  function moveSymbol(symbol: string, direction: -1 | 1) {
    if (editingDisabledRef.current) return
    const currentIndex = visibleSymbols.indexOf(symbol)
    const nextIndex = currentIndex + direction
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= visibleSymbols.length) return
    const next = [...visibleSymbols]
    ;[next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]]
    updateSymbols(next)
  }

  function dropSymbol(targetSymbol: string) {
    if (editingDisabledRef.current) return
    if (!draggedSymbol || draggedSymbol === targetSymbol) return
    const next = visibleSymbols.filter((symbol) => symbol !== draggedSymbol)
    const targetIndex = next.indexOf(targetSymbol)
    next.splice(targetIndex, 0, draggedSymbol)
    updateSymbols(next)
    setDraggedSymbol(null)
  }

  return (
    <div className="h-full w-full">
      <div
        aria-busy={syncBusy || (batchEnabled && (
          batchQuoteStatus === 'loading' || batchQuoteStatus === 'refreshing'
        ))}
        className="h-full overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
      >
        <div className="flex min-h-11 items-center justify-between gap-3 border-b border-gray-200 px-3 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-950 dark:text-white">
              Watchlist
            </h2>
            {alertCount > 0 ? (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                {alertCount} unusual
              </span>
            ) : null}
            {syncLabel ? (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                syncStatus === 'ready'
                  ? 'bg-sage-50 text-sage-700 dark:bg-sage-950/40 dark:text-sage-300'
                  : syncStatus === 'conflict'
                    || syncStatus === 'uncertain'
                    || syncStatus === 'unavailable'
                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
              }`}>
                {syncLabel}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            disabled={editingDisabled || adding}
            onClick={() => {
              setIsAdding((current) => !current)
              setAddError(null)
            }}
            className="text-xs font-medium text-gray-500 hover:text-sage-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:text-sage-300"
          >
            {isAdding ? 'Cancel' : '+ Add'}
          </button>
        </div>

        {isAdding ? (
          <form className="border-b border-gray-100 p-3 dark:border-gray-800" onSubmit={addSymbol}>
            <div className="flex gap-2">
              <input
                aria-label="Ticker symbol"
                autoCapitalize="characters"
                autoComplete="off"
                disabled={editingDisabled || adding}
                value={newSymbol}
                onChange={(event) => setNewSymbol(event.target.value.toUpperCase())}
                placeholder="Ticker"
                className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-2.5 py-1.5 text-xs uppercase text-gray-900 outline-none focus:border-sage-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
              <button
                type="submit"
                disabled={adding || editingDisabled}
                className="rounded bg-gray-950 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-gray-950"
              >
                {adding ? 'Adding' : 'Add'}
              </button>
            </div>
            {addError ? (
              <p role="status" className="mt-2 text-xs text-red-600 dark:text-red-400">
                {addError}
              </p>
            ) : null}
            {!addError && visibleSymbols.length >= MAX_WATCHLIST_SYMBOLS ? (
              <p role="status" className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                This watchlist has reached its {MAX_WATCHLIST_SYMBOLS}-symbol limit.
              </p>
            ) : null}
          </form>
        ) : null}

        {syncStatus !== 'local' && (
          syncMessage || !syncCacheAvailable
        ) ? (
          <div
            aria-atomic="true"
            aria-live="polite"
            className="flex items-start justify-between gap-3 border-b border-gray-100 px-3 py-2 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400"
            role="status"
          >
            <span>
              {syncMessage}
              {!syncCacheAvailable ? (
                <span className={syncMessage ? 'mt-1 block' : undefined}>
                  This browser cannot store offline retry receipts; keep this tab open until saves finish.
                </span>
              ) : null}
            </span>
            {syncCanRetry && onSyncRetry ? (
              <button
                type="button"
                onClick={onSyncRetry}
                className="shrink-0 font-semibold text-sage-700 hover:text-sage-900 dark:text-sage-300 dark:hover:text-sage-100"
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : null}

        {batchEnabled
        && batchSymbols.length > 0
        && batchQuoteStatus !== 'idle'
        && batchQuoteStatus !== 'ready' ? (
          <div
            aria-atomic="true"
            aria-live="polite"
            className="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-2 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400"
            role="status"
          >
            <span>
              {batchQuoteStatus === 'loading'
                ? 'Loading watchlist quotes…'
                : batchQuoteStatus === 'refreshing'
                  ? 'Refreshing watchlist quotes…'
                  : batchQuoteStatus === 'stale'
                    ? 'Showing last available quotes; refresh failed.'
                    : 'Watchlist quotes are temporarily unavailable.'}
            </span>
            {batchQuoteStatus === 'stale'
            || batchQuoteStatus === 'unavailable' ? (
              <button
                type="button"
                onClick={retryBatchQuotes}
                className="font-semibold text-sage-700 hover:text-sage-900 dark:text-sage-300 dark:hover:text-sage-100"
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : null}

        {visibleSymbols.length > 0 ? (
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                  Symbol
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                  Change
                </th>
                <th className="w-16 px-2 py-2"><span className="sr-only">Reorder or remove</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {visibleSymbols.map((symbol, index) => {
                const stock = baseQuotes[symbol] ?? customQuotes[symbol]
                const unusual = stock
                  ? Math.abs(stock.changePercent) >= UNUSUAL_MOVE_THRESHOLD
                  : false
                return (
                  <tr
                    key={symbol}
                    draggable={!editingDisabled}
                    onDragStart={() => setDraggedSymbol(symbol)}
                    onDragOver={(event: DragEvent<HTMLTableRowElement>) => event.preventDefault()}
                    onDrop={() => dropSymbol(symbol)}
                    className="group transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-xs font-semibold">
                      <span className="inline-flex items-center gap-1.5">
                        {unusual ? (
                          <span
                            aria-label="Unusual move"
                            className="h-1.5 w-1.5 rounded-full bg-amber-500"
                            title="Unusual move"
                          />
                        ) : null}
                        <TickerLink symbol={symbol} className="text-gray-900 dark:text-white" />
                      </span>
                    </td>
                    <td className={`whitespace-nowrap px-2 py-2 text-right text-xs font-semibold tabular-nums ${
                      !stock
                        ? 'text-gray-400'
                        : stock.changePercent >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                    }`}>
                      {stock
                        ? `${stock.changePercent >= 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%`
                        : batchEnabled && batchQuoteStatus === 'unavailable'
                          ? 'Unavailable'
                          : 'Loading'}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <span className="inline-flex items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          disabled={editingDisabled || index === 0}
                          aria-label={`Move ${symbol} up`}
                          onClick={() => moveSymbol(symbol, -1)}
                          className="text-[10px] text-gray-400 hover:text-gray-900 disabled:opacity-20 dark:hover:text-white"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={editingDisabled || index === visibleSymbols.length - 1}
                          aria-label={`Move ${symbol} down`}
                          onClick={() => moveSymbol(symbol, 1)}
                          className="text-[10px] text-gray-400 hover:text-gray-900 disabled:opacity-20 dark:hover:text-white"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          disabled={editingDisabled}
                          aria-label={`Remove ${symbol}`}
                          onClick={() => updateSymbols(visibleSymbols.filter((item) => item !== symbol))}
                          className="text-[10px] text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                        >
                          ×
                        </button>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div className="px-4 py-8 text-center text-xs text-gray-500 dark:text-gray-400">
            Add a ticker to start your watchlist.
          </div>
        )}
      </div>
    </div>
  )
}
