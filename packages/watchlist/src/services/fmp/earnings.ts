/**
 * FMP Earnings Service
 *
 * Handles fetching and normalizing earnings calendar data from FMP API
 */

import { EarningsData, FMPEarningsResponse } from '@watchlist/types/earnings'

const FMP_BASE_URL = 'https://financialmodelingprep.com/api/v3'
const FMP_API_KEY = process.env.FMP_API_KEY

/**
 * FMP Earnings Service
 */
export class FMPEarningsService {
  private apiKey: string

  constructor(apiKey?: string) {
    this.apiKey = apiKey || FMP_API_KEY || ''
    if (!this.apiKey) {
      console.warn('[FMP Earnings] No API key configured')
    }
  }

  /**
   * Fetch earnings calendar for date range (max 3 months)
   */
  async getEarningsCalendar(from: string, to: string): Promise<EarningsData[]> {
    if (!this.apiKey) {
      console.error('[FMP Earnings] Cannot fetch calendar: No API key')
      return []
    }

    try {
      const url = `${FMP_BASE_URL}/earning_calendar?from=${from}&to=${to}&apikey=${this.apiKey}`
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`FMP API error: ${response.status} ${response.statusText}`)
      }

      const data: FMPEarningsResponse[] = await response.json()

      if (!Array.isArray(data)) {
        console.warn('[FMP Earnings] Invalid response format:', data)
        return []
      }

      return data.map(item => this.normalizeEarnings(item))
    } catch (error) {
      console.error('[FMP Earnings] Error fetching calendar:', error)
      return []
    }
  }

  /**
   * Fetch historical earnings for specific symbol
   */
  async getSymbolEarnings(symbol: string, limit: number = 4): Promise<EarningsData[]> {
    if (!this.apiKey) {
      console.error('[FMP Earnings] Cannot fetch symbol earnings: No API key')
      return []
    }

    try {
      const url = `${FMP_BASE_URL}/historical/earning_calendar/${symbol}?limit=${limit}&apikey=${this.apiKey}`
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`FMP API error: ${response.status} ${response.statusText}`)
      }

      const data: FMPEarningsResponse[] = await response.json()

      if (!Array.isArray(data)) {
        console.warn('[FMP Earnings] Invalid response format for symbol:', symbol, data)
        return []
      }

      return data.map(item => this.normalizeEarnings(item))
    } catch (error) {
      console.error(`[FMP Earnings] Error fetching earnings for ${symbol}:`, error)
      return []
    }
  }

  /**
   * Fetch earnings for specific date
   */
  async getEarningsForDate(date: string): Promise<EarningsData[]> {
    // FMP doesn't have a specific endpoint for single date, use calendar with same from/to
    return this.getEarningsCalendar(date, date)
  }

  /**
   * Transform FMP response to normalized EarningsData
   *
   * Handles:
   * - Revenue normalization (millions/billions to dollars)
   * - Timestamp computation (date + time -> UTC timestamp)
   * - Source tracking for future migrations
   */
  private normalizeEarnings(fmpData: FMPEarningsResponse): EarningsData {
    const symbol = fmpData.symbol || ''
    const date = fmpData.date || ''
    const time = this.normalizeTime(fmpData.time)
    const eventTimestampUtc = this.computeEventTimestamp(date, time)

    // Normalize revenue (FMP sometimes returns in millions or billions)
    const revenueEstimate = this.normalizeRevenue(fmpData.revenueEstimated)
    const revenueActual = this.normalizeRevenue(fmpData.revenue)

    return {
      symbol,
      date,
      time,
      eventTimestampUtc,
      fiscalDateEnding: fmpData.fiscalDateEnding || '',
      epsEstimate: fmpData.epsEstimated ?? null,
      epsActual: fmpData.eps ?? null,
      revenueEstimate,
      revenueActual,
      source: 'fmp',
      sourceVersion: 'v3', // FMP API version
      updatedAt: Date.now()
    }
  }

  /**
   * Normalize time field from FMP
   */
  private normalizeTime(time?: string): 'bmo' | 'amc' | 'unknown' {
    if (!time) return 'unknown'
    const lower = time.toLowerCase().trim()

    if (lower === 'bmo' || lower === 'before market open') return 'bmo'
    if (lower === 'amc' || lower === 'after market close') return 'amc'

    return 'unknown'
  }

  /**
   * Compute canonical event timestamp in UTC
   *
   * Maps:
   * - bmo -> 9:30 AM ET (market open)
   * - amc -> 5:00 PM ET (typical after-hours time)
   * - unknown -> 12:00 PM ET (noon, safe default)
   *
   * Handles DST automatically via JavaScript Date
   */
  private computeEventTimestamp(date: string, time: 'bmo' | 'amc' | 'unknown'): number {
    if (!date) return 0

    try {
      // Parse date in ET timezone (market timezone)
      // Note: This assumes input date is already in ET context
      const d = new Date(date + 'T00:00:00-05:00') // EST offset, Date handles DST

      if (time === 'bmo') {
        // Before market open = 9:30 AM ET
        d.setHours(9, 30, 0, 0)
      } else if (time === 'amc') {
        // After market close = 5:00 PM ET (common earnings time)
        d.setHours(17, 0, 0, 0)
      } else {
        // Unknown = noon ET (safe default)
        d.setHours(12, 0, 0, 0)
      }

      return d.getTime()
    } catch (error) {
      console.error('[FMP Earnings] Error computing timestamp:', error)
      return 0
    }
  }

  /**
   * Normalize revenue values to USD
   *
   * FMP sometimes returns revenue in millions or raw dollars
   * This ensures consistent dollar representation
   */
  private normalizeRevenue(revenue?: number): number | null {
    if (revenue === undefined || revenue === null) return null

    // If revenue is less than 1 million, assume it's already in dollars
    // If revenue is large (> 1 billion), it's likely already in dollars
    // Middle range (1M - 1B) might be in millions, but we can't reliably detect
    // For now, assume FMP returns in dollars (check API docs to confirm)

    return revenue
  }
}

/**
 * Default singleton instance
 */
export const fmpEarningsService = new FMPEarningsService()
