import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}))

import { createNewsletterNotification } from '../notifications'

describe('newsletter notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('refreshes deduplicated notification copy without clearing delivery state', async () => {
    const refreshedRow = {
      id: 'notification-1',
      scope_key: 'owner:owner-1',
      owner_id: 'owner-1',
      session_id: 'session-1',
      market_date: '2026-08-05',
      notification_type: 'morning_completed',
      severity: 'success',
      title: 'Morning newsletter report is ready',
      message: '40 of 40 issues are ready.',
      action_url: '/newsletter/morning-review',
      metadata_json: { readyCount: 40, selectedCount: 40 },
      dedupe_key: 'morning-completed:2026-08-05',
      read_at: '2026-08-05T13:00:00.000Z',
      delivered_at: '2026-08-05T12:30:00.000Z',
      created_at: '2026-08-05T12:00:00.000Z',
      updated_at: '2026-08-05T14:00:00.000Z',
    }
    const builder = {
      insert: vi.fn(),
      update: vi.fn(),
      eq: vi.fn(),
      select: vi.fn(),
      single: vi.fn(),
    }
    for (const method of ['insert', 'update', 'eq', 'select'] as const) {
      builder[method].mockReturnValue(builder)
    }
    builder.single
      .mockResolvedValueOnce({ data: null, error: { code: '23505' } })
      .mockResolvedValueOnce({ data: refreshedRow, error: null })
    mocks.createServiceRoleClient.mockReturnValue({
      from: vi.fn().mockReturnValue(builder),
    })

    const result = await createNewsletterNotification(
      { ownerId: 'owner-1', sessionId: 'session-1' },
      {
        marketDate: '2026-08-05',
        type: 'morning_completed',
        severity: 'success',
        title: 'Morning newsletter report is ready',
        message: '40 of 40 issues are ready.',
        actionUrl: '/newsletter/morning-review',
        metadata: { readyCount: 40, selectedCount: 40 },
        dedupeKey: 'morning-completed:2026-08-05',
      },
    )

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'success',
        message: '40 of 40 issues are ready.',
        metadata_json: { readyCount: 40, selectedCount: 40 },
      }),
    )
    expect(result).toMatchObject({
      created: false,
      notification: {
        message: '40 of 40 issues are ready.',
        readAt: refreshedRow.read_at,
        deliveredAt: refreshedRow.delivered_at,
      },
    })
  })
})
