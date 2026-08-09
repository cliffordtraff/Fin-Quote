'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  isAuthSessionMissingError,
  type User,
} from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { isSupabaseAccessToken } from '@/lib/supabase/access-token'

export type CurrentUserStatus =
  | 'loading'
  | 'authenticated'
  | 'signed_out'
  | 'unavailable'

interface CurrentUserContextValue {
  user: User | null
  accessToken: string | null
  loading: boolean
  status: CurrentUserStatus
  retry: () => void
}

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null)

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), [])
  const [user, setUser] = useState<User | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [status, setStatus] = useState<CurrentUserStatus>('loading')
  const [retryGeneration, setRetryGeneration] = useState(0)
  const authGenerationRef = useRef(0)

  useEffect(() => {
    let disposed = false
    const validateGeneration = (generation: number) => {
      void supabase.auth.getUser().then(async ({ data, error }) => {
        if (
          disposed ||
          authGenerationRef.current !== generation
        ) return

        if (error && !isAuthSessionMissingError(error)) {
          setUser(null)
          setAccessToken(null)
          setStatus('unavailable')
          return
        }

        const nextUser = data.user ?? null
        if (!nextUser) {
          setUser(null)
          setAccessToken(null)
          setStatus('signed_out')
          return
        }

        const sessionResult = await supabase.auth.getSession()
        if (
          disposed ||
          authGenerationRef.current !== generation
        ) return
        const session = sessionResult.data.session
        if (
          sessionResult.error
          || !session
          || session.user.id !== nextUser.id
          || !isSupabaseAccessToken(session.access_token)
        ) {
          setUser(null)
          setAccessToken(null)
          setStatus('unavailable')
          return
        }

        setUser(nextUser)
        setAccessToken(session.access_token)
        setStatus('authenticated')
      }).catch(() => {
        if (
          disposed ||
          authGenerationRef.current !== generation
        ) return
        setUser(null)
        setAccessToken(null)
        setStatus('unavailable')
      })
    }

    const beginValidation = (defer: boolean) => {
      const generation = authGenerationRef.current + 1
      authGenerationRef.current = generation
      setUser(null)
      setAccessToken(null)
      setStatus('loading')

      if (defer) {
        queueMicrotask(() => {
          if (disposed || authGenerationRef.current !== generation) return
          validateGeneration(generation)
        })
        return
      }
      validateGeneration(generation)
    }

    beginValidation(false)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (disposed) return

        // Auth events expose a local session snapshot, not the result of an
        // authoritative user lookup. Positive events therefore trigger a new
        // getUser() validation, while a null INITIAL_SESSION stays provisional.
        if (event === 'INITIAL_SESSION' && !session?.user) return

        if (session?.user) {
          // Leave the callback before calling another Supabase auth method;
          // auth-js may still hold its internal session lock here.
          beginValidation(true)
          return
        }

        authGenerationRef.current += 1
        setUser(null)
        setAccessToken(null)
        setStatus(event === 'SIGNED_OUT' ? 'signed_out' : 'unavailable')
      },
    )

    return () => {
      disposed = true
      authGenerationRef.current += 1
      subscription.unsubscribe()
    }
  }, [retryGeneration, supabase])

  const retry = useCallback(() => {
    setRetryGeneration((generation) => generation + 1)
  }, [])

  const value = useMemo<CurrentUserContextValue>(
    () => ({
      user,
      accessToken,
      loading: status === 'loading',
      status,
      retry,
    }),
    [accessToken, retry, status, user],
  )

  return (
    <CurrentUserContext.Provider value={value}>
      {children}
    </CurrentUserContext.Provider>
  )
}

export function useCurrentUser(): CurrentUserContextValue {
  const context = useContext(CurrentUserContext)
  if (!context) {
    throw new Error('useCurrentUser must be used within CurrentUserProvider')
  }
  return context
}
