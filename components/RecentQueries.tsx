'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { getRecentQueries, clearQueryHistory, deleteQuery, type RecentQuery } from '@/app/actions/get-recent-queries'
import { getConversations, deleteConversation } from '@/app/actions/conversations'
import type {
  ChatbotConversationCursor,
  ChatbotConversationSummary,
} from '@/lib/chatbot/conversation-contract'
import { createChatbotIdempotencyKey } from '@/lib/chatbot/idempotency-key'
import { useRouter } from 'next/navigation'

type RecentQueriesProps = {
  userId?: string
  sessionId?: string
  onQueryClick: (question: string) => void
  onNewChat?: () => void
  refreshTrigger?: number // Used to trigger refresh after new query
  currentConversationId?: string | null // Highlight the active conversation
  navigationLocked?: boolean
}

function appendUniqueConversations(
  current: ChatbotConversationSummary[],
  incoming: ChatbotConversationSummary[],
): ChatbotConversationSummary[] {
  const seen = new Set(current.map(conversation => conversation.id))
  return [
    ...current,
    ...incoming.filter(conversation => {
      if (seen.has(conversation.id)) return false
      seen.add(conversation.id)
      return true
    }),
  ]
}

export default function RecentQueries({ userId, sessionId, onQueryClick, onNewChat, refreshTrigger, currentConversationId, navigationLocked = false }: RecentQueriesProps) {
  const [queries, setQueries] = useState<RecentQuery[]>([])
  const [conversations, setConversations] = useState<ChatbotConversationSummary[]>([])
  const [conversationListUnavailable, setConversationListUnavailable] = useState(false)
  const [nextConversationCursor, setNextConversationCursor] =
    useState<ChatbotConversationCursor | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [publishedDataKey, setPublishedDataKey] = useState('')
  const [clearing, setClearing] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const loadGenerationRef = useRef(0)
  const previousRefreshTriggerRef = useRef(refreshTrigger)
  const router = useRouter()
  const dataKey = userId
    ? `user:${userId}`
    : sessionId
      ? `session:${sessionId}`
      : 'none'
  const activeDataKeyRef = useRef(dataKey)
  activeDataKeyRef.current = dataKey
  const dataIsPublished = publishedDataKey === dataKey
  const visibleConversations = dataIsPublished ? conversations : []
  const visibleQueries = dataIsPublished ? queries : []
  const visibleUnavailable = dataIsPublished && conversationListUnavailable
  const visibleNextCursor = dataIsPublished ? nextConversationCursor : null

  const loadQueries = useCallback(async ({
    showLoading = true,
    append = false,
    cursor = null,
  }: {
    showLoading?: boolean
    append?: boolean
    cursor?: ChatbotConversationCursor | null
  } = {}) => {
    const expectedDataKey = dataKey
    const generation = ++loadGenerationRef.current
    const isCurrent = () =>
      loadGenerationRef.current === generation &&
      activeDataKeyRef.current === expectedDataKey

    // The newest generation owns both flags. This lets a refresh supersede an
    // initial or load-more request without leaving either spinner stuck.
    setLoading(showLoading)
    setLoadingOlder(append)

    try {
      if (!userId && !sessionId) return

      if (userId) {
        const result = await getConversations({
          limit: 50,
          ...(cursor ?? {}),
        })
        if (!isCurrent()) return

        if (result.status === 'ready' || result.status === 'empty') {
          setConversations(previous => append
            ? appendUniqueConversations(previous, result.conversations)
            : result.conversations)
          setNextConversationCursor(result.nextCursor)
          setConversationListUnavailable(false)
        } else {
          // An unavailable next page never erases already-published rows or
          // its retry cursor. Empty is authoritative only on a successful read.
          setConversationListUnavailable(true)
        }
      } else {
        const data = await getRecentQueries({ userId, sessionId })
        if (!isCurrent()) return
        setQueries(data)
      }
    } catch {
      if (isCurrent() && userId) setConversationListUnavailable(true)
    } finally {
      if (isCurrent()) {
        setLoading(false)
        setLoadingOlder(false)
      }
    }
  }, [dataKey, sessionId, userId])

  // Publish data only under the exact owner/session key. The render-time key
  // comparison hides the prior owner's rows before this effect can run.
  useEffect(() => {
    loadGenerationRef.current += 1
    setPublishedDataKey(dataKey)
    setQueries([])
    setConversations([])
    setNextConversationCursor(null)
    setConversationListUnavailable(false)
    setOpenMenuId(null)
    setLoadingOlder(false)
    setClearing(false)

    if (!userId && !sessionId) {
      setLoading(false)
      return
    }
    void loadQueries({ showLoading: true })

    return () => {
      loadGenerationRef.current += 1
    }
  }, [dataKey, loadQueries, sessionId, userId])

  // Silently refresh when refreshTrigger changes (no loading spinner)
  useEffect(() => {
    if (previousRefreshTriggerRef.current === refreshTrigger) return
    previousRefreshTriggerRef.current = refreshTrigger
    if (refreshTrigger && refreshTrigger > 0) {
      void loadQueries({ showLoading: false })
    }
  }, [refreshTrigger, loadQueries])

  const handleLoadOlder = () => {
    if (!dataIsPublished || !visibleNextCursor || loadingOlder) return
    void loadQueries({
      showLoading: false,
      append: true,
      cursor: visibleNextCursor,
    })
  }

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
    const expectedDataKey = dataKey
    const result = await deleteQuery(queryId)
    if (activeDataKeyRef.current !== expectedDataKey) return

    if (result.success) {
      setQueries(prev => prev.filter(q => q.id !== queryId))
      setOpenMenuId(null)
    } else {
      alert('Failed to delete query. Please try again.')
    }
  }

  const handleDeleteConversation = async (conversation: ChatbotConversationSummary) => {
    if (navigationLocked) return
    const expectedDataKey = dataKey
    const command = {
      conversationId: conversation.id,
      expectedRevision: conversation.revision,
      idempotencyKey: createChatbotIdempotencyKey(),
    }
    let result = await deleteConversation(command)
    if (result.status === 'unavailable') result = await deleteConversation(command)
    if (activeDataKeyRef.current !== expectedDataKey) return

    if (
      result.status === 'ready' &&
      ['applied', 'replayed', 'gone', 'not_found'].includes(result.disposition)
    ) {
      setConversations(prev => prev.filter(c => c.id !== conversation.id))
      setOpenMenuId(null)

      // If we deleted the current conversation, redirect to new chat
      if (conversation.id === currentConversationId) {
        if (onNewChat) onNewChat()
      }
    } else {
      alert('Failed to delete conversation. Please try again.')
    }
  }

  const handleConversationClick = (conversationId: string) => {
    if (navigationLocked) return
    router.push(`/chatbot?id=${conversationId}`)
  }

  const handleTitleClick = () => {
    router.push('/')
  }

  const handleClearHistory = async () => {
    if (!confirm('Are you sure you want to clear your query history?')) return

    const expectedDataKey = dataKey
    setClearing(true)
    const result = await clearQueryHistory({ userId, sessionId })
    if (activeDataKeyRef.current !== expectedDataKey) return

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

  if (loading || !dataIsPublished) {
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
        <h1
          onClick={handleTitleClick}
          className="text-lg font-bold text-gray-900 dark:text-gray-100 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          Fin Quote
        </h1>
      </div>

      {/* New Chat Button */}
      <div className="border-b border-gray-200 dark:border-[rgb(26,26,26)] mt-4">
        <button
          onClick={onNewChat}
          disabled={navigationLocked}
          className="w-full flex items-center gap-3 px-4 h-16 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-gray-700 transition-colors cursor-pointer"
        >
          <svg className="w-6 h-6 text-gray-700 dark:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          <span className="text-base font-light text-gray-900 dark:text-gray-100">New chat</span>
        </button>
      </div>

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-[rgb(26,26,26)] flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-700 dark:text-gray-400">Chats</h2>
      </div>

      {/* Conversation/Query List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden pb-32 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 dark:[&::-webkit-scrollbar-track]:bg-[rgb(26,26,26)] [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-[rgb(60,60,60)] [&::-webkit-scrollbar-thumb]:rounded-full dark:[&::-webkit-scrollbar-thumb]:hover:bg-[rgb(70,70,70)]">
        {userId && visibleUnavailable && (
          <div role="alert" className="mx-4 mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
            Chat history is temporarily unavailable. Your saved chats were not cleared.
          </div>
        )}
        {/* For authenticated users: show conversations */}
        {userId ? (
          visibleUnavailable && visibleConversations.length === 0 ? null :
          visibleConversations.length === 0 ? (
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
              <p className="text-base text-gray-500 dark:text-gray-400">No conversations yet</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Your conversations will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-[rgb(30,30,30)]">
              {visibleConversations.map((conversation) => {
                const isActive = conversation.id === currentConversationId
                return (
                  <div
                    key={conversation.id}
                    onClick={() => handleConversationClick(conversation.id)}
                    className={`relative w-full px-4 transition-colors group h-16 flex items-center ${
                      navigationLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                    } ${isActive
                        ? 'bg-gray-50 dark:bg-[rgb(40,40,40)]'
                        : 'hover:bg-gray-50 dark:hover:bg-[rgb(40,40,40)]'
                    }`}
                  >
                    <div className="flex-1 text-left pr-16 max-w-[300px]">
                      <p className="text-base font-light truncate text-gray-900 dark:text-gray-100">
                        {conversation.title}
                      </p>
                    </div>

                    {/* Three-dot menu button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenMenuId(openMenuId === conversation.id ? null : conversation.id)
                      }}
                      disabled={navigationLocked}
                      className="absolute right-2 p-2 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-gray-200 disabled:cursor-not-allowed dark:hover:bg-gray-600 transition-opacity"
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
                            handleDeleteConversation(conversation)
                          }}
                          className="w-full px-4 py-3 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors rounded-lg flex items-center gap-3"
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
              {visibleNextCursor && (
                <div className="px-4 py-4">
                  <button
                    type="button"
                    onClick={handleLoadOlder}
                    disabled={loadingOlder}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200"
                  >
                    {loadingOlder ? 'Loading older chats…' : 'Load older chats'}
                  </button>
                </div>
              )}
            </div>
          )
        ) : (
          /* For non-authenticated users: show query logs */
          visibleQueries.length === 0 ? (
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
              {visibleQueries.map((query) => (
                <div
                  key={query.id}
                  onClick={() => onQueryClick(query.question)}
                  className="relative w-full px-4 hover:bg-gray-50 dark:hover:bg-[rgb(40,40,40)] transition-colors group h-16 flex items-center cursor-pointer"
                >
                  <div className="flex-1 text-left pr-16 max-w-[300px]">
                    <p className="text-base text-gray-900 dark:text-gray-100 font-light truncate">
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
                        className="w-full px-4 py-3 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors rounded-lg flex items-center gap-3"
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
    </div>
  )
}
