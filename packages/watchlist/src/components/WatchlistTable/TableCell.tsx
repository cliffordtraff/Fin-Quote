'use client'

import { memo, CSSProperties } from 'react'
import { MergedStock } from '@watchlist/types'
import NewsIndicator from '@watchlist/components/NewsIndicator'

const SYMBOL_HEADER_LABEL = 'Symbol'
const DIVIDEND_YIELD_HEADER_LABEL = 'Div Yield'

interface TableCellProps {
  style: CSSProperties // Positioning from react-window
  columnKey: string
  rowData: MergedStock | null
  isHeader?: boolean
  isHighlighted?: boolean
  isSelected?: boolean
  deleteMode?: boolean
  reorderMode?: boolean
  newsMeta?: { count: number; loading?: boolean }
  rssNewsMeta?: { count: number; loading?: boolean }
  analystMeta?: { count: number; loading?: boolean }
  allArticles?: any[]
  onCellClick?: () => void
  onCheckboxChange?: (checked: boolean) => void
  onNewsClick?: () => void
}

// Helper: Format numbers
function formatNumber(num: number | null | undefined, decimals = 2): string {
  if (num === null || num === undefined) return 'N/A'
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
}

// Helper: Format large numbers
function formatLargeNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return 'N/A'

  if (num >= 1e9) {
    const billions = num / 1e9
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

// Helper: Format date
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

const TableCell = memo(function TableCell({
  style,
  columnKey,
  rowData,
  isHeader = false,
  isHighlighted = false,
  isSelected = false,
  deleteMode = false,
  reorderMode = false,
  newsMeta,
  rssNewsMeta,
  analystMeta,
  allArticles = [],
  onCellClick,
  onCheckboxChange,
  onNewsClick
}: TableCellProps) {
  // Base cell styles
  const cellStyle: CSSProperties = {
    ...style,
    padding: '8px',
    borderBottom: '1px solid #e0e0e0',
    borderRight: '1px solid #f0f0f0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    backgroundColor: isHighlighted ? '#fffacd' : isSelected ? '#e3f2fd' : 'white',
    cursor: onCellClick ? 'pointer' : 'default',
    fontSize: '14px'
  }

  // Header cell
  if (isHeader) {
    return (
      <div style={{ ...cellStyle, fontWeight: 'bold', backgroundColor: '#f8f9fa' }}>
        {getColumnLabel(columnKey)}
      </div>
    )
  }

  // Data cell
  if (!rowData) {
    return <div style={cellStyle}>...</div>
  }

  const isPositive = rowData.change >= 0
  const changeColor = isPositive ? '#008f3b' : '#d60000'

  // Render content based on column
  let content: React.ReactNode = null
  let cellAlign: 'left' | 'right' | 'center' = 'right'

  switch (columnKey) {
    case 'control':
      // Control column for delete/reorder mode
      if (deleteMode) {
        content = (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation()
              onCheckboxChange?.(e.target.checked)
            }}
            style={{
              cursor: 'pointer',
              width: '18px',
              height: '18px',
              margin: 0
            }}
            onClick={(e) => e.stopPropagation()}
          />
        )
        cellAlign = 'center'
      } else if (reorderMode) {
        content = (
          <span style={{ fontSize: '18px', cursor: 'grab' }}>
            ☰
          </span>
        )
        cellAlign = 'center'
      }
      break

    case 'symbol':
      content = rowData.symbol
      cellAlign = 'left'
      break

    case 'news':
      const totalNewsCount = (newsMeta?.count || 0) + (rssNewsMeta?.count || 0)
      const totalAnalystCount = analystMeta?.count || 0

      content = (
        <NewsIndicator
          news={null}
          newsCount={totalNewsCount}
          fmpNewsCount={totalNewsCount}
          onNewsClick={onNewsClick || (() => {})}
          symbol={rowData.symbol}
          allArticles={allArticles}
        />
      )
      cellAlign = 'center'
      break

    case 'lastTrade':
      content = formatNumber(rowData.price)
      break

    case 'change':
      content = (
        <span style={{ color: changeColor }}>
          {isPositive && '+'}{formatNumber(rowData.change)}
        </span>
      )
      break

    case 'changePercent':
      content = (
        <span style={{ color: changeColor }}>
          {formatNumber(Math.abs(rowData.changePercent))}%
        </span>
      )
      break

    case 'bid':
      content = formatNumber(rowData.bid)
      break

    case 'ask':
      content = formatNumber(rowData.ask)
      break

    case 'volume':
      content = formatLargeNumber(rowData.volume)
      break

    case 'low':
      content = formatNumber(rowData.dayLow)
      break

    case 'high':
      content = formatNumber(rowData.dayHigh)
      break

    case 'marketCap':
      content = formatLargeNumber(rowData.marketCap)
      break

    case 'peRatio':
      content = rowData.peRatio ? formatNumber(rowData.peRatio) : 'N/A'
      break

    case 'exDate':
      content = rowData.exDividendDate === undefined ? (
        <span style={{ fontWeight: 300, color: '#666' }}>...</span>
      ) : rowData.exDividendDate ? (
        formatExDate(rowData.exDividendDate)
      ) : (
        <span style={{ fontWeight: 300 }}>– –</span>
      )
      break

    case 'eps':
      content = rowData.eps ? formatNumber(rowData.eps) : 'N/A'
      break

    case 'divYield':
      content = rowData.dividendYield === undefined ? (
        <span style={{ fontWeight: 300, color: '#666' }}>...</span>
      ) : rowData.dividendYield === null || rowData.dividendYield === 0 ? (
        <span style={{ fontWeight: 300 }}>– –</span>
      ) : (
        <span style={{ color: '#000000', fontWeight: 600 }}>
          {formatNumber(rowData.dividendYield, 2)}%
        </span>
      )
      break

    case 'name':
      content = rowData.name
      cellAlign = 'left'
      break

    default:
      content = 'N/A'
  }

  return (
    <div
      style={{ ...cellStyle, justifyContent: cellAlign === 'left' ? 'flex-start' : cellAlign === 'right' ? 'flex-end' : 'center' }}
      onClick={onCellClick}
    >
      {content}
    </div>
  )
})

// Helper function for column labels
function getColumnLabel(columnKey: string): string {
  const labels: { [key: string]: string } = {
    symbol: SYMBOL_HEADER_LABEL,
    news: 'News',
    lastTrade: 'Last Trade',
    change: 'Change',
    changePercent: '%',
    bid: 'Bid',
    ask: 'Ask',
    volume: 'Volume',
    low: 'Low',
    high: 'High',
    marketCap: 'M. Cap',
    peRatio: 'P/E (ttm)',
    exDate: 'Ex-Date',
    eps: 'EPS (ttm)',
    divYield: DIVIDEND_YIELD_HEADER_LABEL,
    name: 'Description'
  }
  return labels[columnKey] || columnKey
}

export default TableCell
