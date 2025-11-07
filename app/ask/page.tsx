'use client'

import { useState, useEffect, useRef } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { User } from '@supabase/supabase-js'
import { askQuestion, submitFeedback, FinancialData, PriceData, FilingData, PassageData } from '@/app/actions/ask-question'
import { getConversation, createConversation, saveMessage, autoGenerateTitle } from '@/app/actions/conversations'
import FinancialChart from '@/components/FinancialChart'
import RecentQueries from '@/components/RecentQueries'
import AuthModal from '@/components/AuthModal'
import UserMenu from '@/components/UserMenu'
import FollowUpQuestions from '@/components/FollowUpQuestions'
import FlowVisualization, { FlowFilter } from '@/components/FlowVisualization'
import FinancialsModal from '@/components/FinancialsModal'
import ThemeToggle from '@/components/ThemeToggle'
import type { ChartConfig } from '@/types/chart'
import type { ConversationHistory, Message } from '@/types/conversation'
import type { FlowEvent } from '@/lib/flow/events'
import type { Database } from '@/lib/database.types'
import { useSearchParams, useRouter } from 'next/navigation'

const stripMarkdown = (text: string): string => {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const formatNumberValue = (value: number, decimals: number): string =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value)

const formatMetricValue = (value: number, yAxisLabel: string): string => {
  const label = yAxisLabel.toLowerCase()

  if (label.includes('%')) {
    return `${formatNumberValue(value, 1)}%`
  }

  if (label.includes('($b)')) {
    return `$${formatNumberValue(value, 1)}B`
  }

  if (label.includes('($m)')) {
    return `$${formatNumberValue(value, 1)}M`
  }

  if (label.includes('($)')) {
    return `$${formatNumberValue(value, 2)}`
  }

  if (label.includes('ratio') || label.includes('turnover')) {
    return formatNumberValue(value, 2)
  }

  return formatNumberValue(value, 1)
}

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
    const last5Years = []
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

