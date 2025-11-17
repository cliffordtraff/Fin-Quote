/**
 * Company Data Service
 *
 * Fetches and caches company profiles from FMP API with intelligent
 * batching, caching, and fallback strategies.
 */

import { db } from '@watchlist/lib/firebase/config'
import { doc, getDoc, setDoc, collection, query, where, getDocs, writeBatch, Timestamp } from 'firebase/firestore'
import { apiLimiter } from './api-limiter'

export interface CompanyProfile {
  symbol: string
  companyName: string
  exchange?: string
  industry?: string
  website?: string
  description?: string
  ceo?: string
  sector?: string
  country?: string
  employees?: number
  isPrivate?: boolean
  lastVerified: Date
  dataSource: 'fmp' | 'manual' | 'hybrid'

  // Derived fields for matching
  commonNames?: string[]
  aliases?: string[]
}

interface CachedProfile extends CompanyProfile {
  cachedAt: Timestamp
  ttl: number // seconds
}

type FetchMode = 'conservative' | 'normal' | 'aggressive'

interface FetchStrategy {
  mode: FetchMode
  batchSize: number
  cacheTTL: number
  fallbackToManual: boolean
}

export class CompanyDataService {
  private static instance: CompanyDataService

  // Cache configuration
  private readonly CACHE_TTL = {
    conservative: 30 * 24 * 60 * 60, // 30 days for rarely changing data
    normal: 7 * 24 * 60 * 60,        // 7 days default
    aggressive: 24 * 60 * 60         // 1 day for fresh data
  }

  // Batch configuration
  private readonly BATCH_SIZES = {
    conservative: 10,
    normal: 25,
    aggressive: 50
  }

  // In-memory LRU cache
  private memoryCache = new Map<string, CompanyProfile>()
  private readonly MAX_MEMORY_CACHE_SIZE = 100
  private readonly MEMORY_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

  private constructor() {}

  static getInstance(): CompanyDataService {
    if (!CompanyDataService.instance) {
      CompanyDataService.instance = new CompanyDataService()
    }
    return CompanyDataService.instance
  }

  /**
   * Fetch company profiles for given symbols
   */
  async fetchCompanyProfiles(
    symbols: string[],
    strategy: Partial<FetchStrategy> = {}
  ): Promise<Map<string, CompanyProfile>> {
    const fetchStrategy: FetchStrategy = {
      mode: strategy.mode || 'normal',
      batchSize: strategy.batchSize || this.BATCH_SIZES.normal,
      cacheTTL: strategy.cacheTTL || this.CACHE_TTL.normal,
      fallbackToManual: strategy.fallbackToManual ?? true
    }

    const profiles = new Map<string, CompanyProfile>()

    // Step 1: Check memory cache
    const uncachedSymbols: string[] = []
    for (const symbol of symbols) {
      const cached = this.getFromMemoryCache(symbol)
      if (cached) {
        profiles.set(symbol, cached)
      } else {
        uncachedSymbols.push(symbol)
      }
    }

    if (uncachedSymbols.length === 0) {
      return profiles
    }

    // Step 2: Check Firestore cache
    const firestoreProfiles = await this.getFromFirestoreCache(uncachedSymbols, fetchStrategy.cacheTTL)
    for (const [symbol, profile] of firestoreProfiles) {
      profiles.set(symbol, profile)
      this.addToMemoryCache(symbol, profile)
    }

    // Step 3: Identify symbols that need fresh data
    const symbolsNeedingFetch = uncachedSymbols.filter(s => !firestoreProfiles.has(s))

    if (symbolsNeedingFetch.length === 0) {
      return profiles
    }

    // Step 4: Fetch from FMP API in batches
    const freshProfiles = await this.fetchFromFMP(symbolsNeedingFetch, fetchStrategy)
    for (const [symbol, profile] of freshProfiles) {
      profiles.set(symbol, profile)
      this.addToMemoryCache(symbol, profile)
    }

    // Step 5: Cache fresh data in Firestore
    if (freshProfiles.size > 0) {
      await this.saveToFirestoreCache(freshProfiles, fetchStrategy.cacheTTL)
    }

    // Step 6: Fallback to manual mappings if enabled
    if (fetchStrategy.fallbackToManual) {
      const stillMissing = symbolsNeedingFetch.filter(s => !freshProfiles.has(s))
      if (stillMissing.length > 0) {
        const manualProfiles = await this.getManualMappings(stillMissing)
        for (const [symbol, profile] of manualProfiles) {
          profiles.set(symbol, profile)
        }
      }
    }

    return profiles
  }

