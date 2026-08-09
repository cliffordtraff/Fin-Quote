import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  from: vi.fn(),
  selectResults: [] as Array<{ data: unknown[]; error: null }>,
  upsert: vi.fn(),
  update: vi.fn(),
  upsertResults: [] as Array<{ data: unknown[]; error: null }>,
  updateResults: [] as Array<{ data: unknown[]; error: null }>,
}))

vi.mock('@/lib/auth/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/admin')>()
  return { ...actual, requireAdminUser: mocks.requireAdminUser }
})

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: mocks.from }),
}))

import { GET, POST } from '@/app/api/annotations/route'
import { AdminAccessError } from '@/lib/auth/admin'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.selectResults.splice(0)
  mocks.upsertResults.splice(0)
  mocks.updateResults.splice(0)
  mocks.requireAdminUser.mockResolvedValue({
    user: { id: 'admin-1' },
    isAdmin: true,
    adminConfigured: true,
  })
  mocks.upsert.mockImplementation(() => ({
    select: vi.fn(() =>
      Promise.resolve(
        mocks.upsertResults.shift() ?? { data: [{ id: 'created' }], error: null },
      ),
    ),
  }))
  mocks.update.mockImplementation(() => {
    const query = {
      eq: vi.fn(),
      select: vi.fn(() =>
        Promise.resolve(
          mocks.updateResults.shift() ?? {
            data: [{ id: 'updated' }],
            error: null,
          },
        ),
      ),
    }
    query.eq.mockReturnValue(query)
    return query
  })
  mocks.from.mockImplementation(() => {
    const selectQuery = {
      eq: vi.fn(),
      order: vi.fn(),
    }
    selectQuery.eq.mockReturnValue(selectQuery)
    selectQuery.order.mockImplementation(() =>
      Promise.resolve(
        mocks.selectResults.shift() ?? { data: [], error: null },
      ),
    )
    return {
      select: vi.fn(() => selectQuery),
      upsert: mocks.upsert,
      update: mocks.update,
    }
  })
})

