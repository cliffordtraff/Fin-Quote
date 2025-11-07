'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { getRecentQueries, clearQueryHistory, deleteQuery, type RecentQuery } from '@/app/actions/get-recent-queries'
import { getConversations, deleteConversation } from '@/app/actions/conversations'
import type { Conversation } from '@/lib/database.types'
import { useRouter } from 'next/navigation'

type RecentQueriesProps = {
  userId?: string
  sessionId?: string
  onQueryClick: (question: string) => void
  onNewChat?: () => void
  refreshTrigger?: number // Used to trigger refresh after new query
  currentConversationId?: string | null // Highlight the active conversation
}

export default function RecentQueries({ userId, sessionId, onQueryClick, onNewChat, refreshTrigger, currentConversationId }: RecentQueriesProps) {
  const [queries, setQueries] = useState<RecentQuery[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const loadQueries = useCallback(async (showLoading = true) => {
    console.log('[RecentQueries] loadQueries called, showLoading:', showLoading)
    if (!userId && !sessionId) {
      console.log('[RecentQueries] No userId or sessionId, returning early')
      return
    }

    if (showLoading) {
      setLoading(true)
    }

    // If user is authenticated, load conversations from database
    if (userId) {
      console.log('[RecentQueries] Fetching conversations for userId:', userId)
      const { conversations: convData, error } = await getConversations()
      if (!error && convData) {
        console.log('[RecentQueries] Received conversations:', convData.length, 'conversations')
        console.log('[RecentQueries] Conversation titles:', convData.map(c => c.title))
        setConversations(convData)
      } else {
        console.log('[RecentQueries] Error fetching conversations:', error)
      }
    } else {
      // For non-authenticated users, load query logs
      console.log('[RecentQueries] Fetching query logs for sessionId:', sessionId)
      const data = await getRecentQueries({ userId, sessionId })
      console.log('[RecentQueries] Received queries:', data.length, 'queries')
      setQueries(data)
    }

    if (showLoading) {
      setLoading(false)
    }
  }, [userId, sessionId])

  // Load queries on mount
  useEffect(() => {
    console.log('[RecentQueries] Mount useEffect triggered')
    loadQueries(true)  // Show loading spinner on initial load
  }, [loadQueries])

  // Silently refresh when refreshTrigger changes (no loading spinner)
  useEffect(() => {
    console.log('[RecentQueries] refreshTrigger useEffect triggered, refreshTrigger:', refreshTrigger)
    if (refreshTrigger && refreshTrigger > 0) {
      console.log('[RecentQueries] Calling loadQueries(false) due to refresh trigger')
      loadQueries(false)  // Silent background refresh
    }
  }, [refreshTrigger, loadQueries])

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null)
      }
    }

    if (openMenuId) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [openMenuId])

  const handleDeleteQuery = async (queryId: string) => {
    const result = await deleteQuery(queryId)

    if (result.success) {
      setQueries(prev => prev.filter(q => q.id !== queryId))
      setOpenMenuId(null)
    } else {
      alert('Failed to delete query. Please try again.')
    }
  }

  const handleDeleteConversation = async (conversationId: string) => {
    if (!confirm('Are you sure you want to delete this conversation?')) return

    const { success, error } = await deleteConversation(conversationId)

    if (success) {
      setConversations(prev => prev.filter(c => c.id !== conversationId))
      setOpenMenuId(null)

      // If we deleted the current conversation, redirect to new chat
      if (conversationId === currentConversationId) {
        router.push('/ask')
        if (onNewChat) onNewChat()
      }
    } else {
      alert('Failed to delete conversation. Please try again.')
    }
  }

  const handleConversationClick = (conversationId: string) => {
    router.push(`/ask?id=${conversationId}`)
  }

  const handleClearHistory = async () => {
    if (!confirm('Are you sure you want to clear your query history?')) return

    setClearing(true)
    const result = await clearQueryHistory({ userId, sessionId })

    if (result.success) {
      setQueries([])
    } else {
      alert('Failed to clear history. Please try again.')
    }

    setClearing(false)
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Website Title */}
      <div className="px-4 py-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Fin Quote</h1>
      </div>

      {/* New Chat Button */}
      <div className="border-b border-gray-200 dark:border-[rgb(26,26,26)] mt-4">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-3 px-4 h-16 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
        >
          <svg className="w-6 h-6 text-gray-700 dark:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          <span className="text-xl font-light text-gray-900 dark:text-gray-100">New chat</span>
        </button>
      </div>

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-[rgb(26,26,26)] flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-400">Chats</h2>
      </div>

      {/* Conversation/Query List */}
      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 dark:[&::-webkit-scrollbar-track]:bg-[rgb(26,26,26)] [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-[rgb(60,60,60)] [&::-webkit-scrollbar-thumb]:rounded-full dark:[&::-webkit-scrollbar-thumb]:hover:bg-[rgb(70,70,70)]">
        {/* For authenticated users: show conversations */}
        {userId ? (
          conversations.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <svg
                className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600 mb-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              <p className="text-xl text-gray-500 dark:text-gray-400">No conversations yet</p>
              <p className="text-lg text-gray-400 dark:text-gray-500 mt-1">Your conversations will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-[rgb(30,30,30)]">
              {conversations.map((conversation) => {
                const isActive = conversation.id === currentConversationId
                return (
                  <div
                    key={conversation.id}
                    onClick={() => handleConversationClick(conversation.id)}
                    className={`relative w-full px-4 transition-colors group h-16 flex items-center cursor-pointer ${
                      isActive
                        ? 'bg-gray-50 dark:bg-[rgb(40,40,40)]'
                        : 'hover:bg-gray-50 dark:hover:bg-[rgb(40,40,40)]'
                    }`}
                  >
                    <div className="flex-1 text-left pr-16 max-w-[440px]">
                      <p className="text-xl font-light truncate text-gray-900 dark:text-gray-100">
                        {conversation.title}
                      </p>
                    </div>

                    {/* Three-dot menu button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenMenuId(openMenuId === conversation.id ? null : conversation.id)
                      }}
                      className="absolute right-2 p-2 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-600 transition-opacity"
                    >
                      <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                      </svg>
                    </button>

                    {/* Dropdown menu */}
                    {openMenuId === conversation.id && (
                      <div
                        ref={menuRef}
                        className="absolute right-2 top-12 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-50 min-w-[180px]"
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteConversation(conversation.id)
                          }}
                          className="w-full px-4 py-3 text-left text-lg text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors rounded-lg flex items-center gap-3"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        ) : (
          /* For non-authenticated users: show query logs */
          queries.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <svg
                className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600 mb-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              <p className="text-xl text-gray-500 dark:text-gray-400">No chats yet</p>
              <p className="text-lg text-gray-400 dark:text-gray-500 mt-1">Your conversations will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-[rgb(30,30,30)]">
              {queries.map((query) => (
                <div
                  key={query.id}
                  onClick={() => onQueryClick(query.question)}
                  className="relative w-full px-4 hover:bg-gray-50 dark:hover:bg-[rgb(40,40,40)] transition-colors group h-16 flex items-center cursor-pointer"
                >
                  <div className="flex-1 text-left pr-16 max-w-[440px]">
                    <p className="text-xl text-gray-900 dark:text-gray-100 font-light truncate">
                      {query.question}
                    </p>
                  </div>

                  {/* Three-dot menu button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setOpenMenuId(openMenuId === query.id ? null : query.id)
                    }}
                    className="absolute right-2 p-2 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-600 transition-opacity"
                  >
                    <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="5" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="12" cy="19" r="2" />
                    </svg>
                  </button>

                  {/* Dropdown menu */}
                  {openMenuId === query.id && (
                    <div
                      ref={menuRef}
                      className="absolute right-2 top-12 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-50 min-w-[180px]"
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteQuery(query.id)
                        }}
                        className="w-full px-4 py-3 text-left text-lg text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors rounded-lg flex items-center gap-3"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Footer hint */}
      {((userId && conversations.length > 0) || (!userId && queries.length > 0)) && (
        <div className="px-4 py-2 border-t border-gray-200 dark:border-[rgb(26,26,26)] bg-gray-50 dark:bg-[rgb(26,26,26)]">
          <p className="text-lg text-gray-500 dark:text-gray-400 text-center">
            {userId ? 'Click any conversation to continue' : 'Click any question to ask it again'}
          </p>
        </div>
      )}
    </div>
  )
}
