'use client'

import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { NewsArticle } from '@watchlist/types'
import { EarningsContext } from '@watchlist/types/earnings'
import { EarningsBadge } from './NewsIndicator/EarningsBadge'
import { EarningsContextCard } from './NewsIndicator/EarningsContextCard'
import { ImpactMeter } from './NewsIndicator/ImpactMeter'
import { useAiSummaryCache } from '@watchlist/contexts/AiSummaryContext'

interface NewsIndicatorProps {
  news?: NewsArticle | null
  newsCount?: number
  onNewsClick?: () => void
  prefetchArticles?: () => Promise<void>
  symbol?: string
  allArticles?: NewsArticle[]
  fetchFMPArticles?: (symbol: string) => Promise<NewsArticle[]>
  fmpNewsCount?: number
}

export default function NewsIndicator({
  news,
  newsCount = 0,
  onNewsClick,
  prefetchArticles,
  symbol = '',
  allArticles = [],
  fetchFMPArticles,
  fmpNewsCount = 0
}: NewsIndicatorProps) {
  const summaryCache = useAiSummaryCache()
  const [showTooltip, setShowTooltip] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'rss' | 'fmp' | 'analyst'>('rss')
  const [fmpArticles, setFmpArticles] = useState<NewsArticle[]>([])
  const [aiSummary, setAiSummary] = useState<string>('')
  const [aiSummaryData, setAiSummaryData] = useState<any>(null)
  const [aiSummarySources, setAiSummarySources] = useState<any[]>([])
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false)
  const [thinkingSteps, setThinkingSteps] = useState<string[]>([])
  const [showAiSummary, setShowAiSummary] = useState(false)
  const [showSources, setShowSources] = useState(false)
  const [analystChanges, setAnalystChanges] = useState<any[]>([])
  const [analystLoading, setAnalystLoading] = useState(false)
  const [earningsContext, setEarningsContext] = useState<EarningsContext | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)

  const isDarkMode = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  const dropdownColors = isDarkMode
    ? {
        containerBg: 'rgb(var(--watchlist-surface))',
        border: '1px solid rgb(var(--watchlist-border))',
        headerBg: 'rgb(var(--watchlist-surface-elevated))',
        headerBorder: '1px solid rgba(148, 163, 184, 0.2)',
        headerText: '#e5e7eb',
        closeDefault: '#9ca3af',
        closeHover: '#f9fafb',
        titleColor: '#e5e7eb',
        tabActive: '#60a5fa',
        tabInactive: '#cbd5f5',
        tabBorderActive: '#60a5fa'
      }
    : {
        containerBg: 'rgb(var(--watchlist-surface))',
        border: '1px solid rgb(var(--watchlist-border))',
        headerBg: '#f8f9fa',
        headerBorder: '1px solid #e0e0e0',
        headerText: '#333',
        closeDefault: '#666',
        closeHover: '#000',
        titleColor: '#333',
        tabActive: '#1a73e8',
        tabInactive: '#666',
        tabBorderActive: '#1a73e8'
      }

  const summaryColors = isDarkMode
    ? {
        heading: '#e5e7eb',
        sentimentPositive: '#4ade80',
        sentimentNegative: '#f87171',
        sentimentNeutral: '#cbd5f5',
        sentimentPositiveBg: 'rgba(34, 197, 94, 0.2)',
        sentimentNegativeBg: 'rgba(239, 68, 68, 0.2)',
        sentimentNeutralBg: 'rgba(148, 163, 184, 0.25)',
        confidenceText: '#93c5fd',
        confidenceBg: 'rgba(59, 130, 246, 0.25)',
        scoreText: '#c4b5fd',
        scoreBg: 'rgba(168, 85, 247, 0.25)',
        driverBg: 'rgba(30, 41, 59, 0.85)',
        driverText: '#e5e7eb',
        driverLabel: '#94a3b8',
        narrativeText: '#d1d5db',
        mutedText: '#9ca3af'
      }
    : {
        heading: '#333',
        sentimentPositive: '#15803d',
        sentimentNegative: '#b91c1c',
        sentimentNeutral: '#6b7280',
        sentimentPositiveBg: 'rgba(34, 197, 94, 0.15)',
        sentimentNegativeBg: 'rgba(239, 68, 68, 0.15)',
        sentimentNeutralBg: 'rgba(156, 163, 175, 0.15)',
        confidenceText: '#1e40af',
        confidenceBg: 'rgba(59, 130, 246, 0.15)',
        scoreText: '#7e22ce',
        scoreBg: 'rgba(168, 85, 247, 0.15)',
        driverBg: 'rgba(249, 250, 251, 0.8)',
        driverText: '#555',
        driverLabel: '#888',
        narrativeText: '#555',
        mutedText: '#888'
      }

  // Component mount check
  useEffect(() => {
    // Component mounted
  }, [symbol, newsCount, news, allArticles.length])

  // Close dropdown when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        indicatorRef.current &&
        !indicatorRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false)
      }
    }

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowDropdown(false)
      }
    }

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscapeKey)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
        document.removeEventListener('keydown', handleEscapeKey)
      }
    }
  }, [showDropdown])

  // Early return after all hooks - commented for debugging
  // if (!news && newsCount === 0 && allArticles.length === 0) {
  //   return null
  // }

  // Always show the indicator for now to debug
  const hasData = news || newsCount > 0 || allArticles.length > 0

  // Use consistent gray color for all news icons
  const getIndicatorColor = () => {
    return '#666' // Gray for all sources
  }

  // Format time ago
  const formatTimeAgo = (date: Date): string => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return 'just now'
  }

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!showDropdown) {
      // Show dropdown immediately
      setShowDropdown(true)

      // Check if we need to fetch articles
      const needsRSSFetch = allArticles.length === 0 && onNewsClick
      const needsFMPFetch = fmpArticles.length === 0 && fetchFMPArticles && symbol
      const needsAISummary = symbol && !aiSummary // Auto-fetch AI summary for all symbols

      if (needsRSSFetch || needsFMPFetch || needsAISummary) {
        setLoading(true)

        // PHASE 1 OPTIMIZATION: Fire all requests in parallel
        const startTime = performance.now()

        const fetchPromises: Promise<void>[] = []

        // Fetch RSS articles in parallel
        if (needsRSSFetch) {
          fetchPromises.push(
            Promise.resolve(onNewsClick()).catch(error => {
              console.error('Failed to fetch RSS articles:', error)
            })
          )
        }

        // Fetch FMP articles in parallel
        if (needsFMPFetch) {
          fetchPromises.push(
            fetchFMPArticles(symbol)
              .then(articles => {
                setFmpArticles(articles || [])
              })
              .catch(error => {
                console.error('Failed to fetch FMP articles:', error)
              })
          )
        }

        // Fire AI summary immediately (doesn't block on RSS/FMP)
        if (needsAISummary) {
          generateAISummary() // Fire and forget - updates state when complete
        }

        // Wait for RSS/FMP to complete, but AI summary continues in background
        await Promise.all(fetchPromises)

        const endTime = performance.now()

        setLoading(false)
      }
    } else {
      setShowDropdown(false)
    }

    setShowTooltip(false)
  }

  const handleMouseEnter = () => {
    if (!showDropdown) {
      setShowTooltip(true)
      prefetchArticles?.()
    }
  }

  const handleMouseLeave = () => {
    setShowTooltip(false)
  }

  const getSummaryArticles = () => (fmpArticles.length > 0 ? fmpArticles : allArticles)

  const buildHeadlinesHash = (articles: NewsArticle[]) => {
    if (!articles || articles.length === 0) {
      return `no-articles-${symbol || 'unknown'}`
    }

    return articles
      .slice(0, 5)
      .map(article => {
        const headline = (article as any).headline || article.title || article.summary || ''
        const published =
          typeof article.publishedAt === 'string'
            ? article.publishedAt
            : article.publishedAt instanceof Date
              ? article.publishedAt.toISOString()
              : ''
        return `${headline.trim()}::${published}`
      })
      .join('|')
      .substring(0, 200)
  }

  const generateAISummary = async () => {
    if (!symbol) return

    const t0 = performance.now()

    // Generate a simple headlines hash for cache key
    const summaryArticles = getSummaryArticles()
    const headlinesHash = buildHeadlinesHash(summaryArticles)

    // PHASE 2: Check cache first
    const cached = summaryCache.getCache(symbol, headlinesHash)
    if (cached) {
      const t1 = performance.now()
      setAiSummary(cached.summary)
      setAiSummaryData(cached.data)
      setAiSummarySources(cached.sources)
      setEarningsContext(cached.earningsContext)
      setShowAiSummary(true)
      return
    }

    setAiSummaryLoading(true)
    setShowAiSummary(true)
    setAiSummary('')  // Clear previous summary
    setThinkingSteps([])  // Reset thinking steps

    // Simulate chain-of-thought with progressive steps
    const addThinkingStep = (step: string) => {
      setThinkingSteps(prev => [...prev, step])
    }

    try {
      // Step 1: Fetching data
      addThinkingStep(`📰 Fetching latest news and market data for ${symbol}...`)

      const fetchStart = performance.now()

      // Step 2: Processing data (show after a brief delay to feel natural)
      setTimeout(() => addThinkingStep(`📊 Analyzing ${symbol} headlines and price movement...`), 300)

      // Step 3: AI thinking (show during request)
      setTimeout(() => addThinkingStep(`🤖 Identifying key drivers for ${symbol} and market sentiment...`), 600)

      const response = await fetch('/api/news/ai-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol })
      })
      const fetchEnd = performance.now()


      if (!response.ok) {
        throw new Error('Failed to generate summary')
      }

      const parseStart = performance.now()
      const data = await response.json()
      const parseEnd = performance.now()


      // Step 4: Finalizing
      addThinkingStep(`✨ Generating ${symbol} summary...`)

      // Small delay to show all steps before displaying result
      await new Promise(resolve => setTimeout(resolve, 500))

      setAiSummary(data.summary)
      setAiSummaryData(data.data || null)  // Store structured data
      setAiSummarySources(data.sources || [])
      setEarningsContext(data.earningsContext || null)  // Store earnings context
      setThinkingSteps([])  // Clear thinking steps when done

      // PHASE 2: Store in cache
      summaryCache.setCache(symbol, headlinesHash, {
        summary: data.summary,
        data: data.data || null,
        sources: data.sources || [],
        earningsContext: data.earningsContext || null
      })

      const totalTime = performance.now() - t0
    } catch (error) {
      console.error('Failed to generate AI summary:', error)
      setAiSummary('Failed to generate AI summary. Please try again later.')
      setAiSummarySources([])
      setThinkingSteps([])
    } finally {
      setAiSummaryLoading(false)
    }
  }

  const fetchAnalystRatings = async () => {
    if (!symbol || analystLoading) return
    setAnalystLoading(true)
    try {
      const response = await fetch(`/api/analyst/details?symbol=${symbol}`)
      if (!response.ok) {
        throw new Error('Failed to fetch analyst ratings')
      }
      const data = await response.json()

      // Filter to only show changes from the last 14 days
      const fourteenDaysAgo = new Date()
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

      const recentChanges = (data.changes || []).filter((change: any) => {
        const changeDate = new Date(change.publishedDate)
        return changeDate >= fourteenDaysAgo
      })

      setAnalystChanges(recentChanges)
    } catch (error) {
      console.error('Failed to fetch analyst ratings:', error)
      setAnalystChanges([])
    } finally {
      setAnalystLoading(false)
    }
  }

  return (
    <div
      ref={indicatorRef}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* News Icon */}
      <div
        onClick={handleClick}
        style={{
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 6px',
          borderRadius: '4px',
          backgroundColor: news ? getIndicatorColor() + '15' : 'rgb(var(--watchlist-surface))',
          transition: 'all 0.2s ease',
          position: 'relative',
          zIndex: 1,
          userSelect: 'none'
        }}
        onMouseDown={(e) => {
          e.preventDefault()
        }}
      >
        {/* News Icon SVG */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke={news ? getIndicatorColor() : '#666'}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
          <path d="M22 6l-10 5L2 6"/>
          <line x1="6" y1="14" x2="18" y2="14"/>
          <line x1="6" y1="18" x2="12" y2="18"/>
        </svg>

        {/* Count Badge - shows total from RSS + FMP */}
        {(newsCount > 0 || allArticles.length > 0 || fmpNewsCount > 0) && (
          <span style={{
            fontSize: '11px',
            fontWeight: '600',
            color: news ? getIndicatorColor() : '#666',
            minWidth: '14px',
            textAlign: 'center'
          }}>
            {(() => {
              const rssCount = newsCount || allArticles.length;
              const totalCount = rssCount + fmpNewsCount;
              return totalCount > 9 ? '9+' : totalCount;
            })()}
          </span>
        )}
      </div>

      {/* Dropdown List - Using portal and fixed positioning to escape any container constraints */}
      {showDropdown && typeof window !== 'undefined' && createPortal(
        (() => {
          const rect = indicatorRef.current?.getBoundingClientRect();
          if (!rect) return null;

        // Larger dropdown size for better readability
        const dropdownWidth = 900;
        const maxDropdownHeight = 700; // Fixed height to show more articles
        const padding = 8; // Distance from icon
        const screenPadding = 20; // Minimum distance from screen edges

        // Get icon center position
        const iconCenterX = rect.left + rect.width / 2;
        const iconCenterY = rect.top + rect.height / 2;

        // Check available space to the right and left
        const spaceRight = window.innerWidth - rect.right - screenPadding;
        const spaceLeft = rect.left - screenPadding;

        // Determine if we should show to the left or right
        const showLeft = spaceRight < dropdownWidth && spaceLeft > spaceRight;

        // Calculate horizontal position
        let leftPos;
        if (showLeft) {
          // Position to the left of icon
          leftPos = rect.left - dropdownWidth - padding;
        } else {
          // Position to the right of icon
          leftPos = rect.right + padding;
        }

        // Calculate vertical position - align top of dropdown with top of icon
        const dropdownHeight = Math.min(maxDropdownHeight, window.innerHeight - 2 * screenPadding);
        let topPos = rect.top;

        // Ensure dropdown doesn't go off screen vertically
        if (topPos < screenPadding) {
          topPos = screenPadding;
        } else if (topPos + dropdownHeight > window.innerHeight - screenPadding) {
          topPos = window.innerHeight - dropdownHeight - screenPadding;
        }

        return (
          <>
            {/* Arrow pointer - points from left or right side */}
            <div
              style={{
                position: 'fixed',
                top: Math.max(
                  topPos + 20,
                  Math.min(
                    iconCenterY - 8,
                    topPos + dropdownHeight - 20
                  )
                ),
                left: showLeft ? leftPos + dropdownWidth - 8 : leftPos - 8,
                width: 0,
                height: 0,
                borderTop: '8px solid transparent',
                borderBottom: '8px solid transparent',
                ...(showLeft ? {
                  borderLeft: `8px solid ${dropdownColors.containerBg}`,
                  borderRight: 'none',
                } : {
                  borderRight: `8px solid ${dropdownColors.containerBg}`,
                  borderLeft: 'none',
                }),
                zIndex: 10002,
              }}
            />
            <div
              ref={dropdownRef}
              style={{
                position: 'fixed',
                top: topPos,
                left: leftPos,
                zIndex: 10001,
                backgroundColor: dropdownColors.containerBg,
                borderRadius: '8px',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
                width: `${dropdownWidth}px`,
                height: `${dropdownHeight}px`,
                maxHeight: `${dropdownHeight}px`,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                border: dropdownColors.border
              }}
            >
          {/* Header with Tabs - Sticky */}
          <div style={{
            borderBottom: dropdownColors.headerBorder,
            backgroundColor: dropdownColors.headerBg,
            flexShrink: 0
          }}>
            {/* Tab Navigation with Close Button */}
            <div style={{
              display: 'flex',
              padding: '12px 16px 0 16px',
              gap: '16px',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{
                display: 'flex',
                gap: '16px'
              }}>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setActiveTab('rss')
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '14px 12px',
                  fontSize: '16px',
                  fontWeight: activeTab === 'rss' ? '600' : '400',
                  color: activeTab === 'rss' ? dropdownColors.tabActive : dropdownColors.tabInactive,
                  borderBottom: activeTab === 'rss'
                    ? `2px solid ${dropdownColors.tabBorderActive}`
                    : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                RSS ({allArticles.filter(a => !a.source?.toLowerCase().includes('yahoo')).length})
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setActiveTab('fmp')
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '14px 12px',
                  fontSize: '16px',
                  fontWeight: activeTab === 'fmp' ? '600' : '400',
                  color: activeTab === 'fmp' ? dropdownColors.tabActive : dropdownColors.tabInactive,
                  borderBottom: activeTab === 'fmp'
                    ? `2px solid ${dropdownColors.tabBorderActive}`
                    : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                FMP ({fmpArticles.length || fmpNewsCount})
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setActiveTab('analyst')
                  if (analystChanges.length === 0 && !analystLoading) {
                    fetchAnalystRatings()
                  }
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '14px 12px',
                  fontSize: '16px',
                  fontWeight: activeTab === 'analyst' ? '600' : '400',
                  color: activeTab === 'analyst' ? dropdownColors.tabActive : dropdownColors.tabInactive,
                  borderBottom: activeTab === 'analyst'
                    ? `2px solid ${dropdownColors.tabBorderActive}`
                    : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Analyst
              </button>
              </div>

              {/* Close Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowDropdown(false)
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: dropdownColors.closeDefault,
                  padding: '0 4px',
                  lineHeight: 1
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = dropdownColors.closeHover
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = dropdownColors.closeDefault
                }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Scrollable Content Area */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden'
          }}>
          {/* AI Summary Display - Auto-shows for all symbols */}
          {symbol && (
            <div style={{
              padding: '16px 20px',
              background: isDarkMode
                ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(124, 58, 237, 0.12) 100%)'
                : 'linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%)',
              borderBottom: isDarkMode ? '1px solid rgba(148, 163, 184, 0.2)' : '1px solid #e0e0e0',
              maxWidth: '100%',
              boxSizing: 'border-box',
              minHeight: '280px'  // Fixed minimum height to prevent layout shift
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                width: '100%'
              }}>
                <span style={{
                  fontSize: '20px',
                  flexShrink: 0,
                  opacity: aiSummaryLoading ? 0.6 : 1,
                  transition: 'opacity 0.3s ease'
                }}>🤖</span>
                <div style={{
                  flex: '1 1 auto',
                  minWidth: 0,  // Critical for text wrapping in flex containers
                  maxWidth: 'calc(100% - 40px)'  // Account for emoji and gap
                }}>
                  {aiSummaryLoading ? (
                    // Chain-of-thought: Show thinking steps
                    <>
                      <div style={{
                        fontSize: '16px',
                        fontWeight: '600',
                        color: summaryColors.heading,
                        marginBottom: '16px'
                      }}>
                        Generating Summary...
                      </div>

                      {/* Thinking Steps */}
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px'
                      }}>
                        {thinkingSteps.map((step, index) => (
                          <div
                            key={index}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '10px',
                              padding: '10px',
                              backgroundColor: isDarkMode ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.08)',
                              borderRadius: '6px',
                              borderLeft: '3px solid #3b82f6',
                              animation: `fadeIn 0.3s ease-in ${index * 0.1}s both`
                            }}
                          >
                            <div style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '50%',
                              backgroundColor: '#3b82f6',
                              flexShrink: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'white',
                              fontSize: '11px',
                              fontWeight: '600'
                            }}>
                              {index + 1}
                            </div>
                            <div style={{
                              flex: 1,
                              fontSize: '14px',
                              color: summaryColors.narrativeText,
                              lineHeight: '1.4'
                            }}>
                              {step}
                            </div>
                            {index === thinkingSteps.length - 1 && (
                              <div style={{
                                width: '16px',
                                height: '16px',
                                borderRadius: '50%',
                                border: '2px solid #3b82f6',
                                borderTopColor: 'transparent',
                                animation: 'spin 0.8s linear infinite',
                                flexShrink: 0
                              }} />
                            )}
                          </div>
                        ))}
                      </div>

                      <style>
                        {`
                          @keyframes fadeIn {
                            0% {
                              opacity: 0;
                              transform: translateY(10px);
                            }
                            100% {
                              opacity: 1;
                              transform: translateY(0);
                            }
                          }
                          @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                          }
                        `}
                      </style>
                    </>
                  ) : (
                    <>
                      {/* Header with Sentiment & Confidence */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '8px',
                        flexWrap: 'wrap'
                      }}>
                        {/* Sentiment Badge */}
                        {aiSummaryData && (
                          <>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: '600',
                              backgroundColor:
                                aiSummaryData.sentiment === 'bullish' ? summaryColors.sentimentPositiveBg :
                                aiSummaryData.sentiment === 'bearish' ? summaryColors.sentimentNegativeBg :
                                summaryColors.sentimentNeutralBg,
                              color:
                                aiSummaryData.sentiment === 'bullish' ? summaryColors.sentimentPositive :
                                aiSummaryData.sentiment === 'bearish' ? summaryColors.sentimentNegative :
                                summaryColors.sentimentNeutral
                            }}>
                              <span style={{ fontSize: '10px' }}>
                                {aiSummaryData.sentiment === 'bullish' ? '🟢' :
                                 aiSummaryData.sentiment === 'bearish' ? '🔴' : '⚪'}
                              </span>
                              {aiSummaryData.sentiment.charAt(0).toUpperCase() + aiSummaryData.sentiment.slice(1)}
                            </span>

                            {/* Confidence Badge */}
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: '600',
                              backgroundColor: summaryColors.confidenceBg,
                              color: summaryColors.confidenceText
                            }}>
                              {(aiSummaryData.confidence * 100).toFixed(0)}% confident
                            </span>

                            {/* Score (optional, shown for non-neutral) */}
                            {aiSummaryData.sentiment !== 'neutral' && (
                              <span style={{
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: '600',
                                backgroundColor: summaryColors.scoreBg,
                                color: summaryColors.scoreText
                              }}>
                                Score: {aiSummaryData.score >= 0 ? '+' : ''}{aiSummaryData.score.toFixed(2)}
                              </span>
                            )}
                          </>
                        )}
                      </div>

                      {/* Primary Driver */}
                      {aiSummaryData && aiSummaryData.primaryDriver && (
                        <div style={{
                          margin: '0 0 8px 0',
                          padding: '6px 10px',
                          backgroundColor: summaryColors.driverBg,
                          borderLeft: '3px solid #667eea',
                          borderRadius: '4px',
                          fontSize: '12px',
                          color: summaryColors.driverText,
                          fontWeight: '500'
                        }}>
                          <span style={{ color: summaryColors.driverLabel, fontWeight: '400' }}>Key Driver:</span> {aiSummaryData.primaryDriver}
                        </div>
                      )}

                      {/* Narrative */}
                      <div style={{
                        margin: 0,
                        fontSize: '18px',
                        color: summaryColors.narrativeText,
                        lineHeight: '1.6',
                        wordBreak: 'break-word',
                        overflowWrap: 'break-word',
                        whiteSpace: 'pre-wrap',
                        maxWidth: '100%'
                      }}>
                        {aiSummary || 'Fetching market summary...'}
                      </div>
                      {/* Source Links - Collapsible */}
                      {aiSummarySources.length > 0 && (
                        <div style={{
                          marginTop: '12px',
                          paddingTop: '12px',
                          borderTop: isDarkMode ? '1px solid rgba(148, 163, 184, 0.2)' : '1px solid rgba(0, 0, 0, 0.08)'
                        }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setShowSources(!showSources)
                            }}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              background: 'transparent',
                              border: 'none',
                              padding: '4px 0',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: '600',
                              color: isDarkMode ? '#94a3b8' : '#666',
                              transition: 'color 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = isDarkMode ? '#cbd5e1' : '#333'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = isDarkMode ? '#94a3b8' : '#666'
                            }}
                          >
                            <span>Sources ({aiSummarySources.filter(src => !src.source?.toLowerCase().includes('yahoo')).length})</span>
                            <span style={{
                              fontSize: '14px',
                              transition: 'transform 0.2s',
                              transform: showSources ? 'rotate(180deg)' : 'rotate(0deg)'
                            }}>
                              ▼
                            </span>
                          </button>

                          {showSources && (
                            <div style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                              marginTop: '8px'
                            }}>
                              {aiSummarySources
                                .filter(src => !src.source?.toLowerCase().includes('yahoo'))
                                .map((src, idx) => (
                                <a
                                  key={idx}
                                  href={src.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    fontSize: '12px',
                                    color: '#0066cc',
                                    textDecoration: 'none',
                                    display: 'flex',
                                    alignItems: 'baseline',
                                    gap: '6px',
                                    wordBreak: 'break-word',
                                    lineHeight: '1.4',
                                    transition: 'all 0.2s'
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.textDecoration = 'underline'
                                    e.currentTarget.style.color = '#0052a3'
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.textDecoration = 'none'
                                    e.currentTarget.style.color = '#0066cc'
                                  }}
                                >
                                  <span style={{
                                    flexShrink: 0,
                                    fontWeight: '600',
                                    color: '#888'
                                  }}>
                                    {idx + 1}.
                                  </span>
                                  <span style={{
                                    flexShrink: 0,
                                    fontWeight: '600',
                                    padding: '2px 6px',
                                    backgroundColor: 'rgba(0, 102, 204, 0.1)',
                                    borderRadius: '3px',
                                    fontSize: '10px'
                                  }}>
                                    {src.source}
                                  </span>
                                  <span style={{
                                    flex: 1,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical' as any
                                  }}>
                                    {src.title}
                                  </span>
                                  <span style={{
                                    flexShrink: 0,
                                    fontSize: '10px',
                                    color: '#999'
                                  }}>
                                    {src.time}
                                  </span>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Earnings Information Section */}
          {earningsContext && earningsContext.status !== 'none' && (
            <div style={{
              padding: '16px 20px',
              borderBottom: isDarkMode ? '1px solid rgba(148, 163, 184, 0.2)' : '1px solid #e0e0e0',
              backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : 'rgba(249, 250, 251, 0.8)'
            }}>
              {/* Earnings Badge */}
              <div style={{ marginBottom: '12px' }}>
                <EarningsBadge earningsContext={earningsContext} compact={false} />
              </div>

              {/* Impact Meter (if confidence >= 30%) */}
              {earningsContext.impactConfidence >= 30 && (
                <div style={{ marginBottom: '12px' }}>
                  <ImpactMeter
                    confidence={earningsContext.impactConfidence}
                    breakdown={earningsContext.confidenceBreakdown}
                    showBreakdown={true}
                  />
                </div>
              )}

              {/* Detailed Earnings Card */}
              <EarningsContextCard context={earningsContext} expanded={false} />
            </div>
          )}

          {/* Articles List */}
          <div style={{ padding: '12px' }}>
            {loading ? (
              <div style={{
                padding: '40px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px'
              }}>
                {/* Loading spinner using CSS animation */}
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  style={{
                    animation: 'newsSpinner 0.8s linear infinite'
                  }}
                >
                  <style>
                    {`
                      @keyframes newsSpinner {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                      }
                    `}
                  </style>
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="#f0f0f0"
                    strokeWidth="3"
                    fill="none"
                  />
                  <path
                    d="M 12 2 A 10 10 0 0 1 22 12"
                    stroke="#1a73e8"
                    strokeWidth="3"
                    fill="none"
                    strokeLinecap="round"
                  />
                </svg>
                <div style={{
                  color: '#666',
                  fontSize: '13px',
                  fontWeight: '500'
                }}>
                  Loading articles...
                </div>
              </div>
            ) : (
              <>
                {/* RSS Articles Tab */}
                {activeTab === 'rss' && (
                  allArticles.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {allArticles
                        .filter(article => !article.source?.toLowerCase().includes('yahoo'))
                        .map((article, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '16px',
                      border: '1px solid rgb(var(--watchlist-border))',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      backgroundColor: 'rgb(var(--watchlist-surface))'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgb(var(--watchlist-button-hover))'
                      e.currentTarget.style.borderColor = 'rgb(var(--watchlist-border))'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgb(var(--watchlist-surface))'
                      e.currentTarget.style.borderColor = 'rgb(var(--watchlist-border))'
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (article.canonicalUrl) {
                        window.open(article.canonicalUrl, '_blank', 'noopener,noreferrer')
                      }
                    }}
                  >
                    {/* Article Header */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '8px'
                    }}>
                      <div style={{
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'center'
                      }}>
                        <span style={{
                          fontSize: '14px',
                          fontWeight: '600',
                          color: '#666',
                          backgroundColor: '#f0f0f0',
                          padding: '5px 12px',
                          borderRadius: '3px'
                        }}>
                          {article.source}
                        </span>
                        {(article as any).isArchived && (
                          <span style={{
                            fontSize: '12px',
                            fontWeight: '600',
                            color: '#7c3aed',
                            backgroundColor: 'rgba(124, 58, 237, 0.1)',
                            padding: '3px 8px',
                            borderRadius: '3px'
                          }}>
                            Archived
                          </span>
                        )}
                        <span style={{
                          fontSize: '14px',
                          color: '#999'
                        }}>
                          {formatTimeAgo(new Date(article.publishedAt))}
                        </span>
                      </div>
                    </div>

                    {/* Article Title */}
                    <h4 style={{
                      margin: '0 0 10px 0',
                      fontSize: '18px',
                      fontWeight: '500',
                      color: '#0066cc',
                      lineHeight: '1.5'
                    }}>
                      {article.headline}
                    </h4>

                    {/* Match Reason */}
                    {article.matchedTickers?.find(m => m.symbol === symbol)?.matchReason && (
                      <p style={{
                        margin: '0 0 10px 0',
                        fontSize: '13px',
                        fontStyle: 'italic',
                        color: '#888',
                        lineHeight: '1.4'
                      }}>
                        {article.matchedTickers.find(m => m.symbol === symbol)?.matchReason}
                      </p>
                    )}

                    {/* Article Description */}
                    {article.description && (
                      <p style={{
                        margin: 0,
                        fontSize: '15px',
                        color: '#666',
                        lineHeight: '1.6',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical'
                      }}>
                        {article.description}
                      </p>
                    )}
                  </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{
                      padding: '24px',
                      textAlign: 'center',
                      color: '#999',
                      fontSize: '16px'
                    }}>
                      No RSS articles available
                    </div>
                  )
                )}

            {/* FMP Articles Tab */}
            {activeTab === 'fmp' && (
              fmpArticles.length > 0 ? (
                <div>
                  {fmpArticles.map((article, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '16px',
                          border: '1px solid rgb(var(--watchlist-border))',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          backgroundColor: 'rgb(var(--watchlist-surface))',
                          marginBottom: '10px'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgb(var(--watchlist-button-hover))'
                          e.currentTarget.style.borderColor = 'rgb(var(--watchlist-border))'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgb(var(--watchlist-surface))'
                          e.currentTarget.style.borderColor = 'rgb(var(--watchlist-border))'
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (article.url) {
                            window.open(article.url, '_blank', 'noopener,noreferrer')
                          }
                        }}
                      >
                        {/* Article Header */}
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          marginBottom: '10px'
                        }}>
                          <div style={{
                            display: 'flex',
                            gap: '8px',
                            alignItems: 'center'
                          }}>
                            <span style={{
                              fontSize: '14px',
                              fontWeight: '600',
                              color: '#0066cc',
                              backgroundColor: 'rgba(0, 102, 204, 0.1)',
                              padding: '5px 12px',
                              borderRadius: '3px'
                            }}>
                              {article.source || 'FMP'}
                            </span>
                            <span style={{
                              fontSize: '14px',
                              color: '#999'
                            }}>
                              {formatTimeAgo(new Date(article.publishedAt || article.publishedDate || Date.now()))}
                            </span>
                          </div>
                        </div>

                        {/* Article Title */}
                        <h4 style={{
                          margin: '0 0 10px 0',
                          fontSize: '18px',
                          fontWeight: '500',
                          color: '#0066cc',
                          lineHeight: '1.4'
                        }}>
                          {article.title}
                        </h4>

                        {/* Article Summary */}
                        {article.summary && (
                          <p style={{
                            margin: 0,
                            fontSize: '15px',
                            color: '#666',
                            lineHeight: '1.6',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical'
                          }}>
                            {article.summary}
                          </p>
                        )}
                      </div>
                  ))}
                </div>
              ) : (
                <div style={{
                  padding: '20px',
                  textAlign: 'center',
                  color: '#999',
                  fontSize: '15px'
                }}>
                  {fmpNewsCount > 0 ? 'Loading FMP articles...' : 'No FMP articles available'}
                </div>
              )
            )}

            {/* Analyst Ratings Tab */}
            {activeTab === 'analyst' && (
              analystLoading ? (
                <div style={{
                  padding: '20px',
                  textAlign: 'center',
                  color: '#999',
                  fontSize: '15px'
                }}>
                  Loading analyst ratings...
                </div>
              ) : analystChanges.length > 0 ? (
                <div>
                  {analystChanges.map((change, index) => (
                    <div
                      key={index}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderBottom: index < analystChanges.length - 1 ? '1px solid #f0f0f0' : 'none',
                        transition: 'background 0.2s',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#f8f8f8'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      onClick={() => change.newsURL && window.open(change.newsURL, '_blank')}
                    >
                      {/* Left side - Date and Company */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        flex: '1',
                        minWidth: 0
                      }}>
                        {/* Date */}
                        <span style={{
                          color: '#666',
                          fontSize: '13px',
                          minWidth: '80px'
                        }}>
                          {(() => {
                            const date = new Date(change.publishedDate);
                            const now = new Date();
                            const diffMs = now.getTime() - date.getTime();
                            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

                            if (diffDays === 0) return 'Today';
                            if (diffDays === 1) return 'Yesterday';
                            if (diffDays < 7) return `${diffDays} days ago`;
                            if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
                            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                          })()}
                        </span>

                        {/* Company */}
                        <span style={{
                          color: '#000',
                          fontSize: '14px',
                          fontWeight: '500',
                          minWidth: '120px'
                        }}>
                          {change.gradingCompany}
                        </span>

                        {/* Action */}
                        <span style={{
                          color: (() => {
                            const actionLower = change.action?.toLowerCase();
                            if (actionLower === 'upgrade' || actionLower === 'up') return '#16a34a';
                            if (actionLower === 'downgrade' || actionLower === 'down') return '#dc2626';
                            if (actionLower === 'init' || actionLower === 'initiated') return '#2563eb';
                            return '#6b7280';
                          })(),
                          fontSize: '13px',
                          fontWeight: '600',
                          minWidth: '80px'
                        }}>
                          {(() => {
                            const actionLower = change.action?.toLowerCase();
                            if (actionLower === 'upgrade' || actionLower === 'up') return 'Upgraded';
                            if (actionLower === 'downgrade' || actionLower === 'down') return 'Downgraded';
                            if (actionLower === 'init' || actionLower === 'initiated') return 'Initiated';
                            if (actionLower === 'reit' || actionLower === 'reiterated') return 'Reiterated';
                            if (actionLower === 'main' || actionLower === 'maintained' || actionLower === 'hold') return 'Maintained';
                            return change.action;
                          })()}
                        </span>

                        {/* Rating Change */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '13px'
                        }}>
                          {(() => {
                            const actionLower = change.action?.toLowerCase();
                            const isMaintained = actionLower === 'main' || actionLower === 'maintained' || actionLower === 'hold' || actionLower === 'reit' || actionLower === 'reiterated';

                            // If rating is maintained/reiterated, just show the current rating
                            if (isMaintained || (change.previousGrade === change.newGrade)) {
                              return (
                                <span style={{ color: '#000', fontWeight: '500' }}>
                                  {change.newGrade}
                                </span>
                              );
                            }

                            // If it's a change or initiation, show the transition
                            if (change.previousGrade && change.previousGrade !== 'None') {
                              return (
                                <>
                                  <span style={{ color: '#888' }}>
                                    {change.previousGrade}
                                  </span>
                                  <span style={{ color: '#666' }}>→</span>
                                  <span style={{ color: '#000', fontWeight: '500' }}>
                                    {change.newGrade}
                                  </span>
                                </>
                              );
                            }

                            // For initiations or when no previous grade
                            return (
                              <span style={{ color: '#000', fontWeight: '500' }}>
                                {change.newGrade}
                              </span>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Right side - Price Target and Link */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px'
                      }}>
                        {/* Price Target */}
                        {change.priceTarget && (
                          <span style={{
                            color: '#000',
                            fontSize: '13px',
                            fontWeight: '500'
                          }}>
                            PT: ${change.priceTarget.toFixed(0)}
                          </span>
                        )}

                        {/* Link indicator */}
                        {change.newsURL && (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#666"
                            strokeWidth="2"
                          >
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{
                  padding: '20px',
                  textAlign: 'center',
                  color: '#999',
                  fontSize: '15px'
                }}>
                  No analyst rating changes in the last 14 days
                </div>
              )
            )}
              </>
            )}
          </div>
          </div>
        </div>
        </>
        )
      })(),
      document.body
      )}

      {/* Hover Tooltip - Using fixed positioning */}
      {showTooltip && news && !showDropdown && (
        <div
          style={{
            position: 'fixed',
            bottom: indicatorRef.current
              ? window.innerHeight - indicatorRef.current.getBoundingClientRect().top + 8
              : 0,
            left: indicatorRef.current
              ? indicatorRef.current.getBoundingClientRect().left +
                (indicatorRef.current.getBoundingClientRect().width / 2) - 150
              : 0,
            zIndex: 10000,
            pointerEvents: 'none'
          }}
        >
          <div
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.95)',
              color: 'white',
              padding: '10px 12px',
              borderRadius: '8px',
              maxWidth: '300px',
              minWidth: '200px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
              fontSize: '12px',
              lineHeight: '1.4'
            }}
          >
            {/* Source and Time */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '6px'
            }}>
              <span style={{
                color: news.source === 'WSJ' ? '#ff6b6b' : '#4dabf7',
                fontWeight: '600',
                fontSize: '11px'
              }}>
                {news.source}
              </span>
              <span style={{
                color: '#999',
                fontSize: '10px'
              }}>
                {formatTimeAgo(new Date(news.publishedAt))}
              </span>
            </div>

            {/* Headline */}
            <div style={{
              fontWeight: '500',
              marginBottom: '4px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical'
            }}>
              {news.headline}
            </div>

            {/* Description */}
            {news.description && (
              <div style={{
                color: '#ccc',
                fontSize: '11px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical'
              }}>
                {news.description}
              </div>
            )}

            {/* More articles indicator */}
            {newsCount > 1 && (
              <div style={{
                marginTop: '6px',
                paddingTop: '6px',
                borderTop: '1px solid #333',
                color: '#999',
                fontSize: '10px',
                textAlign: 'center'
              }}>
                +{newsCount - 1} more {newsCount === 2 ? 'article' : 'articles'}
              </div>
            )}

            {/* Click hint */}
            <div style={{
              marginTop: '6px',
              color: '#666',
              fontSize: '10px',
              textAlign: 'center',
              fontStyle: 'italic'
            }}>
              Click to view all articles
            </div>
          </div>

          {/* Tooltip Arrow */}
          <div
            style={{
              position: 'absolute',
              bottom: '-6px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: '6px solid rgba(0, 0, 0, 0.95)'
            }}
          />
        </div>
      )}
    </div>
  )
}
