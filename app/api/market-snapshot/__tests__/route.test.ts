import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as route from '@/app/api/market-snapshot/route'

describe('retired combined market-snapshot route', () => {
  it('returns a cacheable 410 with the split snapshot replacements', async () => {
    const response = route.GET()

    expect(response.status).toBe(410)
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=300, s-maxage=3600',
    )
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    await expect(response.json()).resolves.toEqual({
      error: 'Gone',
      message: 'This combined market-snapshot endpoint has been retired.',
      replacements: [
        '/api/market-snapshot/fast',
        '/api/market-snapshot/slow',
        '/api/market-snapshot/live-movers',
      ],
    })
  })

  it('contains no full-dashboard loader dependency or invocation', async () => {
    const source = await readFile(
      path.resolve(process.cwd(), 'app/api/market-snapshot/route.ts'),
      'utf8',
    )

    expect(Object.keys(route)).toEqual(['GET'])
    expect(source).not.toMatch(/fetchAllMarketData|@\/lib\/fetch-market-data/)
  })
})
