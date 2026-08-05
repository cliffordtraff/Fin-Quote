import { describe, expect, it } from 'vitest'
import { normalizeExternalHttpUrl } from '@/lib/safe-url'

describe('external URL normalization', () => {
  it('allows public HTTP links', () => {
    expect(normalizeExternalHttpUrl('https://example.com/story?q=1')).toBe(
      'https://example.com/story?q=1',
    )
  })

  it.each([
    'javascript:alert(1)',
    'data:text/html,unsafe',
    'file:///etc/passwd',
    'https://user:secret@example.com/private',
    '/relative/path',
  ])('rejects unsafe URLs: %s', (value) => {
    expect(normalizeExternalHttpUrl(value)).toBeNull()
  })
})
