'use client'

import { ReactNode } from 'react'
import Navigation from './Navigation'
import Sidebar from './Sidebar'
import RecentQueries from './RecentQueries'
import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { User } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

interface AppLayoutProps {
  children: ReactNode
  showSidebar?: boolean
  onQueryClick?: (conversationId: string) => void
  onNewChat?: () => void
  refreshQueriesTrigger?: number
  currentConversationId?: string | null
}

export default function AppLayout({
  children,
  showSidebar = false,
  onQueryClick,
  onNewChat,
  refreshQueriesTrigger,
  currentConversationId
}: AppLayoutProps) {
  const [user, setUser] = useState<User | null>(null)
  const [sessionId, setSessionId] = useState<string>('')
  const supabase = createClientComponentClient<Database>()

  // Generate or retrieve session ID on mount
  useEffect(() => {
    let id = localStorage.getItem('finquote_session_id')
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('finquote_session_id', id)
    }
    setSessionId(id)
  }, [])

  // Auth state management
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <>
      {showSidebar && (
        <Sidebar>
          <RecentQueries
            userId={user?.id}
            sessionId={!user ? sessionId : undefined}
            onQueryClick={onQueryClick || (() => {})}
            onNewChat={onNewChat}
            refreshTrigger={refreshQueriesTrigger}
            currentConversationId={currentConversationId}
          />
        </Sidebar>
      )}
      <Navigation />
      {children}
    </>
  )
}
