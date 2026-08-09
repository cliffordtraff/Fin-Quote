import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RecentQueries from '@/components/RecentQueries'

const mocks = vi.hoisted(() => ({
  getConversations: vi.fn(),
  deleteConversation: vi.fn(),
  getRecentQueries: vi.fn(),
  clearQueryHistory: vi.fn(),
  deleteQuery: vi.fn(),
  push: vi.fn(),
}))

vi.mock('@/app/actions/conversations', () => ({
  getConversations: mocks.getConversations,
  deleteConversation: mocks.deleteConversation,
}))
vi.mock('@/app/actions/get-recent-queries', () => ({
  getRecentQueries: mocks.getRecentQueries,
  clearQueryHistory: mocks.clearQueryHistory,
  deleteQuery: mocks.deleteQuery,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => { resolve = resolvePromise })
  return { promise, resolve }
}

function conversation(id: string, title: string, updatedAt = '2026-08-09T12:00:00.000Z') {
  return {
    id,
    title,
    createdAt: updatedAt,
    updatedAt,
    revision: 1,
  }
}

const A_ID = '00000000-0000-4000-8000-000000000001'
const B_ID = '00000000-0000-4000-8000-000000000002'
const CURSOR = {
  beforeUpdatedAt: '2026-08-09T12:00:00.000Z',
  beforeId: A_ID,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getRecentQueries.mockResolvedValue([])
})

describe('RecentQueries conversation publication and keyset paging', () => {
  it('hides owner A synchronously while owner B is pending or unavailable', async () => {
    const b = deferred<any>()
    mocks.getConversations
      .mockResolvedValueOnce({
        status: 'ready', conversations: [conversation(A_ID, 'Owner A private')], nextCursor: null,
      })
      .mockReturnValueOnce(b.promise)
    const view = render(
      <RecentQueries userId="owner-a" onQueryClick={vi.fn()} />,
    )
    expect(await screen.findByText('Owner A private')).toBeInTheDocument()

    view.rerender(<RecentQueries userId="owner-b" onQueryClick={vi.fn()} />)
    expect(screen.queryByText('Owner A private')).not.toBeInTheDocument()
    b.resolve({ status: 'unavailable', error: 'offline' })
    expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable')
    expect(screen.queryByText('Owner A private')).not.toBeInTheDocument()
  })

  it('ignores owner A late success after owner B publishes', async () => {
    const a = deferred<any>()
    mocks.getConversations
      .mockReturnValueOnce(a.promise)
      .mockResolvedValueOnce({
        status: 'ready', conversations: [conversation(B_ID, 'Owner B chat')], nextCursor: null,
      })
    const view = render(<RecentQueries userId="owner-a" onQueryClick={vi.fn()} />)
    view.rerender(<RecentQueries userId="owner-b" onQueryClick={vi.fn()} />)
    expect(await screen.findByText('Owner B chat')).toBeInTheDocument()
    a.resolve({
      status: 'ready', conversations: [conversation(A_ID, 'Late owner A')], nextCursor: null,
    })
    await waitFor(() => expect(screen.queryByText('Late owner A')).not.toBeInTheDocument())
  })

  it('appends and deduplicates the next keyset page', async () => {
    mocks.getConversations
      .mockResolvedValueOnce({
        status: 'ready', conversations: [conversation(A_ID, 'Newest')], nextCursor: CURSOR,
      })
      .mockResolvedValueOnce({
        status: 'ready',
        conversations: [conversation(A_ID, 'Duplicate'), conversation(B_ID, 'Older')],
        nextCursor: null,
      })
    render(<RecentQueries userId="owner-a" onQueryClick={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Load older chats' }))
    expect(await screen.findByText('Older')).toBeInTheDocument()
    expect(screen.getAllByText('Newest')).toHaveLength(1)
    expect(mocks.getConversations).toHaveBeenLastCalledWith({ limit: 50, ...CURSOR })
  })

  it('retains rows and retry cursor when the next page is unavailable', async () => {
    mocks.getConversations
      .mockResolvedValueOnce({
        status: 'ready', conversations: [conversation(A_ID, 'Newest')], nextCursor: CURSOR,
      })
      .mockResolvedValueOnce({ status: 'unavailable', error: 'offline' })
    render(<RecentQueries userId="owner-a" onQueryClick={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Load older chats' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Newest')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load older chats' })).toBeEnabled()
  })

  it('does not navigate or start a new chat while exact recovery is locked', async () => {
    const onNewChat = vi.fn()
    mocks.getConversations.mockResolvedValueOnce({
      status: 'ready',
      conversations: [conversation(A_ID, 'Pending recovery chat')],
      nextCursor: null,
    })
    render(
      <RecentQueries
        userId="owner-a"
        onQueryClick={vi.fn()}
        onNewChat={onNewChat}
        navigationLocked
      />,
    )

    const newChat = await screen.findByRole('button', { name: 'New chat' })
    expect(newChat).toBeDisabled()
    fireEvent.click(screen.getByText('Pending recovery chat'))
    expect(mocks.push).not.toHaveBeenCalled()
    fireEvent.click(newChat)
    expect(onNewChat).not.toHaveBeenCalled()
  })

  it('lets the newest refresh clear superseded initial/load-more spinners', async () => {
    const older = deferred<any>()
    mocks.getConversations
      .mockResolvedValueOnce({
        status: 'ready', conversations: [conversation(A_ID, 'Initial')], nextCursor: CURSOR,
      })
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce({
        status: 'ready', conversations: [conversation(B_ID, 'Refreshed')], nextCursor: null,
      })
    const view = render(
      <RecentQueries userId="owner-a" refreshTrigger={0} onQueryClick={vi.fn()} />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Load older chats' }))
    view.rerender(
      <RecentQueries userId="owner-a" refreshTrigger={1} onQueryClick={vi.fn()} />,
    )
    expect(await screen.findByText('Refreshed')).toBeInTheDocument()
    expect(screen.queryByText('Loading older chats…')).not.toBeInTheDocument()
    older.resolve({ status: 'unavailable', error: 'late' })
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())

    const initial = deferred<any>()
    mocks.getConversations
      .mockReturnValueOnce(initial.promise)
      .mockResolvedValueOnce({
        status: 'ready', conversations: [conversation(A_ID, 'Silent refresh')], nextCursor: null,
      })
    const second = render(
      <RecentQueries userId="owner-c" refreshTrigger={0} onQueryClick={vi.fn()} />,
    )
    second.rerender(
      <RecentQueries userId="owner-c" refreshTrigger={1} onQueryClick={vi.fn()} />,
    )
    expect(await screen.findByText('Silent refresh')).toBeInTheDocument()
    initial.resolve({ status: 'unavailable', error: 'late initial' })
    await waitFor(() => expect(screen.getByText('Silent refresh')).toBeInTheDocument())
  })
})
