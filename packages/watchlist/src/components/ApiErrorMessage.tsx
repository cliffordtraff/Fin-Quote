'use client'

import { useState, useEffect } from 'react'

interface ApiError {
  type: 'API_ERROR' | 'CONFIGURATION_ERROR' | 'RATE_LIMIT' | 'NETWORK_ERROR' | 'VALIDATION_ERROR'
  message: string
  details?: string
  retryAfter?: number
  timestamp: string
}

interface ApiErrorMessageProps {
  error: ApiError | string | null
  onRetry?: () => void
  className?: string
}

export default function ApiErrorMessage({ error, onRetry, className = '' }: ApiErrorMessageProps) {
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null)

  // Parse error if it's a string
  const errorObj: ApiError | null = error ? (
    typeof error === 'string' 
      ? { type: 'API_ERROR', message: error, timestamp: new Date().toISOString() }
      : error
  ) : null

  // Handle retry countdown
  useEffect(() => {
    if (errorObj?.retryAfter && errorObj.retryAfter > 0) {
      setRetryCountdown(errorObj.retryAfter)
      
      const interval = setInterval(() => {
        setRetryCountdown(prev => {
          if (prev === null || prev <= 1) {
            clearInterval(interval)
            return null
          }
          return prev - 1
        })
      }, 1000)

      return () => clearInterval(interval)
    } else {
      setRetryCountdown(null)
    }
  }, [errorObj?.retryAfter])

  if (!errorObj) return null

  // Get user-friendly message based on error type
  const getUserMessage = () => {
    switch (errorObj.type) {
      case 'CONFIGURATION_ERROR':
        return {
          title: 'Market Data Not Configured',
          message: 'Real-time stock data is not available. The application needs to be configured with an API key.',
          icon: '⚙️',
          showRetry: false
        }
      
      case 'RATE_LIMIT':
        return {
          title: 'Rate Limit Exceeded',
          message: retryCountdown 
            ? `Too many requests. Please wait ${retryCountdown} seconds before refreshing.`
            : 'Too many requests. Please wait before refreshing.',
          icon: '⏱️',
          showRetry: !retryCountdown
        }
      
      case 'NETWORK_ERROR':
        return {
          title: 'Connection Error',
          message: 'Unable to connect to market data service. Please check your internet connection.',
          icon: '🔌',
          showRetry: true
        }
      
      case 'VALIDATION_ERROR':
        return {
          title: 'Invalid Request',
          message: errorObj.details || errorObj.message,
          icon: '⚠️',
          showRetry: false
        }
      
      case 'API_ERROR':
      default:
        return {
          title: 'Market Data Unavailable',
          message: errorObj.details || 'The market data service is temporarily unavailable. Please try again later.',
          icon: '📊',
          showRetry: true
        }
    }
  }

  const { title, message, icon, showRetry } = getUserMessage()

  return (
    <div 
      className={`api-error-message ${className}`}
      style={{
        background: '#fff3cd',
        border: '1px solid #ffc107',
        borderRadius: '8px',
        padding: '16px',
        margin: '16px 0',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}
    >
      <span style={{ fontSize: '24px' }}>{icon}</span>
      
      <div style={{ flex: 1 }}>
        <h4 style={{ 
          margin: '0 0 4px 0', 
          fontSize: '16px', 
          fontWeight: 600,
          color: '#856404'
        }}>
          {title}
        </h4>
        <p style={{ 
          margin: 0, 
          fontSize: '14px',
          color: '#856404'
        }}>
          {message}
        </p>
      </div>

      {showRetry && onRetry && (
        <button
          onClick={onRetry}
          disabled={retryCountdown !== null}
          style={{
            padding: '8px 16px',
            background: retryCountdown ? '#e0e0e0' : '#ffc107',
            border: 'none',
            borderRadius: '4px',
            fontWeight: 500,
            cursor: retryCountdown ? 'not-allowed' : 'pointer',
            color: retryCountdown ? '#999' : '#000',
            transition: 'background 0.2s'
          }}
          onMouseEnter={(e) => {
            if (!retryCountdown) {
              e.currentTarget.style.background = '#ffb300'
            }
          }}
          onMouseLeave={(e) => {
            if (!retryCountdown) {
              e.currentTarget.style.background = '#ffc107'
            }
          }}
        >
          {retryCountdown ? `Wait ${retryCountdown}s` : 'Retry'}
        </button>
      )}
    </div>
  )
}