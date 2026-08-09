import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EvaluationsPage from '@/app/admin/evaluations/page'

const evaluation = {
  mode: 'fast',
  timestamp: '2026-08-08T10:00:00.000Z',
  total_questions: 1,
  correct_tool: 1,
  correct_args: 0,
  correct_args_semantic: 1,
  fully_correct: 0,
  fully_correct_semantic: 1,
  accuracy: {
    tool_selection: 100,
    args_selection: 0,
    args_selection_semantic: 100,
    overall: 0,
    overall_semantic: 100,
  },
  results: [
    {
      question_id: 7,
      question: 'A minor variation',
      expected_tool: 'quote',
      expected_args: { symbol: 'AAPL' },
      actual_tool: 'quote',
      actual_args: { symbol: 'AAPL', range: '1d' },
      tool_match: true,
      args_match: false,
      args_match_semantic: true,
      overall_correct: false,
      overall_correct_semantic: true,
      routing_latency_ms: 12,
    },
  ],
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('evaluations annotation hydration', () => {
  it('hydrates a card that mounted before its durable annotation arrived', async () => {
    let resolveAnnotations!: (response: Response) => void
    const annotations = new Promise<Response>((resolve) => {
      resolveAnnotations = resolve
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      if (url === '/api/evaluations/latest') {
        return Promise.resolve(
          Response.json({
            filename: 'eval-fast-2026-08-08.json',
            evaluation,
          }),
        )
      }
      if (url.startsWith('/api/annotations?file=')) return annotations
      throw new Error(`Unexpected fetch: ${url}`)
    })

    render(<EvaluationsPage />)

    expect(await screen.findByText('"A minor variation"')).toBeInTheDocument()
    const comment = screen.getByPlaceholderText('Add your notes...')
    expect(comment).toHaveValue('')

    resolveAnnotations(
      Response.json({
        evaluation_file: 'eval-fast-2026-08-08.json',
        timestamp: '2026-08-08T10:05:00.000Z',
        annotations: [
          {
            question_id: 7,
            action: 'skip',
            comment: 'Durable annotation',
            updated_at: '2026-08-08T10:05:00.000Z',
          },
        ],
      }),
    )

    await waitFor(() => expect(comment).toHaveValue('Durable annotation'))
    expect(comment).toBeInTheDocument()
    fireEvent.change(comment, {
      target: { value: 'Still editable' },
    })
    expect(comment).toHaveValue('Still editable')
  })

  it('serializes a newer same-question edit behind the in-flight save', async () => {
    let resolveFirstSave!: (response: Response) => void
    const firstSave = new Promise<Response>((resolve) => {
      resolveFirstSave = resolve
    })
    const postBodies: Array<{
      annotations: Array<{ comment: string; updated_at: string }>
    }> = []
    vi.spyOn(window, 'alert').mockImplementation(() => undefined)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url === '/api/evaluations/latest') {
        return Response.json({
          filename: 'eval-fast-2026-08-08.json',
          evaluation,
        })
      }
      if (url.startsWith('/api/annotations?file=')) {
        return Response.json({
          evaluation_file: 'eval-fast-2026-08-08.json',
          timestamp: '2026-08-08T10:05:00.000Z',
          annotations: [
            {
              question_id: 7,
              action: '',
              comment: 'Initial',
              updated_at: '2026-08-08T10:05:00.000Z',
            },
          ],
        })
      }
      if (url === '/api/annotations' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        postBodies.push(body)
        if (postBodies.length === 1) return firstSave
        const minute = 5 + postBodies.length
        return Response.json({
          evaluation_file: 'eval-fast-2026-08-08.json',
          timestamp: `2026-08-08T10:${String(minute).padStart(2, '0')}:00.000Z`,
          annotations: [
            {
              ...body.annotations[0],
              updated_at: `2026-08-08T10:${String(minute).padStart(2, '0')}:00.000Z`,
            },
          ],
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    render(<EvaluationsPage />)
    const comment = await screen.findByPlaceholderText('Add your notes...')
    await waitFor(() => expect(comment).toHaveValue('Initial'))

    fireEvent.change(comment, { target: { value: 'First edit' } })
    await waitFor(() => expect(postBodies).toHaveLength(1), { timeout: 1_200 })

    fireEvent.change(comment, { target: { value: 'Second edit' } })
    expect(postBodies).toHaveLength(1)

    resolveFirstSave(
      Response.json({
        evaluation_file: 'eval-fast-2026-08-08.json',
        timestamp: '2026-08-08T10:06:00.000Z',
        annotations: [
          {
            question_id: 7,
            action: '',
            comment: 'First edit',
            updated_at: '2026-08-08T10:06:00.000Z',
          },
        ],
      }),
    )

    await waitFor(() => expect(postBodies).toHaveLength(2))
    expect(postBodies[1].annotations[0]).toMatchObject({
      comment: 'Second edit',
      updated_at: '2026-08-08T10:06:00.000Z',
    })
    await waitFor(() => expect(comment).toHaveValue('Second edit'))

    fireEvent.change(comment, { target: { value: 'Third edit' } })
    await waitFor(() => expect(postBodies).toHaveLength(3), { timeout: 1_200 })
    expect(postBodies[2].annotations[0]).toMatchObject({
      comment: 'Third edit',
      updated_at: '2026-08-08T10:07:00.000Z',
    })
  })

  it('retains and retries a queued edit when the in-flight save fails', async () => {
    let rejectFirstSave!: (reason: Error) => void
    const firstSave = new Promise<Response>((_resolve, reject) => {
      rejectFirstSave = reject
    })
    const postBodies: Array<{
      annotations: Array<{ comment: string; updated_at: string }>
    }> = []
    vi.spyOn(window, 'alert').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url === '/api/evaluations/latest') {
        return Response.json({
          filename: 'eval-fast-2026-08-08.json',
          evaluation,
        })
      }
      if (url.startsWith('/api/annotations?file=')) {
        return Response.json({
          evaluation_file: 'eval-fast-2026-08-08.json',
          timestamp: '2026-08-08T10:05:00.000Z',
          annotations: [
            {
              question_id: 7,
              action: '',
              comment: 'Initial',
              updated_at: '2026-08-08T10:05:00.000Z',
            },
          ],
        })
      }
      if (url === '/api/annotations' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        postBodies.push(body)
        if (postBodies.length === 1) return firstSave
        return Response.json({
          evaluation_file: 'eval-fast-2026-08-08.json',
          timestamp: '2026-08-08T10:06:00.000Z',
          annotations: [
            {
              ...body.annotations[0],
              updated_at: '2026-08-08T10:06:00.000Z',
            },
          ],
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    render(<EvaluationsPage />)
    const comment = await screen.findByPlaceholderText('Add your notes...')
    await waitFor(() => expect(comment).toHaveValue('Initial'))

    fireEvent.change(comment, { target: { value: 'First edit' } })
    await waitFor(() => expect(postBodies).toHaveLength(1), { timeout: 1_200 })
    fireEvent.change(comment, { target: { value: 'Queued second edit' } })

    // Let the second edit's debounce fire while the first request owns the
    // per-question lane. It must remain queued even when that request fails.
    await new Promise((resolve) => setTimeout(resolve, 550))
    expect(postBodies).toHaveLength(1)
    rejectFirstSave(new Error('network unavailable'))

    expect(
      await screen.findByText('1 annotation remain unsaved.', undefined, {
        timeout: 1_000,
      }),
    ).toBeInTheDocument()
    await waitFor(() => expect(postBodies).toHaveLength(2), { timeout: 2_000 })
    expect(postBodies[1].annotations[0]).toMatchObject({
      comment: 'Queued second edit',
      updated_at: '2026-08-08T10:05:00.000Z',
    })
    await waitFor(() =>
      expect(screen.queryByText(/annotation remain unsaved/)).toBeNull(),
    )
    expect(comment).toHaveValue('Queued second edit')
  })
})
