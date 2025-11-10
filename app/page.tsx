'use client'

import { useEffect, useState, useRef } from 'react'
import Navigation from '@/components/Navigation'
import RecentQueries from '@/components/RecentQueries'
import SimpleCanvasChart from '@/components/SimpleCanvasChart'
import FuturesTable from '@/components/FuturesTable'
import FinancialChart from '@/components/FinancialChart'
import FollowUpQuestions from '@/components/FollowUpQuestions'
import ThemeToggle from '@/components/ThemeToggle'
import { getAaplMarketData, getNasdaqMarketData, getDowMarketData, getRussellMarketData } from '@/app/actions/market-data'
import { getFuturesData } from '@/app/actions/futures'
import { getConversation, createConversation, saveMessage, autoGenerateTitle } from '@/app/actions/conversations'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { User } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import type { ChartConfig } from '@/types/chart'
import type { ConversationHistory, Message } from '@/types/conversation'
import { useRouter, useSearchParams } from 'next/navigation'

interface MarketData {
  currentPrice: number
  priceChange: number
  priceChangePercent: number
  date: string
  priceHistory: Array<{ date: string; open: number; high: number; low: number; close: number }>
}

interface FutureData {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
}

export default function Home() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClientComponentClient<Database>()

  // Market data state
  const [spxData, setSpxData] = useState<MarketData | null>(null)
  const [nasdaqData, setNasdaqData] = useState<MarketData | null>(null)
  const [dowData, setDowData] = useState<MarketData | null>(null)
  const [russellData, setRussellData] = useState<MarketData | null>(null)
  const [futuresData, setFuturesData] = useState<FutureData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Auth and UI state
  const [user, setUser] = useState<User | null>(null)
  const [sessionId, setSessionId] = useState<string>('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showChatbot, setShowChatbot] = useState(false)
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

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch SPX, Nasdaq, Dow, Russell, and Futures data in parallel
        const [spxResult, nasdaqResult, dowResult, russellResult, futuresResult] = await Promise.all([
          getAaplMarketData(),
          getNasdaqMarketData(),
          getDowMarketData(),
          getRussellMarketData(),
          getFuturesData()
        ])

        if ('error' in spxResult) {
          setError(spxResult.error)
        } else {
          console.log('SPX data received:', {
            hasPriceHistory: !!spxResult.priceHistory,
            priceHistoryLength: spxResult.priceHistory?.length,
          })
          setSpxData(spxResult as MarketData)
        }

        if ('error' in nasdaqResult) {
          setError(nasdaqResult.error)
        } else {
          console.log('Nasdaq data received:', {
            hasPriceHistory: !!nasdaqResult.priceHistory,
            priceHistoryLength: nasdaqResult.priceHistory?.length,
          })
          setNasdaqData(nasdaqResult as MarketData)
        }

        if ('error' in dowResult) {
          setError(dowResult.error)
        } else {
          console.log('Dow data received:', {
            hasPriceHistory: !!dowResult.priceHistory,
            priceHistoryLength: dowResult.priceHistory?.length,
          })
          setDowData(dowResult as MarketData)
        }

        if ('error' in russellResult) {
          setError(russellResult.error)
        } else {
          console.log('Russell data received:', {
            hasPriceHistory: !!russellResult.priceHistory,
            priceHistoryLength: russellResult.priceHistory?.length,
          })
          setRussellData(russellResult as MarketData)
        }

        if ('error' in futuresResult) {
          console.error('Futures data error:', futuresResult.error)
        } else {
          setFuturesData(futuresResult.futures)
        }
      } catch (err) {
        setError('Failed to load market data')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const formatCurrency = (value: number, decimals: number = 2): string => {
    if (value >= 1_000_000_000_000) {
      return `$${(value / 1_000_000_000_000).toFixed(decimals)}T`
    }
    if (value >= 1_000_000_000) {
      return `$${(value / 1_000_000_000).toFixed(decimals)}B`
    }
    if (value >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(decimals)}M`
    }
    return `$${value.toFixed(decimals)}`
  }

  const handleQueryClick = async (conversationId: string) => {
    // Load the conversation and show chatbot
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
      setShowChatbot(true)
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

    // Show chatbot
    setShowChatbot(true)

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
      {!showChatbot && <Navigation />}

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

      {!showChatbot ? (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-gray-600 dark:text-gray-400">Loading market data...</div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-red-600 dark:text-red-400">{error}</div>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className="flex gap-6">
            {/* SPX Chart */}
            {spxData && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] pt-2 pb-2 pl-2 pr-0" style={{ width: '310px', minWidth: '310px' }}>
                <div className="mb-0">
                  <div className="flex items-baseline justify-between">
                    <h2 className="text-xs font-bold text-gray-600 dark:text-gray-400 ml-2">SPX</h2>
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {new Date(spxData.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span
                      className={`text-xs font-medium mr-12 ${
                        spxData.priceChange >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {spxData.priceChange >= 0 ? '+' : ''}
                      {spxData.priceChange.toFixed(2)} (
                      {spxData.priceChangePercent >= 0 ? '+' : ''}
                      {spxData.priceChangePercent.toFixed(2)}%)
                    </span>
                  </div>
                </div>

                {/* Simple Canvas Chart */}
                {spxData.priceHistory && spxData.priceHistory.length > 0 ? (
                  <SimpleCanvasChart
                    data={spxData.priceHistory}
                    previousClose={spxData.currentPrice - spxData.priceChange}
                  />
                ) : (
                  <div className="w-full h-48 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {spxData.priceHistory ? 'No intraday data available' : 'Loading chart...'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Nasdaq Chart */}
            {nasdaqData && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] pt-2 pb-2 pl-2 pr-0" style={{ width: '310px', minWidth: '310px' }}>
                <div className="mb-0">
                  <div className="flex items-baseline justify-between">
                    <h2 className="text-xs font-bold text-gray-600 dark:text-gray-400 ml-2">NASDAQ</h2>
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {new Date(nasdaqData.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span
                      className={`text-xs font-medium mr-12 ${
                        nasdaqData.priceChange >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {nasdaqData.priceChange >= 0 ? '+' : ''}
                      {nasdaqData.priceChange.toFixed(2)} (
                      {nasdaqData.priceChangePercent >= 0 ? '+' : ''}
                      {nasdaqData.priceChangePercent.toFixed(2)}%)
                    </span>
                  </div>
                </div>

                {/* Simple Canvas Chart */}
                {nasdaqData.priceHistory && nasdaqData.priceHistory.length > 0 ? (
                  <SimpleCanvasChart
                    data={nasdaqData.priceHistory}
                    yAxisInterval={100}
                    labelIntervalMultiplier={1}
                    previousClose={nasdaqData.currentPrice - nasdaqData.priceChange}
                  />
                ) : (
                  <div className="w-full h-48 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {nasdaqData.priceHistory ? 'No intraday data available' : 'Loading chart...'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Dow Chart */}
            {dowData && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] pt-2 pb-2 pl-2 pr-0" style={{ width: '310px', minWidth: '310px' }}>
                <div className="mb-0">
                  <div className="flex items-baseline justify-between">
                    <h2 className="text-xs font-bold text-gray-600 dark:text-gray-400 ml-2">DOW</h2>
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {new Date(dowData.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span
                      className={`text-xs font-medium mr-12 ${
                        dowData.priceChange >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {dowData.priceChange >= 0 ? '+' : ''}
                      {dowData.priceChange.toFixed(2)} (
                      {dowData.priceChangePercent >= 0 ? '+' : ''}
                      {dowData.priceChangePercent.toFixed(2)}%)
                    </span>
                  </div>
                </div>

                {/* Simple Canvas Chart */}
                {dowData.priceHistory && dowData.priceHistory.length > 0 ? (
                  <SimpleCanvasChart
                    data={dowData.priceHistory}
                    yAxisInterval={100}
                    labelIntervalMultiplier={1}
                    previousClose={dowData.currentPrice - dowData.priceChange}
                  />
                ) : (
                  <div className="w-full h-48 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {dowData.priceHistory ? 'No intraday data available' : 'Loading chart...'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Russell 2000 Chart */}
            {russellData && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] pt-2 pb-2 pl-2 pr-0" style={{ width: '310px', minWidth: '310px' }}>
                <div className="mb-0">
                  <div className="flex items-baseline justify-between">
                    <h2 className="text-xs font-bold text-gray-600 dark:text-gray-400 ml-2">RUSSELL</h2>
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {new Date(russellData.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span
                      className={`text-xs font-medium mr-12 ${
                        russellData.priceChange >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {russellData.priceChange >= 0 ? '+' : ''}
                      {russellData.priceChange.toFixed(2)} (
                      {russellData.priceChangePercent >= 0 ? '+' : ''}
                      {russellData.priceChangePercent.toFixed(2)}%)
                    </span>
                  </div>
                </div>

                {/* Simple Canvas Chart */}
                {russellData.priceHistory && russellData.priceHistory.length > 0 ? (
                  <SimpleCanvasChart
                    data={russellData.priceHistory}
                    yAxisInterval={10}
                    labelIntervalMultiplier={1}
                    previousClose={russellData.currentPrice - russellData.priceChange}
                  />
                ) : (
                  <div className="w-full h-48 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {russellData.priceHistory ? 'No intraday data available' : 'Loading chart...'}
                    </p>
                  </div>
                )}
              </div>
            )}
            </div>

              {/* Futures Table */}
              {futuresData.length > 0 && (
                <div className="mt-[500px] self-start ml-[-50px]">
                  <FuturesTable futures={futuresData} />
                </div>
              )}
            </div>
          )}
        </main>
      ) : (
        // Chatbot Interface
        <>
          {/* Fixed Header */}
          <div className="fixed top-0 left-0 right-0 z-40 border-b border-gray-50 dark:border-[rgb(33,33,33)] bg-gray-50 dark:bg-[rgb(33,33,33)] px-6 py-4">
            <div className="flex justify-end items-center">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowChatbot(false)}
                  className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Back to Charts
                </button>
                <ThemeToggle />
              </div>
            </div>
          </div>

          {/* Chatbot content area */}
          <div
            ref={scrollContainerRef}
            className={`${sidebarOpen ? 'lg:ml-64' : ''} flex-1 overflow-y-auto pt-20 pb-32 relative z-50 pointer-events-none transition-[margin] duration-300`}
          >
            <div className="max-w-4xl mx-auto px-6 pointer-events-auto">
              {conversationHistory.map((message, index) => (
                <div key={index} className={`mb-6 ${index > 0 ? 'mt-6' : ''}`}>
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
              ))}

              {/* Loading indicator */}
              {chatbotLoading && !answer && (
                <div className="bg-gray-50 dark:bg-[rgb(33,33,33)] rounded-lg p-6">
                  <p className="text-gray-600 dark:text-gray-400 text-xl">Analyzing...</p>
                </div>
              )}

              {/* Streaming answer */}
              {chatbotLoading && answer && (
                <div className="space-y-4">
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
                        <p className="text-sm text-gray-600 dark:text-gray-400">Generating chart...</p>
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
        </>
      )}
    </div>
  )
}
