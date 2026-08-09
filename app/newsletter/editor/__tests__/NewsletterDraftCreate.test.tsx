import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NewsletterDraftCreate from '../NewsletterDraftCreate'

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navigation.push }),
}))

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn())
})

describe('NewsletterDraftCreate navigation safety', () => {
  it('labels the creation controls and exposes the selected format', () => {
    render(<NewsletterDraftCreate />)

    expect(
      screen.getByRole('heading', { name: 'Start A Draft' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('group', { name: 'Newsletter format' }),
    ).toBeInTheDocument()

    const singleStock = screen.getByRole('button', { name: 'Single stock' })
    const marketRoundup = screen.getByRole('button', {
      name: 'Market roundup',
    })
    expect(singleStock).toHaveAttribute('aria-pressed', 'true')
    expect(marketRoundup).toHaveAttribute('aria-pressed', 'false')
    expect(
      screen.getByRole('textbox', { name: 'Stock ticker' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: 'AI generation prompt' }),
    ).toHaveAccessibleDescription(/Leave this blank for the default deep dive/i)

    fireEvent.click(marketRoundup)

    expect(singleStock).toHaveAttribute('aria-pressed', 'false')
    expect(marketRoundup).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.queryByRole('textbox', { name: 'Stock ticker' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: 'AI generation prompt' }),
    ).toHaveAccessibleDescription(/auto-pick 3-5/i)
  })

  it('does not navigate over edits made while draft creation is in flight', async () => {
    let resolveCreate!: (response: Response) => void
    const pendingCreate = new Promise<Response>((resolve) => {
      resolveCreate = resolve
    })
    vi.mocked(fetch).mockReturnValueOnce(pendingCreate)
    let editSequence = 3
    const beforeNavigate = vi.fn().mockReturnValue(false)

    render(
      <NewsletterDraftCreate
        beforeCreate={() => true}
        getEditSequence={() => editSequence}
        beforeNavigate={beforeNavigate}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Start blank' }))
    editSequence = 4
    await act(async () => {
      resolveCreate(jsonResponse({ draft: { id: 'new-draft' } }, 201))
      await pendingCreate
    })

    expect(beforeNavigate).toHaveBeenCalledWith(3)
    expect(navigation.push).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'newer edits in this editor are still open',
    )
  })

  it('aborts and ignores a late response after its popover unmounts', async () => {
    let resolveCreate!: (response: Response) => void
    const pendingCreate = new Promise<Response>((resolve) => {
      resolveCreate = resolve
    })
    vi.mocked(fetch).mockReturnValueOnce(pendingCreate)
    const beforeNavigate = vi.fn().mockReturnValue(true)
    const { unmount } = render(
      <NewsletterDraftCreate
        beforeCreate={() => true}
        getEditSequence={() => 1}
        beforeNavigate={beforeNavigate}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
    const requestSignal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal
    unmount()
    expect(requestSignal?.aborted).toBe(true)

    await act(async () => {
      resolveCreate(jsonResponse({ draft: { id: 'late-draft' } }, 201))
      await pendingCreate
    })
    expect(beforeNavigate).not.toHaveBeenCalled()
    expect(navigation.push).not.toHaveBeenCalled()
  })
})
