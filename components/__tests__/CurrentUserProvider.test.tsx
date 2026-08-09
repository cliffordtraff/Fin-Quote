import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CurrentUserProvider,
  useCurrentUser,
} from '@/components/CurrentUserProvider'
import {
  AuthSessionMissingError,
  type User,
} from '@supabase/supabase-js'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: mocks.getUser,
      getSession: mocks.getSession,
      signOut: mocks.signOut,
      onAuthStateChange: mocks.onAuthStateChange,
    },
  }),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

const ACCESS_TOKEN = `${'a'.repeat(24)}.${'b'.repeat(48)}.${'c'.repeat(48)}`
const SECOND_ACCESS_TOKEN = `${'d'.repeat(24)}.${'e'.repeat(48)}.${'f'.repeat(48)}`

function Identity({ label }: { label: string }) {
  const { retry, status, user } = useCurrentUser()
  return (
    <div>
      <p>{label}:{status}:{user?.email ?? 'anonymous'}</p>
      <button type="button" onClick={retry}>Retry auth</button>
    </div>
  )
}

describe('CurrentUserProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: ACCESS_TOKEN,
          user: { id: 'user-1' },
        },
      },
      error: null,
    })
    mocks.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mocks.unsubscribe } },
    })
  })

  it('shares one auth read and subscription across every consumer', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const view = render(
      <CurrentUserProvider>
        <Identity label="first" />
        <Identity label="second" />
      </CurrentUserProvider>,
    )

    expect(await screen.findByText('first:signed_out:anonymous')).toBeInTheDocument()
    expect(screen.getByText('second:signed_out:anonymous')).toBeInTheDocument()
    expect(mocks.getUser).toHaveBeenCalledOnce()
    expect(mocks.getSession).not.toHaveBeenCalled()
    expect(mocks.onAuthStateChange).toHaveBeenCalledOnce()

    view.unmount()
    expect(mocks.unsubscribe).toHaveBeenCalledOnce()
  })

  it('does not let a late initial read replace a newer auth event', async () => {
    const initial = deferred<{
      data: { user: User | null }
      error: null
    }>()
    const user = { id: 'user-1', email: 'reader@example.com' } as User
    mocks.getUser
      .mockReturnValueOnce(initial.promise)
      .mockResolvedValueOnce({ data: { user }, error: null })
    let authListener: ((event: string, session: { user: User } | null) => void)
      | undefined
    mocks.onAuthStateChange.mockImplementation((listener) => {
      authListener = listener
      return { data: { subscription: { unsubscribe: mocks.unsubscribe } } }
    })

    render(
      <CurrentUserProvider>
        <Identity label="identity" />
      </CurrentUserProvider>,
    )

    await act(async () => {
      authListener?.('SIGNED_IN', { user })
      await Promise.resolve()
    })
    expect(await screen.findByText('identity:authenticated:reader@example.com')).toBeInTheDocument()

    await act(async () => {
      initial.resolve({ data: { user: null }, error: null })
      await initial.promise
    })
    expect(screen.getByText('identity:authenticated:reader@example.com')).toBeInTheDocument()
  })

  it('does not let a late token snapshot replace a newer principal event', async () => {
    const firstSession = deferred<{
      data: { session: { access_token: string; user: { id: string } } }
      error: null
    }>()
    const firstUser = {
      id: 'user-1',
      email: 'first@example.com',
    } as User
    const secondUser = {
      id: 'user-2',
      email: 'second@example.com',
    } as User
    mocks.getUser
      .mockResolvedValueOnce({ data: { user: firstUser }, error: null })
      .mockResolvedValueOnce({ data: { user: secondUser }, error: null })
    mocks.getSession
      .mockReturnValueOnce(firstSession.promise)
      .mockResolvedValueOnce({
        data: {
          session: {
            access_token: SECOND_ACCESS_TOKEN,
            user: { id: secondUser.id },
          },
        },
        error: null,
      })
    let authListener: ((event: string, session: { user: User } | null) => void)
      | undefined
    mocks.onAuthStateChange.mockImplementation((listener) => {
      authListener = listener
      return { data: { subscription: { unsubscribe: mocks.unsubscribe } } }
    })

    render(
      <CurrentUserProvider>
        <Identity label="identity" />
      </CurrentUserProvider>,
    )
    await waitFor(() => expect(mocks.getSession).toHaveBeenCalledOnce())

    await act(async () => {
      authListener?.('SIGNED_IN', { user: secondUser })
      await Promise.resolve()
    })
    expect(await screen.findByText('identity:authenticated:second@example.com')).toBeInTheDocument()

    await act(async () => {
      firstSession.resolve({
        data: {
          session: {
            access_token: ACCESS_TOKEN,
            user: { id: firstUser.id },
          },
        },
        error: null,
      })
      await firstSession.promise
    })
    expect(screen.getByText('identity:authenticated:second@example.com')).toBeInTheDocument()
  })

  it('revalidates a positive cached-session event before publishing it', async () => {
    const initial = deferred<{
      data: { user: User | null }
      error: null
    }>()
    const cachedUser = {
      id: 'cached-user',
      email: 'cached@example.com',
    } as User
    mocks.getUser
      .mockReturnValueOnce(initial.promise)
      .mockResolvedValueOnce({
        data: { user: null },
        error: new Error('authoritative user lookup failed'),
      })
    let authListener: ((event: string, session: { user: User } | null) => void)
      | undefined
    mocks.onAuthStateChange.mockImplementation((listener) => {
      authListener = listener
      return { data: { subscription: { unsubscribe: mocks.unsubscribe } } }
    })

    render(
      <CurrentUserProvider>
        <Identity label="identity" />
      </CurrentUserProvider>,
    )

    await act(async () => {
      authListener?.('SIGNED_IN', { user: cachedUser })
      await Promise.resolve()
    })
    expect(await screen.findByText('identity:unavailable:anonymous')).toBeInTheDocument()
    expect(screen.queryByText(/cached@example\.com/)).not.toBeInTheDocument()

    await act(async () => {
      initial.resolve({ data: { user: cachedUser }, error: null })
      await initial.promise
    })
    expect(screen.getByText('identity:unavailable:anonymous')).toBeInTheDocument()
  })

  it('keeps transient authentication failures distinct from signed-out state and retries', async () => {
    mocks.getUser
      .mockResolvedValueOnce({
        data: { user: null },
        error: new Error('Auth transport unavailable'),
      })
      .mockResolvedValueOnce({
        data: {
          user: { id: 'user-1', email: 'reader@example.com' } as User,
        },
        error: null,
      })

    render(
      <CurrentUserProvider>
        <Identity label="identity" />
      </CurrentUserProvider>,
    )

    expect(await screen.findByText('identity:unavailable:anonymous')).toBeInTheDocument()
    await act(async () => {
      screen.getByRole('button', { name: 'Retry auth' }).click()
    })
    expect(await screen.findByText('identity:authenticated:reader@example.com')).toBeInTheDocument()
    expect(mocks.getUser).toHaveBeenCalledTimes(2)
    expect(mocks.getSession).toHaveBeenCalledOnce()
    expect(mocks.unsubscribe).toHaveBeenCalledOnce()
  })

  it('classifies a missing session as signed out instead of unavailable', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthSessionMissingError(),
    })

    render(
      <CurrentUserProvider>
        <Identity label="identity" />
      </CurrentUserProvider>,
    )

    expect(await screen.findByText('identity:signed_out:anonymous')).toBeInTheDocument()
  })

  it('fails closed when the cookie token does not belong to the verified user', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'reader@example.com' } as User },
      error: null,
    })
    mocks.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: ACCESS_TOKEN,
          user: { id: 'user-2' },
        },
      },
      error: null,
    })

    render(
      <CurrentUserProvider>
        <Identity label="identity" />
      </CurrentUserProvider>,
    )

    expect(await screen.findByText('identity:unavailable:anonymous')).toBeInTheDocument()
  })

  it('does not let an ambiguous null INITIAL_SESSION hide a transient auth failure', async () => {
    const initial = deferred<{
      data: { user: User | null }
      error: Error
    }>()
    mocks.getUser.mockReturnValue(initial.promise)
    let authListener: ((event: string, session: { user: User } | null) => void)
      | undefined
    mocks.onAuthStateChange.mockImplementation((listener) => {
      authListener = listener
      return { data: { subscription: { unsubscribe: mocks.unsubscribe } } }
    })

    render(
      <CurrentUserProvider>
        <Identity label="identity" />
      </CurrentUserProvider>,
    )

    act(() => authListener?.('INITIAL_SESSION', null))
    expect(screen.getByText('identity:loading:anonymous')).toBeInTheDocument()

    await act(async () => {
      initial.resolve({
        data: { user: null },
        error: new Error('session refresh transport failed'),
      })
      await initial.promise
    })
    expect(screen.getByText('identity:unavailable:anonymous')).toBeInTheDocument()
  })

  it('treats only an explicit null SIGNED_OUT event as authoritative sign-out', async () => {
    const initial = deferred<{
      data: { user: User | null }
      error: null
    }>()
    mocks.getUser.mockReturnValue(initial.promise)
    let authListener: ((event: string, session: { user: User } | null) => void)
      | undefined
    mocks.onAuthStateChange.mockImplementation((listener) => {
      authListener = listener
      return { data: { subscription: { unsubscribe: mocks.unsubscribe } } }
    })

    render(
      <CurrentUserProvider>
        <Identity label="identity" />
      </CurrentUserProvider>,
    )

    act(() => authListener?.('TOKEN_REFRESHED', null))
    expect(screen.getByText('identity:unavailable:anonymous')).toBeInTheDocument()
    act(() => authListener?.('SIGNED_OUT', null))
    expect(screen.getByText('identity:signed_out:anonymous')).toBeInTheDocument()

    await act(async () => {
      initial.resolve({ data: { user: null }, error: null })
      await initial.promise
    })
    expect(screen.getByText('identity:signed_out:anonymous')).toBeInTheDocument()
  })
})
