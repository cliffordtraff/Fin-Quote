import { describe, expect, it } from 'vitest'
import { resolveAuthRedirect } from '@/lib/auth/redirect'

describe('resolveAuthRedirect', () => {
  it('preserves an internal path with query parameters and a hash', () => {
    expect(
      resolveAuthRedirect('/newsletter/editor/draft-1?mode=email#preview'),
    ).toBe('/newsletter/editor/draft-1?mode=email#preview')
  })

  it.each([
    'https://example.com/newsletter',
    '//example.com/newsletter',
    '/\\example.com/newsletter',
    'newsletter/editor/draft-1',
  ])('rejects unsafe redirect value %s', (value) => {
    expect(resolveAuthRedirect(value)).toBe('/dashboard')
  })

  it('supports an explicit fallback', () => {
    expect(resolveAuthRedirect(null, '/newsletter/morning-review')).toBe(
      '/newsletter/morning-review',
    )
  })
})