  /**
   * Get from memory cache
   */
  private getFromMemoryCache(symbol: string): CompanyProfile | null {
    const cached = this.memoryCache.get(symbol)
    if (cached) {
      // Simple LRU: move to end when accessed
      this.memoryCache.delete(symbol)
      this.memoryCache.set(symbol, cached)
      return cached
    }
    return null
  }

  /**
   * Add to memory cache with LRU eviction
   */
  private addToMemoryCache(symbol: string, profile: CompanyProfile) {
    // Remove oldest if at capacity
    if (this.memoryCache.size >= this.MAX_MEMORY_CACHE_SIZE) {
      const firstKey = this.memoryCache.keys().next().value
      this.memoryCache.delete(firstKey)
    }
    this.memoryCache.set(symbol, profile)
  }

  /**
   * Get profiles from Firestore cache
   */
  private async getFromFirestoreCache(
    symbols: string[],
    ttl: number
  ): Promise<Map<string, CompanyProfile>> {
    const profiles = new Map<string, CompanyProfile>()

    try {
      // Batch get documents
      const promises = symbols.map(async (symbol) => {
        const docRef = doc(db, 'companies', symbol)
        const docSnap = await getDoc(docRef)

        if (docSnap.exists()) {
          const data = docSnap.data() as CachedProfile
          const age = Date.now() - data.cachedAt.toMillis()

          // Check if cache is still valid
          if (age < ttl * 1000) {
            const profile: CompanyProfile = {
              ...data,
              lastVerified: data.cachedAt.toDate()
            }
            return { symbol, profile }
          }
        }
        return null
      })

      const results = await Promise.all(promises)
      for (const result of results) {
        if (result) {
          profiles.set(result.symbol, result.profile)
        }
      }
    } catch (error) {
      console.error('Error fetching from Firestore cache:', error)
    }

    return profiles
  }

  /**
   * Save profiles to Firestore cache
   */
  private async saveToFirestoreCache(
    profiles: Map<string, CompanyProfile>,
    ttl: number
  ): Promise<void> {
    try {
      const batch = writeBatch(db)

      for (const [symbol, profile] of profiles) {
        const docRef = doc(db, 'companies', symbol)
        const cachedProfile: CachedProfile = {
          ...profile,
          cachedAt: Timestamp.now(),
          ttl
        }
        batch.set(docRef, cachedProfile, { merge: true })
      }

      await batch.commit()
      console.log(`Cached ${profiles.size} company profiles to Firestore`)
    } catch (error) {
      console.error('Error saving to Firestore cache:', error)
    }
  }

  /**
   * Fetch profiles from FMP API
   */
  private async fetchFromFMP(
    symbols: string[],
    strategy: FetchStrategy
  ): Promise<Map<string, CompanyProfile>> {
    const profiles = new Map<string, CompanyProfile>()

    if (!process.env.FMP_API_KEY) {
      console.warn('FMP_API_KEY not configured, skipping API fetch')
      return profiles
    }

    // Split into batches
    const batches: string[][] = []
    for (let i = 0; i < symbols.length; i += strategy.batchSize) {
      batches.push(symbols.slice(i, i + strategy.batchSize))
    }

    console.log(`Fetching ${symbols.length} company profiles in ${batches.length} batches`)

    // Process batches with rate limiting
    for (const batch of batches) {
      try {
        const data = await apiLimiter.queueRequest(
          'company/profile',
          async () => {
            const response = await fetch(
              `https://financialmodelingprep.com/api/v3/profile/${batch.join(',')}?apikey=${process.env.FMP_API_KEY}`
            )

            if (!response.ok) {
              throw new Error(`FMP API error: ${response.status}`)
            }

            return response.json()
          },
          strategy.mode === 'aggressive' ? 'high' : 'normal'
        )

        // Process response
        if (Array.isArray(data)) {
          for (const company of data) {
            const profile: CompanyProfile = {
              symbol: company.symbol,
              companyName: company.companyName,
              exchange: company.exchange,
              industry: company.industry,
              website: company.website,
              description: company.description,
              ceo: company.ceo,
              sector: company.sector,
              country: company.country,
              employees: company.fullTimeEmployees,
              isPrivate: company.isEtf || company.isActivelyTrading === false,
              lastVerified: new Date(),
              dataSource: 'fmp',
              commonNames: this.generateNameVariations(company.companyName),
              aliases: this.extractAliases(company.description)
            }
            profiles.set(company.symbol, profile)
          }
        }
      } catch (error) {
        console.error(`Failed to fetch batch [${batch.join(', ')}]:`, error)
        // Continue with other batches
      }
    }

    return profiles
  }

