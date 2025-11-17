'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@watchlist/lib/firebase/auth-context'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading) {
      if (!user) {
        // Not signed in, redirect to auth page
        router.push('/auth')
      } else if (!user.emailVerified && user.providerData[0]?.providerId !== 'google.com') {
        // Email not verified (except for Google users who are auto-verified)
        router.push('/auth')
      }
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f5f5'
      }}>
        <div style={{ fontSize: '1.5rem' }}>Loading...</div>
      </div>
    )
  }

  if (!user || (!user.emailVerified && user.providerData[0]?.providerId !== 'google.com')) {
    return null // Will redirect
  }

  return <>{children}</>
}