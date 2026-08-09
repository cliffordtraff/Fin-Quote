'use server'

import { FMPProvider } from '@/lib/providers/fmp'
import type { QuoteRequestOptions } from '@/lib/providers/types'
import { safeErrorMessage } from '@/lib/safe-logging'
import {
  FOREX_BOND_PANEL,
  normalizeCompleteForexBondPanel,
  type ForexBondPanelRow,
} from '@/lib/forex-bonds-panel'

export type ForexBondData = ForexBondPanelRow

export interface ForexBondDataWithYTD extends ForexBondData {
  ytdChangePercent?: number
}

export async function getForexBondsData(
  options: QuoteRequestOptions = {},
): Promise<{ forexBonds: ForexBondData[] } | { error: string }> {
  try {
    // This mixed panel needs FX and treasury-yield quotes together.
    // The Massive provider path does not yet normalize the symbols
    // used here, so keep this widget on FMP until that mapping is implemented.
    const provider = new FMPProvider()
    const symbols = FOREX_BOND_PANEL.map(f => f.symbol)
    const quotes = await provider.getQuotes(symbols, options)
    const forexBonds = normalizeCompleteForexBondPanel(quotes)
    if (!forexBonds) {
      return { error: 'Incomplete forex/bonds data' }
    }

    return { forexBonds }
  } catch (error) {
    options.signal?.throwIfAborted()
    console.error('Error fetching forex/bonds data:', safeErrorMessage(error))
    return { error: 'Failed to load forex/bonds data' }
  }
}

/**
 * Fetch forex/bonds data with YTD change percentage
 */
export async function getForexBondsWithYTD(): Promise<{ forexBonds: ForexBondDataWithYTD[] } | { error: string }> {
  // Get start of year date
  const currentYear = new Date().getFullYear()
  const yearStart = `${currentYear}-01-01`

  try {
    const provider = new FMPProvider()
    const symbols = FOREX_BOND_PANEL.map(f => f.symbol)
    const quotes = await provider.getQuotes(symbols)

    const forexBondsData = await Promise.all(
      FOREX_BOND_PANEL.map(async ({ symbol, name }) => {
        const quote = quotes.find(q => q.symbol === symbol)
        if (!quote) return null

        // Fetch YTD historical data via provider
        let ytdChangePercent: number | undefined

        try {
          const candles = await provider.getHistoricalDaily(symbol, yearStart)

          if (candles.length >= 2) {
            // Candles come newest-first: [0] is latest, [length-1] is oldest
            const firstClose = candles[candles.length - 1].close
            const lastClose = candles[0].close
            ytdChangePercent = ((lastClose - firstClose) / firstClose) * 100
          }
        } catch (histError) {
          console.error(`Failed to fetch YTD history for ${symbol}:`, histError)
        }

        return {
          symbol,
          name,
          price: quote.price,
          change: quote.change,
          changesPercentage: quote.changesPercentage,
          ytdChangePercent
        } as ForexBondDataWithYTD
      })
    )

    const validData = forexBondsData.filter((f): f is ForexBondDataWithYTD => f !== null)

    return { forexBonds: validData }
  } catch (error) {
    console.error('Error fetching forex/bonds data with YTD:', safeErrorMessage(error))
    return { error: 'Failed to load forex/bonds data' }
  }
}