const summarizeAnswer = (rawAnswer: string, chartConfig: ChartConfig | null): string => {
  const cleanedAnswer = stripMarkdown(rawAnswer)

  if (
    !chartConfig ||
    !Array.isArray(chartConfig.data) ||
    !Array.isArray(chartConfig.categories) ||
    chartConfig.data.length !== chartConfig.categories.length ||
    chartConfig.data.length <= 4
  ) {
    return cleanedAnswer
  }

  const { data, categories, yAxisLabel, title } = chartConfig
  if (data.length === 0) return cleanedAnswer

  const metricMatch = title?.match(/AAPL\s+(.+?)\s*\(/i)
  const metricDisplayName = (metricMatch ? metricMatch[1] : yAxisLabel.replace(/\s*\(.*\)/, '')).trim() || 'metric'
  const metricLower = metricDisplayName.toLowerCase()

  const startYear = categories[0]
  const endYear = categories[categories.length - 1]
  const startValue = data[0]
  const endValue = data[data.length - 1]

  let minIndex = 0
  let maxIndex = 0
  data.forEach((value, index) => {
    if (value < data[minIndex]) minIndex = index
    if (value > data[maxIndex]) maxIndex = index
  })

  const startText = formatMetricValue(startValue, yAxisLabel)
  const endText = formatMetricValue(endValue, yAxisLabel)

  const extremes: string[] = []
  if (data.length > 2) {
    if (maxIndex !== 0 && maxIndex !== data.length - 1) {
      extremes.push(`peaking at ${formatMetricValue(data[maxIndex], yAxisLabel)} in ${categories[maxIndex]}`)
    }
    if (minIndex !== 0 && minIndex !== data.length - 1 && minIndex !== maxIndex) {
      extremes.push(`bottoming at ${formatMetricValue(data[minIndex], yAxisLabel)} in ${categories[minIndex]}`)
    }
  }

  let extremesText = ''
  if (extremes.length === 1) {
    extremesText = `, ${extremes[0]}`
  } else if (extremes.length === 2) {
    extremesText = `, ${extremes[0]} and ${extremes[1]}`
  }

  const normalizedLabel = yAxisLabel.toLowerCase()
  let tolerance = Math.abs(startValue) * 0.01
  if (!Number.isFinite(tolerance) || tolerance < 0.01) {
    tolerance = 0.01
  }
  if (normalizedLabel.includes('%')) {
    tolerance = Math.max(tolerance, 0.3)
  } else if (normalizedLabel.includes('($')) {
    tolerance = Math.max(tolerance, 1)
  } else {
    tolerance = Math.max(tolerance, 0.02)
  }

  const diff = endValue - startValue
  let trendClause: string
  if (diff > tolerance) {
    trendClause = 'increased over the period'
  } else if (diff < -tolerance) {
    trendClause = 'decreased over the period'
  } else {
    trendClause = 'was relatively flat over the period'
  }

  const firstSentence = `AAPL's ${metricDisplayName} moved from ${startText} in ${startYear} to ${endText} in ${endYear}${extremesText}.`
  const secondSentence = `Overall ${metricLower} ${trendClause}; check the data table below for the full year-by-year breakdown.`

  return `${firstSentence} ${secondSentence}`
}

const SCROLL_BUFFER_PX = 8  // Minimal gap between question and header
const HEADER_HEIGHT_PX = 80
const EXTRA_SCROLL_UP = 50  // Extra pixels to scroll up to hide previous content completely

export default function AskPage() {
  const searchParams = useSearchParams()
  const router = useRouter()

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
  const [conversationHistory, setConversationHistory] = useState<ConversationHistory>([])
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
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
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showFinancialsModal, setShowFinancialsModal] = useState(false)
  const supabase = createClientComponentClient<Database>()

  // Ref for the textarea to enable auto-focus
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Ref for the latest message to enable auto-scroll
  const latestMessageRef = useRef<HTMLDivElement>(null)

  // Ref for the scrollable container
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Ref for tracking the previous message's follow-up questions (to measure height for scroll)
  const previousFollowUpRef = useRef<HTMLDivElement>(null)

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto'
    // Set height to scrollHeight (content height)
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [question])

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
    // Get current user on mount
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
    })

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Load conversation from URL parameter or localStorage
  useEffect(() => {
    const loadConversation = async () => {
      const conversationId = searchParams.get('id')

      // If authenticated and conversation ID in URL, load from database
      if (user && conversationId) {
        const { conversation, error } = await getConversation(conversationId)
        if (error) {
          console.error('Failed to load conversation:', error)
          return
        }

        if (conversation) {
          setCurrentConversationId(conversation.id)
          // Convert database messages to conversation history format
          const history: ConversationHistory = conversation.messages.map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
            timestamp: msg.created_at,
            chartConfig: msg.chart_config as ChartConfig | undefined,
            followUpQuestions: msg.follow_up_questions || undefined,
            dataUsed: msg.data_used as any,
          }))
          setConversationHistory(history)
        }
      }
      // Otherwise load from localStorage for non-authenticated users
      else if (!user) {
        const saved = localStorage.getItem('finquote_conversation')
        if (saved) {
          try {
            const parsed = JSON.parse(saved)
            setConversationHistory(parsed)
          } catch (err) {
            console.error('Failed to load conversation history:', err)
            localStorage.removeItem('finquote_conversation')
          }
        }
      }
    }

    loadConversation()
  }, [user, searchParams])

  // Save conversation history to localStorage for non-authenticated users only
  useEffect(() => {
    if (!user && conversationHistory.length > 0) {
      localStorage.setItem('finquote_conversation', JSON.stringify(conversationHistory))
    }
  }, [conversationHistory, user])

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
    if (conversationHistory.length === 0) return

    const lastMessage = conversationHistory[conversationHistory.length - 1]
    // Only scroll when user message is added (question is posted)
    if (lastMessage.role !== 'user') return

    // Only scroll once per user message
    if (hasScrolledForMessage.current === conversationHistory.length) return
    hasScrolledForMessage.current = conversationHistory.length

    // Scroll immediately after question is posted
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!scrollContainerRef.current) return

        // Get all message containers
        const messageContainers = scrollContainerRef.current.querySelectorAll('.space-y-0 > .space-y-1')

        // The user message is the last container
        const userMessageIndex = conversationHistory.length - 1
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
  }, [conversationHistory.length])

  // Streaming version using Server-Sent Events
  const handleSubmitStreaming = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!question.trim()) {
      setError('Please enter a question')
      return
    }

    setLoading(true)
    setError('')
    setAnswer('')
    setDataUsed(null)
    setChartConfig(null)
    setFollowUpQuestions([])
    setFlowEvents([])
    setDataReceived(false)

    // Create user message
    const userMessage: Message = {
      role: 'user',
      content: question,
      timestamp: new Date().toISOString(),
    }

    // Add user message to conversation history immediately
    setConversationHistory(prev => [...prev, userMessage])

    // Clear the input box immediately
    setQuestion('')

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          conversationHistory,
          sessionId,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No response body')
      }

      const updateFlowEvent = (incoming: FlowEvent) => {
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

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n\n')

        for (const line of lines) {
          if (!line.trim()) continue

          // Parse SSE format: "event: eventName\ndata: {...}"
          const eventMatch = line.match(/event: (\w+)\ndata: (.+)/)
          if (!eventMatch) continue

          const [, eventType, dataStr] = eventMatch
          const data = JSON.parse(dataStr)

          switch (eventType) {
            case 'status':
              setLoadingStep(data.step)
              setLoadingMessage(data.message)
              break

            case 'flow':
              updateFlowEvent(data as FlowEvent)
              break

            case 'data':
              receivedData = data.dataUsed
              receivedChart = data.chartConfig
              setDataUsed(data.dataUsed)
              setChartConfig(data.chartConfig)
              setDataReceived(true)
              break

            case 'answer':
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
              break

            case 'error':
              setError(data.message)
              break
          }
        }
      }

      // Update conversation history (no summarization in streaming mode)
      if (streamedAnswer && !error) {
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
        setConversationHistory(prev => [...prev, assistantMessage])
        // Answer is already displayed during streaming - don't replace it!

        // Save to database if user is authenticated
        if (user) {
          // Create new conversation if this is the first message
          let convId = currentConversationId
          if (!convId) {
            const { conversation, error: createError } = await createConversation()
            if (!createError && conversation) {
              convId = conversation.id
              setCurrentConversationId(convId)
              // Update URL with conversation ID
              router.push(`/ask?id=${convId}`)

              // Refresh sidebar immediately after creating conversation
              console.log('[ask/page] New conversation created, refreshing sidebar')
              setRefreshQueriesTrigger(prev => prev + 1)

              // Save user message
              await saveMessage(convId, 'user', userMessage.content)
            }
          } else {
            // Save user message to existing conversation
            await saveMessage(convId, 'user', userMessage.content)
          }

          // Save assistant message
          if (convId) {
            await saveMessage(convId, 'assistant', streamedAnswer, {
              chart_config: receivedChart,
              follow_up_questions: receivedFollowUpQuestions.length > 0 ? receivedFollowUpQuestions : undefined,
              data_used: receivedData,
            })

            // Auto-generate title after first exchange
            if (conversationHistory.length === 0) {
              await autoGenerateTitle(convId)
              // Refresh sidebar again to show the generated title
              console.log('[ask/page] Title generated, refreshing sidebar')
              setRefreshQueriesTrigger(prev => prev + 1)
            }
          }
        }

        // Reset feedback state
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
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
      setLoadingStep(null)
      setLoadingMessage('')
    }
  }

  // Non-streaming version (original)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!question.trim()) {
      setError('Please enter a question')
      return
    }

    setLoading(true)
    setError('')
    setAnswer('')
    setDataUsed(null)
    setChartConfig(null)

    // Create user message
    const userMessage: Message = {
      role: 'user',
      content: question,
      timestamp: new Date().toISOString(),
    }

    try {
      // Infer which tool will be called
      const toolInfo = inferToolFromQuestion(question)

      // Step 1: Analyzing question (200ms)
      setLoadingStep('analyzing')
      setLoadingMessage('Parsing your question...')
      await new Promise(resolve => setTimeout(resolve, 200))

      // Step 2: Selecting tool (300ms)
      setLoadingStep('selecting')
      setLoadingMessage('Selecting optimal tool...')
      await new Promise(resolve => setTimeout(resolve, 300))

      // Step 3: Calling tool (show actual tool)
      setLoadingStep('calling')
      if (toolInfo.tool === 'getAaplFinancialsByMetric' && toolInfo.metric) {
        setLoadingMessage(`Calling getAaplFinancialsByMetric('${toolInfo.metric}')`)
      } else if (toolInfo.tool === 'getPrices') {
        setLoadingMessage(`Calling getPrices({ range: '${toolInfo.range}' })`)
      } else if (toolInfo.tool === 'searchFilings') {
        setLoadingMessage('Calling searchFilings (semantic search)')
      } else {
        setLoadingMessage(`Calling ${toolInfo.tool}()`)
      }
      await new Promise(resolve => setTimeout(resolve, 400))

      // Step 4: Fetching from database
      setLoadingStep('fetching')
      setLoadingMessage('Querying Supabase database...')
      await new Promise(resolve => setTimeout(resolve, 500))

      // Step 5: Calculating (if ratio)
      const isRatio = question.toLowerCase().includes('margin') ||
                      question.toLowerCase().includes('roe') ||
                      question.toLowerCase().includes('roa') ||
                      question.toLowerCase().includes('ratio')
      if (isRatio) {
        setLoadingStep('calculating')
        setLoadingMessage('Computing financial ratios...')
        await new Promise(resolve => setTimeout(resolve, 300))
      }

      // Step 6: Generating answer
      setLoadingStep('generating')
      setLoadingMessage('Generating answer with GPT-5-nano...')

      // Send question with conversation history and session ID
      const result = await askQuestion(question, conversationHistory, sessionId)

      if (result.error) {
        setError(result.error)
      } else {
        const formattedAnswer = summarizeAnswer(result.answer, result.chartConfig)
        // Create assistant message
        const assistantMessage: Message = {
          role: 'assistant',
          content: formattedAnswer,
          timestamp: new Date().toISOString(),
        }

        // Update conversation history with both messages
        setConversationHistory([...conversationHistory, userMessage, assistantMessage])

        // Update UI
        setAnswer(formattedAnswer)
        setDataUsed(result.dataUsed)
        setChartConfig(result.chartConfig)
        setQueryLogId(result.queryLogId)

        // Reset feedback state for new answer
        setFeedback(null)
        setShowCommentBox(false)
        setFeedbackComment('')

        // Refresh recent queries sidebar
        setRefreshQueriesTrigger(prev => prev + 1)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
      setLoadingStep(null)
      setLoadingMessage('')
      setQuestion('') // Clear input after submission
    }
  }

  // Handle feedback submission
  const handleFeedbackClick = async (feedbackType: 'thumbs_up' | 'thumbs_down') => {
    if (!queryLogId) return

    setFeedback(feedbackType)
    setShowCommentBox(true)

    // If thumbs up and no comment needed, submit immediately
    if (feedbackType === 'thumbs_up') {
      setFeedbackSubmitting(true)
      const result = await submitFeedback({
        queryLogId,
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
    if (!queryLogId || !feedback) return

    setFeedbackSubmitting(true)
    const result = await submitFeedback({
      queryLogId,
      feedback,
      comment: feedbackComment.trim() || undefined,
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
    setQuestion(selectedQuestion)
    // Trigger submit after a brief delay to ensure state is updated
    setTimeout(() => {
      const form = document.querySelector('form')
      if (form) {
        const event = new Event('submit', { bubbles: true, cancelable: true })
        form.dispatchEvent(event)
      }
    }, 0)
  }

  // Copy answer to clipboard
  const handleCopyAnswer = async () => {
    try {
      await navigator.clipboard.writeText(answer)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Clear conversation history / Start new conversation
  const handleClearConversation = async () => {
    setConversationHistory([])
    setCurrentConversationId(null)
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

    // Create new conversation immediately if authenticated
    if (user) {
      console.log('[ask/page] Creating new conversation on New Chat click')
      const { conversation, error: createError } = await createConversation()
      if (!createError && conversation) {
        setCurrentConversationId(conversation.id)
        router.push(`/ask?id=${conversation.id}`)

        // Refresh sidebar to show the new conversation
        console.log('[ask/page] New conversation created, refreshing sidebar')
        setRefreshQueriesTrigger(prev => prev + 1)
      }
    } else {
      // Clear conversation ID from URL if not authenticated
      router.push('/ask')
    }

    // Focus the textarea after clearing
    setTimeout(() => {
      textareaRef.current?.focus()
    }, 0)
  }

  // Handle clicking on a recent query
  const handleRecentQueryClick = (queryText: string) => {
    setQuestion(queryText)
    // Optionally auto-submit:
    // setTimeout(() => handleSubmit(new Event('submit') as any), 100)
  }

  // Handle clicking on an example query
  const handleExampleClick = (exampleQuery: string) => {
    setQuestion(exampleQuery)
    // Auto-submit after a short delay
    setTimeout(() => {
      const form = document.querySelector('form')
      if (form) {
        form.requestSubmit()
      }
    }, 100)
  }

  // Infer the likely tool and parameters from the question
  const inferToolFromQuestion = (q: string): { tool: string; metric?: string; range?: string } => {
    const lower = q.toLowerCase()

    // Check for price queries
    if (lower.includes('price') || lower.includes('stock')) {
      const range = lower.includes('today') || lower.includes('week') ? '7d' :
                    lower.includes('month') || lower.includes('30') ? '30d' : '90d'
      return { tool: 'getPrices', range }
    }

    // Check for filing queries
    if (lower.includes('filing') || lower.includes('10-k') || lower.includes('10-q') ||
        lower.includes('risk') || lower.includes('sec')) {
      return lower.includes('search') || lower.includes('find') ?
        { tool: 'searchFilings' } : { tool: 'getRecentFilings' }
    }

    // Financial metrics
    const metricMap: Record<string, string> = {
      'gross margin': 'gross_profit',
      'gross profit': 'gross_profit',
      'operating margin': 'operating_income',
      'operating income': 'operating_income',
      'net margin': 'net_income',
      'net profit': 'net_income',
      'net income': 'net_income',
      'profit': 'net_income',
      'earnings': 'net_income',
      'roe': 'net_income',
      'return on equity': 'net_income',
      'roa': 'net_income',
      'return on assets': 'net_income',
      'revenue': 'revenue',
      'sales': 'revenue',
      'debt to equity': 'total_liabilities',
      'debt to assets': 'total_liabilities',
      'debt': 'total_liabilities',
      'asset turnover': 'total_assets',
      'assets': 'total_assets',
      'cash flow': 'operating_cash_flow',
      'eps': 'eps'
    }

    for (const [keyword, metric] of Object.entries(metricMap)) {
      if (lower.includes(keyword)) {
        return { tool: 'getAaplFinancialsByMetric', metric }
      }
    }

    return { tool: 'getAaplFinancialsByMetric', metric: 'revenue' }
  }

  // Check if conversation is empty (center the input)
  const isEmptyConversation = conversationHistory.length === 0

  return (
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
          currentConversationId={currentConversationId}
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
            {conversationHistory.length > 0 && (
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
              <UserMenu user={user} />
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
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-6 py-4 rounded-lg mb-8">
                <p className="font-medium text-lg">Error</p>
                <p className="text-base">{error}</p>
              </div>
            )}

            {/* Display conversation history */}
            {conversationHistory.map((message, index) => {
              const isLastMessage = index === conversationHistory.length - 1
              return (
                <div
                  key={index}
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
                      const userQuestion = index > 0 ? conversationHistory[index - 1].content : ''

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
                      const userQuestion = index > 0 ? conversationHistory[index - 1].content : ''

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
                      <div className={index < conversationHistory.length - 1 ? 'hidden' : ''}>
                        <FollowUpQuestions
                          ref={index === conversationHistory.length - 2 ? previousFollowUpRef : null}
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
            {loading && !answer && (
              <div className="space-y-1 mt-6">
                <div className="bg-gray-50 dark:bg-[rgb(33,33,33)] rounded-lg p-6">
                  <p className="text-gray-600 dark:text-gray-400 text-xl">
                    {loadingStep === 'analyzing' && 'Analyzing...'}
                    {loadingStep === 'selecting' && 'Selecting Tool...'}
                    {loadingStep === 'calling' && 'Calling API...'}
                    {loadingStep === 'fetching' && 'Fetching Data...'}
                    {loadingStep === 'calculating' && 'Calculating...'}
                    {loadingStep === 'generating' && 'Generating Answer...'}
                  </p>
                </div>
              </div>
            )}

            {/* Show current streaming answer (text only - chart appears when complete) */}
            {loading && answer && (
              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-[rgb(33,33,33)] rounded-lg p-6">
                  <p className="text-gray-800 dark:text-gray-200 leading-relaxed text-2xl">{answer}</p>
                </div>

                {/* Loading indicator for chart/table - only show if data hasn't been received yet */}
                {!dataReceived && (
                  <div className="bg-white dark:bg-[rgb(33,33,33)] rounded-lg shadow-sm border-2 border-gray-200 dark:border-gray-700 p-8">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="flex gap-2">
                        <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Generating chart and data table...</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Feedback section (shown only when not loading and has answer) */}
            {!loading && answer && (
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
                          disabled={feedbackSubmitting}
                          className={`p-2 rounded-lg transition-colors ${
                            feedback === 'thumbs_up'
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
                          disabled={feedbackSubmitting}
                          className={`p-2 rounded-lg transition-colors ${
                            feedback === 'thumbs_down'
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
                    {showCommentBox && (
                      <div className="mt-4 space-y-3">
                        <textarea
                          value={feedbackComment}
                          onChange={(e) => setFeedbackComment(e.target.value)}
                          placeholder={
                            feedback === 'thumbs_down'
                              ? 'What was wrong with this answer? (optional)'
                              : 'Any additional comments? (optional)'
                          }
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-base"
                          rows={3}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleCommentSubmit}
                            disabled={feedbackSubmitting}
                            className="px-4 py-2 bg-blue-600 text-white text-base rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
                          >
                            {feedbackSubmitting ? 'Submitting...' : 'Submit Feedback'}
                          </button>
                          <button
                            onClick={() => {
                              setShowCommentBox(false)
                              setFeedbackComment('')
                            }}
                            disabled={feedbackSubmitting}
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
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (question.trim()) {
                      handleSubmitStreaming(e as any)
                    }
                  }
                }}
                placeholder="Ask Anything"
                rows={1}
                className="flex-1 bg-transparent border-none focus:outline-none text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 text-xl resize-none overflow-hidden leading-normal max-h-[200px] py-0"
                style={{ height: 'auto' }}
                disabled={loading}
              />

              {/* Send button */}
              <button
                type="submit"
                disabled={loading || !question.trim()}
                className="flex-shrink-0 w-11 h-11 bg-gray-600 text-white rounded-full hover:bg-gray-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
                title={loading ? "Stop" : "Send message"}
              >
                {loading ? (
                  <div className="w-4 h-4 bg-white rounded-sm"></div>
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                )}
              </button>
            </div>

          </form>
        </div>
      </div>

      <FlowVisualization
        events={flowEvents}
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
  )
}
