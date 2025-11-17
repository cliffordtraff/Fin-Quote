'use client'

import { memo, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Stock, MergedStock } from '@watchlist/types'
import NewsModal from '@watchlist/components/NewsModal'
import AnalystModal from '@watchlist/components/AnalystModal'
import NewsIndicator from '@watchlist/components/NewsIndicator'
import { formatDividendYield } from '@watchlist/utils/formatters'

interface DividendInfo {
  exDate: string | null
  paymentDate: string | null
  amount: number | null
}

interface NewsMeta {
  hasNews: boolean
  count: number
  latestPublishedAt?: string
  latestTitle?: string
}

interface RSSNewsMeta {
  symbol: string
  articles: any[]
  count: number
  latestArticle?: any
}

interface NewsArticle {
  title: string
  url: string
  source: string
  publishedAt: string
  summary: string
}

interface AnalystMeta {
  hasAnalystData: boolean
  recentChanges: number
  latestAction?: string
  latestDate?: string
  latestCompany?: string
  latestGrade?: string
  priceTarget?: number
  upgrades: number
  downgrades: number
  initiations: number
}

interface StockRowProps {
  symbol: string
  stock?: MergedStock
  isHeader?: boolean
  isHighlighted: boolean
  deleteMode?: boolean
  reorderMode?: boolean
  isSelected?: boolean
  isDragging?: boolean
  isDropTarget?: boolean
  dropPosition?: 'before' | 'after' | null
  index?: number
  newsMeta?: NewsMeta
  rssNewsMeta?: RSSNewsMeta
  analystMeta?: AnalystMeta
  fetchArticles?: (symbol: string) => Promise<NewsArticle[]>
  fetchRSSArticles?: (symbol: string) => Promise<any[]>
  prefetchArticles?: (symbol: string) => Promise<void>
  prefetchRSSArticles?: (symbol: string) => void
  onCheckboxChange?: (checked: boolean) => void
  onRowClick: () => void
  onSymbolClick: () => void
  onRemove: () => void
  onRename?: (newName: string) => void
  onContextMenu?: (e: React.MouseEvent, symbol: string, rowIndex: number) => void
  onDragStart?: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  onDragLeave?: () => void
  showExtendedHours?: boolean
}

// Helper function to format numbers
function formatNumber(num: number | null | undefined, decimals = 2): string {
  if (num === null || num === undefined) return 'N/A'
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
}

// Helper function to format large numbers
function formatLargeNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return 'N/A'
  
  if (num >= 1e9) {
    const billions = num / 1e9
    // If over 1 trillion (1000B), don't show decimals
    if (billions >= 1000) {
      return billions.toLocaleString(undefined, { 
        minimumFractionDigits: 0, 
        maximumFractionDigits: 0 
      }) + 'B'
    }
    return billions.toLocaleString(undefined, { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    }) + 'B'
  }
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M'
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K'
  
  return num.toLocaleString()
}

// Format date as MM/DD/YY
function formatExDate(dateStr: string | null | undefined): string {
  if (!dateStr || dateStr === 'N/A' || dateStr === 'None') return '– –'
  
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return dateStr
    
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const day = date.getDate().toString().padStart(2, '0')
    const year = date.getFullYear().toString().slice(2)
    
    return `${month}/${day}/${year}`
  } catch (e) {
    return dateStr
  }
}

// News functionality will be implemented with real data in Phase 1
// No mock news - only show icons when we have real news from FMP API

