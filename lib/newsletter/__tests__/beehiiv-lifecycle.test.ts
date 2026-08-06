import { describe, expect, it } from 'vitest'
import { classifyBeehiivLifecycle } from '../beehiiv-lifecycle'

const NOW = new Date('2026-07-30T14:00:00.000Z')

describe('Beehiiv lifecycle mapping', () => {
  it('distinguishes a future confirmed post from a published post', () => {
    expect(
      classifyBeehiivLifecycle(
        'confirmed',
        '2026-07-30T15:00:00.000Z',
        NOW,
      ),
    ).toEqual({
      lifecycleStatus: 'scheduled',
      scheduledAt: '2026-07-30T15:00:00.000Z',
      publishedAt: null,
    })
    expect(
      classifyBeehiivLifecycle(
        'confirmed',
        '2026-07-30T13:00:00.000Z',
        NOW,
      ),
    ).toEqual({
      lifecycleStatus: 'published',
      scheduledAt: null,
      publishedAt: '2026-07-30T13:00:00.000Z',
    })
  })

  it('preserves draft and archived states', () => {
    expect(classifyBeehiivLifecycle('draft', null, NOW).lifecycleStatus).toBe(
      'draft',
    )
    expect(
      classifyBeehiivLifecycle('archived', null, NOW).lifecycleStatus,
    ).toBe('archived')
  })

  it('does not invent a publish timestamp for an ambiguous confirmed state', () => {
    expect(classifyBeehiivLifecycle('confirmed', null, NOW)).toEqual({
      lifecycleStatus: 'unknown',
      scheduledAt: null,
      publishedAt: null,
    })
    expect(classifyBeehiivLifecycle('confirmed', 'not-a-date', NOW)).toEqual({
      lifecycleStatus: 'unknown',
      scheduledAt: null,
      publishedAt: null,
    })
  })
})
