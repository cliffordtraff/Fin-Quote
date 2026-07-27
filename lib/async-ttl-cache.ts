/**
 * Small in-process cache for expensive public-data loaders.
 *
 * Vercel Fluid Compute can reuse a warm function instance across requests, so
 * this avoids repeating the same fan-out while still allowing data to refresh.
 * Concurrent misses share one promise to prevent a cache stampede.
 */
export function createAsyncTTLCache<T>(ttlMs: number) {
  let cached: { value: T; expiresAt: number } | null = null
  let pending: Promise<T> | null = null

  return async function getCached(loader: () => Promise<T>): Promise<T> {
    const now = Date.now()

    if (cached && now < cached.expiresAt) {
      return cached.value
    }

    if (pending) {
      return pending
    }

    pending = loader()
      .then((value) => {
        cached = {
          value,
          expiresAt: Date.now() + ttlMs,
        }
        return value
      })
      .finally(() => {
        pending = null
      })

    return pending
  }
}

/**
 * Keyed variant for loaders such as stock pages where many symbols share one
 * function instance. Entries are bounded so a crawler cannot grow memory
 * without limit.
 */
export function createKeyedAsyncTTLCache<K, T>(
  ttlMs: number,
  maxEntries: number = 250
) {
  const cached = new Map<K, { value: T; expiresAt: number }>()
  const pending = new Map<K, Promise<T>>()

  return async function getCached(
    key: K,
    loader: () => Promise<T>
  ): Promise<T> {
    const now = Date.now()
    const entry = cached.get(key)

    if (entry && now < entry.expiresAt) {
      return entry.value
    }

    if (entry) {
      cached.delete(key)
    }

    const existing = pending.get(key)
    if (existing) {
      return existing
    }

    const request = loader()
      .then((value) => {
        if (cached.size >= maxEntries) {
          const oldestKey = cached.keys().next().value
          if (oldestKey !== undefined) {
            cached.delete(oldestKey)
          }
        }

        cached.set(key, {
          value,
          expiresAt: Date.now() + ttlMs,
        })
        return value
      })
      .finally(() => {
        pending.delete(key)
      })

    pending.set(key, request)
    return request
  }
}
