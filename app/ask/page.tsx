'use client'

import { useState, useEffect, useRef } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { User } from '@supabase/supabase-js'
import { askQuestion, submitFeedback, FinancialData, PriceData, FilingData, PassageData } from '@/app/actions/ask-question'
import FinancialChart from '@/components/FinancialChart'
import RecentQueries from '@/components/RecentQueries'
import AuthModal from '@/components/AuthModal'
import UserMenu from '@/components/UserMenu'
import FollowUpQuestions from '@/components/FollowUpQuestions'
import FinancialsModal from '@/components/FinancialsModal'
import ThemeToggle from '@/components/ThemeToggle'
import type { ChartConfig } from '@/types/chart'
import type { ConversationHistory, Message } from '@/types/conversation'
import type { Database } from '@/lib/database.types'

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

const SCROLL_BUFFER_PX = 24

export default function AskPage() {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [dataUsed, setDataUsed] = useState<{
    type: 'financials' | 'prices' | 'filings' | 'passages'
    data: FinancialData[] | PriceData[] | FilingData[] | PassageData[]
  } | null>(null)
  const [chartConfig, setChartConfig] = useState<ChartConfig | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState<'analyzing' | 'selecting' | 'calling' | 'fetching' | 'calculating' | 'generating' | null>(null)
  const [loadingMessage, setLoadingMessage] = useState<string>('')
  const [conversationHistory, setConversationHistory] = useState<ConversationHistory>([])
  const [sessionId, setSessionId] = useState<string>('')
  const [queryLogId, setQueryLogId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<'thumbs_up' | 'thumbs_down' | null>(null)
  const [showCommentBox, setShowCommentBox] = useState(false)
  const [feedbackComment, setFeedbackComment] = useState('')
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)
  const [refreshQueriesTrigger, setRefreshQueriesTrigger] = useState(0)
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([])
  const [copied, setCopied] = useState(false)

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

  // Load conversation history from localStorage on mount
  useEffect(() => {
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
  }, [])

  // Save conversation history to localStorage whenever it changes
  useEffect(() => {
    if (conversationHistory.length > 0) {
      localStorage.setItem('finquote_conversation', JSON.stringify(conversationHistory))
    }
  }, [conversationHistory])

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

  // Auto-scroll to latest USER message when conversation history changes
  // Only scroll when user asks a question, not when answer appears
  useEffect(() => {
    if (conversationHistory.length === 0) return

    const lastMessage = conversationHistory[conversationHistory.length - 1]
    if (lastMessage.role !== 'user') return

    // Use setTimeout to ensure DOM has fully rendered
    setTimeout(() => {
      if (!latestMessageRef.current) return

      // Get the absolute position of the message relative to the viewport
      const rect = latestMessageRef.current.getBoundingClientRect()
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop

      // Calculate target position (message position + current scroll - desired offset from top)
      const targetPosition = rect.top + scrollTop - 100

      // Scroll the WINDOW, not the container
      window.scrollTo({
        top: targetPosition,
        behavior: 'instant'
      })
    }, 100)
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

            case 'data':
              receivedData = data.dataUsed
              receivedChart = data.chartConfig
              setDataUsed(data.dataUsed)
              setChartConfig(data.chartConfig)
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
        }

        // Add only assistant message (user message was already added at the start)
        setConversationHistory(prev => [...prev, assistantMessage])
        // Answer is already displayed during streaming - don't replace it!

        // Reset feedback state
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

  // Clear conversation history
  const handleClearConversation = () => {
    setConversationHistory([])
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Sidebar - fixed position overlay */}
      <div
        className={`hidden lg:block fixed left-0 top-20 h-[calc(100vh-5rem)] w-80 xl:w-96 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 z-40 transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <RecentQueries
          userId={user?.id}
          sessionId={!user ? sessionId : undefined}
          onQueryClick={handleRecentQueryClick}
          refreshTrigger={refreshQueriesTrigger}
        />
      </div>

      {/* Sidebar Toggle Button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className={`hidden lg:flex fixed top-1/2 -translate-y-1/2 z-50 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-r-lg px-2 py-4 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all shadow-lg ${
          sidebarOpen ? 'xl:left-96 left-80' : 'left-0'
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
      <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Fin Quote</h1>
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
      <div ref={scrollContainerRef} className="lg:ml-80 xl:ml-96 flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6 space-y-6 pb-32 lg:pb-[35vh]">
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
                  className="space-y-4"
                  ref={isLastMessage ? latestMessageRef : null}
                >
                  {message.role === 'user' ? (
                    // User question
                    <div className="flex justify-end">
                    <div className="bg-blue-600 text-white rounded-2xl px-6 py-4 max-w-3xl">
                      <p className="text-xl">{message.content}</p>
                    </div>
                  </div>
                ) : (
                  // Assistant answer with chart and follow-up questions
                  <div className="space-y-4">
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
                      <p className="text-gray-800 dark:text-gray-200 leading-relaxed text-2xl">{message.content}</p>
                    </div>

                    {/* Chart for this message */}
                    {message.chartConfig && (
                      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border-2 border-gray-200 dark:border-gray-700 p-6">
                        <FinancialChart config={message.chartConfig} />
                      </div>
                    )}

                    {/* Follow-up questions for this message */}
                    {message.followUpQuestions && message.followUpQuestions.length > 0 && (
                      <FollowUpQuestions
                        questions={message.followUpQuestions}
                        onQuestionClick={handleFollowUpQuestionClick}
                      />
                    )}
                  </div>
                  )}
                </div>
              )
            })}

            {/* Show current streaming answer (text only - chart appears when complete) */}
            {loading && answer && (
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
                <p className="text-gray-800 dark:text-gray-200 leading-relaxed text-2xl">{answer}</p>
              </div>
            )}

            {/* Copy and feedback section (shown only when not loading and has answer) */}
            {!loading && answer && (
              <div className="space-y-6">
                {/* Copy, feedback and comment section */}
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
                    {/* Copy button */}
                    <div className="relative mb-6">
                      <button
                        onClick={handleCopyAnswer}
                        className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
                        title={copied ? 'Copied!' : 'Copy answer'}
                      >
                        {copied ? (
                          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                    </div>

                  {/* Feedback Section */}
                  <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
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

      {/* Fixed bottom input bar */}
      <div className="lg:ml-80 xl:ml-96 fixed bottom-0 left-0 right-0 bg-gray-50 dark:bg-gray-900 pb-12 z-50">
        <div className="max-w-6xl mx-auto">
          <form onSubmit={handleSubmitStreaming}>
            <div className="relative flex items-center gap-4 bg-blue-100 dark:bg-slate-800 rounded-full px-6 py-5 border border-blue-300 dark:border-slate-700">
              {/* Textarea field */}
              <textarea
                ref={textareaRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmitStreaming(e as any)
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
                className="flex-shrink-0 w-11 h-11 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
                title="Send message"
              >
                {loading ? (
                  <div className="flex gap-0.5">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                )}
              </button>
            </div>

            {/* Loading status below input */}
            {loading && (
              <div className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
                <span className="font-semibold">
                  {loadingStep === 'analyzing' && 'Analyzing...'}
                  {loadingStep === 'selecting' && 'Selecting Tool...'}
                  {loadingStep === 'calling' && 'Calling API...'}
                  {loadingStep === 'fetching' && 'Fetching Data...'}
                  {loadingStep === 'calculating' && 'Calculating...'}
                  {loadingStep === 'generating' && 'Generating Answer...'}
                </span>
              </div>
            )}
          </form>
        </div>
      </div>

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
