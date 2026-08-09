import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'
import ProfilePage from '@/app/profile/page'

const ACCESS_TOKEN = `${'a'.repeat(24)}.${'b'.repeat(48)}.${'c'.repeat(48)}`
const SECOND_ACCESS_TOKEN = `${'d'.repeat(24)}.${'e'.repeat(48)}.${'f'.repeat(48)}`

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  retry: vi.fn(),
  signOut: vi.fn(),
  updateDisplayName: vi.fn(),
  updatePassword: vi.fn(),
  resendVerification: vi.fn(),
  auth: {
    accessToken: null as string | null,
    status: 'authenticated' as 'loading' | 'authenticated' | 'signed_out' | 'unavailable',
    user: null as User | null,
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => mocks,
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock('@/components/CurrentUserProvider', () => ({
  useCurrentUser: () => ({
    accessToken: mocks.auth.accessToken,
    user: mocks.auth.user,
    status: mocks.auth.status,
    loading: mocks.auth.status === 'loading',
    retry: mocks.retry,
  }),
}))

vi.mock('@/app/actions/account-settings', () => ({
  updateAccountDisplayName: mocks.updateDisplayName,
  updateAccountPassword: mocks.updatePassword,
  resendAccountVerification: mocks.resendVerification,
  signOutAccountSession: mocks.signOut,
}))

function user(
  id: string,
  email: string,
  displayName: string,
  provider: 'email' | 'google' = 'email',
): User {
  return {
    id,
    email,
    email_confirmed_at: '2026-08-01T12:00:00.000Z',
    created_at: '2026-01-15T12:00:00.000Z',
    app_metadata: { provider },
    user_metadata: { display_name: displayName },
    aud: 'authenticated',
  } as User
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('ProfilePage principal-bound settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.status = 'authenticated'
    mocks.auth.accessToken = ACCESS_TOKEN
    mocks.auth.user = user(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'reader@example.com',
      'Reader',
    )
    mocks.signOut.mockResolvedValue({
      status: 'updated',
      userId: mocks.auth.user.id,
    })
    mocks.updateDisplayName.mockResolvedValue({
      status: 'updated',
      userId: mocks.auth.user.id,
    })
    mocks.updatePassword.mockResolvedValue({
      status: 'updated',
      userId: mocks.auth.user.id,
    })
    mocks.resendVerification.mockResolvedValue({
      status: 'updated',
      userId: mocks.auth.user.id,
    })
  })

  it('performs sign out without claiming to delete the account', async () => {
    render(<ProfilePage />)

    const signOutButton = await screen.findByRole('button', { name: 'Sign Out' })
    expect(screen.queryByText(/delete account/i)).not.toBeInTheDocument()
    expect(screen.getByText(/does not delete your account, conversations, or saved data/i)).toBeInTheDocument()

    fireEvent.click(signOutButton)
    await waitFor(() => {
      expect(mocks.signOut).toHaveBeenCalledWith({
        expectedUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        accessToken: ACCESS_TOKEN,
      })
      expect(mocks.push).toHaveBeenCalledWith('/')
      expect(mocks.refresh).toHaveBeenCalledOnce()
    })
  })

  it('submits the displayed principal identity with profile mutations', async () => {
    render(<ProfilePage />)

    const input = await screen.findByLabelText('Display Name')
    fireEvent.change(input, { target: { value: '  New Reader  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(mocks.updateDisplayName).toHaveBeenCalledWith({
      expectedUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      accessToken: ACCESS_TOKEN,
      displayName: '  New Reader  ',
    }))
    expect(await screen.findByRole('status')).toHaveTextContent('Profile updated successfully.')
  })

  it('clears old secrets and fences a late result when the principal changes', async () => {
    const firstMutation = deferred<{ status: 'updated'; userId: string }>()
    mocks.updatePassword.mockReturnValueOnce(firstMutation.promise)
    const view = render(<ProfilePage />)

    fireEvent.change(await screen.findByLabelText('New Password'), {
      target: { value: 'old-user-secret' },
    })
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'old-user-secret' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Update Password' }))

    mocks.auth.user = user(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'second@example.com',
      'Second User',
    )
    view.rerender(<ProfilePage />)

    expect(screen.getByText('second@example.com')).toBeInTheDocument()
    expect(screen.getByLabelText('New Password')).toHaveValue('')
    expect(screen.getByLabelText('Confirm New Password')).toHaveValue('')

    await act(async () => {
      firstMutation.resolve({
        status: 'updated',
        userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      })
      await firstMutation.promise
    })
    expect(screen.queryByText('Password updated successfully.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('New Password')).toHaveValue('')
  })

  it('fences a late mutation when the same user rotates to a new session token', async () => {
    const firstMutation = deferred<{ status: 'updated'; userId: string }>()
    mocks.updateDisplayName.mockReturnValueOnce(firstMutation.promise)
    const view = render(<ProfilePage />)

    fireEvent.change(await screen.findByLabelText('Display Name'), {
      target: { value: 'Stale Session Name' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    mocks.auth.accessToken = SECOND_ACCESS_TOKEN
    view.rerender(<ProfilePage />)
    expect(screen.getByLabelText('Display Name')).toHaveValue('Reader')

    await act(async () => {
      firstMutation.resolve({
        status: 'updated',
        userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      })
      await firstMutation.promise
    })
    expect(screen.queryByText('Profile updated successfully.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Display Name')).toHaveValue('Reader')
  })

  it('fails closed when the current account cannot be verified', () => {
    mocks.auth.status = 'unavailable'
    mocks.auth.user = null
    mocks.auth.accessToken = null
    render(<ProfilePage />)

    expect(screen.getByRole('alert')).toHaveTextContent(/could not safely verify/i)
    expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry account check' }))
    expect(mocks.retry).toHaveBeenCalledOnce()
    expect(mocks.updateDisplayName).not.toHaveBeenCalled()
  })

  it('derives verification identity on the server instead of sending an email', async () => {
    mocks.auth.user = {
      ...mocks.auth.user,
      email_confirmed_at: undefined,
    } as User
    render(<ProfilePage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Resend verification' }))
    await waitFor(() => expect(mocks.resendVerification).toHaveBeenCalledWith({
      expectedUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      accessToken: ACCESS_TOKEN,
    }))
  })
})
