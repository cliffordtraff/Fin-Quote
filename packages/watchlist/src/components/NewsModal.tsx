'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface NewsArticle {
  title: string
  url: string
  source: string
  publishedAt: string
  summary: string
}

interface NewsModalProps {
  isOpen: boolean
  onClose: () => void
  symbol: string
  articles: NewsArticle[]
  loading?: boolean
}

export default function NewsModal({ isOpen, onClose, symbol, articles, loading = false }: NewsModalProps) {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  const colors = isDark
    ? {
        modalBg: 'rgb(var(--watchlist-surface))',
        modalBorder: '#374151',
        headerBg: 'rgb(var(--watchlist-surface-elevated))',
        headerText: '#e5e7eb',
        closeDefault: '#9ca3af',
        closeHover: '#f9fafb',
        bodyText: '#d1d5db',
        mutedText: '#9ca3af',
        headline: '#bfdbfe',
        cardBorder: '#374151',
        cardHover: 'rgba(59, 130, 246, 0.15)'
      }
    : {
        modalBg: '#ffffff',
        modalBorder: '#e0e0e0',
        headerBg: '#ffffff',
        headerText: '#333333',
        closeDefault: '#666666',
        closeHover: '#000000',
        bodyText: '#444444',
        mutedText: '#666666',
        headline: '#0047AB',
        cardBorder: '#e0e0e0',
        cardHover: '#f5f5f5'
      }

  const modalContent = (
    <>
      {/* Backdrop */}
      <div 
        className="news-modal-backdrop"
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 1000,
          cursor: 'pointer'
        }}
      />
      
      {/* Modal */}
      <div 
        className="news-modal"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: colors.modalBg,
          border: `1px solid ${colors.modalBorder}`,
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
          maxWidth: '600px',
          width: '90%',
          maxHeight: '70vh',
          zIndex: 1001,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${colors.modalBorder}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: colors.headerBg,
          color: colors.headerText
        }}>
          <h2 style={{ 
            margin: 0, 
            fontSize: '20px',
            fontWeight: 'bold',
            color: colors.headerText
          }}>
            {symbol} News
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: colors.closeDefault,
              padding: '0 4px',
              lineHeight: 1
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = colors.closeHover
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = colors.closeDefault
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{
          padding: '20px',
          overflowY: 'auto',
          flex: 1
        }}>
          {loading ? (
            <p style={{ color: colors.mutedText, textAlign: 'center' }}>
              Loading news for {symbol}...
            </p>
          ) : articles.length === 0 ? (
            <p style={{ color: colors.mutedText, textAlign: 'center' }}>
              No news available for {symbol}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {articles.map((article, idx) => (
                <div 
                  key={idx}
                  style={{
                    padding: '12px',
                    border: `1px solid ${colors.cardBorder}`,
                    borderRadius: '6px',
                    transition: 'background 0.2s',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = colors.cardHover
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                  onClick={() => {
                    if (article.url && article.url !== '#') {
                      window.open(article.url, '_blank')
                    }
                  }}
                >
                  <h3 style={{
                    margin: '0 0 8px 0',
                    fontSize: '16px',
                    color: colors.headline,
                    fontWeight: 'normal'
                  }}>
                    {article.title}
                  </h3>
                  
                  <div style={{
                    display: 'flex',
                    gap: '12px',
                    fontSize: '13px',
                    color: colors.mutedText
                  }}>
                    <span>{article.source}</span>
                    {article.publishedAt && (
                      <span>{new Date(article.publishedAt).toLocaleDateString()}</span>
                    )}
                  </div>
                  
                  {article.summary && (
                    <p style={{
                      margin: '8px 0 0 0',
                      fontSize: '14px',
                      color: colors.bodyText,
                      lineHeight: 1.4
                    }}>
                      {article.summary.slice(0, 150)}
                      {article.summary.length > 150 && '...'}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )

  // Render modal using Portal to avoid HTML structure issues
  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body)
  }

  return null
}
