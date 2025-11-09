'use client'

import { useEffect, useState } from 'react'
import Navigation from '@/components/Navigation'
import RecentQueries from '@/components/RecentQueries'
import SimpleCanvasChart from '@/components/SimpleCanvasChart'
import FuturesTable from '@/components/FuturesTable'
import { getAaplMarketData, getNasdaqMarketData, getDowMarketData, getRussellMarketData } from '@/app/actions/market-data'
import { getFuturesData } from '@/app/actions/futures'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { User } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { useRouter } from 'next/navigation'

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
  const [spxData, setSpxData] = useState<MarketData | null>(null)
  const [nasdaqData, setNasdaqData] = useState<MarketData | null>(null)
  const [dowData, setDowData] = useState<MarketData | null>(null)
  const [russellData, setRussellData] = useState<MarketData | null>(null)
  const [futuresData, setFuturesData] = useState<FutureData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [sessionId, setSessionId] = useState<string>('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const supabase = createClientComponentClient<Database>()
  const router = useRouter()

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

  const handleQueryClick = (conversationId: string) => {
    router.push(`/chatbot?id=${conversationId}`)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[rgb(33,33,33)]">
      <Navigation />

      {/* Sidebar - fixed position overlay */}
      <div
        className={`hidden lg:block fixed left-0 top-0 h-screen w-96 xl:w-[28rem] border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(26,26,26)] z-50 transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <RecentQueries
          userId={user?.id}
          sessionId={!user ? sessionId : undefined}
          onQueryClick={handleQueryClick}
          onNewChat={() => router.push('/chatbot')}
          refreshTrigger={0}
          currentConversationId={null}
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
                  <SimpleCanvasChart data={spxData.priceHistory} />
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
                  <SimpleCanvasChart data={nasdaqData.priceHistory} />
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
                  <SimpleCanvasChart data={dowData.priceHistory} yAxisInterval={100} />
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
                  <SimpleCanvasChart data={russellData.priceHistory} yAxisInterval={1} />
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
    </div>
  )
}
