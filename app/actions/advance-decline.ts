'use server'

import * as fs from 'fs/promises'
import * as path from 'path'
import { unstable_cache } from 'next/cache'
import { getProvider } from '@/lib/providers'

export interface AdvanceDeclineSnapshot {
  timestamp: string // ISO timestamp
  time: string // HH:MM format for display
  advances: number
  declines: number
  unchanged: number
  advanceDeclineLine: number // advances - declines
  advanceDeclineRatio: number // advances / declines
}

interface SP500Constituent {
  symbol: string
  alternate_symbols: Record<string, string>
}

// Cache for constituent list
let cachedConstituents: SP500Constituent[] | null = null

async function getSP500Constituents(): Promise<SP500Constituent[]> {
  if (cachedConstituents) {
    return cachedConstituents
  }

  try {
    const filePath = path.join(process.cwd(), 'data', 'sp500-constituents.json')
    const content = await fs.readFile(filePath, 'utf-8')
    cachedConstituents = JSON.parse(content)
    return cachedConstituents!
  } catch (error) {
    console.error('Error loading S&P 500 constituents:', error)
    return []
  }
}

/**
 * Get a single snapshot of advance-decline data for the S&P 500
 * Returns the current count of advancing vs declining stocks
 */
async function loadAdvanceDeclineSnapshot(): Promise<{ data: AdvanceDeclineSnapshot } | { error: string }> {
  try {
    const constituents = await getSP500Constituents()

    if (constituents.length === 0) {
      return { error: 'Could not load S&P 500 constituents' }
    }

    // Get all symbols
    const symbols = constituents.map(c => {
      if (c.alternate_symbols?.fmp) {
        return c.alternate_symbols.fmp
      }
      return c.symbol
    })

    const provider = getProvider()
    const allQuotes = await provider.getQuotes(symbols)

    if (allQuotes.length === 0) {
      return { error: 'Could not fetch stock quotes' }
    }

    // Count advances, declines, unchanged
    let advances = 0
    let declines = 0
    let unchanged = 0

    for (const quote of allQuotes) {
      if (quote.change !== undefined && quote.change !== null) {
        if (quote.change > 0) {
          advances++
        } else if (quote.change < 0) {
          declines++
        } else {
          unchanged++
        }
      }
    }

    const now = new Date()
    const timestamp = now.toISOString()
    const time = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })

    return {
      data: {
        timestamp,
        time,
        advances,
        declines,
        unchanged,
        advanceDeclineLine: advances - declines,
        advanceDeclineRatio: declines > 0 ? advances / declines : advances,
      },
    }
  } catch (error) {
    console.error('Error fetching advance-decline data:', error)
    return { error: 'Failed to load advance-decline data' }
  }
}

const getCachedAdvanceDeclineSnapshot = unstable_cache(
  loadAdvanceDeclineSnapshot,
  ['sp500-advance-decline-snapshot-v1'],
  { revalidate: 120 },
)

export async function getAdvanceDeclineSnapshot(): Promise<{ data: AdvanceDeclineSnapshot } | { error: string }> {
  return getCachedAdvanceDeclineSnapshot()
}
