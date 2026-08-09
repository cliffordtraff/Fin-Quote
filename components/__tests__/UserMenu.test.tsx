import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UserMenu from '@/components/UserMenu'
import { CurrentUserProvider } from '@/components/CurrentUserProvider'

const mockPush = vi.fn()
const mockReplace = vi.fn()
const mockRefresh = vi.fn()
const mockGetUser = vi.fn()
const mockGetSession = vi.fn()
const mockSignOut = vi.fn()
const mockAccountSignOut = vi.hoisted(() => vi.fn())
const ACCESS_TOKEN = `${'a'.repeat(24)}.${'b'.repeat(48)}.${'c'.repeat(48)}`

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: mockRefresh,
  }),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
      getSession: mockGetSession,
      signOut: mockSignOut,
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  }),
}))

vi.mock('@/app/actions/account-settings', () => ({
  signOutAccountSession: mockAccountSignOut,
}))

describe('UserMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSignOut.mockResolvedValue({ error: null })
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: ACCESS_TOKEN,
          user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
        },
      },
      error: null,
    })
    mockAccountSignOut.mockResolvedValue({
      status: 'updated',
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    })
  })

  it('contains long display names without hiding the full accessible name', async () => {
    const displayName = 'AnExceptionallyLongUnbrokenDisplayNameThatCannotWrap'
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          email: 'reader@example.com',
          email_confirmed_at: '2026-08-01T12:00:00.000Z',
          user_metadata: { display_name: displayName },
        },
      },
    })

    render(
      <CurrentUserProvider>
        <UserMenu />
      </CurrentUserProvider>,
    )

    const trigger = await screen.findByRole('button', {
      name: `Open account menu for ${displayName}`,
    })
    expect(trigger).toHaveClass('max-w-28')
    expect(trigger).toHaveAttribute('title', displayName)
    await waitFor(() => expect(trigger.querySelector('span')).toHaveClass('truncate'))
  })

  it('keeps the menu open and announces resolved sign-out errors', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          email: 'reader@example.com',
          email_confirmed_at: '2026-08-01T12:00:00.000Z',
          user_metadata: { display_name: 'Reader' },
        },
      },
    })
    mockAccountSignOut.mockResolvedValue({
      status: 'upstream_unavailable',
      message: 'Account settings are temporarily unavailable. Please try again.',
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <CurrentUserProvider>
        <UserMenu />
      </CurrentUserProvider>,
    )

    const trigger = await screen.findByRole('button', { name: /open account menu/i })
    fireEvent.click(trigger)
    fireEvent.click(await screen.findByRole('button', { name: 'Logout' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Account settings are temporarily unavailable. Please try again.',
    )
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('leaves the current surface after principal-bound sign-out succeeds', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          email: 'reader@example.com',
          user_metadata: { display_name: 'Reader' },
        },
      },
      error: null,
    })
    render(
      <CurrentUserProvider>
        <UserMenu />
      </CurrentUserProvider>,
    )

    fireEvent.click(await screen.findByRole('button', { name: /open account menu/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }))

    await waitFor(() => {
      expect(mockAccountSignOut).toHaveBeenCalledWith({
        expectedUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        accessToken: ACCESS_TOKEN,
      })
      expect(mockReplace).toHaveBeenCalledWith('/')
      expect(mockRefresh).toHaveBeenCalledOnce()
    })
  })

  it('shows an explicit retry control when authentication is unavailable', async () => {
    mockGetUser
      .mockResolvedValueOnce({
        data: { user: null },
        error: new Error('transport unavailable'),
      })
      .mockResolvedValueOnce({
        data: {
          user: {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            email: 'reader@example.com',
            user_metadata: { display_name: 'Reader' },
          },
        },
        error: null,
      })

    render(
      <CurrentUserProvider>
        <UserMenu />
      </CurrentUserProvider>,
    )

    const retry = await screen.findByRole('button', {
      name: 'Account status unavailable. Retry',
    })
    fireEvent.click(retry)

    expect(await screen.findByRole('button', {
      name: 'Open account menu for Reader',
    })).toBeInTheDocument()
    expect(mockGetUser).toHaveBeenCalledTimes(2)
  })
})