// Memoized component that only re-renders when its props change
const StockRow = memo(function StockRow({
  symbol,
  stock,
  isHeader = false,
  isHighlighted,
  deleteMode = false,
  reorderMode = false,
  isSelected = false,
  isDragging = false,
  isDropTarget = false,
  dropPosition = null,
  index,
  newsMeta,
  rssNewsMeta,
  analystMeta,
  fetchArticles,
  fetchRSSArticles,
  prefetchArticles,
  prefetchRSSArticles,
  onCheckboxChange,
  onRowClick,
  onSymbolClick,
  onRemove,
  onRename,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onDragLeave,
  showExtendedHours = false
}: StockRowProps) {
  const rowRef = useRef<HTMLTableRowElement>(null)
  const prevPriceRef = useRef<number | undefined>(stock?.price)
  const [showNewsModal, setShowNewsModal] = useState(false)
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([])
  const [loadingArticles, setLoadingArticles] = useState(false)
  const [showAnalystModal, setShowAnalystModal] = useState(false)
  const [analystChanges, setAnalystChanges] = useState<any[]>([])
  const [loadingAnalyst, setLoadingAnalyst] = useState(false)
  const [rssArticles, setRssArticles] = useState<any[]>(rssNewsMeta?.articles || [])
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Track previous price (keeping for potential future use)
  useEffect(() => {
    prevPriceRef.current = stock?.price
  }, [stock?.price])

  // Update RSS articles when prop changes
  useEffect(() => {
    if (rssNewsMeta?.articles && rssNewsMeta.articles.length > 0) {
      setRssArticles(rssNewsMeta.articles)
    }
  }, [rssNewsMeta, symbol])
  
  // Handle news icon click - use RSS articles or fetch if needed
  const handleNewsClick = async () => {
    // If we already have articles, just return (dropdown will show)
    if (rssArticles.length > 0) {
      return
    }

    // Try to fetch if we have a fetch function
    if (fetchRSSArticles) {
      try {
        const articles = await fetchRSSArticles(symbol)
        setRssArticles(articles)
      } catch (error) {
        console.error('Failed to fetch RSS articles:', error)
        setRssArticles([])
      }
    }
  }

  // Handle FMP news modal (keeping original functionality)
  const handleFMPNewsClick = async () => {
    if (!fetchArticles) return

    setShowNewsModal(true)
    setLoadingArticles(true)

    try {
      const articles = await fetchArticles(symbol)
      setNewsArticles(articles)
    } catch (error) {
      console.error('Failed to fetch articles:', error)
      setNewsArticles([])
    } finally {
      setLoadingArticles(false)
    }
  }

  // Handle analyst indicator click
  const handleAnalystClick = async () => {
    setShowAnalystModal(true)
    setLoadingAnalyst(true)
    
    try {
      const response = await fetch(`/api/analyst/details?symbol=${symbol}`)
      const data = await response.json()
      setAnalystChanges(data.changes || [])
    } catch (error) {
      console.error('Failed to fetch analyst details:', error)
      setAnalystChanges([])
    } finally {
      setLoadingAnalyst(false)
    }
  }

  // Header row rendering
  if (isHeader) {
    return (
      <tr
        ref={rowRef}
        className="header-row bg-watchlist-surface-elevated"
        draggable={reorderMode}
        style={{
          cursor: reorderMode ? 'move' : 'default',
          fontWeight: 'bold',
          borderTop: '2px solid rgb(var(--watchlist-border))',
          borderBottom: '1px solid rgb(var(--watchlist-border))',
          ...(isDragging ? { opacity: 0.5 } : {}),
          ...(dropPosition === 'before' ? { borderTop: '3px solid #2196F3' } : {}),
          ...(dropPosition === 'after' ? { borderBottom: '3px solid #2196F3' } : {})
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          
          // Remove any existing context menu
          const existingMenu = document.getElementById('headerContextMenu')
          if (existingMenu) {
            existingMenu.remove()
          }
          
          // Create context menu
          const contextMenu = document.createElement('div')
          contextMenu.id = 'headerContextMenu'
          contextMenu.style.cssText = `
            position: fixed;
            left: ${e.clientX}px;
            top: ${e.clientY}px;
            background: white;
            border: 1px solid #ddd;
            border-radius: 6px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.15);
            z-index: 10000;
            padding: 4px 0;
            min-width: 150px;
          `
          
          contextMenu.innerHTML = `
            <div id="renameOption" style="
              padding: 8px 16px;
              cursor: pointer;
              color: #333;
              font-size: 14px;
              font-weight: 500;
              display: flex;
              align-items: center;
              gap: 8px;
              border-bottom: 1px solid #eee;
            " onmouseover="this.style.backgroundColor='#f5f5f5'" onmouseout="this.style.backgroundColor='transparent'">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
              Rename Header Row
            </div>
            <div id="deleteOption" style="
              padding: 8px 16px;
              cursor: pointer;
              color: #333;
              font-size: 14px;
              font-weight: 500;
              display: flex;
              align-items: center;
              gap: 8px;
            " onmouseover="this.style.backgroundColor='#f5f5f5'" onmouseout="this.style.backgroundColor='transparent'">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              Delete
            </div>
          `
          
          document.body.appendChild(contextMenu)
          
          // Handle rename option click
          contextMenu.querySelector('#renameOption')?.addEventListener('click', () => {
            contextMenu.remove()
            
            // Show rename dialog
            const renameDialog = document.createElement('div')
            renameDialog.style.cssText = `
              position: fixed;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              background: white;
              border: 2px solid #888c94;
              border-radius: 8px;
              padding: 20px;
              z-index: 10000;
              box-shadow: 0 4px 20px rgba(0,0,0,0.15);
              min-width: 350px;
              text-align: center;
            `
            
            const backdrop = document.createElement('div')
            backdrop.style.cssText = `
              position: fixed;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background: rgba(0,0,0,0.5);
              z-index: 9999;
            `
            
            renameDialog.innerHTML = `
              <h3 style="margin: 0 0 15px 0; font-size: 18px; color: #333;">Rename Header</h3>
              <input 
                id="renameInput" 
                type="text" 
                value="${symbol}"
                style="
                  width: 100%;
                  padding: 10px 12px;
                  border: 2px solid #888c94;
                  border-radius: 6px;
                  font-size: 14px;
                  margin-bottom: 20px;
                  box-sizing: border-box;
                  outline: none;
                "
              />
              <div style="display: flex; gap: 10px; justify-content: center;">
                <button id="confirmRename" style="
                  background: #4caf50;
                  color: white;
                  border: none;
                  padding: 8px 20px;
                  border-radius: 6px;
                  cursor: pointer;
                  font-weight: bold;
                  font-size: 14px;
                ">Rename</button>
                <button id="cancelRename" style="
                  background: white;
                  color: #333;
                  border: 2px solid #888c94;
                  padding: 8px 20px;
                  border-radius: 6px;
                  cursor: pointer;
                  font-weight: bold;
                  font-size: 14px;
                ">Cancel</button>
              </div>
            `
            
            document.body.appendChild(backdrop)
            document.body.appendChild(renameDialog)
            
            // Focus and select the input
            const input = renameDialog.querySelector('#renameInput') as HTMLInputElement
            if (input) {
              input.focus()
              input.select()
            }
            
            const cleanup = () => {
              document.body.removeChild(backdrop)
              document.body.removeChild(renameDialog)
            }
            
            const handleRename = () => {
              const newName = (renameDialog.querySelector('#renameInput') as HTMLInputElement)?.value
              if (newName && newName.trim() && newName.trim() !== symbol) {
                cleanup()
                onRename?.(newName.trim())
              }
            }
            
            // Handle button clicks
            renameDialog.querySelector('#confirmRename')?.addEventListener('click', handleRename)
            renameDialog.querySelector('#cancelRename')?.addEventListener('click', cleanup)
            backdrop.addEventListener('click', cleanup)
            
            // Handle Enter key
            input?.addEventListener('keypress', (e) => {
              if (e.key === 'Enter') {
                handleRename()
              }
            })
            
            // Handle Escape key
            input?.addEventListener('keydown', (e) => {
              if (e.key === 'Escape') {
                cleanup()
              }
            })
          })
          
          // Handle delete option click
          contextMenu.querySelector('#deleteOption')?.addEventListener('click', () => {
            contextMenu.remove()
            onRemove()  // Delete immediately without confirmation
          })
          
          // Close context menu when clicking elsewhere
          const closeMenu = (event: MouseEvent) => {
            if (!contextMenu.contains(event.target as Node)) {
              contextMenu.remove()
              document.removeEventListener('click', closeMenu)
            }
          }
          
          // Add slight delay to prevent immediate closure
          setTimeout(() => {
            document.addEventListener('click', closeMenu)
          }, 10)
        }}
        onDragStart={(e) => {
          if (reorderMode) {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', '')
            onDragStart?.()
          }
        }}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        onDragLeave={onDragLeave}
      >
        {/* Control column on the left for header rows */}
        {(deleteMode || reorderMode) && (
          <td style={{
            textAlign: 'center',
            padding: 0,
            position: 'relative',
            verticalAlign: 'middle',
            cursor: reorderMode ? 'move' : (deleteMode ? 'pointer' : 'default')
          }}
          onClick={(e) => {
            e.stopPropagation()
            if (deleteMode) {
              requestAnimationFrame(() => {
                onCheckboxChange?.(!isSelected)
              })
            }
          }}>
            {deleteMode && (
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => {}} // Handled by td onClick
                style={{ 
                  cursor: 'pointer',
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%) scale(1.3)',
                  margin: 0,
                  width: '18px',
                  height: '18px',
                  pointerEvents: 'none' // Prevent double-firing
                }}
              />
            )}
            {reorderMode && (
              <span
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  display: 'inline-block',
                  width: '24px',
                  height: '24px',
                  cursor: 'move',
                  pointerEvents: 'none',
                  color: 'rgb(var(--watchlist-text-primary))'
                }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ pointerEvents: 'none' }}
                >
                  <line x1="12" y1="5" x2="12" y2="5.01"></line>
                  <line x1="12" y1="12" x2="12" y2="12.01"></line>
                  <line x1="12" y1="19" x2="12" y2="19.01"></line>
                  <line x1="7" y1="5" x2="7" y2="5.01"></line>
                  <line x1="7" y1="12" x2="7" y2="12.01"></line>
                  <line x1="7" y1="19" x2="7" y2="19.01"></line>
                  <line x1="17" y1="5" x2="17" y2="5.01"></line>
                  <line x1="17" y1="12" x2="17" y2="12.01"></line>
                  <line x1="17" y1="19" x2="17" y2="19.01"></line>
                </svg>
              </span>
            )}
          </td>
        )}
        <td className="symbol" colSpan={deleteMode || reorderMode ? 1 : 2} style={{ paddingLeft: '10px', borderRight: 'none', borderLeft: 'none' }}>{symbol}</td>
        <td colSpan={deleteMode || reorderMode ? 15 : 14} style={{ borderLeft: 'none', borderRight: 'none' }}></td>
      </tr>
    )
  }

  // Loading state for symbol without data yet
  if (!stock && !isHeader) {
    return (
      <tr
        ref={rowRef}
        draggable={reorderMode}
        style={{
          cursor: reorderMode ? 'move' : 'pointer',
          opacity: isDragging ? 0.5 : 1
        }}
        onContextMenu={(e) => {
          // Highlight the row when right-clicking
          if (!isHighlighted) {
            onRowClick()
          }
          onContextMenu?.(e, symbol, index ?? 0)
        }}
        onDragStart={(e) => {
          if (reorderMode) {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', '')
            onDragStart?.()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault() // Always prevent default to allow drop
          if (reorderMode) {
            onDragOver?.(e)
          }
        }}
        onDrop={(e) => {
          if (reorderMode) {
            e.preventDefault()
            onDrop?.(e)
          }
        }}
        onDragLeave={(e) => {
          if (reorderMode) {
            e.preventDefault()
            onDragLeave?.()
          }
        }}
      >
        {/* Control column on the left */}
        {(deleteMode || reorderMode) && (
          <td style={{
          textAlign: 'center',
          padding: 0,
          position: 'relative',
          verticalAlign: 'middle',
          cursor: reorderMode ? 'move' : (deleteMode ? 'pointer' : 'default')
        }}
        onClick={(e) => {
          e.stopPropagation()
          if (deleteMode) {
            requestAnimationFrame(() => {
              onCheckboxChange?.(!isSelected)
            })
          }
        }}>
          {deleteMode && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => {}} // Handled by td onClick
              style={{ 
                cursor: 'pointer',
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%) scale(1.3)',
                margin: 0,
                width: '18px',
                height: '18px',
                pointerEvents: 'none' // Prevent double-firing
              }}
            />
          )}
          {reorderMode && (
            <span
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                display: 'inline-block',
                width: '24px',
                height: '24px',
                cursor: 'move',
                pointerEvents: 'none',
                color: 'rgb(var(--watchlist-text-primary))'
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ pointerEvents: 'none' }}
              >
                <line x1="12" y1="5" x2="12" y2="5.01"></line>
                <line x1="12" y1="12" x2="12" y2="12.01"></line>
                <line x1="12" y1="19" x2="12" y2="19.01"></line>
                <line x1="7" y1="5" x2="7" y2="5.01"></line>
                <line x1="7" y1="12" x2="7" y2="12.01"></line>
                <line x1="7" y1="19" x2="7" y2="19.01"></line>
                <line x1="17" y1="5" x2="17" y2="5.01"></line>
                <line x1="17" y1="12" x2="17" y2="12.01"></line>
                <line x1="17" y1="19" x2="17" y2="19.01"></line>
              </svg>
            </span>
            )}
          </td>
        )}
        <td className="symbol">{symbol}</td>
        <td className="news"></td>
        <td colSpan={deleteMode || reorderMode ? 14 : 14} style={{ textAlign: 'center', color: '#666' }}>Loading...</td>
      </tr>
    )
  }

  // If no stock data is available, show loading state
  if (!stock) {
    return (
      <tr
        className={isHighlighted ? 'row-highlight' : ''}
        draggable={reorderMode}
        style={{
          cursor: reorderMode ? 'move' : 'default'
        }}
        onContextMenu={(e) => {
          // Highlight the row when right-clicking
          if (!isHighlighted) {
            onRowClick()
          }
          onContextMenu?.(e, symbol, index ?? 0)
        }}
        onDragStart={(e) => {
          if (reorderMode) {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', '')
            onDragStart?.()
          }
        }}
      >
        {(deleteMode || reorderMode) && <td></td>}
        <td className="symbol">{symbol}</td>
        <td className="news"></td>
        <td colSpan={deleteMode || reorderMode ? 14 : 14} style={{ textAlign: 'center', color: '#666' }}>Loading...</td>
      </tr>
    )
  }

  const isPositive = stock.change >= 0
  const extendedHoursQuote = stock.extendedHoursQuote
  const extendedHoursChangePercent = extendedHoursQuote?.changePercent ?? 0
  const extendedHoursPercentDisplay = `${extendedHoursChangePercent >= 0 ? '+' : '-'}${formatNumber(Math.abs(extendedHoursChangePercent))}%`

  const tableRow = (
    <tr
      ref={rowRef}
      className={isHighlighted ? 'row-highlight' : ''}
      onClick={onRowClick}
      draggable={reorderMode}
      style={{
        cursor: reorderMode ? 'move' : 'pointer',
        opacity: isDragging ? 0.5 : 1
      }}
      onContextMenu={(e) => {
        // Highlight the row when right-clicking
        if (!isHighlighted) {
          onRowClick()
        }
        onContextMenu?.(e, symbol, index ?? 0)
      }}
      onDragStart={(e) => {
        if (reorderMode) {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', '')
          onDragStart?.()
        }
      }}
      onDragOver={(e) => {
        e.preventDefault() // Always prevent default to allow drop
        if (reorderMode) {
          onDragOver?.(e)
        }
      }}
      onDrop={(e) => {
        if (reorderMode) {
          e.preventDefault()
          onDrop?.(e)
        }
      }}
      onDragEnd={(e) => {
        if (reorderMode && isDragging) {
          e.preventDefault()
          onDragEnd?.()
        }
      }}
      onDragLeave={(e) => {
        if (reorderMode) {
          e.preventDefault()
          onDragLeave?.()
        }
      }}
    >
      {/* Control column on the left */}
      {(deleteMode || reorderMode) && (
        <td
          style={{
            textAlign: 'center',
            padding: 0,
            position: 'relative',
            verticalAlign: 'middle',
            cursor: reorderMode ? 'move' : (deleteMode ? 'pointer' : 'default')
          }}
          onClick={(e) => {
            e.stopPropagation()
            if (deleteMode) {
              requestAnimationFrame(() => {
                onCheckboxChange?.(!isSelected)
              })
            }
          }}
        >
          {deleteMode && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => {}} // Handled by td onClick
              style={{ 
                cursor: 'pointer',
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%) scale(1.3)',
                margin: 0,
                width: '18px',
                height: '18px',
                pointerEvents: 'none', // Prevent double-firing
                background: 'rgb(var(--watchlist-surface))',
                border: '1px solid rgb(var(--watchlist-border))',
                borderRadius: '4px'
              }}
            />
          )}
          {reorderMode && (
            <span
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                display: 'inline-block',
                width: '24px',
                height: '24px',
                cursor: 'move',
                pointerEvents: 'none',
                color: 'rgb(var(--watchlist-text-primary))'
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ pointerEvents: 'none' }}
              >
                <line x1="12" y1="5" x2="12" y2="5.01"></line>
                <line x1="12" y1="12" x2="12" y2="12.01"></line>
                <line x1="12" y1="19" x2="12" y2="19.01"></line>
                <line x1="7" y1="5" x2="7" y2="5.01"></line>
                <line x1="7" y1="12" x2="7" y2="12.01"></line>
                <line x1="7" y1="19" x2="7" y2="19.01"></line>
                <line x1="17" y1="5" x2="17" y2="5.01"></line>
                <line x1="17" y1="12" x2="17" y2="12.01"></line>
                <line x1="17" y1="19" x2="17" y2="19.01"></line>
              </svg>
            </span>
          )}
        </td>
      )}
      
      {/* Symbol */}
      <td
        className="symbol"
        onClick={(e) => {
          if (reorderMode) return
          e.stopPropagation()
          // Only set highlight if not already highlighted (don't toggle)
          if (!isHighlighted) {
            onRowClick()
          }
          // Send to TradingView
          onSymbolClick()
        }}
        style={{ cursor: reorderMode ? 'move' : 'pointer' }}
      >
        <span style={{ 
          cursor: reorderMode ? 'move' : 'pointer'
        }}>
          {stock.symbol}
        </span>
      </td>

      {/* News - Shows indicator for news */}
      <td
        className="news"
        style={{ cursor: reorderMode ? 'move' : 'pointer' }}
        onClick={(e) => {
          if (reorderMode) {
            e.stopPropagation()
            e.preventDefault()
          }
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          justifyContent: 'center',
          height: '28px',
          maxHeight: '28px',
          overflow: 'hidden'
        }}>
          {/* Unified News Indicator */}
          <NewsIndicator
            news={rssNewsMeta?.latestArticle || null}
            newsCount={rssNewsMeta?.count || 0}
            fmpNewsCount={newsMeta?.count || 0}
            onNewsClick={reorderMode ? undefined : handleNewsClick}
            fetchFMPArticles={fetchArticles}
            prefetchArticles={reorderMode ? undefined : async () => { prefetchRSSArticles?.(symbol) }}
            symbol={symbol}
            allArticles={rssArticles}
          />
        </div>
      </td>
      
      {/* Last Trade (Price) */}
      <td className="price">
        {formatNumber(stock.price)}
      </td>

      {/* Extended Hours */}
      {showExtendedHours && (
        <td className="price" style={{ whiteSpace: 'nowrap' }}>
          {extendedHoursQuote ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                whiteSpace: 'nowrap'
              }}
            >
              <span>{formatNumber(extendedHoursQuote.price)}</span>
              <span
                style={{
                  fontSize: '0.85em',
                  color: extendedHoursChangePercent >= 0 ? '#008f3b' : 'rgb(var(--watchlist-change-negative))'
                }}
              >
                ({extendedHoursPercentDisplay})
              </span>
            </div>
          ) : (
            <span style={{ color: '#999', fontSize: '0.85em' }}>N/A</span>
          )}
        </td>
      )}

      {/* Change */}
      <td className="change" style={{ color: isPositive ? '#008f3b' : 'rgb(var(--watchlist-change-negative))' }}>
        {isPositive && '+'}{formatNumber(stock.change)}
      </td>

      {/* Change % */}
      <td className="change" style={{ color: isPositive ? '#008f3b' : 'rgb(var(--watchlist-change-negative))' }}>
        {formatNumber(Math.abs(stock.changePercent))}%
      </td>
      
      {/* Bid */}
      <td className="price">
        {formatNumber(stock.bid)}
      </td>

      {/* Ask */}
      <td className="price">
        {formatNumber(stock.ask)}
      </td>
      
      {/* Volume */}
      <td className="volume">
        {formatLargeNumber(stock.volume)}
      </td>
      
      {/* Low */}
      <td className="price">
        {formatNumber(stock.dayLow)}
      </td>
      
      {/* High */}
      <td className="price">
        {formatNumber(stock.dayHigh)}
      </td>
      
      {/* Market Cap */}
      <td className="volume">
        {formatLargeNumber(stock.marketCap)}
      </td>
      
      {/* P/E Ratio */}
      <td className="price">
        {stock.peRatio ? formatNumber(stock.peRatio) : 'N/A'}
      </td>
      
      {/* Ex-Date */}
      <td>
        {!stock ? (
          // Stock data not loaded yet
          <span style={{ fontWeight: 300, color: '#999' }}>...</span>
        ) : stock?.exDividendDate === undefined ? (
          // Dividend data loading
          <span style={{ fontWeight: 300, color: '#666' }}>...</span>
        ) : stock?.exDividendDate ? (
          // Dividend data loaded
          formatExDate(stock.exDividendDate)
        ) : (
          // No dividend
          <span style={{ fontWeight: 300 }}>– –</span>
        )}
      </td>
      
      {/* EPS (ttm) */}
      <td className="price">
        {stock.eps ? formatNumber(stock.eps) : 'N/A'}
      </td>
      
      {/* Div Yield */}
      <td>
        {!stock ? (
          // Stock data not loaded yet
          <span style={{ fontWeight: 300, color: '#999' }}>...</span>
        ) : stock?.dividendYield === undefined ? (
          // Dividend data loading
          <span style={{ fontWeight: 300, color: '#666' }}>...</span>
        ) : stock?.dividendYield === null || stock?.dividendYield === 0 ? (
          // No dividend
          <span style={{ fontWeight: 300 }}>– –</span>
        ) : (
          // Dividend data loaded
          <span style={{ fontWeight: 600 }}>
            {formatDividendYield(stock?.dividendYield, stock?.yieldBasis)}
          </span>
        )}
      </td>
      
      {/* Name */}
      <td className="name">
        {stock.name}
      </td>
      
    </tr>
  )
  
  // Render modals using React Portal to avoid HTML nesting issues
  const modals = (
    <>
      {showNewsModal && typeof document !== 'undefined' && createPortal(
        <NewsModal
          isOpen={showNewsModal}
          onClose={() => setShowNewsModal(false)}
          symbol={symbol}
          articles={newsArticles}
          loading={loadingArticles}
        />,
        document.body
      )}
      
      {showAnalystModal && typeof document !== 'undefined' && createPortal(
        <AnalystModal
          isOpen={showAnalystModal}
          onClose={() => setShowAnalystModal(false)}
          symbol={symbol}
          changes={analystChanges}
          loading={loadingAnalyst}
        />,
        document.body
      )}
    </>
  )
  
  return (
    <>
      {tableRow}
      {modals}
    </>
  )
}, (prevProps, nextProps) => {
  // Custom comparison for memo - only re-render if important data changes
  return (
    prevProps.symbol === nextProps.symbol &&
    prevProps.stock?.price === nextProps.stock?.price &&
    prevProps.stock?.change === nextProps.stock?.change &&
    prevProps.stock?.changePercent === nextProps.stock?.changePercent &&
    prevProps.stock?.volume === nextProps.stock?.volume &&
    prevProps.stock?.lastUpdated === nextProps.stock?.lastUpdated &&
    prevProps.stock?.exDividendDate === nextProps.stock?.exDividendDate &&
    prevProps.stock?.dividendYield === nextProps.stock?.dividendYield &&
    prevProps.stock?.news?.id === nextProps.stock?.news?.id &&
    prevProps.stock?.newsCount === nextProps.stock?.newsCount &&
    prevProps.stock?.extendedHoursQuote?.price === nextProps.stock?.extendedHoursQuote?.price &&
    prevProps.stock?.extendedHoursQuote?.change === nextProps.stock?.extendedHoursQuote?.change &&
    prevProps.stock?.extendedHoursQuote?.changePercent === nextProps.stock?.extendedHoursQuote?.changePercent &&
    prevProps.newsMeta?.hasNews === nextProps.newsMeta?.hasNews &&
    prevProps.newsMeta?.count === nextProps.newsMeta?.count &&
    prevProps.rssNewsMeta?.count === nextProps.rssNewsMeta?.count &&
    prevProps.rssNewsMeta?.symbol === nextProps.rssNewsMeta?.symbol &&
    prevProps.analystMeta?.hasAnalystData === nextProps.analystMeta?.hasAnalystData &&
    prevProps.analystMeta?.upgrades === nextProps.analystMeta?.upgrades &&
    prevProps.analystMeta?.downgrades === nextProps.analystMeta?.downgrades &&
    prevProps.analystMeta?.initiations === nextProps.analystMeta?.initiations &&
    prevProps.isHighlighted === nextProps.isHighlighted &&
    prevProps.deleteMode === nextProps.deleteMode &&
    prevProps.reorderMode === nextProps.reorderMode &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isDragging === nextProps.isDragging &&
    prevProps.isDropTarget === nextProps.isDropTarget &&
    prevProps.dropPosition === nextProps.dropPosition &&
    prevProps.showExtendedHours === nextProps.showExtendedHours
  )
})

export default StockRow
