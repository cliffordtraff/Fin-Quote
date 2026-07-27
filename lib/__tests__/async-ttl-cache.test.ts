import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createAsyncTTLCache,
  createKeyedAsyncTTLCache,
} from '@/lib/async-ttl-cache'

afterEach(() => {
  vi.useRealTimers()
})

describe('createAsyncTTLCache', () => {
  it('reuses a value until its TTL expires', async () => {
    vi.useFakeTimers()
    const getCached = createAsyncTTLCache(1_000)
    const loader = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second')

    await expect(getCached(loader)).resolves.toBe('first')
    await expect(getCached(loader)).resolves.toBe('first')
    expect(loader).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1_001)
    await expect(getCached(loader)).resolves.toBe('second')
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('coalesces concurrent misses and retries rejected loads', async () => {
    const getCached = createAsyncTTLCache(1_000)
    let resolve!: (value: string) => void
    const pendingValue = new Promise<string>((done) => {
      resolve = done
    })
    const loader = vi.fn().mockReturnValue(pendingValue)

    const first = getCached(loader)
    const second = getCached(loader)
    resolve('shared')

    await expect(Promise.all([first, second])).resolves.toEqual(['shared', 'shared'])
    expect(loader).toHaveBeenCalledTimes(1)

    const retryCache = createAsyncTTLCache(1_000)
    const retryLoader = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce('recovered')

    await expect(retryCache(retryLoader)).rejects.toThrow('temporary')
    await expect(retryCache(retryLoader)).resolves.toBe('recovered')
  })
})

describe('createKeyedAsyncTTLCache', () => {
  it('caches independently per key and coalesces matching keys', async () => {
    const getCached = createKeyedAsyncTTLCache<string, string>(1_000)
    const appleLoader = vi.fn().mockResolvedValue('Apple')
    const microsoftLoader = vi.fn().mockResolvedValue('Microsoft')

    await expect(
      Promise.all([
        getCached('AAPL', appleLoader),
        getCached('AAPL', appleLoader),
        getCached('MSFT', microsoftLoader),
      ])
    ).resolves.toEqual(['Apple', 'Apple', 'Microsoft'])

    expect(appleLoader).toHaveBeenCalledTimes(1)
    expect(microsoftLoader).toHaveBeenCalledTimes(1)
  })
})
