import { 
  doc, 
  getDoc, 
  setDoc,
  collection,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore'
import { db } from './config'

export interface DividendData {
  exDate: string | null
  paymentDate: string | null
  amount: number | null
  lastUpdated: Timestamp
}

export class DividendService {
  private static CACHE_DURATION_DAYS = 7
  
  /**
   * Get dividend data from Firestore cache
   * Returns null if not found or if data is stale
   */
  static async getDividendData(symbol: string): Promise<DividendData | null> {
    try {
      console.log(`[DividendService] Fetching dividend data for ${symbol}`)
      const dividendRef = doc(db, 'dividends', symbol)
      const dividendDoc = await getDoc(dividendRef)
      
      if (!dividendDoc.exists()) {
        console.log(`[DividendService] No dividend data found for ${symbol}`)
        return null
      }
      
      const data = dividendDoc.data() as DividendData
      console.log(`[DividendService] Found dividend data for ${symbol}:`, data)
      
      // Check if data is stale (older than 7 days)
      const lastUpdated = data.lastUpdated?.toDate()
      if (!lastUpdated) {
        console.log(`[DividendService] No lastUpdated timestamp for ${symbol}`)
        return null
      }
      
      const daysSinceUpdate = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24)
      if (daysSinceUpdate > this.CACHE_DURATION_DAYS) {
        console.log(`[DividendService] Dividend data for ${symbol} is stale (${daysSinceUpdate.toFixed(1)} days old)`)
        return null
      }
      
      console.log(`[DividendService] Dividend data for ${symbol} is fresh (${daysSinceUpdate.toFixed(1)} days old)`)
      return data
    } catch (error) {
      console.error(`[DividendService] Error getting dividend data for ${symbol}:`, error)
      return null
    }
  }
  
  /**
   * Save dividend data to Firestore cache
   */
  static async saveDividendData(
    symbol: string, 
    exDate: string | null,
    paymentDate: string | null,
    amount: number | null
  ): Promise<void> {
    try {
      const dividendRef = doc(db, 'dividends', symbol)
      
      console.log(`[DividendService] Attempting to save dividend data for ${symbol}:`, {
        exDate,
        paymentDate,
        amount
      })
      
      await setDoc(dividendRef, {
        exDate,
        paymentDate,
        amount,
        lastUpdated: serverTimestamp()
      })
      
      console.log(`[DividendService] Successfully saved dividend data for ${symbol}`)
    } catch (error) {
      console.error(`[DividendService] Error saving dividend data for ${symbol}:`, error)
      throw error // Re-throw to let caller handle
    }
  }
  
  /**
   * Get dividend data for multiple symbols
   * Returns a map of symbol -> dividend data
   */
  static async getBatchDividendData(symbols: string[]): Promise<Map<string, DividendData>> {
    const results = new Map<string, DividendData>()
    
    // Fetch all symbols in parallel
    const promises = symbols.map(async (symbol) => {
      const data = await this.getDividendData(symbol)
      if (data) {
        results.set(symbol, data)
      }
    })
    
    await Promise.all(promises)
    return results
  }
}