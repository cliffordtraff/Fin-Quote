import {
  MAX_WATCHLIST_SYMBOLS,
  WATCHLIST_SYNC_MODES,
  normalizeWatchlistSymbols,
  parseAccountWatchlistSnapshot,
  type AccountWatchlistSnapshot,
  type AccountWatchlistSyncCommand,
  type AccountWatchlistSyncDisposition,
} from '@/lib/dashboard/watchlist-contract'
import { isAccountWatchlistUserId } from '@/lib/dashboard/watchlist-http-contract'

export const ACCOUNT_WATCHLIST_CACHE_KEY = 'the-intraday:account-watchlists:v1'
export const ACCOUNT_WATCHLIST_CACHE_MAX_ACCOUNTS = 3

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/

export interface AccountWatchlistSyncWireResult {
  watchlist: AccountWatchlistSnapshot
  disposition: AccountWatchlistSyncDisposition
  droppedSymbols: string[]
}

export interface CachedAccountWatchlist {
  userId: string
  snapshot: AccountWatchlistSnapshot
  mergedLocalFingerprint: string | null
  pendingCommand: AccountWatchlistSyncCommand | null
  touchedAt: number
}

interface AccountWatchlistCacheEnvelope {
  version: 1
  accounts: CachedAccountWatchlist[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  return Object.keys(value).sort().join(',') === [...expected].sort().join(',')
}

function parseCanonicalSymbols(value: unknown, nullable: boolean): string[] | null {
  if (value === null && nullable) return null
  if (!Array.isArray(value) || value.length > MAX_WATCHLIST_SYMBOLS) {
    throw new Error('Invalid account watchlist symbols')
  }
  const normalized = normalizeWatchlistSymbols(value)
  if (
    normalized.length !== value.length
    || normalized.some((symbol, index) => symbol !== value[index])
  ) {
    throw new Error('Invalid account watchlist symbols')
  }
  return normalized
}

function parseWireSnapshot(value: unknown): AccountWatchlistSnapshot {
  if (!isRecord(value) || !hasExactKeys(
    value,
    ['symbols', 'revision', 'syncInitializedAt'],
  )) {
    throw new Error('Invalid account watchlist response')
  }
  return parseAccountWatchlistSnapshot({
    symbols: value.symbols,
    revision: value.revision,
    sync_initialized_at: value.syncInitializedAt,
  })
}

export function parseAccountWatchlistReadResponse(
  value: unknown,
): AccountWatchlistSnapshot {
  if (!isRecord(value) || !hasExactKeys(value, ['watchlist'])) {
    throw new Error('Invalid account watchlist response')
  }
  return parseWireSnapshot(value.watchlist)
}

export function parseAccountWatchlistSyncResponse(
  value: unknown,
): AccountWatchlistSyncWireResult {
  if (!isRecord(value)) throw new Error('Invalid account watchlist sync response')
  if (!('disposition' in value)) {
    throw new Error('Invalid account watchlist sync response')
  }

  const disposition = value.disposition
  if (
    disposition !== 'applied'
    && disposition !== 'unchanged'
    && disposition !== 'replayed'
    && disposition !== 'conflict'
  ) {
    throw new Error('Invalid account watchlist sync response')
  }
  const expectedKeys = disposition === 'conflict'
    ? ['watchlist', 'disposition', 'droppedSymbols', 'error', 'code']
    : ['watchlist', 'disposition', 'droppedSymbols']
  if (
    !hasExactKeys(value, expectedKeys)
    || (
      disposition === 'conflict'
      && (
        typeof value.error !== 'string'
        || value.error.length < 1
        || value.error.length > 512
        || value.code !== 'WATCHLIST_REVISION_CONFLICT'
      )
    )
  ) {
    throw new Error('Invalid account watchlist sync response')
  }

  return {
    watchlist: parseWireSnapshot(value.watchlist),
    disposition,
    droppedSymbols: parseCanonicalSymbols(value.droppedSymbols, false) ?? [],
  }
}

function parsePendingCommand(value: unknown): AccountWatchlistSyncCommand | null {
  if (value === null) return null
  if (!isRecord(value) || !hasExactKeys(
    value,
    ['mode', 'symbols', 'expectedRevision', 'idempotencyKey'],
  )) {
    throw new Error('Invalid pending account watchlist command')
  }
  const mode = value.mode
  const expectedRevision = value.expectedRevision
  const idempotencyKey = value.idempotencyKey
  if (
    typeof mode !== 'string'
    || !WATCHLIST_SYNC_MODES.includes(mode as AccountWatchlistSyncCommand['mode'])
    || (
      expectedRevision !== null
      && (!Number.isSafeInteger(expectedRevision) || (expectedRevision as number) < 0)
    )
    || typeof idempotencyKey !== 'string'
    || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)
  ) {
    throw new Error('Invalid pending account watchlist command')
  }
  return {
    mode: mode as AccountWatchlistSyncCommand['mode'],
    symbols: parseCanonicalSymbols(value.symbols, true),
    expectedRevision: expectedRevision as number | null,
    idempotencyKey,
  }
}

