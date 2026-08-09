import 'server-only'

import type { createClient } from '@/lib/supabase/server'
import {
  WATCHLIST_SYNC_MODES,
  parseAccountWatchlistSnapshot,
  parseAccountWatchlistSyncResult,
  type AccountWatchlistSnapshot,
  type AccountWatchlistSyncCommand,
  type AccountWatchlistSyncResult,
} from '@/lib/dashboard/watchlist-contract'

type AccountWatchlistClient = Awaited<ReturnType<typeof createClient>>

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/

export interface AccountWatchlistStore {
  read(signal?: AbortSignal): Promise<AccountWatchlistSnapshot>
  sync(
    command: AccountWatchlistSyncCommand,
    signal?: AbortSignal,
  ): Promise<AccountWatchlistSyncResult>
}

export class AccountWatchlistStoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AccountWatchlistStoreError'
  }
}

function assertSyncCommand(command: AccountWatchlistSyncCommand): void {
  if (!WATCHLIST_SYNC_MODES.includes(command.mode)) {
    throw new AccountWatchlistStoreError('Invalid account watchlist sync mode')
  }
  if (
    command.expectedRevision !== null
    && (
      !Number.isSafeInteger(command.expectedRevision)
      || command.expectedRevision < 0
    )
  ) {
    throw new AccountWatchlistStoreError(
      'Invalid account watchlist expected revision',
    )
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(command.idempotencyKey)) {
    throw new AccountWatchlistStoreError(
      'Invalid account watchlist idempotency key',
    )
  }
  if (
    command.symbols !== null
    && (
      !Array.isArray(command.symbols)
      || command.symbols.some((symbol) => typeof symbol !== 'string')
    )
  ) {
    throw new AccountWatchlistStoreError('Invalid account watchlist symbols')
  }
}

/**
 * Build the authenticated RPC adapter. The client may be a server-cookie
 * Supabase client or an equivalent test double; ownership always comes from
 * the JWT inside Postgres, never from a caller-supplied user id.
 */
export function createAccountWatchlistStore(
  client: AccountWatchlistClient,
): AccountWatchlistStore {
  return {
    async read(signal) {
      let query = client.rpc('read_primary_watchlist')
      if (signal) query = query.abortSignal(signal)
      const { data, error } = await query

      if (error) {
        throw new AccountWatchlistStoreError(
          `Failed to read account watchlist: ${error.message}`,
        )
      }
      if (!data || data.length !== 1) {
        throw new AccountWatchlistStoreError(
          'Account watchlist read returned no snapshot',
        )
      }

      try {
        return parseAccountWatchlistSnapshot(data[0])
      } catch {
        throw new AccountWatchlistStoreError(
          'Account watchlist read returned an invalid snapshot',
        )
      }
    },

    async sync(command, signal) {
      assertSyncCommand(command)

      // Do not normalize here. The browser helper prepares local preferences,
      // while the authoritative RPC rejects duplicate or invalid wire input.
      let query = client.rpc('sync_primary_watchlist', {
        p_mode: command.mode,
        p_symbols: command.symbols === null ? null : [...command.symbols],
        p_expected_revision: command.expectedRevision,
        p_idempotency_key: command.idempotencyKey,
      })
      if (signal) query = query.abortSignal(signal)
      const { data, error } = await query

      if (error) {
        throw new AccountWatchlistStoreError(
          `Failed to sync account watchlist: ${error.message}`,
        )
      }
      if (!data || data.length !== 1) {
        throw new AccountWatchlistStoreError(
          'Account watchlist sync returned no result',
        )
      }

      try {
        return parseAccountWatchlistSyncResult(data[0])
      } catch {
        throw new AccountWatchlistStoreError(
          'Account watchlist sync returned an invalid result',
        )
      }
    },
  }
}
