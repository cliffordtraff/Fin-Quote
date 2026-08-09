import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'
import ResetPasswordPage from '@/app/auth/reset-password/page'

const ACCESS_TOKEN = `${'a'.repeat(24)}.${'b'.repeat(48)}.${'c'.repeat(48)}`

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  retry: vi.fn(),
  updatePassword: vi.fn(),
  auth: {
    accessToken: null as string | null,
    status: 'authenticated' as 'loading' | 'authenticated' | 'signed_out' | 'unavailable',
    user: null as User | null,
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
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
    signOut: vi.fn(),
  }),
}))

vi.mock('@/app/actions/account-settings', () => ({
  updateAccountPassword: mocks.updatePassword,
}))

function user(id: string, email: string): User {
  return {
    id,
    email,
    created_at: '2026-08-09T12:00:00.000Z',
    app_metadata: { provider: 'email' },
    user_metadata: {},
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

describe('ResetPasswordPage principal binding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.status = 'authenticated'
    mocks.auth.accessToken = ACCESS_TOKEN
    mocks.auth.user = user(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'first@example.com',
    )
    mocks.updatePassword.mockResolvedValue({
      status: 'updated',
      userId: mocks.auth.user.id,
    })
  })

  it('binds the password mutation to the verified principal', async () => {
    render(<ResetPasswordPage />)

    fireEvent.change(await screen.findByLabelText('New Password'), {
      target: { value: 'new-password' },
    })
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'new-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Update Password' }))

    await waitFor(() => expect(mocks.updatePassword).toHaveBeenCalledWith({
      expectedUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      accessToken: ACCESS_TOKEN,
      password: 'new-password',
    }))
    expect(await screen.findByRole('status')).toHaveTextContent(/updated for the verified account/i)
  })

  it('clears the first account password and ignores its late success after a switch', async () => {
    const firstMutation = deferred<{ status: 'updated'; userId: string }>()
    mocks.updatePassword.mockReturnValueOnce(firstMutation.promise)
    const view = render(<ResetPasswordPage />)

    fireEvent.change(await screen.findByLabelText('New Password'), {
      target: { value: 'first-secret' },
    })
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'first-secret' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Update Password' }))

    mocks.auth.user = user(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'second@example.com',
    )
    view.rerender(<ResetPasswordPage />)

    expect(screen.getByText(/second@example.com/i)).toBeInTheDocument()
    expect(screen.getByLabelText('New Password')).toHaveValue('')
    expect(screen.getByLabelText('Confirm New Password')).toHaveValue('')

    await act(async () => {
      firstMutation.resolve({
        status: 'updated',
        userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      })
      await firstMutation.promise
    })
    expect(screen.queryByText('Password Updated')).not.toBeInTheDocument()
    expect(screen.getByLabelText('New Password')).toHaveValue('')
  })

  it('fails closed on transient auth errors and retries without exposing a form', () => {
    mocks.auth.status = 'unavailable'
    mocks.auth.user = null
    mocks.auth.accessToken = null
    render(<ResetPasswordPage />)

    expect(screen.getByRole('alert')).toHaveTextContent(/could not safely verify/i)
    expect(screen.queryByLabelText('New Password')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry session check' }))
    expect(mocks.retry).toHaveBeenCalledOnce()
    expect(mocks.updatePassword).not.toHaveBeenCalled()
  })

  it('treats a genuine signed-out state as an expired recovery session', () => {
    mocks.auth.status = 'signed_out'
    mocks.auth.user = null
    mocks.auth.accessToken = null
    render(<ResetPasswordPage />)

    expect(screen.getByRole('heading', { name: 'Invalid or Expired Link' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Request New Link' })).toHaveAttribute(
      'href',
      '/auth/forgot-password',
    )
  })
})
