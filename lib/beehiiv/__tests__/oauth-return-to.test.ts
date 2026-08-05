import { describe, expect, it } from 'vitest'
import { sanitizeBeehiivReturnTo } from '@/lib/beehiiv/oauth'

describe('Beehiiv OAuth return path', () => {
  it('keeps a same-origin application path', () => {
    expect(
      sanitizeBeehiivReturnTo('/newsletter/morning-review?tab=delivery#status'),
    ).toBe('/newsletter/morning-review?tab=delivery#status')
  })

  it.each([
    'https://evil.example/steal',
    '//evil.example/steal',
    '/\\evil.example/steal',
    '/%5cevil.example/steal',
    '/%255cevil.example/steal',
    '/%2fevil.example/steal',
  ])('rejects an external or ambiguously encoded destination: %s', (value) => {
    expect(sanitizeBeehiivReturnTo(value)).toBe('/newsletter/morning-review')
  })
})
