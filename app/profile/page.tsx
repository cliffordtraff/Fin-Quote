'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  resendAccountVerification,
  signOutAccountSession,
  updateAccountDisplayName,
  updateAccountPassword,
} from '@/app/actions/account-settings'
import { useCurrentUser } from '@/components/CurrentUserProvider'
import { parseAccountSettingsMutationResult } from '@/lib/account-settings-contract'

type MutationKind = 'display_name' | 'password' | 'verification' | 'sign_out'

interface ProfileDraft {
  userId: string
  displayName: string
  newPassword: string
  confirmPassword: string
}

interface ProfileNotice {
  userId: string
  kind: 'success' | 'error'
  message: string
}

interface PendingMutation {
  userId: string
  kind: MutationKind
}

function displayNameForUser(user: {
  user_metadata?: Record<string, unknown>
}): string {
  const candidate = user.user_metadata?.display_name
    ?? user.user_metadata?.full_name
  return typeof candidate === 'string' ? candidate : ''
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-100 dark:bg-gray-900">
      <div
        className="h-8 w-8 animate-spin rounded-full border-b-2 border-sage-600"
        aria-label="Checking account status"
      />
    </div>
  )
}

export default function ProfilePage() {
  const router = useRouter()
  const { accessToken, retry, status, user } = useCurrentUser()
  const currentUserIdRef = useRef<string | null>(user?.id ?? null)
  const currentAccessTokenRef = useRef<string | null>(accessToken)
  currentUserIdRef.current = user?.id ?? null
  currentAccessTokenRef.current = accessToken

  const [draft, setDraft] = useState<ProfileDraft | null>(null)
  const [notice, setNotice] = useState<ProfileNotice | null>(null)
  const [pending, setPending] = useState<PendingMutation | null>(null)

  useEffect(() => {
    if (status === 'signed_out') {
      router.replace('/auth')
      return
    }
    if (status !== 'authenticated' || !user || !accessToken) return

    setDraft({
      userId: user.id,
      displayName: displayNameForUser(user),
      newPassword: '',
      confirmPassword: '',
    })
    setNotice(null)
    setPending(null)
  }, [accessToken, router, status, user])

  if (status === 'loading' || status === 'signed_out') return <LoadingScreen />

  if (status === 'unavailable' || !user || !accessToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream-100 px-4 dark:bg-gray-900">
        <div className="w-full max-w-md rounded-lg border border-amber-200 bg-white p-8 text-center shadow-lg dark:border-amber-900 dark:bg-gray-800">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Account status unavailable</h1>
          <p role="alert" className="mt-3 text-sm text-gray-600 dark:text-gray-300">
            We could not safely verify which account is active. No account settings can be changed until verification succeeds.
          </p>
          <button
            type="button"
            onClick={retry}
            className="mt-6 rounded-lg bg-sage-600 px-4 py-2 font-medium text-white hover:bg-sage-700"
          >
            Retry account check
          </button>
        </div>
      </div>
    )
  }

  const activeDraft = draft?.userId === user.id ? draft : null
  const activeNotice = notice?.userId === user.id ? notice : null
  const activePending = pending?.userId === user.id ? pending : null
  const isBusy = activePending !== null
  const isEmailVerified = Boolean(user.email_confirmed_at)
  const isOAuthUser = user.app_metadata?.provider !== 'email'

  const publishNotice = (
    expectedUserId: string,
    expectedAccessToken: string,
    kind: ProfileNotice['kind'],
    message: string,
  ) => {
    if (
      currentUserIdRef.current !== expectedUserId
      || currentAccessTokenRef.current !== expectedAccessToken
    ) return
    setNotice({ userId: expectedUserId, kind, message })
  }

  const finishMutation = (
    expectedUserId: string,
    expectedAccessToken: string,
    kind: MutationKind,
  ) => {
    if (
      currentUserIdRef.current !== expectedUserId
      || currentAccessTokenRef.current !== expectedAccessToken
    ) return
    setPending((current) => (
      current?.userId === expectedUserId && current.kind === kind ? null : current
    ))
  }

  const handleUpdateProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!activeDraft || isBusy) return
    const expectedUserId = activeDraft.userId
    const expectedAccessToken = accessToken
    setNotice(null)
    setPending({ userId: expectedUserId, kind: 'display_name' })

    try {
      const result = parseAccountSettingsMutationResult(await updateAccountDisplayName({
        expectedUserId,
        accessToken: expectedAccessToken,
        displayName: activeDraft.displayName,
      }))
      if (result.status !== 'updated') {
        publishNotice(expectedUserId, expectedAccessToken, 'error', result.message)
        return
      }
      publishNotice(expectedUserId, expectedAccessToken, 'success', 'Profile updated successfully.')
      retry()
    } catch {
      publishNotice(expectedUserId, expectedAccessToken, 'error', 'Profile settings are temporarily unavailable.')
    } finally {
      finishMutation(expectedUserId, expectedAccessToken, 'display_name')
    }
  }

  const handleUpdatePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!activeDraft || isBusy) return
    const expectedUserId = activeDraft.userId
    const expectedAccessToken = accessToken
    setNotice(null)

    if (activeDraft.newPassword !== activeDraft.confirmPassword) {
      publishNotice(expectedUserId, expectedAccessToken, 'error', 'New passwords do not match.')
      return
    }
    if (Array.from(activeDraft.newPassword).length < 6) {
      publishNotice(expectedUserId, expectedAccessToken, 'error', 'Password must be at least 6 characters.')
      return
    }

    setPending({ userId: expectedUserId, kind: 'password' })
    try {
      const result = parseAccountSettingsMutationResult(await updateAccountPassword({
        expectedUserId,
        accessToken: expectedAccessToken,
        password: activeDraft.newPassword,
      }))
      if (result.status !== 'updated') {
        publishNotice(expectedUserId, expectedAccessToken, 'error', result.message)
        return
      }
      if (
        currentUserIdRef.current !== expectedUserId
        || currentAccessTokenRef.current !== expectedAccessToken
      ) return
      setDraft((current) => current?.userId === expectedUserId
        ? { ...current, newPassword: '', confirmPassword: '' }
        : current)
      publishNotice(expectedUserId, expectedAccessToken, 'success', 'Password updated successfully.')
    } catch {
      publishNotice(expectedUserId, expectedAccessToken, 'error', 'Profile settings are temporarily unavailable.')
    } finally {
      finishMutation(expectedUserId, expectedAccessToken, 'password')
    }
  }

  const handleResendVerification = async () => {
    if (!activeDraft || isBusy) return
    const expectedUserId = activeDraft.userId
    const expectedAccessToken = accessToken
    setNotice(null)
    setPending({ userId: expectedUserId, kind: 'verification' })
    try {
      const result = parseAccountSettingsMutationResult(
        await resendAccountVerification({
          expectedUserId,
          accessToken: expectedAccessToken,
        }),
      )
      if (result.status !== 'updated') {
        publishNotice(expectedUserId, expectedAccessToken, 'error', result.message)
        return
      }
      publishNotice(expectedUserId, expectedAccessToken, 'success', 'Verification email sent. Check your inbox.')
    } catch {
      publishNotice(expectedUserId, expectedAccessToken, 'error', 'Profile settings are temporarily unavailable.')
    } finally {
      finishMutation(expectedUserId, expectedAccessToken, 'verification')
    }
  }

  const handleSignOut = async () => {
    if (!activeDraft || isBusy) return
    const expectedUserId = activeDraft.userId
    const expectedAccessToken = accessToken
    setNotice(null)
    setPending({ userId: expectedUserId, kind: 'sign_out' })
    try {
      const result = parseAccountSettingsMutationResult(
        await signOutAccountSession({
          expectedUserId,
          accessToken: expectedAccessToken,
        }),
      )
      if (
        currentUserIdRef.current !== expectedUserId
        || currentAccessTokenRef.current !== expectedAccessToken
      ) return
      if (result.status !== 'updated') {
        publishNotice(expectedUserId, expectedAccessToken, 'error', result.message)
        return
      }
      retry()
      router.push('/')
      router.refresh()
    } catch {
      publishNotice(expectedUserId, expectedAccessToken, 'error', 'Failed to sign out. Please try again.')
    } finally {
      finishMutation(expectedUserId, expectedAccessToken, 'sign_out')
    }
  }

  return (
    <div className="min-h-screen bg-cream-100 px-4 py-12 dark:bg-gray-900">
      <main className="mx-auto max-w-2xl" aria-busy={isBusy}>
        <div className="mb-8">
          <Link
            href="/"
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            <span aria-hidden="true">←</span>
            Back to home
          </Link>
          <h1 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white">Profile Settings</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Manage your account settings and preferences.</p>
        </div>

        {activeNotice && (
          <div
            role={activeNotice.kind === 'error' ? 'alert' : 'status'}
            className={`mb-6 rounded-lg border px-4 py-3 text-sm ${activeNotice.kind === 'error'
              ? 'border-red-200 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400'
              : 'border-green-200 bg-green-50 text-green-600 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400'}`}
          >
            {activeNotice.message}
          </div>
        )}

        <section className="mb-6 rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800" aria-labelledby="account-information-heading">
          <h2 id="account-information-heading" className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Account Information</h2>
          <dl className="space-y-4">
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</dt>
              <dd className="mt-1 break-all text-gray-900 dark:text-white">{user.email ?? 'Unavailable'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Account Type</dt>
              <dd className="mt-1 capitalize text-gray-900 dark:text-white">
                {isOAuthUser ? `${String(user.app_metadata?.provider ?? 'OAuth')} Account` : 'Email & Password'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Email Status</dt>
              <dd className="mt-1 flex items-center gap-2">
                <span className={isEmailVerified
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-yellow-600 dark:text-yellow-400'}
                >
                  {isEmailVerified ? 'Verified' : 'Not verified'}
                </span>
                {!isEmailVerified && (
                  <button
                    type="button"
                    onClick={() => void handleResendVerification()}
                    disabled={isBusy || !activeDraft}
                    className="text-sm text-sage-600 hover:underline disabled:opacity-50 dark:text-sage-400"
                  >
                    {activePending?.kind === 'verification' ? 'Sending…' : 'Resend verification'}
                  </button>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Member Since</dt>
              <dd className="mt-1 text-gray-900 dark:text-white">
                {new Date(user.created_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </dd>
            </div>
          </dl>
        </section>

        <section className="mb-6 rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800" aria-labelledby="update-profile-heading">
          <h2 id="update-profile-heading" className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Update Profile</h2>
          <form onSubmit={(event) => void handleUpdateProfile(event)} className="space-y-4">
            <div>
              <label htmlFor="profile-display-name" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Display Name</label>
              <input
                id="profile-display-name"
                type="text"
                value={activeDraft?.displayName ?? ''}
                onChange={(event) => setDraft((current) => current?.userId === user.id
                  ? { ...current, displayName: event.target.value }
                  : current)}
                disabled={!activeDraft || isBusy}
                maxLength={320}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-transparent focus:ring-2 focus:ring-sage-500 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                placeholder="Your display name"
              />
            </div>
            <button
              type="submit"
              disabled={!activeDraft || isBusy}
              className="rounded-lg bg-sage-600 px-4 py-2 font-medium text-white transition-colors hover:bg-sage-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {activePending?.kind === 'display_name' ? 'Saving…' : 'Save Changes'}
            </button>
          </form>
        </section>

        {!isOAuthUser && (
          <section className="mb-6 rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800" aria-labelledby="change-password-heading">
            <h2 id="change-password-heading" className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Change Password</h2>
            <form onSubmit={(event) => void handleUpdatePassword(event)} className="space-y-4">
              <div>
                <label htmlFor="profile-new-password" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">New Password</label>
                <input
                  id="profile-new-password"
                  type="password"
                  autoComplete="new-password"
                  value={activeDraft?.newPassword ?? ''}
                  onChange={(event) => setDraft((current) => current?.userId === user.id
                    ? { ...current, newPassword: event.target.value }
                    : current)}
                  disabled={!activeDraft || isBusy}
                  minLength={6}
                  maxLength={512}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-transparent focus:ring-2 focus:ring-sage-500 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="profile-confirm-password" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Confirm New Password</label>
                <input
                  id="profile-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={activeDraft?.confirmPassword ?? ''}
                  onChange={(event) => setDraft((current) => current?.userId === user.id
                    ? { ...current, confirmPassword: event.target.value }
                    : current)}
                  disabled={!activeDraft || isBusy}
                  minLength={6}
                  maxLength={512}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-transparent focus:ring-2 focus:ring-sage-500 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <button
                type="submit"
                disabled={!activeDraft || isBusy || !activeDraft.newPassword || !activeDraft.confirmPassword}
                className="rounded-lg bg-sage-600 px-4 py-2 font-medium text-white transition-colors hover:bg-sage-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {activePending?.kind === 'password' ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          </section>
        )}

        <section className="rounded-lg border border-cream-300 bg-white p-6 shadow-lg dark:border-gray-700 dark:bg-gray-800" aria-labelledby="session-heading">
          <h2 id="session-heading" className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Your Session</h2>
          <p className="mb-4 text-gray-600 dark:text-gray-400">
            Sign out of this browser. This does not delete your account, conversations, or saved data.
          </p>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={!activeDraft || isBusy}
            className="rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-700"
          >
            {activePending?.kind === 'sign_out' ? 'Signing out…' : 'Sign Out'}
          </button>
        </section>
      </main>
    </div>
  )
}
