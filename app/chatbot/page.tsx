'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

// Feature flag check - redirect if chat is disabled
const CHAT_ENABLED = process.env.NEXT_PUBLIC_ENABLE_CHAT === 'true'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { submitFeedback } from '@/app/actions/ask-question'
import { resolvePendingChatbotRequest } from '@/app/actions/chatbot-request-recovery'
import type {
  FinancialData,
  PriceData,
  FilingData,
  PassageData,
} from '@/lib/chatbot/public-types'
import { getConversation } from '@/app/actions/conversations'
import type { ChatbotConversationMessageCursor } from '@/lib/chatbot/conversation-contract'
import FinancialChart from '@/components/FinancialChart'
import RecentQueries from '@/components/RecentQueries'
import AuthModal from '@/components/AuthModal'
import UserMenu from '@/components/UserMenu'
import FollowUpQuestions from '@/components/FollowUpQuestions'
import FlowVisualization, { FlowFilter } from '@/components/FlowVisualization'
import FinancialsModal from '@/components/FinancialsModal'
import ThemeToggle from '@/components/ThemeToggle'
import Navigation from '@/components/Navigation'
import type { ChartConfig } from '@/types/chart'
import type { ConversationHistory, Message } from '@/types/conversation'
import type { FlowEvent } from '@/lib/flow/events'
import {
  CHATBOT_EXPECTED_USER_HEADER,
  MAX_CHAT_QUESTION_LENGTH,
} from '@/lib/chatbot/constants'
import {
  projectChatbotPromptHistory,
  projectChatbotRequestBody,
} from '@/lib/chatbot/prompt-history'
import {
  createChatbotRequestCoordinator,
  createChatbotSseParser,
  parseChatbotCompletionReceipt,
  type ChatbotCompletionReceipt,
  type ChatbotSseEvent,
} from '@/lib/chatbot/client-stream'
import {
  CHATBOT_PENDING_COMMAND_MAX_ATTEMPTS,
  clearPendingChatbotCommand,
  getPendingChatbotRecoveryPath,
  hasPendingChatbotCommand,
  isRetryablePendingChatbotResponse,
  loadPendingChatbotCommand,
  loadPendingChatbotRecoveryMarker,
  schedulePendingChatbotCommandExpiry,
  savePendingChatbotCommand,
  type PendingChatbotCommand,
  type PendingChatbotRequestBody,
} from '@/lib/chatbot/pending-command'
import { fingerprintChatbotRequest } from '@/lib/chatbot/request-fingerprint'
import {
  classifyCompletedConversationRecovery,
  classifyPendingMarkerResolution,
} from '@/lib/chatbot/request-resolution'
import { ChatbotHistoryGenerationFence } from '@/lib/chatbot/history-generation'
import {
  isChatbotConversationTargetReady,
  type ChatbotConversationTargetStatus,
} from '@/lib/chatbot/conversation-target'
import { ChatbotClientAuthFence } from '@/lib/chatbot/client-auth'

/**
 * Extracts years from question and returns filtered year range based on distance-based context
 * Option A: Distance-Based Context
 * - Current year (2025): Show 3 years before → [2022, 2023, 2024, 2025]
 * - Other years: Show 2 years before and 2 years after → [year-2, year-1, year, year+1, year+2]
 * - 3+ years mentioned: Show exact years only (no context)
 */
const getFilteredYearRange = (question: string, availableData: any[]): any[] => {
  if (!question || !availableData || availableData.length === 0) {
    return availableData
  }

  const currentYear = new Date().getFullYear()

  // Extract explicit years (e.g., 2023, 2024, 2025)
  const explicitYears = [...question.matchAll(/\b(20\d{2})\b/g)].map(match => parseInt(match[1]))

  // Extract "last N years" or "past N years"
  const lastYearsMatch = question.match(/(?:last|past)\s+(\d+)\s+years?/i)
  let mentionedYears: number[] = []

  if (lastYearsMatch) {
    const n = parseInt(lastYearsMatch[1])
    // "last 5 years" means current year back to current-4
    for (let i = 0; i < n; i++) {
      mentionedYears.push(currentYear - i)
    }
  } else if (explicitYears.length > 0) {
    mentionedYears = [...new Set(explicitYears)] // Remove duplicates
  }

  // If no years mentioned, default to last 5 years
  if (mentionedYears.length === 0) {
    const last5Years: number[] = []
    for (let i = 0; i < 5; i++) {
      last5Years.push(currentYear - i)
    }
    return availableData.filter(row =>
      last5Years.includes(row.year)
    ).sort((a, b) => a.year - b.year)
  }

  const yearCount = mentionedYears.length

  // Rule: If 3+ years mentioned, show exact years only
  if (yearCount >= 3) {
    return availableData.filter(row =>
      mentionedYears.includes(row.year)
    ).sort((a, b) => a.year - b.year)
  }

  // Rule: If 1-2 years mentioned, add context
  const latestMentionedYear = Math.max(...mentionedYears)
  const earliestMentionedYear = Math.min(...mentionedYears)

  let minYear: number
  let maxYear: number

  if (latestMentionedYear === currentYear) {
    // Current year: show 3 years before
    minYear = currentYear - 3
    maxYear = currentYear
  } else {
    // Past year(s): show 2 years before and 2 years after
    minYear = earliestMentionedYear - 2
    maxYear = latestMentionedYear + 2
  }

  return availableData.filter(row =>
    row.year >= minYear && row.year <= maxYear
  ).sort((a, b) => a.year - b.year)
}

const SCROLL_BUFFER_PX = 8  // Minimal gap between question and header
const HEADER_HEIGHT_PX = 80
const EXTRA_SCROLL_UP = 50  // Extra pixels to scroll up to hide previous content completely
const EMPTY_CONVERSATION_HISTORY: ConversationHistory = []
const EMPTY_FLOW_EVENTS: FlowEvent[] = []

function AskPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  // Redirect to home if chat feature is disabled
  useEffect(() => {
    if (!CHAT_ENABLED) {
      router.replace('/')
    }
  }, [router])

  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [dataUsed, setDataUsed] = useState<{
    type: 'financials' | 'prices' | 'filings' | 'passages' | 'metrics_catalog' | 'financial_metrics'
    data: FinancialData[] | PriceData[] | FilingData[] | PassageData[] | any[]
  } | null>(null)
  const [chartConfig, setChartConfig] = useState<ChartConfig | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState<'analyzing' | 'selecting' | 'calling' | 'fetching' | 'calculating' | 'generating' | null>(null)
  const [loadingMessage, setLoadingMessage] = useState<string>('')
  const [selectedTool, setSelectedTool] = useState<string | null>(null)
  const [conversationHistory, setConversationHistory] = useState<ConversationHistory>([])
  const [publishedHistoryScope, setPublishedHistoryScope] = useState('')
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [currentConversationRevision, setCurrentConversationRevision] = useState(0)
  const [conversationTargetState, setConversationTargetState] = useState<{
    scope: string
    status: ChatbotConversationTargetStatus
  }>({ scope: '', status: 'pending' })
  const [olderMessagesCursor, setOlderMessagesCursor] =
    useState<ChatbotConversationMessageCursor | null>(null)
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false)
  const [olderMessagesError, setOlderMessagesError] = useState('')
  const [pendingRecoveryLocked, setPendingRecoveryLocked] = useState(false)
  const [pendingRecoveryPath, setPendingRecoveryPath] = useState<string | null>(null)
  const [pendingRecoveryPublishedScope, setPendingRecoveryPublishedScope] =
    useState('')
  const [pendingRecoveryCheck, setPendingRecoveryCheck] = useState(0)
  const [sessionId, setSessionId] = useState<string>('')
  const [queryLogId, setQueryLogId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<'thumbs_up' | 'thumbs_down' | null>(null)
  const [showCommentBox, setShowCommentBox] = useState(false)
  const [feedbackComment, setFeedbackComment] = useState('')
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)
  const [refreshQueriesTrigger, setRefreshQueriesTrigger] = useState(0)
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([])
  const [copied, setCopied] = useState(false)
  const [flowEvents, setFlowEvents] = useState<FlowEvent[]>([])
  const [flowPanelOpen, setFlowPanelOpen] = useState(false)
  const [flowFilter, setFlowFilter] = useState<FlowFilter>('all')
  const flowPanelOffsetClass = flowPanelOpen ? 'lg:mr-[420px]' : ''
  const flowPanelPaddingClass = flowPanelOpen ? 'lg:pr-[420px]' : ''
  const [dataReceived, setDataReceived] = useState(false)

  // Auth state
  const [user, setUser] = useState<User | null>(null)
  const [authResolved, setAuthResolved] = useState(false)
  const [authUnavailable, setAuthUnavailable] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showFinancialsModal, setShowFinancialsModal] = useState(false)
  const supabase = createClient()
  const authFenceRef = useRef<ChatbotClientAuthFence | null>(null)
  const requestedConversationId = searchParams.get('id')
  const authenticatedUserId = user?.id ?? null
  const requestedHistoryScope = !authResolved
    ? 'auth:pending'
    : authenticatedUserId
      ? `user:${authenticatedUserId}:conversation:${requestedConversationId ?? 'new'}`
      : sessionId
        ? `anonymous:${sessionId}`
        : 'anonymous:pending'
  const activeHistoryScopeRef = useRef(requestedHistoryScope)
  activeHistoryScopeRef.current = requestedHistoryScope
  const historyGenerationFenceRef = useRef<ChatbotHistoryGenerationFence | null>(
    null,
  )
  if (!historyGenerationFenceRef.current) {
    historyGenerationFenceRef.current = new ChatbotHistoryGenerationFence()
  }
  const historyGenerationFence = historyGenerationFenceRef.current
  const olderMessagesLoadGenerationRef = useRef(0)
  const historyIsPublished = publishedHistoryScope === requestedHistoryScope
  const requestedTargetRequiresRead = Boolean(
    authResolved && authenticatedUserId && requestedConversationId,
  )
  const visibleConversationTargetStatus =
    conversationTargetState.scope === requestedHistoryScope
      ? conversationTargetState.status
      : requestedTargetRequiresRead
        ? 'pending'
        : 'ready'
  const conversationTargetReady = isChatbotConversationTargetReady(
    requestedTargetRequiresRead,
    visibleConversationTargetStatus,
  )
  const visibleConversationHistory = historyIsPublished
    ? conversationHistory
    : EMPTY_CONVERSATION_HISTORY
  const visibleCurrentConversationId = historyIsPublished
    ? currentConversationId
    : null
  const visibleCurrentConversationRevision = historyIsPublished
    ? currentConversationRevision
    : 0
  const visibleOlderMessagesCursor = historyIsPublished
    ? olderMessagesCursor
    : null
  const visibleLoadingOlderMessages = historyIsPublished
    ? loadingOlderMessages
    : false
  const visibleOlderMessagesError = historyIsPublished ? olderMessagesError : ''
  const pendingRecoveryIsPublished =
    pendingRecoveryPublishedScope === requestedHistoryScope
  const visiblePendingRecoveryLocked = pendingRecoveryIsPublished
    ? pendingRecoveryLocked
    : false
  const visiblePendingRecoveryPath = pendingRecoveryIsPublished
    ? pendingRecoveryPath
    : null
  const visibleQuestion = historyIsPublished ? question : ''
  const visibleAnswer = historyIsPublished ? answer : ''
  const visibleError = historyIsPublished ? error : ''
  const visibleLoading = historyIsPublished ? loading : false
  const visibleLoadingStep = historyIsPublished ? loadingStep : null
  const visibleSelectedTool = historyIsPublished ? selectedTool : null
  const visibleLoadingMessage = historyIsPublished ? loadingMessage : ''
  const visibleFlowEvents = historyIsPublished ? flowEvents : EMPTY_FLOW_EVENTS
  const visibleQueryLogId = historyIsPublished ? queryLogId : null
  const visibleFeedback = historyIsPublished ? feedback : null
  const visibleShowCommentBox = historyIsPublished ? showCommentBox : false
  const visibleFeedbackComment = historyIsPublished ? feedbackComment : ''
  const visibleFeedbackSubmitting = historyIsPublished
    ? feedbackSubmitting
    : false
  const visibleDataReceived = historyIsPublished ? dataReceived : false

  // Ref for the textarea to enable auto-focus
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Ref for the latest message to enable auto-scroll
  const latestMessageRef = useRef<HTMLDivElement>(null)

  // Ref for the scrollable container
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Ref for tracking the previous message's follow-up questions (to measure height for scroll)
  const previousFollowUpRef = useRef<HTMLDivElement>(null)

  const requestCoordinatorRef = useRef<ReturnType<
    typeof createChatbotRequestCoordinator
  > | null>(null)
  if (!requestCoordinatorRef.current) {
    requestCoordinatorRef.current = createChatbotRequestCoordinator()
  }
  const requestCoordinator = requestCoordinatorRef.current
  const pendingRecoveryStartedRef = useRef<string | null>(null)
  const optimisticBaselineRef = useRef<{
    idempotencyKey: string
    scope: string
    history: ConversationHistory
    question: string
  } | null>(null)
  const retryTimerRef = useRef<number | null>(null)
  const pageMountedRef = useRef(false)
  const pendingSubmitRef = useRef<(
    command: PendingChatbotCommand,
  ) => void>(() => undefined)

  useEffect(() => {
    pageMountedRef.current = true
    return () => {
      pageMountedRef.current = false
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
      requestCoordinator.cancelCurrent()
    }
  }, [requestCoordinator])

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto'
    // Set height to scrollHeight (content height)
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [visibleQuestion])

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
    const authFence = new ChatbotClientAuthFence()
    authFenceRef.current = authFence
    const lookupGeneration = authFence.beginInitialLookup()
    const publishResolution = (
      resolution: ReturnType<typeof authFence.resolveInitialLookup>,
    ) => {
      if (!resolution) return
      if (resolution.status === 'unavailable') {
        // Keep the principal unresolved. Publishing a null user here would
        // activate anonymous scope and erase another principal's exact retry.
        setAuthUnavailable(true)
        setAuthResolved(false)
        return
      }
      setUser(resolution.user)
      setAuthUnavailable(false)
      setAuthResolved(true)
    }

    void supabase.auth.getUser().then(
      result => publishResolution(
        authFence.resolveInitialLookup(lookupGeneration, result),
      ),
      () => publishResolution(authFence.rejectInitialLookup(lookupGeneration)),
    )

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      publishResolution(authFence.publishAuthEvent(session?.user ?? null))
    })

    return () => {
      authFence.dispose()
      if (authFenceRef.current === authFence) authFenceRef.current = null
      subscription.unsubscribe()
    }
  }, [])

  // Load conversation from URL parameter or localStorage. State is published
  // only under the exact auth/session + conversation key, so a previous
  // account's content is hidden synchronously before this effect runs.
  useEffect(() => {
    const scope = requestedHistoryScope
    const generation = historyGenerationFence.begin()
    olderMessagesLoadGenerationRef.current += 1
    const isCurrent = () =>
      historyGenerationFence.isCurrent(generation) &&
      activeHistoryScopeRef.current === scope

    if (!authResolved || (!authenticatedUserId && !sessionId)) return

    requestCoordinator.cancelCurrent(
      new DOMException('Chatbot identity or conversation changed.', 'AbortError'),
    )
    pendingRecoveryStartedRef.current = null
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
    if (optimisticBaselineRef.current?.scope !== scope) {
      optimisticBaselineRef.current = null
    }
    setPublishedHistoryScope(scope)
    setConversationHistory([])
    setCurrentConversationId(null)
    setCurrentConversationRevision(0)
    setConversationTargetState({
      scope,
      status: authenticatedUserId && requestedConversationId
        ? 'pending'
        : 'ready',
    })
    setOlderMessagesCursor(null)
    setLoadingOlderMessages(false)
    setOlderMessagesError('')
    setQuestion('')
    setAnswer('')
    setDataUsed(null)
    setChartConfig(null)
    setFlowEvents([])
    setFollowUpQuestions([])
    setQueryLogId(null)
    setFeedback(null)
    setShowCommentBox(false)
    setFeedbackComment('')
    setFeedbackSubmitting(false)
    setCopied(false)
    setError('')
    setLoading(false)
    setLoadingStep(null)
    setLoadingMessage('')
    setSelectedTool(null)
    setDataReceived(false)

    const loadConversation = async () => {
      // If authenticated and conversation ID in URL, load from database
      if (authenticatedUserId && requestedConversationId) {
        const result = await getConversation(requestedConversationId)
        if (!isCurrent()) return
        if (result.status !== 'ready') {
          setConversationTargetState({ scope, status: result.status })
          setError(
            result.status === 'not_found'
              ? 'Conversation not found.'
              : result.status === 'overflow'
                ? result.error
                : 'Conversation history is temporarily unavailable.',
          )
          return
        }

        setCurrentConversationId(result.conversation.id)
        setCurrentConversationRevision(result.conversation.revision)
        setConversationTargetState({ scope, status: 'ready' })
        setOlderMessagesCursor(result.nextCursor)
        const history: ConversationHistory = result.messages.map(msg => ({
          id: msg.id,
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
          timestamp: msg.createdAt,
          chartConfig: msg.chartConfig as ChartConfig | undefined,
          followUpQuestions: msg.followUpQuestions || undefined,
          dataUsed: msg.dataUsed as any,
        }))
        setConversationHistory(history)
        setError('')
      }
      // Otherwise load from localStorage for non-authenticated users
      else if (!authenticatedUserId) {
        const saved = localStorage.getItem('finquote_conversation')
        if (saved) {
          try {
            const parsed = JSON.parse(saved)
            if (isCurrent()) setConversationHistory(parsed)
          } catch (err) {
            console.error('Failed to load conversation history:', err)
            if (isCurrent()) localStorage.removeItem('finquote_conversation')
          }
        }
      }
    }

    loadConversation()
    return () => {
      historyGenerationFence.invalidateIfCurrent(generation)
    }
  }, [
    authResolved,
    authenticatedUserId,
    historyGenerationFence,
    requestCoordinator,
    requestedConversationId,
    requestedHistoryScope,
    sessionId,
  ])

  // Save conversation history to localStorage for non-authenticated users only
  useEffect(() => {
    if (
      authResolved &&
      !user &&
      sessionId &&
      historyIsPublished &&
      requestedHistoryScope.startsWith('anonymous:') &&
      conversationHistory.length > 0
    ) {
      localStorage.setItem('finquote_conversation', JSON.stringify(conversationHistory))
    }
  }, [
    authResolved,
    conversationHistory,
    historyIsPublished,
    requestedHistoryScope,
    sessionId,
    user,
  ])

  // Auto-focus textarea when user starts typing anywhere on the page
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't interfere if user is already typing in an input/textarea
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return
      }

      // Don't interfere with keyboard shortcuts (Ctrl, Cmd, Alt)
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return
      }

      // Don't interfere with special keys
      if (e.key.length > 1 && e.key !== 'Enter' && e.key !== 'Backspace') {
        return
      }

      // Focus the textarea and let the keystroke happen naturally
      if (textareaRef.current && document.activeElement !== textareaRef.current) {
        textareaRef.current.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const storedOpen = window.localStorage.getItem('finquote_flow_panel_open')
    if (storedOpen !== null) {
      setFlowPanelOpen(storedOpen === 'true')
    }

    const storedFilter = window.localStorage.getItem('finquote_flow_filter')
    if (
      storedFilter === 'all' ||
      storedFilter === 'errors' ||
      storedFilter === 'warnings' ||
      storedFilter === 'slow' ||
      storedFilter === 'cost'
    ) {
      setFlowFilter(storedFilter)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('finquote_flow_panel_open', flowPanelOpen.toString())
  }, [flowPanelOpen])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('finquote_flow_filter', flowFilter)
  }, [flowFilter])

  // Track if we've already scrolled for this user message
  const hasScrolledForMessage = useRef<number>(-1)

  // Auto-scroll to latest USER message when conversation history changes
  // Step 2: Scroll immediately after user message is posted
  // Using useEffect to run after DOM is fully painted
  useEffect(() => {
    if (visibleConversationHistory.length === 0) return

    const lastMessage = visibleConversationHistory.at(-1)
    // Only scroll when user message is added (question is posted)
    if (!lastMessage || lastMessage.role !== 'user') return

    // Only scroll once per user message
    if (hasScrolledForMessage.current === visibleConversationHistory.length) return
    hasScrolledForMessage.current = visibleConversationHistory.length

    // Scroll immediately after question is posted
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!scrollContainerRef.current) return

        // Get all message containers
        const messageContainers = scrollContainerRef.current.querySelectorAll('.space-y-0 > .space-y-1')

        // The user message is the last container
        const userMessageIndex = visibleConversationHistory.length - 1
        const userMessageElement = messageContainers[userMessageIndex] as HTMLElement

        if (!userMessageElement) {
          console.warn('Could not find user message element')
          return
        }

        // Scroll the user message to the top of the viewport
        // block: 'start' aligns the element with the top of the scrolling area
        userMessageElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })

        // After scrollIntoView, adjust for the fixed header by scrolling up a bit more
        setTimeout(() => {
          if (scrollContainerRef.current) {
            const currentScroll = scrollContainerRef.current.scrollTop
            const adjustment = HEADER_HEIGHT_PX + SCROLL_BUFFER_PX

            scrollContainerRef.current.scrollTo({
              top: Math.max(currentScroll - adjustment, 0),
              behavior: 'smooth',
            })

            console.log('🎯 Scrolled to new user question with header adjustment')
          }
        }, 300) // Wait for initial scrollIntoView to complete
      })
    })
  }, [visibleConversationHistory])

  // Streaming version using Server-Sent Events
  const handleSubmitStreaming = async (
    e: React.FormEvent,
    pendingCommand?: PendingChatbotCommand,
  ) => {
    e.preventDefault()

    if (!historyIsPublished) return
    if (!pendingCommand && !conversationTargetReady) {
      setError(
        visibleConversationTargetStatus === 'pending'
          ? 'This conversation is still loading.'
          : visibleConversationTargetStatus === 'not_found'
            ? 'Conversation not found. Start a new chat to continue.'
            : 'This conversation cannot be loaded safely. Reload before sending.',
      )
      return
    }
    if (
      !pendingCommand &&
      hasPendingChatbotCommand(
        window.sessionStorage,
        requestedHistoryScope,
      )
    ) {
      setPendingRecoveryLocked(true)
      setPendingRecoveryPublishedScope(requestedHistoryScope)
      setPendingRecoveryPath(getPendingChatbotRecoveryPath(
        window.sessionStorage,
        requestedHistoryScope,
      ))
      setError('A previous answer is still being recovered. Wait for it to finish or reload this chat.')
      return
    }
    if (pendingCommand && pendingCommand.scope !== requestedHistoryScope) return
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }

    const submittedQuestion = (
      pendingCommand?.body.question ?? visibleQuestion
    ).trim()
    if (!submittedQuestion) {
      setError('Please enter a question')
      return
    }

    if (!user) {
      setError('Sign in to ask a question.')
      setShowAuthModal(true)
      return
    }
    const expectedUserId = user.id

    const historySnapshot = pendingCommand?.body.conversationHistory ??
      projectChatbotPromptHistory(
        visibleConversationHistory.map(({ role, content, timestamp }) => ({
          role,
          content,
          timestamp,
        })),
      )
    const conversationIdSnapshot = pendingCommand?.body.conversationId ??
      visibleCurrentConversationId
    const conversationRevisionSnapshot = pendingCommand?.body.expectedRevision ??
      visibleCurrentConversationRevision
    const requestSessionId = pendingCommand?.body.sessionId ?? sessionId
    const clientRequest = requestCoordinator.begin(
      pendingCommand?.body.idempotencyKey,
    )
    const requestScope = requestedHistoryScope
    const isCurrent = () =>
      requestCoordinator.isCurrent(clientRequest.generation) &&
      activeHistoryScopeRef.current === requestScope
    const requestBody: PendingChatbotRequestBody = projectChatbotRequestBody({
      question: submittedQuestion,
      conversationHistory: historySnapshot,
      sessionId: requestSessionId,
      idempotencyKey: clientRequest.idempotencyKey,
      conversationId: conversationIdSnapshot,
      expectedRevision: conversationRevisionSnapshot,
    })
    const attempt = pendingCommand?.attempt ?? 0
    let retainedCommand: PendingChatbotCommand
    try {
      const requestFingerprint = pendingCommand?.requestFingerprint ??
        await fingerprintChatbotRequest(requestBody)
      if (!isCurrent()) return
      retainedCommand = savePendingChatbotCommand(
        window.sessionStorage,
        requestScope,
        requestBody,
        requestFingerprint,
        attempt,
        Date.now(),
        pendingCommand ? {
          savedAt: pendingCommand.savedAt,
          expiresAt: pendingCommand.expiresAt,
        } : undefined,
      )
    } catch {
      requestCoordinator.finish(clientRequest.generation)
      setError('Unable to retain this request safely. Please try again.')
      return
    }
    pendingRecoveryStartedRef.current = clientRequest.idempotencyKey
    // Arm the original ten-minute content-erasure timer for a fresh command.
    // The started-key fence prevents this effect tick from launching a second
    // request while still guaranteeing an idle/exhausted tab is scrubbed.
    setPendingRecoveryCheck(previous => previous + 1)
    setPendingRecoveryLocked(true)
    setPendingRecoveryPublishedScope(requestScope)
    setPendingRecoveryPath(getPendingChatbotRecoveryPath(
      window.sessionStorage,
      requestScope,
    ))
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
    let retryableTransportFailure = true
    let retryDelayMs = 500

    setLoading(true)
    setError('')
    setAnswer('')
    setSelectedTool(null) // Reset selected tool for new question
    setLoadingMessage('') // Reset loading message
    setDataUsed(null)
    setChartConfig(null)
    setFollowUpQuestions([])
    setFlowEvents([])
    setDataReceived(false)
    setQueryLogId(null)
    setFeedback(null)
    setShowCommentBox(false)
    setFeedbackComment('')
    setFeedbackSubmitting(false)

    // Create user message
    const userMessage: Message = {
      role: 'user',
      content: submittedQuestion,
      timestamp: new Date().toISOString(),
    }

    // Recovery reuses the original optimistic row (or reloads the durable
    // conversation) and must never append the same user turn again.
    if (!pendingCommand) {
      optimisticBaselineRef.current = {
        idempotencyKey: clientRequest.idempotencyKey,
        scope: requestScope,
        history: visibleConversationHistory,
        question: visibleQuestion,
      }
      setConversationHistory(previous => [...previous, userMessage])
      setQuestion('')
    }

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [CHATBOT_EXPECTED_USER_HEADER]: expectedUserId,
        },
        body: JSON.stringify(requestBody),
        signal: clientRequest.signal,
      })
      if (!isCurrent()) return

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null)
        if (!isCurrent()) return
        const responseCode = errorBody?.code
        const retryAfterSeconds = Number(response.headers.get('retry-after'))
        if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
          retryDelayMs = Math.min(180_000, retryAfterSeconds * 1_000)
        }
        retryableTransportFailure = isRetryablePendingChatbotResponse(
          response.status,
          responseCode,
        )
        if (responseCode === 'CHATBOT_AUTH_REFRESH_REQUIRED') {
          // The request was retained before fetch. Refresh in the singleton
          // browser client, then let the normal retry path reuse its exact key.
          // auth-js acquires the same per-storage-key lock internally here.
          const refreshed = await supabase.auth.refreshSession().catch(() => null)
          if (!isCurrent()) return
          if (
            refreshed?.data.user
            && refreshed.data.user.id !== expectedUserId
          ) {
            retryableTransportFailure = false
          }
        } else if (responseCode === 'CHATBOT_PRINCIPAL_MISMATCH') {
          // Do not retry an A-scoped command under request-cookie principal B.
          // Revalidate through the auth-event fence so a late lookup also
          // cannot overwrite a newer tab/account transition.
          retryableTransportFailure = false
          const authFence = authFenceRef.current
          const lookupGeneration = authFence?.beginInitialLookup()
          if (authFence && lookupGeneration !== undefined) {
            const result = await supabase.auth.getUser().catch(() => null)
            if (!isCurrent()) return
            const resolution = result
              ? authFence.resolveInitialLookup(lookupGeneration, result)
              : authFence.rejectInitialLookup(lookupGeneration)
            if (resolution?.status === 'unavailable') {
              setUser(null)
              setAuthUnavailable(true)
              setAuthResolved(false)
            } else if (resolution) {
              setUser(resolution.user)
              setAuthUnavailable(false)
              setAuthResolved(true)
            }
          }
        } else if (response.status === 401) {
          setShowAuthModal(true)
        }
        throw new Error(
          typeof errorBody?.error === 'string'
            ? errorBody.error
            : `Request failed with status ${response.status}`,
        )
      }

      reader = response.body?.getReader() ?? null

      if (!reader) {
        throw new Error('No response body')
      }
      if (!requestCoordinator.attachReader(clientRequest.generation, reader)) return

      const updateFlowEvent = (incoming: FlowEvent) => {
        if (!isCurrent()) return
        setFlowEvents(prev => {
          const existingIndex = prev.findIndex(event => event.id === incoming.id)
          if (existingIndex === -1) {
            return [...prev, incoming].sort((a, b) => a.sequence - b.sequence)
          }

          const next = [...prev]
          const previous = next[existingIndex]
          next[existingIndex] = {
            ...previous,
            ...incoming,
            summary: incoming.summary ?? previous.summary,
            why: incoming.why ?? previous.why,
            details: incoming.details ?? previous.details,
            durationMs: incoming.durationMs ?? previous.durationMs,
            costUsd: incoming.costUsd ?? previous.costUsd,
          }
          return next.sort((a, b) => a.sequence - b.sequence)
        })
      }

      let streamedAnswer = ''
      let receivedData: any = null
      let receivedChart: any = null
      let receivedFollowUpQuestions: string[] = []
      let selectedToolName: string | null = null
      let streamFailed = false
      let streamCompleted = false
      let completionReceipt: ChatbotCompletionReceipt | null = null
      let terminalFailureMessage = ''

      const handleEvent = ({ event: eventType, data: rawData }: ChatbotSseEvent) => {
        if (!isCurrent()) return
        const data = rawData as Record<string, any>
        switch (eventType) {
            case 'flow':
              updateFlowEvent(data as FlowEvent)
              // Update loading message with detailed flow information
              const flowEvent = data as FlowEvent
              if (flowEvent.status === 'active') {
                let message = ''
                if (flowEvent.step === 'tool_selection') {
                  message = '🔍 Analyzing question and selecting tool...'
                  setLoadingStep('analyzing')
                } else if (flowEvent.step === 'tool_execution') {
                  message = `📊 ${flowEvent.summary || 'Fetching data'}...`
                  setLoadingStep('fetching')
                } else if (flowEvent.step === 'chart_generation') {
                  message = `📈 ${flowEvent.summary || 'Preparing chart'}...`
                  setLoadingStep('calculating')
                } else if (flowEvent.step === 'answer_generation') {
                  // Customize message based on selected tool
                  if (
                    selectedToolName === 'getFinancialsByMetric' ||
                    selectedToolName === 'getAaplFinancialsByMetric'
                  ) {
                    message = '✍️ Generating answer from financial data...'
                  } else if (selectedToolName === 'getFinancialMetric') {
                    message = '✍️ Generating answer from financial metrics...'
                  } else if (selectedToolName === 'getPrices') {
                    message = '✍️ Generating answer from price data...'
                  } else if (selectedToolName === 'getRecentFilings') {
                    message = '✍️ Generating answer from filing metadata...'
                  } else if (selectedToolName === 'listMetrics') {
                    message = '✍️ Generating answer from metrics catalog...'
                  } else {
                    message = '✍️ Generating answer from fetched data...'
                  }
                  setLoadingStep('generating')
                } else if (flowEvent.step === 'validation') {
                  message = '🔎 Validating answer accuracy...'
                } else if (flowEvent.step === 'followup_generation') {
                  message = '💡 Generating follow-up suggestions...'
                }
                if (message) {
                  setLoadingMessage(message)
                }
              } else if (flowEvent.status === 'success' && flowEvent.step === 'tool_selection') {
                // Capture the selected tool and show it prominently
                const toolName = flowEvent.summary?.replace('Selected ', '') || 'tool'
                selectedToolName = toolName
                setSelectedTool(toolName)
                setLoadingMessage(`✓ ${flowEvent.summary}`)
              }
              break

            case 'data':
              receivedData = data.dataUsed
              receivedChart = data.chartConfig
              setDataUsed(data.dataUsed)
              setChartConfig(data.chartConfig)
              setDataReceived(true)
              break

            case 'answer':
              if (typeof data.content !== 'string') {
                throw new Error('The chatbot returned an invalid answer event.')
              }
              streamedAnswer += data.content
              setAnswer(streamedAnswer)
              break

            case 'validation':
              // Validation results received (could show warning if needed)
              console.log('Validation:', data.results)
              break

            case 'followup':
              // Follow-up question suggestions received
              console.log('📥 Received followup event:', data)
              if (data.questions && Array.isArray(data.questions)) {
                console.log('✅ Setting follow-up questions:', data.questions)
                receivedFollowUpQuestions = data.questions
                setFollowUpQuestions(data.questions)
              } else {
                console.log('⚠️ Invalid follow-up data structure:', data)
              }
              break

            case 'complete':
              // Answer complete
              console.log('Latency:', data.latency)
              completionReceipt = parseChatbotCompletionReceipt(data)
              streamCompleted = true
              requestCoordinator.acceptFeedbackReceipt(
                clientRequest.generation,
                data.queryLogId,
              )
              break

            case 'error':
              streamFailed = true
              retryableTransportFailure = data.retryable === true && (
                data.code === 'CHATBOT_COMPLETION_UNCERTAIN' ||
                data.code === 'CHATBOT_TIMEOUT'
              )
              terminalFailureMessage = typeof data.message === 'string'
                ? data.message
                : 'The chatbot request failed.'
              requestCoordinator.invalidateFeedbackReceipt(clientRequest.generation)
              setError(terminalFailureMessage)
              break
        }
      }

      const parser = createChatbotSseParser(handleEvent)
      while (isCurrent()) {
        const { done, value } = await reader.read()
        if (!isCurrent()) return
        if (done) {
          parser.finish()
          break
        }
        parser.push(value)
      }
      if (!isCurrent()) return

      // The parser callback mutates this local synchronously while draining,
      // but TypeScript cannot infer that mutation across the callback boundary.
      const durableReceipt = completionReceipt as ChatbotCompletionReceipt | null

      // A retry of a response lost after durable completion carries only the
      // content-free conversation pointer. Navigate to it and let the exact
      // scoped detail loader recover the stored answer.
      if (
        streamCompleted &&
        durableReceipt &&
        (!streamedAnswer || pendingCommand !== undefined)
      ) {
        const recovered = await getConversation(durableReceipt.conversationId)
        if (!isCurrent()) return
        const recoveryDecision = classifyCompletedConversationRecovery(
          recovered.status,
          recovered.status === 'ready' ? recovered.conversation.revision : null,
          durableReceipt.revision,
        )
        if (recoveryDecision === 'retain') {
          throw new Error(
            recovered.status === 'unavailable'
              ? recovered.error
              : 'The completed conversation could not be recovered.',
          )
        }
        if (recoveryDecision !== 'publish') {
          clearPendingChatbotCommand(
            window.sessionStorage,
            clientRequest.idempotencyKey,
          )
          setPendingRecoveryLocked(false)
          setPendingRecoveryPath(null)
          setConversationHistory([])
          setCurrentConversationId(null)
          setCurrentConversationRevision(0)
          setConversationTargetState({
            scope: requestScope,
            status: conversationIdSnapshot
              ? recoveryDecision === 'clear_deleted'
                ? 'not_found'
                : 'overflow'
              : 'ready',
          })
          setOlderMessagesCursor(null)
          optimisticBaselineRef.current = null
          setError(recoveryDecision === 'clear_deleted'
            ? 'This completed chat was deleted in another tab.'
            : 'This completed chat is too large to display safely.')
          return
        }
        if (recovered.status !== 'ready') return
        const recoveredHistory: ConversationHistory = recovered.messages.map(message => ({
          id: message.id,
          role: message.role,
          content: message.content,
          timestamp: message.createdAt,
          chartConfig: message.chartConfig as ChartConfig | undefined,
          followUpQuestions: message.followUpQuestions ?? undefined,
          dataUsed: message.dataUsed as any,
        }))
        setConversationHistory(recoveredHistory)
        setCurrentConversationId(recovered.conversation.id)
        setCurrentConversationRevision(recovered.conversation.revision)
        setConversationTargetState({ scope: requestScope, status: 'ready' })
        setOlderMessagesCursor(recovered.nextCursor)
        setQuestion('')
        clearPendingChatbotCommand(
          window.sessionStorage,
          clientRequest.idempotencyKey,
        )
        setPendingRecoveryLocked(false)
        setPendingRecoveryPath(null)
        if (
          optimisticBaselineRef.current?.idempotencyKey ===
            clientRequest.idempotencyKey
        ) {
          optimisticBaselineRef.current = null
        }
        router.push(`/chatbot?id=${durableReceipt.conversationId}`)
        setRefreshQueriesTrigger(previous => previous + 1)
        return
      }

      if (streamFailed || !streamCompleted || !durableReceipt) {
        throw new Error(
          terminalFailureMessage || 'The chatbot response ended before completion.',
        )
      }

      // Update conversation history (no summarization in streaming mode)
      if (
        streamedAnswer &&
        !streamFailed &&
        streamCompleted &&
        durableReceipt
      ) {
        const feedbackReceipt = requestCoordinator.getFeedbackReceipt(
          clientRequest.generation,
        )
        // In streaming mode, trust the LLM prompt to generate concise answers
        // The prompt already instructs: "If >4 data points, write 2 sentences max"
        // Client-side summarization would cause a jarring flash after streaming
        const assistantMessage: Message = {
          role: 'assistant',
          content: streamedAnswer,
          timestamp: new Date().toISOString(),
          chartConfig: receivedChart,
          followUpQuestions: receivedFollowUpQuestions.length > 0 ? receivedFollowUpQuestions : undefined,
          dataUsed: receivedData,
        }

        // Add only assistant message (user message was already added at the start)
        if (!isCurrent()) return
        setConversationHistory(prev => [...prev, assistantMessage])
        // Answer is already displayed during streaming - don't replace it!

        setCurrentConversationId(durableReceipt.conversationId)
        setCurrentConversationRevision(durableReceipt.revision)
        setConversationTargetState({ scope: requestScope, status: 'ready' })
        setQuestion('')
        clearPendingChatbotCommand(
          window.sessionStorage,
          clientRequest.idempotencyKey,
        )
        setPendingRecoveryLocked(false)
        setPendingRecoveryPath(null)
        if (
          optimisticBaselineRef.current?.idempotencyKey ===
            clientRequest.idempotencyKey
        ) {
          optimisticBaselineRef.current = null
        }
        router.push(`/chatbot?id=${durableReceipt.conversationId}`)

        // Reset feedback state
        setQueryLogId(feedbackReceipt)
        setFeedback(null)
        setShowCommentBox(false)
        setFeedbackComment('')

        // Refresh recent queries sidebar
        console.log('[ask/page] Incrementing refreshQueriesTrigger')
        setRefreshQueriesTrigger(prev => {
          const newValue = prev + 1
          console.log('[ask/page] refreshQueriesTrigger:', prev, '->', newValue)
          return newValue
        })
      }
    } catch (err) {
      if (!isCurrent() || clientRequest.signal.aborted) return
      if (retryableTransportFailure && attempt < CHATBOT_PENDING_COMMAND_MAX_ATTEMPTS) {
        let nextPending: PendingChatbotCommand
        try {
          nextPending = savePendingChatbotCommand(
            window.sessionStorage,
            requestScope,
            requestBody,
            retainedCommand.requestFingerprint,
            attempt + 1,
            Date.now(),
            {
              savedAt: retainedCommand.savedAt,
              expiresAt: retainedCommand.expiresAt,
            },
          )
        } catch {
          const marker = loadPendingChatbotRecoveryMarker(
            window.sessionStorage,
            requestScope,
          )
          if (marker?.idempotencyKey === clientRequest.idempotencyKey) {
            setPendingRecoveryLocked(true)
            setPendingRecoveryPublishedScope(requestScope)
            setPendingRecoveryPath(getPendingChatbotRecoveryPath(
              window.sessionStorage,
              requestScope,
            ))
            setError('Saved request content expired. Reload to check whether the answer committed.')
            return
          }
          clearPendingChatbotCommand(
            window.sessionStorage,
            clientRequest.idempotencyKey,
          )
          setPendingRecoveryLocked(false)
          setPendingRecoveryPath(null)
          setError('The saved-answer recovery window expired. Please try again.')
          return
        }
        setError('Connection interrupted. Recovering the saved answer…')
        retryTimerRef.current = window.setTimeout(() => {
          retryTimerRef.current = null
          if (
            !pageMountedRef.current ||
            activeHistoryScopeRef.current !== requestScope ||
            pendingRecoveryStartedRef.current !== clientRequest.idempotencyKey
          ) return
          const retained = loadPendingChatbotCommand(
            window.sessionStorage,
            requestScope,
          )
          if (
            !retained ||
            retained.body.idempotencyKey !== clientRequest.idempotencyKey ||
            retained.attempt !== nextPending.attempt
          ) return
          pendingSubmitRef.current(nextPending)
        }, retryDelayMs)
        return
      }
      if (retryableTransportFailure) {
        // Automatic polling is exhausted, but the last attempt may have
        // committed before its terminal bytes were lost. Keep the same key
        // recoverable across reload until the original ten-minute TTL.
        setError('Connection interrupted. Reload to recover the saved answer.')
        return
      }
      clearPendingChatbotCommand(
        window.sessionStorage,
        clientRequest.idempotencyKey,
      )
      setPendingRecoveryLocked(false)
      setPendingRecoveryPath(null)
      let terminalFailureDisplay: string | null = null
      if (pendingCommand) {
        if (conversationIdSnapshot) {
          setConversationTargetState({ scope: requestScope, status: 'pending' })
          const restored = await getConversation(conversationIdSnapshot)
          if (!isCurrent()) return
          if (restored.status === 'ready') {
            setConversationHistory(restored.messages.map(message => ({
              id: message.id,
              role: message.role,
              content: message.content,
              timestamp: message.createdAt,
              chartConfig: message.chartConfig as ChartConfig | undefined,
              followUpQuestions: message.followUpQuestions ?? undefined,
              dataUsed: message.dataUsed as any,
            })))
            setCurrentConversationId(restored.conversation.id)
            setCurrentConversationRevision(restored.conversation.revision)
            setConversationTargetState({ scope: requestScope, status: 'ready' })
            setOlderMessagesCursor(restored.nextCursor)
          } else {
            setConversationHistory([])
            setCurrentConversationId(null)
            setCurrentConversationRevision(0)
            setConversationTargetState({
              scope: requestScope,
              status: restored.status,
            })
            setOlderMessagesCursor(null)
            terminalFailureDisplay = restored.status === 'not_found'
              ? 'This chat no longer exists. Start a new chat to continue.'
              : restored.status === 'overflow'
                ? restored.error
                : 'Conversation history is temporarily unavailable. Reload before sending.'
          }
        } else {
          setConversationHistory([])
          setCurrentConversationId(null)
          setCurrentConversationRevision(0)
          setConversationTargetState({ scope: requestScope, status: 'ready' })
          setOlderMessagesCursor(null)
        }
        setQuestion(submittedQuestion)
      }
      const baseline = optimisticBaselineRef.current
      if (
        baseline?.idempotencyKey === clientRequest.idempotencyKey &&
        baseline.scope === requestScope
      ) {
        // A definitive non-admission/failure means the optimistic user row was
        // never committed. Restore the exact pre-command snapshot. This runs
        // only under isCurrent(), so an older request cannot roll back a newer
        // generation; uncertain outcomes retain both the row and same key.
        setConversationHistory(baseline.history)
        setQuestion(baseline.question)
        optimisticBaselineRef.current = null
      }
      setError(terminalFailureDisplay ?? (
        err instanceof Error ? err.message : 'An unexpected error occurred'
      ))
    } finally {
      if (reader) {
        await reader.cancel(
          new DOMException('Chatbot response processing finished.', 'AbortError'),
        ).catch(() => undefined)
      }
      if (isCurrent()) {
        requestCoordinator.finish(clientRequest.generation)
        setLoading(false)
        setLoadingStep(null)
        setLoadingMessage('')
      }
    }
  }

  pendingSubmitRef.current = command => {
    void handleSubmitStreaming({ preventDefault() {} } as React.FormEvent, command)
  }

  // Recover a command after a tab reload using the exact same bounded payload
  // and key. After ten minutes the content is erased, but a content-free marker
  // keeps the exact durable identity resolvable for the key's bounded window.
  useEffect(() => {
    if (!historyIsPublished) return
    const scope = requestedHistoryScope
    let cancelled = false
    const isCurrentScope = () =>
      !cancelled && activeHistoryScopeRef.current === scope
    const pending = loadPendingChatbotCommand(
      window.sessionStorage,
      scope,
    )
    const marker = loadPendingChatbotRecoveryMarker(
      window.sessionStorage,
      scope,
    )
    const recoveryExists = hasPendingChatbotCommand(
      window.sessionStorage,
      scope,
    )
    const recoveryPath = getPendingChatbotRecoveryPath(
      window.sessionStorage,
      scope,
    )
    setPendingRecoveryLocked(recoveryExists)
    setPendingRecoveryPublishedScope(scope)
    setPendingRecoveryPath(recoveryPath)
    if (!pending && !marker && recoveryExists) {
      setError('Another chat has an answer pending recovery. Return to it before starting a new request.')
    }
    const cancelExpiry = schedulePendingChatbotCommandExpiry(
      window.sessionStorage,
      scope,
      promoted => {
        if (!isCurrentScope()) return
        if (promoted) {
          requestCoordinator.cancelCurrent(new DOMException(
            'Pending request content retention expired.',
            'AbortError',
          ))
          pendingRecoveryStartedRef.current = null
          if (retryTimerRef.current !== null) {
            window.clearTimeout(retryTimerRef.current)
            retryTimerRef.current = null
          }
          setLoading(false)
          setLoadingStep(null)
          setLoadingMessage('')
          setAnswer('')
          setSelectedTool(null)
          setDataUsed(null)
          setChartConfig(null)
          setFollowUpQuestions([])
          setFlowEvents([])
          setDataReceived(false)
        }
        const baseline = optimisticBaselineRef.current
        if (baseline?.scope === scope) {
          setConversationHistory(baseline.history)
          setQuestion(baseline.question)
          optimisticBaselineRef.current = null
        }
        setPendingRecoveryLocked(promoted !== null)
        setPendingRecoveryPath(promoted
          ? getPendingChatbotRecoveryPath(window.sessionStorage, scope)
          : null)
        setError(promoted
          ? 'Saved request content expired. Reload to check whether the answer committed.'
          : 'Saved-answer recovery expired. Please try again.')
        setPendingRecoveryCheck(previous => previous + 1)
      },
    )

    if (marker) {
      // Fence a same-scope initial loader: it must not publish an older
      // revision after this exact-key resolution/recovery finishes.
      historyGenerationFence.invalidate()
      void (async () => {
        const resolved = await resolvePendingChatbotRequest({
          idempotencyKey: marker.idempotencyKey,
          requestFingerprint: marker.requestFingerprint,
        })
        if (!isCurrentScope()) return
        const markerDecision = classifyPendingMarkerResolution(
          resolved.status === 'ready' ? resolved : null,
        )

        if (
          markerDecision === 'recover' &&
          resolved.status === 'ready' &&
          resolved.disposition === 'completed' &&
          resolved.conversationId &&
          resolved.revision !== null
        ) {
          const recovered = await getConversation(resolved.conversationId)
          if (!isCurrentScope()) return
          const recoveryDecision = classifyCompletedConversationRecovery(
            recovered.status,
            recovered.status === 'ready'
              ? recovered.conversation.revision
              : null,
            resolved.revision,
          )
          if (recoveryDecision === 'retain') {
            setError('The saved answer committed, but its conversation is temporarily unavailable. Reload to recover it.')
            return
          }
          if (recoveryDecision !== 'publish') {
            clearPendingChatbotCommand(
              window.sessionStorage,
              marker.idempotencyKey,
            )
            setPendingRecoveryLocked(false)
            setPendingRecoveryPath(null)
            setConversationHistory([])
            setCurrentConversationId(null)
            setCurrentConversationRevision(0)
            setConversationTargetState({
              scope,
              status: requestedConversationId
                ? recoveryDecision === 'clear_deleted'
                  ? 'not_found'
                  : 'overflow'
                : 'ready',
            })
            setOlderMessagesCursor(null)
            setError(recoveryDecision === 'clear_deleted'
              ? 'This completed chat was deleted in another tab.'
              : 'This completed chat is too large to display safely.')
            return
          }
          if (recovered.status !== 'ready') return
          setConversationHistory(recovered.messages.map(message => ({
            id: message.id,
            role: message.role,
            content: message.content,
            timestamp: message.createdAt,
            chartConfig: message.chartConfig as ChartConfig | undefined,
            followUpQuestions: message.followUpQuestions ?? undefined,
            dataUsed: message.dataUsed as any,
          })))
          setCurrentConversationId(recovered.conversation.id)
          setCurrentConversationRevision(recovered.conversation.revision)
          setConversationTargetState({ scope, status: 'ready' })
          setOlderMessagesCursor(recovered.nextCursor)
          clearPendingChatbotCommand(window.sessionStorage, marker.idempotencyKey)
          setPendingRecoveryLocked(false)
          setPendingRecoveryPath(null)
          setError('')
          router.push(`/chatbot?id=${resolved.conversationId}`)
          setRefreshQueriesTrigger(previous => previous + 1)
          return
        }

        if (
          markerDecision === 'retain'
        ) {
          setError('Saved-answer status is temporarily unavailable. Reload to continue recovery; the original question has been erased from this browser.')
          return
        }

        // The durable identity is definitively non-committable (including an
        // expired lease, which the combo RPC now fences). Clear only after the
        // authoritative resolution, then publish DB state rather than an
        // optimistic row.
        clearPendingChatbotCommand(window.sessionStorage, marker.idempotencyKey)
        if (requestedConversationId) {
          setConversationTargetState({ scope, status: 'pending' })
        }
        setPendingRecoveryLocked(false)
        setPendingRecoveryPath(null)
        let terminalMessage = 'The saved request did not commit. You can ask it again.'
        if (requestedConversationId) {
          const restored = await getConversation(requestedConversationId)
          if (!isCurrentScope()) return
          if (restored.status === 'ready') {
            setConversationHistory(restored.messages.map(message => ({
              id: message.id,
              role: message.role,
              content: message.content,
              timestamp: message.createdAt,
              chartConfig: message.chartConfig as ChartConfig | undefined,
              followUpQuestions: message.followUpQuestions ?? undefined,
              dataUsed: message.dataUsed as any,
            })))
            setCurrentConversationId(restored.conversation.id)
            setCurrentConversationRevision(restored.conversation.revision)
            setConversationTargetState({ scope, status: 'ready' })
            setOlderMessagesCursor(restored.nextCursor)
          } else {
            setConversationHistory([])
            setCurrentConversationId(null)
            setCurrentConversationRevision(0)
            setConversationTargetState({ scope, status: restored.status })
            setOlderMessagesCursor(null)
            terminalMessage = restored.status === 'not_found'
              ? 'The saved request did not commit, and this chat no longer exists. Start a new chat to continue.'
              : restored.status === 'overflow'
                ? restored.error
                : 'The saved request did not commit, and this conversation is temporarily unavailable. Reload before sending.'
          }
        } else {
          setConversationHistory([])
          setCurrentConversationId(null)
          setCurrentConversationRevision(0)
          setConversationTargetState({ scope, status: 'ready' })
          setOlderMessagesCursor(null)
        }
        setError(terminalMessage)
      })()
    }

    if (
      !pending ||
      pendingRecoveryStartedRef.current === pending.body.idempotencyKey
    ) {
      return () => {
        cancelled = true
        cancelExpiry()
      }
    }

    // Fence the still-running initial detail request before launching an exact
    // retained command. Its older revision must never clobber recovery.
    historyGenerationFence.invalidate()
    pendingRecoveryStartedRef.current = pending.body.idempotencyKey
    setQuestion(pending.body.question)
    pendingSubmitRef.current(pending)
    return () => {
      cancelled = true
      cancelExpiry()
    }
  }, [
    historyIsPublished,
    historyGenerationFence,
    pendingRecoveryCheck,
    requestCoordinator,
    requestedConversationId,
    requestedHistoryScope,
    router,
  ])

  // Handle feedback submission
  const handleFeedbackClick = async (feedbackType: 'thumbs_up' | 'thumbs_down') => {
    if (
      !historyIsPublished ||
      !visibleQueryLogId ||
      !requestCoordinator.ownsFeedbackReceipt(visibleQueryLogId)
    ) return

    setFeedback(feedbackType)
    setShowCommentBox(true)

    // If thumbs up and no comment needed, submit immediately
    if (feedbackType === 'thumbs_up') {
      setFeedbackSubmitting(true)
      const result = await submitFeedback({
        queryLogId: visibleQueryLogId,
        feedback: feedbackType,
      })
      setFeedbackSubmitting(false)

      if (!result.success) {
        console.error('Failed to submit feedback:', result.error)
      }
    }
  }

  // Handle comment submission
  const handleCommentSubmit = async () => {
    if (
      !historyIsPublished ||
      !visibleQueryLogId ||
      !visibleFeedback ||
      !requestCoordinator.ownsFeedbackReceipt(visibleQueryLogId)
    ) return

    setFeedbackSubmitting(true)
    const result = await submitFeedback({
      queryLogId: visibleQueryLogId,
      feedback: visibleFeedback,
      comment: visibleFeedbackComment.trim() || undefined,
    })
    setFeedbackSubmitting(false)

    if (result.success) {
      setShowCommentBox(false)
    } else {
      console.error('Failed to submit feedback:', result.error)
    }
  }

  // Handle follow-up question click
  const handleFollowUpQuestionClick = (selectedQuestion: string) => {
    if (!historyIsPublished) return
    const expectedScope = requestedHistoryScope
    setQuestion(selectedQuestion)
    // Trigger submit after a brief delay to ensure state is updated
    setTimeout(() => {
      if (activeHistoryScopeRef.current !== expectedScope) return
      const form = document.querySelector('form')
      if (form) {
        const event = new Event('submit', { bubbles: true, cancelable: true })
        form.dispatchEvent(event)
      }
    }, 0)
  }

  // Copy answer to clipboard
  const handleCopyAnswer = async () => {
    if (!historyIsPublished) return
    try {
      await navigator.clipboard.writeText(visibleAnswer)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleLoadOlderMessages = async () => {
    const cursor = visibleOlderMessagesCursor
    const conversationId = visibleCurrentConversationId
    if (
      !historyIsPublished ||
      !conversationId ||
      !cursor ||
      visibleLoadingOlderMessages
    ) return

    const scope = requestedHistoryScope
    const expectedRevision = visibleCurrentConversationRevision
    const generation = ++olderMessagesLoadGenerationRef.current
    const isCurrent = () =>
      olderMessagesLoadGenerationRef.current === generation &&
      activeHistoryScopeRef.current === scope

    setLoadingOlderMessages(true)
    setOlderMessagesError('')
    try {
      const result = await getConversation({
        conversationId,
        beforeCreatedAt: cursor.beforeCreatedAt,
        beforeId: cursor.beforeId,
      })
      if (!isCurrent()) return
      if (
        result.status !== 'ready' ||
        result.conversation.id !== conversationId ||
        result.conversation.revision !== expectedRevision
      ) {
        setOlderMessagesError(
          result.status === 'unavailable'
            ? result.error
            : 'Older messages could not be loaded safely. Refresh the conversation.',
        )
        return
      }

      const olderHistory: ConversationHistory = result.messages.map(message => ({
        id: message.id,
        role: message.role,
        content: message.content,
        timestamp: message.createdAt,
        chartConfig: message.chartConfig as ChartConfig | undefined,
        followUpQuestions: message.followUpQuestions ?? undefined,
        dataUsed: message.dataUsed as any,
      }))
      setConversationHistory(current => {
        const existingIds = new Set(
          current.flatMap(message => message.id ? [message.id] : []),
        )
        return [
          ...olderHistory.filter(message =>
            !message.id || !existingIds.has(message.id)
          ),
          ...current,
        ]
      })
      setOlderMessagesCursor(result.nextCursor)
    } catch {
      if (isCurrent()) {
        setOlderMessagesError('Older messages are temporarily unavailable.')
      }
    } finally {
      if (isCurrent()) setLoadingOlderMessages(false)
    }
  }

  // Clear conversation history / Start new conversation
  const handleClearConversation = async () => {
    if (hasPendingChatbotCommand(
      window.sessionStorage,
      requestedHistoryScope,
    )) {
      setPendingRecoveryLocked(true)
      setPendingRecoveryPublishedScope(requestedHistoryScope)
      setPendingRecoveryPath(getPendingChatbotRecoveryPath(
        window.sessionStorage,
        requestedHistoryScope,
      ))
      setError('Finish recovering the pending answer before starting a new chat.')
      return
    }
    requestCoordinator.cancelCurrent(
      new DOMException('Started a new conversation.', 'AbortError'),
    )
    setLoading(false)
    setLoadingStep(null)
    setLoadingMessage('')
    setConversationHistory([])
    setCurrentConversationId(null)
    setCurrentConversationRevision(0)
    setConversationTargetState({
      scope: requestedHistoryScope,
      status: 'ready',
    })
    setOlderMessagesCursor(null)
    setLoadingOlderMessages(false)
    setOlderMessagesError('')
    localStorage.removeItem('finquote_conversation')

    // Generate new session ID for fresh conversation
    const newSessionId = crypto.randomUUID()
    localStorage.setItem('finquote_session_id', newSessionId)
    setSessionId(newSessionId)

    setAnswer('')
    setDataUsed(null)
    setChartConfig(null)
    setError('')
    setQueryLogId(null)
    setFeedback(null)
    setShowCommentBox(false)
    setFeedbackComment('')

    // A new row is created only when a complete user/assistant turn commits.
    router.push('/chatbot')

    // Focus the textarea after clearing
    setTimeout(() => {
      textareaRef.current?.focus()
    }, 0)
  }

  // Handle clicking on a recent query
  const handleRecentQueryClick = (queryText: string) => {
    if (!historyIsPublished) return
    setQuestion(queryText)
    // Optionally auto-submit:
    // Deliberately leave selection as an edit-before-send interaction.
  }

  // Handle clicking on an example query
  const handleExampleClick = (exampleQuery: string) => {
    if (!historyIsPublished) return
    const expectedScope = requestedHistoryScope
    setQuestion(exampleQuery)
    // Auto-submit after a short delay
    setTimeout(() => {
      if (activeHistoryScopeRef.current !== expectedScope) return
      const form = document.querySelector('form')
      if (form) {
        form.requestSubmit()
      }
    }, 100)
  }

  // Check if conversation is empty (center the input)
  const isEmptyConversation = visibleConversationHistory.length === 0

  // Don't render anything while redirecting (chat disabled)
  if (!CHAT_ENABLED) {
    return null
  }

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-gray-50 dark:bg-[rgb(33,33,33)] flex flex-col">
      {/* Sidebar - fixed position overlay */}
      <div
        className={`hidden lg:block fixed left-0 top-0 h-screen w-96 xl:w-[28rem] border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(26,26,26)] z-50 transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <RecentQueries
          userId={user?.id}
          sessionId={!user ? sessionId : undefined}
          onQueryClick={handleRecentQueryClick}
          onNewChat={handleClearConversation}
          refreshTrigger={refreshQueriesTrigger}
          currentConversationId={visibleCurrentConversationId}
          navigationLocked={visiblePendingRecoveryLocked}
        />
      </div>

      {/* Sidebar Toggle Button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className={`hidden lg:flex fixed top-1/2 -translate-y-1/2 z-[70] bg-white dark:bg-[rgb(45,45,45)] border border-gray-300 dark:border-gray-600 rounded-r-lg px-2 py-4 hover:bg-gray-100 dark:hover:bg-[rgb(55,55,55)] transition-all shadow-lg ${
          sidebarOpen ? 'xl:left-[28rem] left-96' : 'left-0'
        }`}
        title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
      >
        {sidebarOpen ? (
          <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
      </button>

      {/* Header - fixed at top */}
      <div className={`fixed top-0 left-0 right-0 z-40 border-b border-gray-200 dark:border-[rgb(33,33,33)] bg-white dark:bg-[rgb(33,33,33)] px-6 py-4 transition-[margin] ${flowPanelOffsetClass}`}>
        <div className="flex justify-end items-center">
          <div className="flex items-center gap-3">
            {visibleConversationHistory.length > 0 && (
              <button
                onClick={handleClearConversation}
                className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setShowFinancialsModal(true)}
              className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Financials
            </button>
            <button
              onClick={() => setFlowPanelOpen(prev => !prev)}
              className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Flow
            </button>
            <ThemeToggle />
            {user ? (
              <UserMenu />
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Login
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main scrollable content area - conversation */}
      <div ref={scrollContainerRef} className={`${sidebarOpen ? 'lg:ml-96 xl:ml-[28rem]' : 'lg:ml-96 xl:ml-[28rem] lg:mr-96 xl:mr-[28rem]'} flex-1 overflow-y-auto transition-[margin] duration-300 ${isEmptyConversation ? '' : 'pt-20'} ${flowPanelOffsetClass} relative z-50 pointer-events-none`}>
        <div className={`max-w-6xl mx-auto p-6 space-y-0 ${isEmptyConversation ? '' : 'pb-32 lg:pb-[35vh]'} pointer-events-auto`}>
            {visibleError && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-6 py-4 rounded-lg mb-8">
                <p className="font-medium text-lg">Error</p>
                <p className="text-base">{visibleError}</p>
                {visiblePendingRecoveryLocked && visiblePendingRecoveryPath && (
                  <button
                    type="button"
                    onClick={() => router.push(visiblePendingRecoveryPath)}
                    className="mt-3 rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium hover:bg-red-100"
                  >
                    Return to pending chat
                  </button>
                )}
                {!visiblePendingRecoveryLocked &&
                  visibleConversationTargetStatus === 'not_found' && (
                  <button
                    type="button"
                    onClick={handleClearConversation}
                    className="mt-3 rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium hover:bg-red-100"
                  >
                    Start a new chat
                  </button>
                )}
              </div>
            )}

            {visibleOlderMessagesError && (
              <p className="mb-4 text-center text-sm text-red-700 dark:text-red-300">
                {visibleOlderMessagesError}
              </p>
            )}
            {visibleOlderMessagesCursor && (
              <div className="mb-6 flex justify-center">
                <button
                  type="button"
                  onClick={handleLoadOlderMessages}
                  disabled={visibleLoadingOlderMessages}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  {visibleLoadingOlderMessages ? 'Loading older…' : 'Load older messages'}
                </button>
              </div>
            )}

            {/* Display conversation history */}
            {visibleConversationHistory.map((message, index) => {
              const isLastMessage = index === visibleConversationHistory.length - 1
              return (
                <div
                  key={message.id ?? `${message.timestamp}:${message.role}:${index}`}
                  className={`space-y-1 ${index > 0 ? 'mt-6' : ''}`}
                  ref={isLastMessage ? latestMessageRef : null}
                >
                  {message.role === 'user' ? (
                    // User question
                    <div className="flex justify-end mt-6">
                      <div className="group max-w-3xl relative">
                        <div className="bg-gray-100 dark:bg-[rgb(55,55,55)] text-gray-900 dark:text-white rounded-2xl px-6 py-4">
                          <p className="text-xl">{message.content}</p>
                        </div>
                        {/* Copy button - appears on hover after 1 second, absolutely positioned */}
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(message.content)
                          }}
                          className="absolute -bottom-2 right-2 p-2 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-all opacity-0 group-hover:opacity-100 group-hover:delay-1000"
                          title="Copy question"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                  </div>
                ) : (
                  // Assistant answer with chart and follow-up questions
                  <div className="space-y-1">
                    <div className="group relative">
                      <div className="bg-gray-50 dark:bg-[rgb(33,33,33)] rounded-lg p-6">
                        <p className="text-gray-800 dark:text-gray-200 leading-relaxed text-2xl">{message.content}</p>
                      </div>
                      {/* Copy button - appears on hover, bottom right */}
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(message.content)
                        }}
                        className="absolute -bottom-2 right-2 p-2 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-all opacity-0 group-hover:opacity-100 group-hover:delay-1000"
                        title="Copy answer"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>

                    {/* Chart and data tables wrapper */}
                    <div className="w-full max-w-5xl mx-auto space-y-4">
                      {/* Chart for this message */}
                      {message.chartConfig && (
                        <div className="w-full bg-white dark:bg-[rgb(33,33,33)] rounded-lg shadow-sm border-[3px] border-gray-200 dark:border-[rgb(50,50,50)] p-6">
                          <FinancialChart config={message.chartConfig} />
                        </div>
                      )}

                    {/* Data table for standard financials type */}
                    {message.dataUsed && message.dataUsed.type === 'financials' && message.dataUsed.data && message.dataUsed.data.length > 1 && (() => {
                      const data = message.dataUsed.data as FinancialData[]

                      // Get the user's question from the previous message
                      const userQuestion = index > 0
                        ? visibleConversationHistory[index - 1].content
                        : ''

                      // Apply smart filtering based on years mentioned in question
                      const filteredData = getFilteredYearRange(userQuestion, data)

                      // Always use horizontal layout
                      return (
                        <div className="flex justify-center overflow-x-auto">
                          <div className="inline-block bg-white dark:bg-[rgb(33,33,33)] rounded-lg shadow-sm border-[3px] border-gray-200 dark:border-[rgb(50,50,50)] overflow-hidden">
                            <table className="divide-y divide-gray-200 dark:divide-gray-700">
                              <thead className="bg-gray-50 dark:bg-[rgb(33,33,33)]">
                                <tr>
                                  {filteredData.map((row, idx) => (
                                    <th key={idx} scope="col" className="px-3 py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                      {row.year}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="bg-white dark:bg-[rgb(33,33,33)]">
                                <tr className="hover:bg-gray-50 dark:hover:bg-[rgb(40,40,40)]">
                                  {filteredData.map((row, idx) => (
                                    <td key={idx} className="px-3 py-4 whitespace-nowrap text-base text-center text-gray-900 dark:text-gray-100 font-mono">
                                      ${(row.value / 1_000_000_000).toFixed(1)}B
                                    </td>
                                  ))}
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )
                    })()}

                    {/* Data table for financial_metrics type */}
                    {message.dataUsed && message.dataUsed.type === 'financial_metrics' && message.dataUsed.data && message.dataUsed.data.length > 1 && (() => {
                      const data = message.dataUsed.data

                      // Get the user's question from the previous message
                      const userQuestion = index > 0
                        ? visibleConversationHistory[index - 1].content
                        : ''

                      // Apply smart filtering based on years mentioned in question
                      const filteredData = getFilteredYearRange(userQuestion, data)

                      // Always use horizontal layout
                      return (
                        <div className="flex justify-center overflow-x-auto">
                          <div className="inline-block bg-white dark:bg-[rgb(33,33,33)] rounded-lg shadow-sm border-[3px] border-gray-200 dark:border-[rgb(50,50,50)] overflow-hidden">
                            <table className="divide-y divide-gray-200 dark:divide-gray-700">
                              <thead className="bg-gray-50 dark:bg-[rgb(33,33,33)]">
                                <tr>
                                  {filteredData.map((row: any, idx: number) => (
                                    <th key={idx} scope="col" className="px-6 py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                      {row.year}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="bg-white dark:bg-[rgb(33,33,33)]">
                                <tr className="hover:bg-gray-50 dark:hover:bg-[rgb(40,40,40)]">
                                  {filteredData.map((row: any, idx: number) => {
                                    let displayValue = row.metric_value
                                    if (typeof row.metric_value === 'number') {
                                      // If value is in billions (> 1 billion), format as $XXX.XB
                                      if (Math.abs(row.metric_value) >= 1_000_000_000) {
                                        const billions = row.metric_value / 1_000_000_000
                                        displayValue = `$${billions.toFixed(1)}B`
                                      } else {
                                        displayValue = row.metric_value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 })
                                      }
                                    }
                                    return (
                                      <td key={idx} className="px-3 py-4 whitespace-nowrap text-base text-center text-gray-900 dark:text-gray-100 font-mono">
                                        {displayValue}
                                      </td>
                                    )
                                  })}
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )
                    })()}
                    </div>

                    {/* Follow-up questions for this message */}
                    {/* Only show follow-ups for the most recent assistant message */}
                    {message.followUpQuestions && message.followUpQuestions.length > 0 && (
                      <div className={index < visibleConversationHistory.length - 1 ? 'hidden' : ''}>
                        <FollowUpQuestions
                          ref={index === visibleConversationHistory.length - 2 ? previousFollowUpRef : null}
                          questions={message.followUpQuestions}
                          onQuestionClick={handleFollowUpQuestionClick}
                        />
                      </div>
                    )}
                  </div>
                  )}
                </div>
              )
            })}

            {/* Loading status indicator - positioned like answer */}
            {visibleLoading && !visibleAnswer && (
              <div className="space-y-4 mt-6">
                {/* Show selected tool indicator if tool has been chosen */}
                {visibleSelectedTool && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full font-medium">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Using {visibleSelectedTool}
                    </span>
                  </div>
                )}
                <div className="bg-gray-50 dark:bg-[rgb(33,33,33)] rounded-lg p-6">
                  <p className="text-gray-600 dark:text-gray-400 text-xl">
                    {visibleLoadingMessage || (
                      <>
                        {visibleLoadingStep === 'analyzing' && 'Analyzing...'}
                        {visibleLoadingStep === 'selecting' && 'Selecting Tool...'}
                        {visibleLoadingStep === 'calling' && 'Calling API...'}
                        {visibleLoadingStep === 'fetching' && 'Fetching Data...'}
                        {visibleLoadingStep === 'calculating' && 'Calculating...'}
                        {visibleLoadingStep === 'generating' && 'Generating Answer...'}
                      </>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Show current streaming answer (text only - chart appears when complete) */}
            {visibleLoading && visibleAnswer && (
              <div className="space-y-4">
                {/* Show selected tool indicator */}
                {visibleSelectedTool && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full font-medium">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Using {visibleSelectedTool}
                    </span>
                  </div>
                )}
                <div className="bg-gray-50 dark:bg-[rgb(33,33,33)] rounded-lg p-6">
                  <p className="text-gray-800 dark:text-gray-200 leading-relaxed text-2xl">{visibleAnswer}</p>
                </div>

                {/* Loading indicator for chart/table - only show if data hasn't been received yet */}
                {!visibleDataReceived && (
                  <div className="bg-white dark:bg-[rgb(33,33,33)] rounded-lg shadow-sm border-2 border-gray-200 dark:border-gray-700 p-8">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="flex gap-2">
                        <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {visibleSelectedTool === 'getAaplFinancialsByMetric' || visibleSelectedTool === 'getFinancialMetric'
                          ? '📊 Preparing financial chart and data table...'
                          : visibleSelectedTool === 'getPrices'
                          ? '📈 Preparing price chart...'
                          : visibleSelectedTool === 'getRecentFilings'
                          ? '📄 Preparing filing data table...'
                          : visibleSelectedTool === 'listMetrics'
                          ? '📋 Preparing metrics catalog table...'
                          : '📊 Generating chart and data table...'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Feedback section (shown only when not loading and has answer) */}
            {!visibleLoading && visibleAnswer && visibleQueryLogId && (
              <div className="space-y-6">
                {/* Feedback and comment section */}
                <div className="bg-gray-50 dark:bg-[rgb(33,33,33)] rounded-lg p-6">
                  {/* Feedback Section */}
                  <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-4">
                      <p className="text-base text-gray-600 dark:text-gray-400">Was this answer helpful?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleFeedbackClick('thumbs_up')}
                          disabled={visibleFeedbackSubmitting}
                          className={`p-2 rounded-lg transition-colors ${
                            visibleFeedback === 'thumbs_up'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          } disabled:opacity-50`}
                          title="Thumbs up"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleFeedbackClick('thumbs_down')}
                          disabled={visibleFeedbackSubmitting}
                          className={`p-2 rounded-lg transition-colors ${
                            visibleFeedback === 'thumbs_down'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          } disabled:opacity-50`}
                          title="Thumbs down"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Comment Box */}
                    {visibleShowCommentBox && (
                      <div className="mt-4 space-y-3">
                        <textarea
                          value={visibleFeedbackComment}
                          onChange={(e) => setFeedbackComment(e.target.value)}
                          placeholder={
                            visibleFeedback === 'thumbs_down'
                              ? 'What was wrong with this answer? (optional)'
                              : 'Any additional comments? (optional)'
                          }
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-base"
                          rows={3}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleCommentSubmit}
                            disabled={visibleFeedbackSubmitting}
                            className="px-4 py-2 bg-blue-600 text-white text-base rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
                          >
                            {visibleFeedbackSubmitting ? 'Submitting...' : 'Submit Feedback'}
                          </button>
                          <button
                            onClick={() => {
                              setShowCommentBox(false)
                              setFeedbackComment('')
                            }}
                            disabled={visibleFeedbackSubmitting}
                            className="px-4 py-2 bg-gray-200 text-gray-700 text-base rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div aria-hidden="true" className="pointer-events-none h-24 sm:h-32 lg:h-[30vh]" />

        </div>
      </div>

      {/* Fixed bottom input bar - centered when empty, bottom when conversation exists */}
      <div className={`${sidebarOpen ? 'lg:ml-96 xl:ml-[28rem]' : 'lg:ml-96 xl:ml-[28rem] lg:mr-96 xl:mr-[28rem]'} ${isEmptyConversation ? 'fixed top-1/2 left-0 right-0 -translate-y-1/2' : 'fixed bottom-0 left-0 right-0 pb-12'} bg-gray-50 dark:bg-[rgb(33,33,33)] z-50 transition-[margin,right] duration-300 ${flowPanelOpen ? 'lg:right-[420px]' : ''}`}>
        <div className="max-w-4xl mx-auto px-6">
          <form onSubmit={handleSubmitStreaming}>
            <div className="relative flex items-center gap-4 bg-blue-100 dark:bg-[rgb(55,55,55)] rounded-full px-6 py-5 border border-blue-300 dark:border-gray-600">
              {/* Textarea field */}
              <textarea
                ref={textareaRef}
                value={visibleQuestion}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (visibleQuestion.trim()) {
                      handleSubmitStreaming(e as any)
                    }
                  }
                }}
                placeholder={
                  authUnavailable
                    ? 'Authentication is temporarily unavailable'
                    : user
                      ? 'Ask anything'
                      : authResolved
                        ? 'Sign in to ask a question'
                        : 'Checking sign-in status'
                }
                rows={1}
                maxLength={MAX_CHAT_QUESTION_LENGTH}
                className="flex-1 bg-transparent border-none focus:outline-none text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 text-xl resize-none overflow-hidden leading-normal max-h-[200px] py-0"
                style={{ height: 'auto' }}
                disabled={
                  !historyIsPublished ||
                  !conversationTargetReady ||
                  visibleLoading ||
                  visiblePendingRecoveryLocked ||
                  !authResolved
                }
              />

              {/* Send button */}
              <button
                type="submit"
                disabled={
                  !historyIsPublished ||
                  !conversationTargetReady ||
                  visibleLoading ||
                  visiblePendingRecoveryLocked ||
                  !authResolved ||
                  !visibleQuestion.trim()
                }
                className="flex-shrink-0 w-11 h-11 bg-gray-600 text-white rounded-full hover:bg-gray-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
                title={visibleLoading ? 'Stop' : user ? 'Send message' : 'Sign in to ask'}
              >
                {visibleLoading ? (
                  <div className="w-4 h-4 bg-white rounded-sm"></div>
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                )}
              </button>
            </div>

            {authResolved && !user && (
              <p className="mt-3 text-center text-sm text-gray-600 dark:text-gray-400">
                <button
                  type="button"
                  onClick={() => setShowAuthModal(true)}
                  className="font-medium text-blue-700 hover:underline dark:text-blue-300"
                >
                  Sign in
                </button>{' '}
                to use the research assistant.
              </p>
            )}

            {authUnavailable && (
              <p className="mt-3 text-center text-sm text-amber-700 dark:text-amber-300">
                Authentication is temporarily unavailable. Your pending
                request is preserved; refresh to retry.
              </p>
            )}

          </form>
        </div>
      </div>

      <FlowVisualization
        events={visibleFlowEvents}
        isOpen={flowPanelOpen}
        onToggle={() => setFlowPanelOpen(prev => !prev)}
        filter={flowFilter}
        onFilterChange={setFlowFilter}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={() => {
          setShowAuthModal(false)
          setRefreshQueriesTrigger(prev => prev + 1)
        }}
      />

      {/* Financials Modal */}
      <FinancialsModal
        isOpen={showFinancialsModal}
        onClose={() => setShowFinancialsModal(false)}
      />
      </div>
    </>
  )
}

export default function AskPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
      <AskPageContent />
    </Suspense>
  )
}
