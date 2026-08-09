import { describe, expect, it, vi } from 'vitest'
import {
  AccountWatchlistStoreError,
  createAccountWatchlistStore,
} from '@/lib/dashboard/account-watchlist-store'

function rpcClient(responses: Array<{
  data: unknown
  error: { message: string } | null
}>) {
  const rpc = vi.fn(() => {
    const response = responses.shift() ?? { data: null, error: null }
    return {
      abortSignal: vi.fn().mockReturnThis(),
      then<TResult1 = typeof response>(
        onfulfilled?: (
          value: typeof response,
        ) => TResult1 | PromiseLike<TResult1>,
      ) {
        return Promise.resolve(response).then(onfulfilled)
      },
    }
  })
  return { client: { rpc }, rpc }
}

describe('account watchlist store', () => {
  it('reads the one authenticated-owner snapshot', async () => {
    const { client, rpc } = rpcClient([{
      data: [{
        symbols: null,
        revision: 0,
        sync_initialized_at: '2026-08-09T12:00:00.000Z',
      }],
      error: null,
    }])

    const result = await createAccountWatchlistStore(client as never).read()

    expect(rpc).toHaveBeenCalledWith('read_primary_watchlist')
    expect(result).toEqual({
      symbols: null,
      revision: 0,
      syncInitializedAt: '2026-08-09T12:00:00.000Z',
    })
  })

  it('preserves the exact command payload for authoritative SQL validation', async () => {
    const { client, rpc } = rpcClient([{
      data: [{
        disposition: 'applied',
        symbols: ['BRK.B'],
        revision: 1,
        sync_initialized_at: '2026-08-09T12:00:00.000Z',
        dropped_symbols: [],
      }],
      error: null,
    }])

    await createAccountWatchlistStore(client as never).sync({
      mode: 'replace',
      symbols: [' brk-b ', 'BRK.B'],
      expectedRevision: 0,
      idempotencyKey: 'watchlist-command-1',
    })

    expect(rpc).toHaveBeenCalledWith('sync_primary_watchlist', {
      p_mode: 'replace',
      p_symbols: [' brk-b ', 'BRK.B'],
      p_expected_revision: 0,
      p_idempotency_key: 'watchlist-command-1',
    })
  })

  it('forwards abort signals to PostgREST', async () => {
    const { client, rpc } = rpcClient([{
      data: [{
        symbols: [],
        revision: 0,
        sync_initialized_at: '2026-08-09T12:00:00.000Z',
      }],
      error: null,
    }])
    const controller = new AbortController()

    await createAccountWatchlistStore(client as never).read(controller.signal)

    const query = rpc.mock.results[0]?.value
    expect(query.abortSignal).toHaveBeenCalledWith(controller.signal)
  })

  it('maps RPC and malformed-response failures to one store error', async () => {
    const failed = rpcClient([{
      data: null,
      error: { message: 'invalid watchlist symbols' },
    }])
    await expect(createAccountWatchlistStore(failed.client as never).sync({
      mode: 'merge',
      symbols: ['ES=F'],
      expectedRevision: null,
      idempotencyKey: 'watchlist-command-2',
    })).rejects.toEqual(expect.objectContaining({
      name: 'AccountWatchlistStoreError',
      message: expect.stringContaining('invalid watchlist symbols'),
    }))

    const malformed = rpcClient([{ data: [{ revision: 0 }], error: null }])
    await expect(
      createAccountWatchlistStore(malformed.client as never).read(),
    ).rejects.toBeInstanceOf(AccountWatchlistStoreError)
  })

  it('rejects malformed command metadata before a request', async () => {
    const { client, rpc } = rpcClient([])
    const store = createAccountWatchlistStore(client as never)

    await expect(store.sync({
      mode: 'replace',
      symbols: [],
      expectedRevision: -1,
      idempotencyKey: 'watchlist-command-3',
    })).rejects.toBeInstanceOf(AccountWatchlistStoreError)
    expect(rpc).not.toHaveBeenCalled()
  })
})
