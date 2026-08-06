import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  createServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/auth/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/admin')>()
  return { ...actual, requireAdminUser: mocks.requireAdminUser }
})

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}))

import {
  getErrorCategoryStats,
  getQueriesForReview,
  markQueryCorrect,
  markQueryIncorrect,
} from '@/app/actions/review-query'
import {
  deleteAnnotation,
  getAnnotation,
  getAnnotations,
  getAnnotationsSummary,
  upsertAnnotation,
} from '@/app/actions/annotations'
import { getCostStats } from '@/app/actions/get-costs'
import {
  getQueriesForValidationReview,
  getValidationFailures,
  getValidationStats,
} from '@/app/actions/get-validation-stats'
import { AdminAccessError } from '@/lib/auth/admin'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.requireAdminUser.mockResolvedValue({
    user: { id: 'admin-1', email: 'admin@example.com' },
    isAdmin: true,
    adminConfigured: true,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('admin data action boundaries', () => {
  it('rejects non-admin query-log and reporting actions before creating a service client', async () => {
    const accessError = new AdminAccessError()
    mocks.requireAdminUser.mockRejectedValue(accessError)

    const actions: Array<() => Promise<{ error: string | null }>> = [
      () =>
        markQueryIncorrect({
          queryLogId: 'query-1',
          errorCategory: 'wrong_tool',
        }),
      () => markQueryCorrect({ queryLogId: 'query-1' }),
      () => getQueriesForReview({ filter: 'all' }),
      () => getErrorCategoryStats(),
      () => getCostStats(),
      () => getValidationStats(),
      () => getValidationFailures(),
      () => getQueriesForValidationReview(),
    ]

    for (const action of actions) {
      const result = await action()
      expect(result.error).toBe(accessError.message)
    }

    expect(mocks.requireAdminUser).toHaveBeenCalledTimes(actions.length)
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled()
  })

  it('rejects non-admin annotation actions before creating a service client', async () => {
    const accessError = new AdminAccessError()
    mocks.requireAdminUser.mockRejectedValue(accessError)

    const actions: Array<() => Promise<unknown>> = [
      () => getAnnotations('eval-fast-example.json'),
      () => getAnnotation('eval-fast-example.json', 1),
      () =>
        upsertAnnotation({
          evaluation_file: 'eval-fast-example.json',
          question_id: 1,
          action: 'fix_bug',
        }),
      () => deleteAnnotation('eval-fast-example.json', 1),
      () => getAnnotationsSummary('eval-fast-example.json'),
    ]

    for (const action of actions) {
      await expect(action()).rejects.toThrow(accessError.message)
    }

    expect(mocks.requireAdminUser).toHaveBeenCalledTimes(actions.length)
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled()
  })

  it('uses the service client for an authorized query-log review', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ update }))
    mocks.createServiceRoleClient.mockReturnValue({ from })

    const result = await markQueryCorrect({
      queryLogId: 'query-1',
      reviewerNotes: 'Verified against the source.',
    })

    expect(result).toEqual({ success: true, error: null })
    expect(from).toHaveBeenCalledWith('query_logs')
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewer_notes: 'Verified against the source.',
        reviewed_by: 'admin-1',
      }),
    )
    expect(eq).toHaveBeenCalledWith('id', 'query-1')
    expect(mocks.requireAdminUser.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createServiceRoleClient.mock.invocationCallOrder[0],
    )
  })

  it('uses the service client for authorized annotation reads', async () => {
    const annotation = {
      id: 'annotation-1',
      evaluation_file: 'eval-fast-example.json',
      question_id: 1,
      action: 'fix_bug',
      comment: null,
      created_at: '2026-08-06T12:00:00.000Z',
      updated_at: '2026-08-06T12:00:00.000Z',
    }
    const order = vi.fn().mockResolvedValue({ data: [annotation], error: null })
    const eq = vi.fn(() => ({ order }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    mocks.createServiceRoleClient.mockReturnValue({ from })

    await expect(getAnnotations('eval-fast-example.json')).resolves.toEqual([
      annotation,
    ])
    expect(from).toHaveBeenCalledWith('evaluation_annotations')
    expect(mocks.requireAdminUser.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createServiceRoleClient.mock.invocationCallOrder[0],
    )
  })

  it('uses the service client for authorized cost reporting', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null })
    const select = vi.fn(() => ({ order }))
    const from = vi.fn(() => ({ select }))
    mocks.createServiceRoleClient.mockReturnValue({ from })

    const result = await getCostStats()

    expect(result.error).toBeNull()
    expect(result.data?.total_queries).toBe(0)
    expect(from).toHaveBeenCalledWith('query_logs')
    expect(mocks.requireAdminUser.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createServiceRoleClient.mock.invocationCallOrder[0],
    )
  })

  it('uses the service client for authorized validation reporting', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null })
    const gte = vi.fn(() => ({ order }))
    const not = vi.fn(() => ({ gte }))
    const select = vi.fn(() => ({ not }))
    const from = vi.fn(() => ({ select }))
    mocks.createServiceRoleClient.mockReturnValue({ from })

    const result = await getValidationStats({ days: 7 })

    expect(result.error).toBeNull()
    expect(result.data?.overall.total_queries).toBe(0)
    expect(from).toHaveBeenCalledWith('query_logs')
    expect(mocks.requireAdminUser.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createServiceRoleClient.mock.invocationCallOrder[0],
    )
  })
})
