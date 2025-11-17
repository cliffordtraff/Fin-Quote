'use client'

import { useEffect, useState } from 'react'
import { getMarketStatus, formatMarketStatus, MarketStatus } from '@watchlist/utils/marketHours'

export default function MarketStatusIndicator() {
  const [status, setStatus] = useState<MarketStatus>(getMarketStatus())
  
  useEffect(() => {
    const updateStatus = () => {
      setStatus(getMarketStatus())
    }
    
    // Update immediately
    updateStatus()
    
    // Update every minute
    const interval = setInterval(updateStatus, 60000)
    
    return () => clearInterval(interval)
  }, [])
  
  const getStatusColor = () => {
    if (status.isOpen) return '#00c853'
    if (status.isPreMarket || status.isAfterHours) return '#ffa000'
    return '#d32f2f'
  }
  
  const getStatusBackground = () => {
    if (status.isOpen) return 'rgba(0, 200, 83, 0.1)'
    if (status.isPreMarket || status.isAfterHours) return 'rgba(255, 160, 0, 0.1)'
    return 'rgba(211, 47, 47, 0.1)'
  }
  
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '6px 12px',
      borderRadius: '6px',
      background: getStatusBackground(),
      border: `1px solid ${getStatusColor()}`,
      fontSize: '14px',
      fontWeight: 500,
      color: getStatusColor(),
      marginLeft: '12px'
    }}>
      <span style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: getStatusColor(),
        marginRight: '8px',
        animation: status.isOpen ? 'pulse 2s infinite' : 'none'
      }} />
      {formatMarketStatus(status)}
      
      {status.nextOpenTime && !status.isOpen && (
        <span style={{ 
          marginLeft: '8px', 
          opacity: 0.8,
          fontSize: '13px'
        }}>
          ({new Date(status.nextOpenTime).toLocaleString('en-US', {
            weekday: 'short',
            hour: 'numeric',
            minute: '2-digit'
          })})
        </span>
      )}
      
      <style jsx>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.6; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  )
}