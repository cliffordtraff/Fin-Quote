'use client'

import { useState, useEffect } from 'react'

interface AnalystChange {
  symbol: string
  publishedDate: string
  newsURL: string
  newsTitle: string
  newsBaseURL: string
  newsPublisher?: string
  analystName?: string
  priceWhenPosted: number
  newGrade: string
  previousGrade: string
  gradingCompany: string
  action: string
  priceTarget?: number
  previousPriceTarget?: number
}

interface AnalystModalProps {
  isOpen: boolean
  onClose: () => void
  symbol: string
  changes?: AnalystChange[]
  loading?: boolean
}

export default function AnalystModal({ 
  isOpen, 
  onClose, 
  symbol,
  changes = [],
  loading = false
}: AnalystModalProps) {
  if (!isOpen) return null

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`
    return formatDate(dateStr)
  }

  const getActionColor = (action: string) => {
    const actionLower = action?.toLowerCase()
    if (actionLower === 'upgrade' || actionLower === 'up') return '#16a34a'
    if (actionLower === 'downgrade' || actionLower === 'down') return '#dc2626'
    if (actionLower === 'init' || actionLower === 'initiated') return '#2563eb'
    return '#6b7280'
  }

  const getActionLabel = (action: string) => {
    const actionLower = action?.toLowerCase()
    if (actionLower === 'upgrade' || actionLower === 'up') return 'Upgraded'
    if (actionLower === 'downgrade' || actionLower === 'down') return 'Downgraded'
    if (actionLower === 'init' || actionLower === 'initiated') return 'Initiated'
    if (actionLower === 'reit' || actionLower === 'reiterated') return 'Reiterated'
    if (actionLower === 'main' || actionLower === 'maintained') return 'Maintained'
    if (actionLower === 'hold') return 'Hold'
    return action
  }

  const formatPriceTarget = (current?: number, previous?: number) => {
    if (!current && !previous) return null
    
    const formatPrice = (price: number) => `$${price.toFixed(0)}`
    
    if (current && previous && current !== previous) {
      const change = current - previous
      const changePercent = ((change / previous) * 100).toFixed(1)
      const isIncrease = change > 0
      return (
        <span>
          {formatPrice(current)} 
          <span style={{ 
            color: isIncrease ? '#4ade80' : '#f87171',
            fontSize: '12px',
            marginLeft: '6px'
          }}>
            ({isIncrease ? '+' : ''}{changePercent}% from {formatPrice(previous)})
          </span>
        </span>
      )
    }
    
    if (current) {
      return <span>{formatPrice(current)}</span>
    }
    
    return null
  }

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(4px)'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          width: '90%',
          maxWidth: '700px',
          maxHeight: '80vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid #e0e0e0',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '20px',
          borderBottom: '1px solid #e0e0e0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#f8f8f8'
        }}>
          <h2 style={{
            margin: 0,
            fontSize: '20px',
            fontWeight: '600',
            color: '#000'
          }}>
            Analyst Ratings - {symbol}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#666',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#e0e0e0'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px'
        }}>
          {loading ? (
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center',
              minHeight: '200px',
              color: '#666'
            }}>
              <div>Loading analyst ratings...</div>
            </div>
          ) : changes.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              color: '#666',
              padding: '40px 20px'
            }}>
              No recent analyst ratings available
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {changes.map((change, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderBottom: index < changes.length - 1 ? '1px solid #f0f0f0' : 'none',
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
                      {formatTimeAgo(change.publishedDate)}
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
                      color: getActionColor(change.action),
                      fontSize: '13px',
                      fontWeight: '600',
                      minWidth: '80px'
                    }}>
                      {getActionLabel(change.action)}
                    </span>

                    {/* Rating Change */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '13px'
                    }}>
                      {change.previousGrade && change.previousGrade !== 'None' ? (
                        <>
                          <span style={{ color: '#888' }}>
                            {change.previousGrade}
                          </span>
                          <span style={{ color: '#666' }}>→</span>
                          <span style={{ color: '#000', fontWeight: '500' }}>
                            {change.newGrade}
                          </span>
                        </>
                      ) : (
                        <span style={{ color: '#000', fontWeight: '500' }}>
                          {change.newGrade}
                        </span>
                      )}
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
          )}
        </div>
      </div>
    </div>
  )
}