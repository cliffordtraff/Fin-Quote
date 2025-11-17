'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@watchlist/lib/firebase/auth-context'
import { useRouter } from 'next/navigation'
import ThemeToggle from '@watchlist/components/ThemeToggle'

interface UserHeaderProps {
  onIncreaseText?: () => void
  onDecreaseText?: () => void
  canIncreaseText?: boolean
  canDecreaseText?: boolean
}

export default function UserHeader({
  onIncreaseText,
  onDecreaseText,
  canIncreaseText = true,
  canDecreaseText = true
}: UserHeaderProps) {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [showDropdown, setShowDropdown] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await logout()
      router.push('/auth')
    } catch (error) {
      console.error('Logout error:', error)
      setLoggingOut(false)
    }
  }

  // Compute user-specific values (safe to call even when user is null)
  const displayName = user ? (user.displayName || user.email?.split('@')[0] || 'User') : 'Guest'
  const initials = displayName
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const showTextControls = Boolean(onIncreaseText || onDecreaseText)
  const decreaseDisabled = !onDecreaseText || !canDecreaseText
  const increaseDisabled = !onIncreaseText || !canIncreaseText
  const NAV_SHORTCUTS = [
    { label: 'Chatbot', href: '/' },
    { label: 'Market', href: '/market' },
    { label: 'Financials', href: '/stock/aapl' }
  ]

  const goBackToMainApp = () => {
    router.push('/')
  }

  const BackToAppButton = () => (
    <button
      type="button"
      onClick={goBackToMainApp}
      aria-label="Return to Fin Quote navigation"
      title="Back to Fin Quote"
      style={{
        height: '36px',
        padding: '0 0.85rem',
        background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        borderRadius: '6px',
        color: 'white',
        cursor: 'pointer',
        fontSize: '0.9rem',
        fontWeight: '500',
        transition: 'all 0.2s',
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
      }}
    >
      <span style={{ fontSize: '1rem', lineHeight: 1 }}>←</span>
      Back to tabs
    </button>
  )

  const NavShortcuts = () => (
    <div style={{ display: 'flex', gap: '0.35rem' }}>
      {NAV_SHORTCUTS.map((link) => (
        <button
          key={link.href}
          type="button"
          onClick={() => router.push(link.href)}
          style={{
            height: '32px',
            padding: '0 0.6rem',
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            borderRadius: '5px',
            color: 'white',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: 500,
            transition: 'all 0.2s',
            display: 'inline-flex',
            alignItems: 'center'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.18)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
          }}
        >
          {link.label}
        </button>
      ))}
    </div>
  )

  // Render sign in button for unauthenticated users
  if (!user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        {showTextControls && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <button
              type="button"
              onClick={onDecreaseText}
              disabled={decreaseDisabled}
              aria-label="Decrease text size"
              title="Decrease text size"
              style={{
                width: '36px',
                height: '36px',
                padding: '0.5rem',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '6px',
                color: 'white',
                cursor: decreaseDisabled ? 'not-allowed' : 'pointer',
                fontSize: '1.125rem',
                fontWeight: '600',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: decreaseDisabled ? 0.5 : 1
              }}
              onMouseEnter={(e) => {
                if (!decreaseDisabled) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
              }}
            >
              -
            </button>
            <button
              type="button"
              onClick={onIncreaseText}
              disabled={increaseDisabled}
              aria-label="Increase text size"
              title="Increase text size"
              style={{
                width: '36px',
                height: '36px',
                padding: '0.5rem',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '6px',
                color: 'white',
                cursor: increaseDisabled ? 'not-allowed' : 'pointer',
                fontSize: '1.125rem',
                fontWeight: '600',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: increaseDisabled ? 0.5 : 1
              }}
              onMouseEnter={(e) => {
                if (!increaseDisabled) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
              }}
            >
              +
            </button>
          </div>
        )}

        {isMounted && <ThemeToggle />}
        <NavShortcuts />
        <BackToAppButton />

        <button
          onClick={() => router.push('/news')}
          style={{
            height: '36px',
            padding: '0 0.8rem',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '6px',
            color: 'white',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: '500',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
          }}
        >
          <span style={{ fontSize: '1rem' }}>📰</span>
          News
        </button>

        <button
          onClick={() => router.push('/auth')}
          style={{
            height: '36px',
            padding: '0 1rem',
            background: '#2962ff',
            border: 'none',
            borderRadius: '6px',
            color: 'white',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: '500',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#1e4fd6'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#2962ff'
          }}
        >
          Sign In
        </button>
      </div>
    )
  }

  // Render user dropdown for authenticated users
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
      {showTextControls && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <button
            type="button"
            onClick={onDecreaseText}
            disabled={decreaseDisabled}
            aria-label="Decrease text size"
            title="Decrease text size"
            style={{
              width: '36px',
              height: '36px',
              padding: '0.5rem',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '6px',
              color: 'white',
              cursor: decreaseDisabled ? 'not-allowed' : 'pointer',
              fontSize: '1.125rem',
              fontWeight: '600',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: decreaseDisabled ? 0.5 : 1
            }}
            onMouseEnter={(e) => {
              if (!decreaseDisabled) {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
            }}
          >
            -
          </button>
          <button
            type="button"
            onClick={onIncreaseText}
            disabled={increaseDisabled}
            aria-label="Increase text size"
            title="Increase text size"
            style={{
              width: '36px',
              height: '36px',
              padding: '0.5rem',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '6px',
              color: 'white',
              cursor: increaseDisabled ? 'not-allowed' : 'pointer',
              fontSize: '1.125rem',
              fontWeight: '600',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: increaseDisabled ? 0.5 : 1
            }}
            onMouseEnter={(e) => {
              if (!increaseDisabled) {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
            }}
          >
            +
          </button>
        </div>
      )}

      <NavShortcuts />
      <BackToAppButton />
      {isMounted && <ThemeToggle />}

      <button
        onClick={() => router.push('/news')}
        style={{
          height: '36px',
          padding: '0 0.8rem',
          background: 'rgba(255, 255, 255, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '6px',
          color: 'white',
          cursor: 'pointer',
          fontSize: '0.9rem',
          fontWeight: '500',
          transition: 'all 0.2s',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
        }}
      >
        <span style={{ fontSize: '1rem' }}>📰</span>
        News
      </button>

      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.25rem 0.75rem',
            background: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '20px',
            cursor: 'pointer',
            fontSize: '0.9rem',
            color: 'white'
          }}
        >
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: '#2962ff',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.75rem',
            fontWeight: 'bold'
          }}>
            {initials}
          </div>
          <span style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', color: 'white' }}>
            {displayName}
          </span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>

        {showDropdown && (
          <>
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 999
              }}
              onClick={() => setShowDropdown(false)}
            />

            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '0.5rem',
              background: 'rgb(var(--watchlist-surface))',
              border: '1px solid rgb(var(--watchlist-border))',
              borderRadius: '8px',
              boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
              minWidth: '200px',
              zIndex: 1000
            }}>
              <div style={{
                padding: '1rem',
                borderBottom: '1px solid rgb(var(--watchlist-border))'
              }}>
                <div style={{ fontWeight: 'bold', marginBottom: '0.25rem', color: 'rgb(var(--watchlist-text-primary))' }}>
                  {displayName}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'rgb(var(--watchlist-text-secondary))' }}>
                  {user.email}
                </div>
              </div>

              <button
                onClick={handleLogout}
                disabled={loggingOut}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '0 0 8px 8px',
                  cursor: loggingOut ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  textAlign: 'left',
                  color: loggingOut ? 'rgb(var(--watchlist-text-muted))' : 'rgb(var(--watchlist-text-primary))',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (!loggingOut) {
                    e.currentTarget.style.background = 'rgb(var(--watchlist-button-hover))'
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                {loggingOut ? 'Logging out...' : 'Log out'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
