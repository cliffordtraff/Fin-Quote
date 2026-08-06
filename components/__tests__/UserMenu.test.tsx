import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UserMenu from '@/components/UserMenu'

const mockPush = vi.fn()
const mockGetUser = vi.fn()
const mockSignOut = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
      signOut: mockSignOut,
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  }),
}))

describe('UserMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSignOut.mockResolvedValue({ error: null })
  })

  it('contains long display names without hiding the full accessible name', async () => {
    const displayName = 'AnExceptionallyLongUnbrokenDisplayNameThatCannotWrap'
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          email: 'reader@example.com',
          email_confirmed_at: '2026-08-01T12:00:00.000Z',
          user_metadata: { display_name: displayName },
        },
      },
    })

    render(<UserMenu />)

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
          email: 'reader@example.com',
          email_confirmed_at: '2026-08-01T12:00:00.000Z',
          user_metadata: { display_name: 'Reader' },
        },
      },
    })
    mockSignOut.mockResolvedValue({ error: new Error('Session could not be cleared') })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(<UserMenu />)

    const trigger = await screen.findByRole('button', { name: /open account menu/i })
    fireEvent.click(trigger)
    fireEvent.click(await screen.findByRole('button', { name: 'Logout' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Session could not be cleared')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })
})
