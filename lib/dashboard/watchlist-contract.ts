import {
  isValidStockPageSymbol,
  normalizeMarketSymbol,
} from '@/lib/market-symbol'

export const MAX_WATCHLIST_SYMBOLS = 20

export const WATCHLIST_SYNC_MODES = ['replace', 'merge'] as const

export type AccountWatchlistSyncMode = (typeof WATCHLIST_SYNC_MODES)[number]

export type AccountWatchlistSyncDisposition =
  | 'applied'
  | 'unchanged'
  | 'replayed'
  | 'conflict'

export interface AccountWatchlistSnapshot {
  /** `null` selects the product default; `[]` is an intentionally empty list. */
  symbols: string[] | null
  revision: number
  syncInitializedAt: string
}

export interface AccountWatchlistSyncResult extends AccountWatchlistSnapshot {
  disposition: AccountWatchlistSyncDisposition
  /** Symbols omitted when an account-first merge exceeds the hard cap. */
  droppedSymbols: string[]
}

export interface AccountWatchlistSyncCommand {
  mode: AccountWatchlistSyncMode
  /** `null` restores the product default; `[]` explicitly clears the list. */
  symbols: string[] | null
  /** `null` opts out of compare-and-swap for the command. */
  expectedRevision: number | null
  idempotencyKey: string
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Convert an explicitly supplied array into the browser/database symbol shape.
 * Invalid values are ignored at this local-preference boundary. Mutation RPCs
 * remain strict and reject invalid or duplicate wire payloads.
 */
export function normalizeWatchlistSymbols(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  const normalized: string[] = []
  const seen = new Set<string>()

  for (const rawSymbol of value) {
    if (typeof rawSymbol !== 'string') continue
    const symbol = normalizeMarketSymbol(rawSymbol)
    if (!isValidStockPageSymbol(symbol) || seen.has(symbol)) continue

    seen.add(symbol)
    normalized.push(symbol)
    if (normalized.length === MAX_WATCHLIST_SYMBOLS) break
  }

  return normalized
}

function parseCanonicalSymbolArray(
  value: unknown,
  field: string,
  nullable: boolean,
): string[] | null {
  if (value === null && nullable) return null
  if (!Array.isArray(value)) {
    throw new Error(`Invalid account watchlist ${field}`)
  }

  const normalized = normalizeWatchlistSymbols(value)
  const isExact = normalized.length === value.length
    && normalized.every((symbol, index) => symbol === value[index])

  if (!isExact) {
    throw new Error(`Invalid account watchlist ${field}`)
  }

  return normalized
}

function parseRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error('Invalid account watchlist revision')
  }
  return value as number
}

function parseInitializedAt(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 64
    || !Number.isFinite(Date.parse(value))
  ) {
    throw new Error('Invalid account watchlist initialization timestamp')
  }
  return value
}

export function parseAccountWatchlistSnapshot(
  value: unknown,
): AccountWatchlistSnapshot {
  if (!isRecord(value)) throw new Error('Invalid account watchlist snapshot')

  return {
    symbols: parseCanonicalSymbolArray(value.symbols, 'symbols', true),
    revision: parseRevision(value.revision),
    syncInitializedAt: parseInitializedAt(value.sync_initialized_at),
  }
}

export function parseAccountWatchlistSyncResult(
  value: unknown,
): AccountWatchlistSyncResult {
  if (!isRecord(value)) throw new Error('Invalid account watchlist sync result')

  const disposition = value.disposition
  if (
    disposition !== 'applied'
    && disposition !== 'unchanged'
    && disposition !== 'replayed'
    && disposition !== 'conflict'
  ) {
    throw new Error('Invalid account watchlist sync disposition')
  }

  return {
    ...parseAccountWatchlistSnapshot(value),
    disposition,
    droppedSymbols: parseCanonicalSymbolArray(
      value.dropped_symbols,
      'dropped symbols',
      false,
    ) ?? [],
  }
}
