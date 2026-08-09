'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { updateAccountPassword } from '@/app/actions/account-settings'
import { useCurrentUser } from '@/components/CurrentUserProvider'
import { parseAccountSettingsMutationResult } from '@/lib/account-settings-contract'

interface PasswordDraft {
  userId: string
  password: string
  confirmation: string
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-100 px-4 dark:bg-gray-900">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg dark:bg-gray-800">
        {children}
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  const router = useRouter()
  const { accessToken, retry, status, user } = useCurrentUser()
  const currentUserIdRef = useRef<string | null>(user?.id ?? null)
  const currentAccessTokenRef = useRef<string | null>(accessToken)
  currentUserIdRef.current = user?.id ?? null
  currentAccessTokenRef.current = accessToken

  const [draft, setDraft] = useState<PasswordDraft | null>(null)
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)
  const [error, setError] = useState<{ userId: string; message: string } | null>(null)
  const [successUserId, setSuccessUserId] = useState<string | null>(null)

  useEffect(() => {
    if (status !== 'authenticated' || !user || !accessToken) {
      setDraft(null)
      setPendingUserId(null)
      setError(null)
      setSuccessUserId(null)
      return
    }

    setDraft({ userId: user.id, password: '', confirmation: '' })
    setPendingUserId(null)
    setError(null)
    setSuccessUserId(null)
  }, [accessToken, status, user])

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream-100 dark:bg-gray-900">
        <div
          className="h-8 w-8 animate-spin rounded-full border-b-2 border-sage-600"
          aria-label="Checking password recovery session"
        />
      </div>
    )
  }

  if (status === 'unavailable') {
    return (
      <CenteredCard>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Recovery session unavailable</h1>
          <p role="alert" className="mt-3 text-gray-600 dark:text-gray-400">
            We could not safely verify the account for this password change. No password was changed.
          </p>
          <button
            type="button"
            onClick={retry}
            className="mt-6 w-full rounded-lg bg-sage-600 px-4 py-3 font-medium text-white hover:bg-sage-700"
          >
            Retry session check
          </button>
        </div>
      </CenteredCard>
    )
  }

  if (status === 'signed_out' || !user || !accessToken) {
    return (
      <CenteredCard>
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30" aria-hidden="true">
            <span className="text-2xl text-red-600 dark:text-red-400">!</span>
          </div>
          <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">Invalid or Expired Link</h1>
          <p className="mb-6 text-gray-600 dark:text-gray-400">
            This password reset link is invalid or has expired. Please request a new one.
          </p>
          <Link href="/auth/forgot-password" className="inline-block w-full rounded-lg bg-sage-600 px-4 py-3 text-center font-medium text-white hover:bg-sage-700">
            Request New Link
          </Link>
          <Link href="/auth" className="mt-4 block text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
            Back to sign in
          </Link>
        </div>
      </CenteredCard>
    )
  }

  const activeDraft = draft?.userId === user.id ? draft : null
  const activeError = error?.userId === user.id ? error.message : null
  const isPending = pendingUserId === user.id
  const isSuccess = successUserId === user.id

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!activeDraft || isPending) return
    const expectedUserId = activeDraft.userId
    const expectedAccessToken = accessToken
    setError(null)

    if (activeDraft.password !== activeDraft.confirmation) {
      setError({ userId: expectedUserId, message: 'Passwords do not match.' })
      return
    }
    if (Array.from(activeDraft.password).length < 6) {
      setError({ userId: expectedUserId, message: 'Password must be at least 6 characters.' })
      return
    }

    setPendingUserId(expectedUserId)
    try {
      const result = parseAccountSettingsMutationResult(await updateAccountPassword({
        expectedUserId,
        accessToken: expectedAccessToken,
        password: activeDraft.password,
      }))
      if (
        currentUserIdRef.current !== expectedUserId
        || currentAccessTokenRef.current !== expectedAccessToken
      ) return
      if (result.status !== 'updated') {
        setError({ userId: expectedUserId, message: result.message })
        return
      }
      setDraft({ userId: expectedUserId, password: '', confirmation: '' })
      setSuccessUserId(expectedUserId)
    } catch {
      if (
        currentUserIdRef.current === expectedUserId
        && currentAccessTokenRef.current === expectedAccessToken
      ) {
        setError({
          userId: expectedUserId,
          message: 'Password recovery is temporarily unavailable.',
        })
      }
    } finally {
      if (
        currentUserIdRef.current === expectedUserId
        && currentAccessTokenRef.current === expectedAccessToken
      ) {
        setPendingUserId((current) => current === expectedUserId ? null : current)
      }
    }
  }

  if (isSuccess) {
    return (
      <CenteredCard>
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30" aria-hidden="true">
            <span className="text-2xl text-green-600 dark:text-green-400">✓</span>
          </div>
          <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">Password Updated</h1>
          <p role="status" className="mb-6 text-gray-600 dark:text-gray-400">
            Your password has been updated for the verified account.
          </p>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="w-full rounded-lg bg-sage-600 px-4 py-3 font-medium text-white hover:bg-sage-700"
          >
            Continue to App
          </button>
        </div>
      </CenteredCard>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-100 px-4 dark:bg-gray-900">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="text-3xl font-bold text-gray-900 dark:text-white">The Intraday</Link>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Set a new password for {user.email ?? 'your verified account'}.</p>
        </div>
        <div className="rounded-lg bg-white p-8 shadow-lg dark:bg-gray-800" aria-busy={isPending}>
          <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">Create new password</h1>
          <p className="mb-6 text-gray-600 dark:text-gray-400">Your new password must be at least 6 characters long.</p>
          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
            <div>
              <label htmlFor="recovery-password" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">New Password</label>
              <input
                id="recovery-password"
                type="password"
                autoComplete="new-password"
                value={activeDraft?.password ?? ''}
                onChange={(event) => setDraft((current) => current?.userId === user.id
                  ? { ...current, password: event.target.value }
                  : current)}
                disabled={!activeDraft || isPending}
                required
                minLength={6}
                maxLength={512}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-transparent focus:ring-2 focus:ring-sage-500 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="recovery-password-confirmation" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Confirm New Password</label>
              <input
                id="recovery-password-confirmation"
                type="password"
                autoComplete="new-password"
                value={activeDraft?.confirmation ?? ''}
                onChange={(event) => setDraft((current) => current?.userId === user.id
                  ? { ...current, confirmation: event.target.value }
                  : current)}
                disabled={!activeDraft || isPending}
                required
                minLength={6}
                maxLength={512}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-transparent focus:ring-2 focus:ring-sage-500 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
            {activeError && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                {activeError}
              </p>
            )}
            <button
              type="submit"
              disabled={!activeDraft || isPending || !activeDraft.password || !activeDraft.confirmation}
              className="w-full rounded-lg bg-sage-600 px-4 py-3 font-medium text-white hover:bg-sage-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