function parseCacheEntry(value: unknown): CachedAccountWatchlist {
  if (!isRecord(value) || !hasExactKeys(value, [
    'userId',
    'snapshot',
    'mergedLocalFingerprint',
    'pendingCommand',
    'touchedAt',
  ])) {
    throw new Error('Invalid account watchlist cache entry')
  }
  if (
    !isAccountWatchlistUserId(value.userId)
    || (
      value.mergedLocalFingerprint !== null
      && (
        typeof value.mergedLocalFingerprint !== 'string'
        || value.mergedLocalFingerprint.length > 512
      )
    )
    || typeof value.touchedAt !== 'number'
    || !Number.isFinite(value.touchedAt)
    || value.touchedAt < 0
  ) {
    throw new Error('Invalid account watchlist cache entry')
  }
  return {
    userId: value.userId,
    snapshot: parseWireSnapshot(value.snapshot),
    mergedLocalFingerprint: value.mergedLocalFingerprint,
    pendingCommand: parsePendingCommand(value.pendingCommand),
    touchedAt: value.touchedAt,
  }
}

function parseEnvelope(raw: string | null): AccountWatchlistCacheEnvelope {
  if (!raw) return { version: 1, accounts: [] }
  try {
    const value: unknown = JSON.parse(raw)
    if (
      !isRecord(value)
      || value.version !== 1
      || !Array.isArray(value.accounts)
      || value.accounts.length > ACCOUNT_WATCHLIST_CACHE_MAX_ACCOUNTS
    ) {
      return { version: 1, accounts: [] }
    }
    const accounts = value.accounts.map(parseCacheEntry)
    if (new Set(accounts.map((entry) => entry.userId)).size !== accounts.length) {
      return { version: 1, accounts: [] }
    }
    return { version: 1, accounts }
  } catch {
    return { version: 1, accounts: [] }
  }
}

export function readCachedAccountWatchlist(
  storage: Pick<Storage, 'getItem'>,
  userId: string,
): CachedAccountWatchlist | null {
  try {
    const envelope = parseEnvelope(storage.getItem(ACCOUNT_WATCHLIST_CACHE_KEY))
    const entry = envelope.accounts.find((candidate) => candidate.userId === userId)
    return entry ? structuredClone(entry) : null
  } catch {
    return null
  }
}

export function writeCachedAccountWatchlist(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  entry: CachedAccountWatchlist,
): boolean {
  try {
    const parsedEntry = parseCacheEntry(entry)
    const envelope = parseEnvelope(storage.getItem(ACCOUNT_WATCHLIST_CACHE_KEY))
    const accounts = envelope.accounts
      .filter((candidate) => candidate.userId !== parsedEntry.userId)
      .concat(parsedEntry)
      .sort((left, right) => right.touchedAt - left.touchedAt)
      .slice(0, ACCOUNT_WATCHLIST_CACHE_MAX_ACCOUNTS)
    storage.setItem(
      ACCOUNT_WATCHLIST_CACHE_KEY,
      JSON.stringify({ version: 1, accounts }),
    )
    return true
  } catch {
    return false
  }
}

export function fingerprintLocalWatchlist(symbols: string[] | null): string {
  return JSON.stringify(symbols === null ? null : normalizeWatchlistSymbols(symbols))
}

export function createWatchlistIdempotencyKey(): string {
  const randomId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `watchlist:${randomId}`.slice(0, 128)
}
