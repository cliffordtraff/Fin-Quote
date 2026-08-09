import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as route from '@/app/api/search-tickers/route'

describe('retired ticker-search route', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a cacheable 410 with the supported replacement', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const response = route.GET()

    expect(response.status).toBe(410)
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=300, s-maxage=3600',
    )
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    await expect(response.json()).resolves.toEqual({
      error: 'Gone',
      message: 'This ticker-search endpoint has been retired.',
      replacement: '/api/search-stocks',
    })
    expect(fetchSpy).not.toHaveBeenCalled()

  })

  it('contains no paid-provider dependency or request path', async () => {
    const source = await readFile(
      path.resolve(process.cwd(), 'app/api/search-tickers/route.ts'),
      'utf8',
    )

    expect(Object.keys(route)).toEqual(['GET'])
    expect(source).not.toMatch(/MASSIVE_API_KEY|api\.massive\.com|\bfetch\s*\(/)
  })
})
