import { useRef, useCallback, useEffect, useState } from 'react'
import { useStatus } from '@watchlist/contexts/StatusContext'
import { useSymbolMapping } from '@watchlist/hooks/useSymbolMapping'

export function useTradingView() {
  const tvWindowRef = useRef<Window | null>(null)
  const { showStatus, clearStatus } = useStatus()
  const [pendingSymbol, setPendingSymbol] = useState<string | null>(null)
  const { mapping, loading: mappingLoading } = useSymbolMapping(pendingSymbol)
  
  // Check if our reference is still valid every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (tvWindowRef.current && tvWindowRef.current.closed) {
        tvWindowRef.current = null
      }
    }, 5000)
    
    return () => clearInterval(interval)
  }, [])
  
  // Core function to open chart with a specific symbol
  const openChartWithSymbol = useCallback((tvSymbol: string) => {
    // Case 1: We have a valid reference - use it directly (no focus change!)
    if (tvWindowRef.current && !tvWindowRef.current.closed) {
      tvWindowRef.current.postMessage({
        name: 'tv-widget-set-symbol',
        symbol: tvSymbol
      }, '*')
      
      // Small focus nudge to keep watchlist active (best effort)
      setTimeout(() => window.focus(), 10)
      return
    }
    
    // Case 2: No reference or tab was closed - need to create/get window
    
    // Build URL with symbol
    const url = `https://www.tradingview.com/chart/?symbol=${tvSymbol}`
    
    // This will either:
    // - Create a new tab (if none exists)
    // - Get existing tab and navigate it (if one exists with this name)
    // Both cases will steal focus unfortunately
    const tvWindow = window.open(url, 'tvChartWindow')
    
    if (tvWindow) {
      // Save reference for next time
      tvWindowRef.current = tvWindow
      
      // Try to return focus to watchlist
      // Longer delay for new windows
      setTimeout(() => {
        window.focus()
      }, 100)
      
      // Send symbol after page loads
      setTimeout(() => {
        if (tvWindow && !tvWindow.closed) {
          tvWindow.postMessage({
            name: 'tv-widget-set-symbol',
            symbol: tvSymbol
          }, '*')
        }
      }, 1000)
    } else {
      showStatus('Please allow popups to open TradingView charts', true)
    }
  }, [showStatus])
  
  // When mapping is loaded (or not found), open the chart
  useEffect(() => {
    if (!pendingSymbol) return
    
    // If we're still loading the mapping, wait
    if (mappingLoading) return
    
    if (mapping) {
      // Use mapped TV symbol
      const tvSymbol = mapping.tvSymbol
      openChartWithSymbol(tvSymbol)
    } else {
      // No mapping found, use raw symbol
      openChartWithSymbol(pendingSymbol)
    }
    
    // Clear pending symbol after handling
    setPendingSymbol(null)
  }, [mapping, mappingLoading, pendingSymbol, openChartWithSymbol])
  
  // Public API - trigger symbol lookup and chart opening
  const sendSymbolToTradingView = useCallback((symbol: string) => {
    // Set pending symbol to trigger mapping lookup
    setPendingSymbol(symbol)
  }, [])
  
  return {
    sendSymbolToTradingView,
    clearStatus
  }
}