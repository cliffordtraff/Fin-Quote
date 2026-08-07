'use client'

import { useState, useRef, useEffect, useId, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

export default function UserMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  // Fetch user on mount
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }
    getUser()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [supabase.auth])

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
    setLoading(true)
    setError('')
    try {
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) throw signOutError
      // Page will auto-update via onAuthStateChange listener
      setIsOpen(false)
    } catch (error) {
      console.error('Logout error:', error)
      setError(error instanceof Error ? error.message : 'Failed to sign out')
    } finally {
      setLoading(false)
    }
  }

  // If no user, show a clickable icon that goes to login
  if (!user) {
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
