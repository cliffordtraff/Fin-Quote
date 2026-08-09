'use client'

import { useState, useRef, useEffect, useId } from 'react'
import { useRouter } from 'next/navigation'
import { signOutAccountSession } from '@/app/actions/account-settings'
import { useCurrentUser } from '@/components/CurrentUserProvider'
import { parseAccountSettingsMutationResult } from '@/lib/account-settings-contract'

export default function UserMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const currentUserIdRef = useRef<string | null>(null)
  const currentAccessTokenRef = useRef<string | null>(null)
  const menuId = useId()
  const router = useRouter()
  const { accessToken, retry, status, user } = useCurrentUser()
  currentUserIdRef.current = user?.id ?? null
  currentAccessTokenRef.current = accessToken

  useEffect(() => {
    setIsOpen(false)
    setLoading(false)
    setError('')
  }, [status, user?.id])

  // Close the disclosure from pointer, keyboard, or route-level interactions.
  useEffect(() => {
    function handlePointerOutside(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setIsOpen(false)
      menuButtonRef.current?.focus()
    }

    if (!isOpen) return

    document.addEventListener('pointerdown', handlePointerOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const handleLogout = async () => {
    const expectedUserId = currentUserIdRef.current
    const expectedAccessToken = currentAccessTokenRef.current
    if (!expectedUserId || !expectedAccessToken) return
    setLoading(true)
    setError('')
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
        setError(result.message)
        return
      }
      setIsOpen(false)
      retry()
      router.replace('/')
      router.refresh()
    } catch {
      if (
        currentUserIdRef.current === expectedUserId
        && currentAccessTokenRef.current === expectedAccessToken
      ) {
        setError('Failed to sign out. Please try again.')
      }
    } finally {
      if (
        currentUserIdRef.current === expectedUserId
        && currentAccessTokenRef.current === expectedAccessToken
      ) setLoading(false)
    }
  }

  if (status === 'loading') {
    return (
      <button
        type="button"
        disabled
        className="flex h-10 w-10 cursor-wait items-center justify-center rounded-lg text-gray-400 opacity-70 dark:text-gray-500"
        aria-label="Checking account status"
      >
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      </button>
    )
  }

  if (status === 'unavailable') {
    return (
      <button
        type="button"
        onClick={retry}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-amber-600 transition-colors hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
        title="Account status unavailable. Retry"
        aria-label="Account status unavailable. Retry"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        </svg>
      </button>
    )
  }

  // If no user, show a clickable icon that goes to login
  if (status === 'signed_out' || !user) {
    return (
      <button
        type="button"
        onClick={() => router.push('/auth')}
        className="w-10 h-10 rounded-lg text-gray-400 dark:text-gray-500 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        title="Sign in"
        aria-label="Sign in"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
      </button>
    )
  }

  // Get display name from user metadata or email
  const displayName = user.user_metadata?.display_name
    || user.user_metadata?.full_name
    || user.user_metadata?.name
    || user.email?.split('@')[0]
    || 'there'

  // Get first name only
  const firstName = displayName.split(' ')[0]

  return (
    <div className="relative" ref={menuRef}>
      {/* User button */}
      <button
        ref={menuButtonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex max-w-28 items-center gap-1 rounded-lg px-2 py-2 text-gray-700 transition-colors hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700 sm:max-w-40 sm:gap-2 sm:px-3"
        aria-label={`Open account menu for ${displayName}`}
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-haspopup="true"
        title={displayName}
      >
        <span className="min-w-0 truncate text-sm font-medium">Hi, {firstName}</span>
        <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          id={menuId}
          className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-gray-200 bg-white py-2 shadow-lg dark:border-gray-700 dark:bg-gray-800"
        >
          {/* User info */}
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <p className="break-all text-sm font-medium text-gray-900 dark:text-gray-100">{user.email}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {user.email_confirmed_at ? 'Verified account' : 'Email not verified'}
            </p>
          </div>

          {/* Menu items */}
          <div className="py-1">
            {/* Profile */}
            <button
              type="button"
              onClick={() => {
                setIsOpen(false)
                router.push('/profile')
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              Profile & Settings
            </button>

            <button
              type="button"
              onClick={() => {
                setIsOpen(false)
                router.push('/newsletter/operations')
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h10"
                />
              </svg>
              Newsletter Operations
            </button>
          </div>

          {/* Logout */}
          <div className="border-t border-gray-200 dark:border-gray-700 mt-1 pt-1">
            {error && (
              <p role="alert" className="px-4 py-2 text-xs text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={handleLogout}
              disabled={loading}
              className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              {loading ? 'Logging out...' : 'Logout'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