  /**
   * Generate common name variations
   */
  private generateNameVariations(companyName: string): string[] {
    const variations = new Set<string>()
    variations.add(companyName)

    // Remove common suffixes
    const suffixes = [' Inc.', ' Inc', ' Corporation', ' Corp.', ' Corp', ' Ltd.', ' Ltd', ' LLC', ' PLC', ' AG', ' SA', ' NV']
    let baseName = companyName
    for (const suffix of suffixes) {
      if (companyName.endsWith(suffix)) {
        baseName = companyName.slice(0, -suffix.length).trim()
        variations.add(baseName)
        break
      }
    }

    // Handle "The" prefix
    if (baseName.startsWith('The ')) {
      variations.add(baseName.slice(4))
    } else if (!companyName.startsWith('The ')) {
      variations.add('The ' + baseName)
    }

    // Add acronym if multi-word
    const words = baseName.split(' ')
    if (words.length > 1 && words.length <= 4) {
      const acronym = words.map(w => w[0]).join('').toUpperCase()
      if (acronym.length > 1) {
        variations.add(acronym)
      }
    }

    return Array.from(variations)
  }

  /**
   * Extract potential aliases from description
   */
  private extractAliases(description?: string): string[] {
    if (!description) return []

    const aliases: string[] = []

    // Look for patterns like "formerly known as" or "also known as"
    const patterns = [
      /formerly known as ([^,\.]+)/i,
      /also known as ([^,\.]+)/i,
      /previously ([^,\.]+)/i,
      /dba ([^,\.]+)/i
    ]

    for (const pattern of patterns) {
      const match = description.match(pattern)
      if (match && match[1]) {
        aliases.push(match[1].trim())
      }
    }

    return aliases
  }

  /**
   * Get manual mappings (fallback)
   */
  private async getManualMappings(symbols: string[]): Promise<Map<string, CompanyProfile>> {
    const profiles = new Map<string, CompanyProfile>()

    // Import existing manual mappings
    try {
      const { companyMappings } = await import('@watchlist/lib/data/company-mappings')

      for (const symbol of symbols) {
        const mapping = companyMappings[symbol]
        if (mapping) {
          const profile: CompanyProfile = {
            symbol,
            companyName: mapping.primary,
            lastVerified: new Date(),
            dataSource: 'manual',
            commonNames: [...mapping.aliases],
            aliases: mapping.aliases,
            ceo: mapping.executives?.[0],
            sector: mapping.contextPositive?.[0] // Best guess
          }
          profiles.set(symbol, profile)
        }
      }
    } catch (error) {
      console.error('Failed to load manual mappings:', error)
    }

    return profiles
  }

  /**
   * Get a single company profile
   */
  async getCompanyProfile(symbol: string): Promise<CompanyProfile | null> {
    const profiles = await this.fetchCompanyProfiles([symbol])
    return profiles.get(symbol) || null
  }

  /**
   * Pre-warm cache with most popular symbols
   */
  async prewarmCache(symbols: string[]) {
    console.log(`Pre-warming cache with ${symbols.length} symbols`)
    await this.fetchCompanyProfiles(symbols, {
      mode: 'conservative',
      batchSize: 50,
      cacheTTL: this.CACHE_TTL.conservative
    })
  }

  /**
   * Clear all caches
   */
  clearCache() {
    this.memoryCache.clear()
    console.log('Memory cache cleared')
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      memoryCacheSize: this.memoryCache.size,
      memoryCacheMaxSize: this.MAX_MEMORY_CACHE_SIZE,
      apiLimiterStats: apiLimiter.getUsageStats()
    }
  }
}

// Export singleton instance
export const companyDataService = CompanyDataService.getInstance()