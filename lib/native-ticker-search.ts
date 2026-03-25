export const NATIVE_TICKER_SEARCH_OPEN_EVENT = 'finquote:native-ticker-search-open'
export const NATIVE_TICKER_SEARCH_CLOSE_EVENT = 'finquote:native-ticker-search-close'
export const NATIVE_TICKER_SEARCH_STATE_EVENT = 'finquote:native-ticker-search-state'

export type NativeTickerSearchCloseReason = 'host' | 'selection' | 'dismiss'

export interface NativeTickerSearchOpenDetail {
  query?: string
}

export interface NativeTickerSearchCloseDetail {
  reason?: NativeTickerSearchCloseReason
}

export interface NativeTickerSearchStateDetail {
  open: boolean
}

export function dispatchNativeTickerSearchOpen(detail: NativeTickerSearchOpenDetail = {}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<NativeTickerSearchOpenDetail>(NATIVE_TICKER_SEARCH_OPEN_EVENT, { detail }))
}

export function dispatchNativeTickerSearchClose(detail: NativeTickerSearchCloseDetail = {}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<NativeTickerSearchCloseDetail>(NATIVE_TICKER_SEARCH_CLOSE_EVENT, { detail }))
}

export function dispatchNativeTickerSearchState(detail: NativeTickerSearchStateDetail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<NativeTickerSearchStateDetail>(NATIVE_TICKER_SEARCH_STATE_EVENT, { detail }))
}
