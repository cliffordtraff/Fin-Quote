import 'server-only'

import { isValidMarketSymbol, normalizeMarketSymbol } from '@/lib/market-symbol'
import { FMP_FUTURES_TO_PRODUCT } from '@/lib/providers/utils'
import { getSymbolValidity } from '@/lib/symbol-resolver'

export type PublicStreamSymbolAdmission =
  | { kind: 'admitted'; symbols: string[] }
  | { kind: 'invalid'; symbol: string }
  | { kind: 'not_found'; symbol: string }
  | { kind: 'unavailable'; symbol: string }

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ??
    new DOMException('The live-stream request was aborted.', 'AbortError')
}

/**
 * Detach one request waiter from the resolver's internally owned shared load.
 * A caller abort must stop admission, but must not cancel a registry query that
 * may also be serving another request.
 */
function waitForDetachedResult<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(abortReason(signal))

  return new Promise<T>((resolve, reject) => {
    let settled = false
    const cleanup = () => signal.removeEventListener('abort', onAbort)
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }
    const onAbort = () => finish(() => reject(abortReason(signal)))

    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    )
  })
}

function isAllowedFuture(symbol: string): boolean {
  return Object.prototype.hasOwnProperty.call(FMP_FUTURES_TO_PRODUCT, symbol)
}

/**
 * Validate a complete public SSE symbol set before the broker is touched.
 * Stocks use the authoritative tri-state registry. Futures bypass that stock
 * registry only when they are exact keys in the provider allowlist.
 */
export async function admitPublicStreamSymbols(
  rawSymbols: readonly string[],
  signal?: AbortSignal,
): Promise<PublicStreamSymbolAdmission> {
  if (signal?.aborted) throw abortReason(signal)

  const symbols = Array.from(new Set(rawSymbols.map(normalizeMarketSymbol)))

  // Finish cheap shape/futures checks for the whole set before starting any
  // registry I/O. In particular, a made-up `ZZZ=F` never reaches either the
  // stock resolver or the futures front-month resolver behind the broker.
  for (const symbol of symbols) {
    if (
      !symbol ||
      !isValidMarketSymbol(symbol) ||
      (symbol.includes('=') && !isAllowedFuture(symbol))
    ) {
      return { kind: 'invalid', symbol }
    }
  }

  const stocks = symbols.filter((symbol) => !symbol.includes('='))
  const validations = await Promise.all(stocks.map(async (symbol) => ({
    symbol,
    validity: await waitForDetachedResult(getSymbolValidity(symbol), signal),
  })))
  if (signal?.aborted) throw abortReason(signal)

  // If any registry query was unavailable, the complete set was not proven
  // safe. Prefer the retryable answer over a partial/ambiguous 404.
  const unavailable = validations.find(({ validity }) => validity === 'unavailable')
  if (unavailable) return { kind: 'unavailable', symbol: unavailable.symbol }

  const absent = validations.find(({ validity }) => validity === 'not_found')
  if (absent) return { kind: 'not_found', symbol: absent.symbol }

  return { kind: 'admitted', symbols }
}
