import { describe, expect, it } from 'vitest'
import { GET, POST } from '@/app/api/dexter-query/route'

describe('Dexter API', () => {
  it.each([
    ['GET', GET],
    ['POST', POST],
  ])('returns a non-cacheable 410 for %s requests', async (_method, handler) => {
    const response = await handler()

    expect(response.status).toBe(410)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ error: 'Dexter is unavailable.' })
  })
})
