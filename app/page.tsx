'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import Navigation from '@/components/Navigation'
import RecentQueries from '@/components/RecentQueries'
import FinancialChart from '@/components/FinancialChart'
import FollowUpQuestions from '@/components/FollowUpQuestions'
import ThemeToggle from '@/components/ThemeToggle'
import { getConversation, createConversation, saveMessage, autoGenerateTitle } from '@/app/actions/conversations'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { User } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import type { ChartConfig } from '@/types/chart'
import type { ConversationHistory, Message } from '@/types/conversation'
import { useRouter, useSearchParams } from 'next/navigation'

export default function Home() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClientComponentClient<Database>()

  // Auth and UI state
  const [user, setUser] = useState<User | null>(null)
  const [sessionId, setSessionId] = useState<string>('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [refreshQueriesTrigger, setRefreshQueriesTrigger] = useState(0)

  // Chatbot state
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [chartConfig, setChartConfig] = useState<ChartConfig | null>(null)
  const [conversationHistory, setConversationHistory] = useState<ConversationHistory>([])
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([])
  const [chatbotLoading, setChatbotLoading] = useState(false)
  const [chatbotError, setChatbotError] = useState('')
  const [dataReceived, setDataReceived] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState<string>('')
  const [selectedTool, setSelectedTool] = useState<string | null>(null)

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const lastUserMessageRef = useRef<HTMLDivElement | null>(null)

  const lastUserMessageIndex = useMemo(() => {
    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      if (conversationHistory[i].role === 'user') {
        return i
      }
    }
    return -1
  }, [conversationHistory])

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

  // Auto-focus textarea when user starts typing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only auto-focus if:
      // 1. User is not already focused in an input/textarea
      // 2. It's a printable character or space
      // 3. Not a modifier key combination (except Shift for uppercase)
      const target = e.target as HTMLElement
      const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'

      if (!isInputFocused && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // Check if it's a printable character
        if (e.key.length === 1) {
          // Focus the textarea and manually insert the character
          textareaRef.current?.focus()

          // Set the question state with the new character
          setQuestion(prev => prev + e.key)

          // Prevent default to avoid duplicate character
          e.preventDefault()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Auto-scroll to keep the latest USER message at the top when conversation updates
  useEffect(() => {
    if (conversationHistory.length === 0) return
    if (lastUserMessageIndex === -1) return

    const userMessageDiv = lastUserMessageRef.current
    if (!userMessageDiv) return

    const performScroll = () => {
      // Get the absolute position of the message relative to the viewport
      const rect = userMessageDiv.getBoundingClientRect()
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop

      // Calculate target position (message position + current scroll - desired offset from top)
      // Offset of 20px puts the question near the top of the viewport
      const targetPosition = rect.top + scrollTop - 20

      // Scroll the WINDOW, not the container
      window.scrollTo({
        top: targetPosition,
        behavior: 'smooth'
      })
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        performScroll()
      })
    })
  }, [conversationHistory.length, lastUserMessageIndex])

  const handleQueryClick = async (conversationId: string) => {
    // Load the conversation
    const { conversation, error } = await getConversation(conversationId)
    if (!error && conversation) {
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

  const handleNewChat = async () => {
    // Clear conversation state
    setConversationHistory([])
    setCurrentConversationId(null)
    setAnswer('')
    setChartConfig(null)
    setChatbotError('')
    setQuestion('')
    setLoadingMessage('')
    setSelectedTool(null)

    // Generate new session ID for fresh conversation
    const newSessionId = crypto.randomUUID()
    localStorage.setItem('finquote_session_id', newSessionId)
    setSessionId(newSessionId)

    // Create new conversation immediately if authenticated
    if (user) {
      const { conversation, error: createError } = await createConversation()
      if (!createError && conversation) {
        setCurrentConversationId(conversation.id)
        setRefreshQueriesTrigger(prev => prev + 1)
      }
    }

    // Focus textarea
    setTimeout(() => {
      textareaRef.current?.focus()
    }, 100)
  }

  const handleSubmitStreaming = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!question.trim()) {
      setChatbotError('Please enter a question')
      return
    }

    setChatbotLoading(true)
    setChatbotError('')
    setAnswer('')
    setChartConfig(null)
    setFollowUpQuestions([])
    setDataReceived(false)
    setLoadingMessage('')
    setSelectedTool(null)

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
          question: userMessage.content,
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

          const eventMatch = line.match(/event: (\w+)\ndata: (.+)/)
          if (!eventMatch) continue

          const [, eventType, dataStr] = eventMatch
          const data = JSON.parse(dataStr)

          switch (eventType) {
            case 'flow':
              // Update loading message with detailed flow information
              const flowEvent = data
              if (flowEvent.status === 'active') {
                let message = ''
                if (flowEvent.step === 'tool_selection') {
                  message = '🔍 Analyzing question and selecting tool...'
                } else if (flowEvent.step === 'tool_execution') {
                  message = `📊 ${flowEvent.summary || 'Fetching data'}...`
                } else if (flowEvent.step === 'chart_generation') {
                  message = `📈 ${flowEvent.summary || 'Preparing chart'}...`
                } else if (flowEvent.step === 'answer_generation') {
                  // Customize message based on selected tool
                  if (selectedTool === 'getAaplFinancialsByMetric') {
                    message = '✍️ Generating answer from financial data...'
                  } else if (selectedTool === 'getFinancialMetric') {
                    message = '✍️ Generating answer from financial metrics...'
                  } else if (selectedTool === 'getPrices') {
                    message = '✍️ Generating answer from price data...'
                  } else if (selectedTool === 'searchFilings') {
                    message = '✍️ Generating answer from SEC filings...'
                  } else if (selectedTool === 'getRecentFilings') {
                    message = '✍️ Generating answer from filing metadata...'
                  } else if (selectedTool === 'listMetrics') {
                    message = '✍️ Generating answer from metrics catalog...'
                  } else {
                    message = '✍️ Generating answer from fetched data...'
                  }
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
                setSelectedTool(toolName)
                setLoadingMessage(`✓ ${flowEvent.summary}`)
              }
              break

            case 'data':
              receivedData = data.dataUsed
              receivedChart = data.chartConfig
              setChartConfig(data.chartConfig)
              setDataReceived(true)
              break

            case 'answer':
              streamedAnswer += data.content
              setAnswer(streamedAnswer)
              break

            case 'followup':
              if (data.questions && Array.isArray(data.questions)) {
                receivedFollowUpQuestions = data.questions
                setFollowUpQuestions(data.questions)
              }
              break

            case 'error':
              setChatbotError(data.message)
              break
          }
        }
      }

      // Update conversation history
      if (streamedAnswer && !chatbotError) {
        const assistantMessage: Message = {
          role: 'assistant',
          content: streamedAnswer,
          timestamp: new Date().toISOString(),
          chartConfig: receivedChart,
          followUpQuestions: receivedFollowUpQuestions.length > 0 ? receivedFollowUpQuestions : undefined,
          dataUsed: receivedData,
        }

        setConversationHistory(prev => [...prev, assistantMessage])

        // Save to database if user is authenticated
        if (user) {
          let convId = currentConversationId
          if (!convId) {
            const { conversation, error: createError } = await createConversation()
            if (!createError && conversation) {
              convId = conversation.id
              setCurrentConversationId(convId)
              setRefreshQueriesTrigger(prev => prev + 1)
              await saveMessage(convId, 'user', userMessage.content)
            }
          } else {
            await saveMessage(convId, 'user', userMessage.content)
          }

          if (convId) {
            await saveMessage(convId, 'assistant', streamedAnswer, {
              chart_config: receivedChart,
              follow_up_questions: receivedFollowUpQuestions.length > 0 ? receivedFollowUpQuestions : undefined,
              data_used: receivedData,
            })

            if (conversationHistory.length === 0) {
              await autoGenerateTitle(convId)
              setRefreshQueriesTrigger(prev => prev + 1)
            }
          }
        }

        setRefreshQueriesTrigger(prev => prev + 1)
      }
    } catch (err) {
      setChatbotError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setChatbotLoading(false)
    }
  }

  const handleFollowUpQuestionClick = (selectedQuestion: string) => {
    setQuestion(selectedQuestion)
    setTimeout(() => {
      const form = document.querySelector('form')
      if (form) {
        const event = new Event('submit', { bubbles: true, cancelable: true })
        form.dispatchEvent(event)
      }
    }, 0)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[rgb(33,33,33)] flex flex-col">
      {/* Sidebar - fixed position overlay */}
      <div
        className={`hidden lg:block fixed left-0 top-0 h-screen w-64 xl:w-80 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(26,26,26)] z-[60] transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <RecentQueries
          userId={user?.id}
          sessionId={!user ? sessionId : undefined}
          onQueryClick={handleQueryClick}
          onNewChat={handleNewChat}
          refreshTrigger={refreshQueriesTrigger}
          currentConversationId={currentConversationId}
        />
      </div>

      {/* Sidebar Toggle Button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className={`hidden lg:flex fixed top-1/2 -translate-y-1/2 z-[70] bg-white dark:bg-[rgb(45,45,45)] border border-gray-300 dark:border-gray-600 rounded-r-lg px-2 py-4 hover:bg-gray-100 dark:hover:bg-[rgb(55,55,55)] transition-all shadow-lg ${
          sidebarOpen ? 'xl:left-80 left-64' : 'left-0'
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

      {/* Fixed Header */}
      <div className="fixed top-0 left-0 right-0 z-40">
        <Navigation />
      </div>

      {/* Chatbot content area */}
      <div
        ref={scrollContainerRef}
        className={`${sidebarOpen ? 'lg:ml-64' : ''} flex-1 overflow-y-auto pt-20 pb-32 relative z-50 pointer-events-none transition-[margin] duration-300`}
      >
        <div className="max-w-4xl mx-auto px-6 pointer-events-auto">
          {conversationHistory.map((message, index) => {
            const isLastUserMessage = message.role === 'user' && index === lastUserMessageIndex

            return (
              <div
                key={index}
                ref={isLastUserMessage ? lastUserMessageRef : null}
                data-message-index={index}
                className={`mb-6 ${index > 0 ? 'mt-6' : ''}`}
              >
              {message.role === 'user' ? (
                <div className="flex justify-end">
                  <div className="bg-gray-100 dark:bg-[rgb(55,55,55)] text-gray-900 dark:text-white rounded-2xl px-6 py-4 max-w-3xl">
                    <p className="text-xl">{message.content}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-gray-50 dark:bg-[rgb(33,33,33)] rounded-lg p-6">
                    <p className="text-gray-800 dark:text-gray-200 leading-relaxed text-2xl">{message.content}</p>
                  </div>

                  {/* Chart */}
                  {message.chartConfig && (
                    <div className="bg-white dark:bg-[rgb(33,33,33)] rounded-lg shadow-sm border-[3px] border-gray-200 dark:border-[rgb(50,50,50)] p-6">
                      <FinancialChart config={message.chartConfig} />
                    </div>
                  )}

                  {/* Follow-up questions (only for last message) */}
                  {index === conversationHistory.length - 1 && message.followUpQuestions && message.followUpQuestions.length > 0 && (
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

          {/* Loading indicator */}
          {chatbotLoading && !answer && (
            <div
              className="space-y-4"
              style={{ minHeight: 'calc(100vh - 200px)' }}
            >
              {/* Show selected tool indicator if tool has been chosen */}
              {selectedTool && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full font-medium">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Using {selectedTool}
                  </span>
                </div>
              )}
              <div className="bg-gray-50 dark:bg-[rgb(33,33,33)] rounded-lg p-6">
                <p className="text-gray-600 dark:text-gray-400 text-xl">
                  {loadingMessage || 'Analyzing...'}
                </p>
              </div>
            </div>
          )}

          {/* Streaming answer */}
          {chatbotLoading && answer && (
            <div
              className="space-y-4"
              style={{ minHeight: 'calc(100vh - 200px)' }}
            >
              {/* Show selected tool indicator */}
              {selectedTool && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full font-medium">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Using {selectedTool}
                  </span>
                </div>
              )}
              <div className="bg-gray-50 dark:bg-[rgb(33,33,33)] rounded-lg p-6">
                <p className="text-gray-800 dark:text-gray-200 leading-relaxed text-2xl">{answer}</p>
              </div>

              {!dataReceived && (
                <div className="bg-white dark:bg-[rgb(33,33,33)] rounded-lg shadow-sm border-2 border-gray-200 dark:border-gray-700 p-8">
                  <div className="flex flex-col items-center justify-center gap-3">
                    <div className="flex gap-2">
                      <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedTool === 'getAaplFinancialsByMetric' || selectedTool === 'getFinancialMetric'
                        ? '📊 Preparing financial chart and data table...'
                        : selectedTool === 'getPrices'
                        ? '📈 Preparing price chart...'
                        : selectedTool === 'searchFilings' || selectedTool === 'getRecentFilings'
                        ? '📄 Preparing filing data table...'
                        : selectedTool === 'listMetrics'
                        ? '📋 Preparing metrics catalog table...'
                        : '📊 Generating chart and data table...'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {chatbotError && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-6 py-4 rounded-lg">
              <p className="font-medium text-lg">Error</p>
              <p className="text-base">{chatbotError}</p>
            </div>
          )}
        </div>
      </div>

      {/* Input bar */}
      <div className={`${sidebarOpen ? 'lg:ml-64' : ''} fixed bottom-0 left-0 right-0 bg-gray-50 dark:bg-[rgb(33,33,33)] pb-12 z-50 transition-[margin] duration-300`}>
        <div className="max-w-4xl mx-auto px-6">
          <form onSubmit={handleSubmitStreaming}>
            <div className="relative flex items-center gap-4 bg-blue-100 dark:bg-[rgb(55,55,55)] rounded-full px-6 py-5 border border-blue-300 dark:border-gray-600">
              <textarea
                ref={textareaRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
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
                disabled={chatbotLoading}
              />
              <button
                type="submit"
                disabled={chatbotLoading || !question.trim()}
                className="flex-shrink-0 w-11 h-11 bg-gray-600 text-white rounded-full hover:bg-gray-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {chatbotLoading ? (
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
    </div>
  )
}
