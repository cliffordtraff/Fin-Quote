import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProfilePage from '@/app/profile/page'

const mockPush = vi.fn()
const mockRefresh = vi.fn()
const mockGetUser = vi.fn()
const mockSignOut = vi.fn()

const mockSupabase = {
  auth: {
    getUser: mockGetUser,
    signOut: mockSignOut,
    updateUser: vi.fn(),
    resend: vi.fn(),
  },
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => mockSupabase,
}))

describe('ProfilePage session controls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'reader@example.com',
          email_confirmed_at: '2026-08-01T12:00:00.000Z',
          created_at: '2026-01-15T12:00:00.000Z',
          app_metadata: { provider: 'google' },
          user_metadata: { display_name: 'Reader' },
        },
      },
    })
    mockSignOut.mockResolvedValue({ error: null })
  })

  it('accurately presents and performs sign out without claiming to delete the account', async () => {
    render(<ProfilePage />)

    const signOutButton = await screen.findByRole('button', { name: 'Sign Out' })
    expect(screen.queryByText(/delete account/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/permanently deleted/i)).not.toBeInTheDocument()
    expect(screen.getByText(/does not delete your account, conversations, or saved data/i)).toBeInTheDocument()

    fireEvent.click(signOutButton)

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledOnce()
      expect(mockPush).toHaveBeenCalledWith('/')
      expect(mockRefresh).toHaveBeenCalledOnce()
    })
  })

  it('shows sign-out errors and keeps the user on the profile page', async () => {
    mockSignOut.mockResolvedValue({ error: new Error('Session could not be cleared') })
    render(<ProfilePage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Sign Out' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Session could not be cleared')
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('announces successful profile updates as status messages', async () => {
    mockSupabase.auth.updateUser.mockResolvedValue({ error: null })
    render(<ProfilePage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Save Changes' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Profile updated successfully!')
  })
})
