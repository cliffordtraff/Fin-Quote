'use client'

import { useState, useEffect, useRef } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { User } from '@supabase/supabase-js'
import { askQuestion, submitFeedback, FinancialData, PriceData, FilingData, PassageData } from '@/app/actions/ask-question'
import FinancialChart from '@/components/FinancialChart'
import RecentQueries from '@/components/RecentQueries'
import AuthModal from '@/components/AuthModal'
import UserMenu from '@/components/UserMenu'
import type { ChartConfig } from '@/types/chart'
import type { ConversationHistory, Message } from '@/types/conversation'
import type { Database } from '@/lib/database.types'

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

  // Auth state
  const [user, setUser] = useState<User | null>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const supabase = createClientComponentClient<Database>()

  // Ref for the textarea to enable auto-focus
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
      setLoadingMessage('Generating answer with GPT-4o-mini...')

      // Send question with conversation history and session ID
      const result = await askQuestion(question, conversationHistory, sessionId)

      if (result.error) {
        setError(result.error)
      } else {
        // Create assistant message
        const assistantMessage: Message = {
          role: 'assistant',
          content: result.answer,
          timestamp: new Date().toISOString(),
        }

        // Update conversation history with both messages
        setConversationHistory([...conversationHistory, userMessage, assistantMessage])

        // Update UI
        setAnswer(result.answer)
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
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar - fixed position overlay */}
      <div
        className={`hidden lg:block fixed left-0 top-0 h-screen w-80 xl:w-96 border-r border-gray-200 bg-white z-40 transition-transform duration-300 ${
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
        className={`hidden lg:flex fixed top-1/2 -translate-y-1/2 z-50 bg-white border border-gray-300 rounded-r-lg px-2 py-4 hover:bg-gray-100 transition-all shadow-lg ${
          sidebarOpen ? 'xl:left-96 left-80' : 'left-0'
        }`}
        title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
      >
        {sidebarOpen ? (
          <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
      </button>

      {/* Main content - with fixed left margin to reserve space for sidebar */}
      <div className="lg:ml-80 xl:ml-96 p-8">
          {/* Header and Question Form - Centered with max width */}
          <div className="max-w-5xl mx-auto mb-8">
            <div className="mb-8">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h1 className="text-4xl font-bold mb-2">Fin Quote</h1>
                </div>
                <div className="flex items-center gap-3">
                  {conversationHistory.length > 0 && (
                    <button
                      onClick={handleClearConversation}
                      className="px-4 py-2 text-base bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                    >
                      Clear Conversation
                    </button>
                  )}
                  {user ? (
                    <UserMenu user={user} />
                  ) : (
                    <button
                      onClick={() => setShowAuthModal(true)}
                      className="px-4 py-2 text-base bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Login / Sign Up
                    </button>
                  )}
                </div>
              </div>
              {!user && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-base text-blue-800">
                  <p>
                    <span className="font-medium">Tip:</span> Sign up to save your query history across all devices.
                  </p>
                </div>
              )}
            </div>

            <form onSubmit={handleSubmit}>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <label htmlFor="question" className="block text-base font-medium mb-2">
                  Your Question
                </label>
                <textarea
                  ref={textareaRef}
                  id="question"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    // Submit on Enter (but allow Shift+Enter for new lines)
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSubmit(e as any)
                    }
                  }}
                  placeholder="e.g., What is AAPL's revenue trend over the last 4 years?"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-base"
                  rows={3}
                  disabled={loading}
                />

                {/* Example Query Chips */}
                {!loading && !answer && (
                  <div className="mt-3">
                    <p className="text-sm text-gray-600 mb-2">Try these:</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        "What's AAPL gross margin?",
                        "Show me AAPL ROE trend",
                        "AAPL debt to equity ratio",
                        "AAPL revenue last 5 years"
                      ].map((example, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => handleExampleClick(example)}
                          className="px-3 py-1.5 text-sm bg-blue-50 text-blue-700 rounded-full hover:bg-blue-100 transition-colors border border-blue-200"
                        >
                          {example}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-4 w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium text-lg"
                >
                  {loading ? (
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                          <span className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                          <span className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                        </div>
                        <span className="font-semibold">
                          {loadingStep === 'analyzing' && 'Step 1/6: Analyzing'}
                          {loadingStep === 'selecting' && 'Step 2/6: Selecting Tool'}
                          {loadingStep === 'calling' && 'Step 3/6: Calling API'}
                          {loadingStep === 'fetching' && 'Step 4/6: Fetching Data'}
                          {loadingStep === 'calculating' && 'Step 5/6: Calculating'}
                          {loadingStep === 'generating' && 'Step 6/6: Generating Answer'}
                        </span>
                      </div>
                      <span className="text-sm font-mono text-blue-100">
                        {loadingMessage}
                      </span>
                    </div>
                  ) : (
                    'Ask'
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Answer and Chart Section - Full width */}
          <div className="w-full px-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-6 py-4 rounded-lg mb-8">
                <p className="font-medium text-lg">Error</p>
                <p className="text-base">{error}</p>
              </div>
            )}

            {answer && (
              <div className="flex gap-6">
                {/* Answer Section - Left side (1/3 width) */}
                <div className="w-1/3">
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <h2 className="text-2xl font-semibold mb-4">Answer</h2>
                    <p className="text-gray-800 leading-relaxed text-lg">{answer}</p>

                    {/* Feedback Section */}
                    <div className="mt-6 pt-4 border-t border-gray-200">
                      <div className="flex items-center gap-4">
                        <p className="text-base text-gray-600">Was this answer helpful?</p>
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

                {/* Chart Section - Right side (2/3 width) */}
                {chartConfig && (
                  <div className="w-2/3">
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                      <FinancialChart config={chartConfig} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {!answer && !error && !loading && (
              <div className="text-center text-gray-500 py-12">
                <p className="text-lg">Ask a question to get started</p>
                <p className="text-base mt-2">Try asking about:</p>
                <ul className="text-base mt-2 space-y-1">
                  <li>"How is AAPL's revenue trending over the last 5 years?"</li>
                  <li>"What's AAPL's stock price trend over the last 30 days?"</li>
                  <li>"Show me AAPL's last 3 quarterly filings"</li>
                  <li>"What supply chain risks did AAPL mention in their filings?"</li>
                </ul>
              </div>
            )}
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
    </div>
  )
}
