import { useState, useEffect, useCallback } from 'react'
import { DividendData, UnifiedStockResponse } from '@watchlist/types'

export function useDividendData(symbols: string[]) {
  const [dividendData, setDividendData] = useState<Map<string, DividendData>>(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Fetch dividend data when symbols change
  useEffect(() => {
    
    if (symbols.length === 0) {
      return
    }
    
    
    const fetchDividendData = async () => {
      setIsLoading(true)
      setError(null)
      
      try {
        // Use the new consolidated endpoint for dividends
        const url = `/api/stocks/data?symbols=${symbols.join(',')}&include=dividends`;
        
        // Force a server log by adding a header
        const response = await fetch(url, {
          headers: {
            'X-Debug': 'dividend-fetch'
          }
        })
        
        if (!response.ok) {
          throw new Error('Failed to fetch dividend data')
        }
        
        const result: UnifiedStockResponse = await response.json()
        
        // Handle any warnings from the API
        if (result.status.warnings.length > 0) {
          console.warn('Dividend API warnings:', result.status.warnings)
        }
        
        // Convert to Map with proper DividendData structure
        const newDividendData = new Map<string, DividendData>()
        
        if (result.data.dividends) {
          Object.entries(result.data.dividends).forEach(([symbol, dividend]) => {
            newDividendData.set(symbol, dividend)
          })
        } else {
          // If no dividend data returned, set defaults
          symbols.forEach(symbol => {
            newDividendData.set(symbol, {
              symbol,
              dividendYield: null,
              exDividendDate: null,
              yieldBasis: 'unknown',
              lastUpdated: result.status.timestamp
            })
          })
        }
        
        setDividendData(newDividendData)
      } catch (err) {
        console.error('Error fetching dividend data:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch dividend data')
      } finally {
        setIsLoading(false)
      }
    }
    
    fetchDividendData()
  }, [symbols.join(',')])
  
  return {
    dividendData,
    isLoading,
    error
  }
}