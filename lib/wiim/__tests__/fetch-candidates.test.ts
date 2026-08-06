import { describe, expect, it } from 'vitest'

import { raceReadOnlyWiimFetch } from '../fetch-candidates'

describe('WIIM candidate fetch cancellation', () => {
  it('returns when the lease is aborted even if a provider read never settles', async () => {
    const controller = new AbortController()
    const reason = new Error('lease budget exhausted')
    const result = raceReadOnlyWiimFetch(
      () => new Promise<never>(() => undefined),
      controller.signal,
    )

    controller.abort(reason)
    await expect(result).rejects.toBe(reason)
  })
})