describe('annotations API', () => {
  it('requires an administrator', async () => {
    mocks.requireAdminUser.mockRejectedValue(new AdminAccessError())
    const request = new NextRequest(
      'https://theintraday.com/api/annotations?file=eval-fast-2026-01-01.json',
    )

    const response = await GET(request)

    expect(response.status).toBe(403)
  })

  it('rejects path traversal on reads', async () => {
    const request = new NextRequest(
      'https://theintraday.com/api/annotations?file=../../package.json',
    )

    const response = await GET(request)

    expect(response.status).toBe(400)
  })

  it('rejects path traversal on writes', async () => {
    const request = new NextRequest('https://theintraday.com/api/annotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        evaluation_file: '../../package.json',
        timestamp: new Date().toISOString(),
        annotations: [],
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
  })

  it('loads durable annotation rows instead of a deployment-local file', async () => {
    mocks.selectResults.push({
      data: [
        {
          id: 'annotation-1',
          evaluation_file: 'eval-fast-2026-01-01.json',
          question_id: 4,
          action: 'fix_bug',
          comment: 'Guard the empty result.',
          created_at: '2026-08-08T10:00:00.000Z',
          updated_at: '2026-08-08T10:05:00.000Z',
        },
      ],
      error: null,
    })

    const response = await GET(
      new NextRequest(
        'https://theintraday.com/api/annotations?file=eval-fast-2026-01-01.json',
      ),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.from).toHaveBeenCalledWith('evaluation_annotations')
    await expect(response.json()).resolves.toEqual({
      evaluation_file: 'eval-fast-2026-01-01.json',
      timestamp: '2026-08-08T10:05:00.000Z',
      annotations: [
        {
          question_id: 4,
          action: 'fix_bug',
          comment: 'Guard the empty result.',
          updated_at: '2026-08-08T10:05:00.000Z',
        },
      ],
    })
  })

  it('updates only a changed question with the exact server version token', async () => {
    const existing = {
      id: 'annotation-1',
      evaluation_file: 'eval-fast-2026-01-01.json',
      question_id: 4,
      action: 'fix_bug',
      comment: 'Old comment',
      created_at: '2026-08-08T10:00:00.000Z',
      updated_at: '2026-08-08T10:05:00.000Z',
    }
    const latest = {
      ...existing,
      comment: 'New comment',
      updated_at: '2026-08-08T10:07:00.000Z',
    }
    mocks.selectResults.push(
      { data: [existing], error: null },
      { data: [latest], error: null },
    )

    const response = await POST(
      new NextRequest('https://theintraday.com/api/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evaluation_file: existing.evaluation_file,
          timestamp: '2026-08-08T10:06:00.000Z',
          annotations: [
            {
              question_id: 4,
              action: 'fix_bug',
              comment: 'New comment',
              updated_at: existing.updated_at,
            },
          ],
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({
      evaluation_file: existing.evaluation_file,
      question_id: 4,
      action: 'fix_bug',
      comment: 'New comment',
    })
    const updateQuery = mocks.update.mock.results[0]?.value
    expect(updateQuery.eq).toHaveBeenNthCalledWith(1, 'id', existing.id)
    expect(updateQuery.eq).toHaveBeenNthCalledWith(
      2,
      'updated_at',
      existing.updated_at,
    )
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it('rejects a stale full-file value instead of replaying it over a newer row', async () => {
    const existing = {
      id: 'annotation-1',
      evaluation_file: 'eval-fast-2026-01-01.json',
      question_id: 4,
      action: 'fix_bug',
      comment: 'Newer admin edit',
      created_at: '2026-08-08T10:00:00.000Z',
      updated_at: '2026-08-08T10:10:00.000Z',
    }
    mocks.selectResults.push(
      { data: [existing], error: null },
      { data: [existing], error: null },
    )

    const response = await POST(
      new NextRequest('https://theintraday.com/api/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evaluation_file: existing.evaluation_file,
          timestamp: '2026-08-08T10:04:00.000Z',
          annotations: [
            {
              question_id: 4,
              action: 'fix_bug',
              comment: 'Stale edit',
              updated_at: '2026-08-08T10:04:00.000Z',
            },
          ],
        }),
      }),
    )

    expect(response.status).toBe(409)
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.upsert).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({
      latest: { annotations: [{ comment: 'Newer admin edit' }] },
    })
  })

  it('returns the latest durable row when an update loses its CAS race', async () => {
    const existing = {
      id: 'annotation-1',
      evaluation_file: 'eval-fast-2026-01-01.json',
      question_id: 4,
      action: 'fix_bug',
      comment: 'Initial comment',
      created_at: '2026-08-08T10:00:00.000Z',
      updated_at: '2026-08-08T10:05:00.000Z',
    }
    const winner = {
      ...existing,
      comment: 'Concurrent admin won',
      updated_at: '2026-08-08T10:06:00.000Z',
    }
    mocks.selectResults.push(
      { data: [existing], error: null },
      { data: [winner], error: null },
    )
    mocks.updateResults.push({ data: [], error: null })

    const response = await POST(
      new NextRequest('https://theintraday.com/api/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evaluation_file: existing.evaluation_file,
          timestamp: '2026-08-08T10:07:00.000Z',
          annotations: [
            {
              question_id: 4,
              action: 'fix_bug',
              comment: 'Losing edit',
              updated_at: existing.updated_at,
            },
          ],
        }),
      }),
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      latest: { annotations: [{ comment: 'Concurrent admin won' }] },
    })
  })

  it('returns a conflict when a concurrent insert wins the unique key', async () => {
    const winner = {
      id: 'annotation-1',
      evaluation_file: 'eval-fast-2026-01-01.json',
      question_id: 4,
      action: 'fix_bug',
      comment: 'Concurrent insert',
      created_at: '2026-08-08T10:00:00.000Z',
      updated_at: '2026-08-08T10:05:00.000Z',
    }
    mocks.selectResults.push(
      { data: [], error: null },
      { data: [winner], error: null },
    )
    mocks.upsertResults.push({ data: [], error: null })

    const response = await POST(
      new NextRequest('https://theintraday.com/api/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evaluation_file: winner.evaluation_file,
          timestamp: '2026-08-08T10:05:00.000Z',
          annotations: [
            {
              question_id: 4,
              action: 'fix_bug',
              comment: 'Losing insert',
              updated_at: '2026-08-08T10:05:00.000Z',
            },
          ],
        }),
      }),
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      latest: { annotations: [{ comment: 'Concurrent insert' }] },
    })
  })

  it('allows two admins to update different questions from the same snapshot', async () => {
    const firstQuestionWinner = {
      id: 'annotation-1',
      evaluation_file: 'eval-fast-2026-01-01.json',
      question_id: 1,
      action: 'fix_bug',
      comment: 'Admin B changed question one',
      created_at: '2026-08-08T10:00:00.000Z',
      updated_at: '2026-08-08T10:06:00.000Z',
    }
    const secondQuestion = {
      id: 'annotation-2',
      evaluation_file: firstQuestionWinner.evaluation_file,
      question_id: 2,
      action: 'skip',
      comment: 'Original question two',
      created_at: '2026-08-08T10:00:00.000Z',
      updated_at: '2026-08-08T10:05:00.000Z',
    }
    mocks.selectResults.push(
      { data: [firstQuestionWinner, secondQuestion], error: null },
      {
        data: [
          firstQuestionWinner,
          {
            ...secondQuestion,
            comment: 'Admin A changed question two',
            updated_at: '2026-08-08T10:07:00.000Z',
          },
        ],
        error: null,
      },
    )

    const response = await POST(
      new NextRequest('https://theintraday.com/api/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evaluation_file: firstQuestionWinner.evaluation_file,
          timestamp: secondQuestion.updated_at,
          annotations: [
            {
              question_id: 2,
              action: 'skip',
              comment: 'Admin A changed question two',
              updated_at: secondQuestion.updated_at,
            },
          ],
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledOnce()
    const updateQuery = mocks.update.mock.results[0]?.value
    expect(updateQuery.eq).toHaveBeenNthCalledWith(
      1,
      'id',
      secondQuestion.id,
    )
    await expect(response.json()).resolves.toMatchObject({
      annotations: [
        { question_id: 1, comment: 'Admin B changed question one' },
        { question_id: 2, comment: 'Admin A changed question two' },
      ],
    })
  })
})
