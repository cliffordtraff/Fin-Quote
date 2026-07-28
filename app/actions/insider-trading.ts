'use server'

import { createKeyedAsyncTTLCache } from '@/lib/async-ttl-cache'
import {
  getEasternCalendarDate,
  getEasternCalendarDateRange,
  shiftIsoCalendarDate,
} from '@/lib/calendar-date'
import { createPublicClient } from '@/lib/supabase/public'
import {
  isAggregatePrincipalInsiderTrade,
  normalizeInsiderTradeUnitPrice,
  rankLargeInsiderTrades,
  type LargeInsiderTrade,
  type LargeInsiderTradeCandidate,
} from '@/lib/insider-large-trades'

export type { LargeInsiderTrade } from '@/lib/insider-large-trades'

export interface InsiderTrade {
  symbol: string
  filingDate: string
  transactionDate: string
  reportingName: string
  typeOfOwner: string
  transactionType: string
  securitiesTransacted: number
  price: number | null
  securitiesOwned: number
  securityName: string
  link: string
  acquistionOrDisposition: string
  formType: string
  value?: number | null
  insiderId?: string | null
}

interface DatabaseInsiderTradeRow {
  id?: string
  symbol: string
  filing_date: string
  transaction_date: string
  reporting_name: string
  owner_type: string | null
  transaction_code: string | null
  transaction_type: string | null
  shares: number | string
  price: number | string | null
  shares_owned_after: number | string | null
  security_name: string | null
  sec_link: string | null
  acquisition_disposition: string | null
  form_type: string | null
  value: number | string | null
  insider_id: string | null
}

type InsiderTradesResult =
  | { trades: InsiderTrade[] }
  | { error: string }

const getCachedInsiderTrades = createKeyedAsyncTTLCache<
  string,
  InsiderTradesResult
>(5 * 60 * 1000, 500)

type LargeInsiderTradesResult =
  | { trades: LargeInsiderTrade[] }
  | { error: string }

const getCachedLargeInsiderTrades = createKeyedAsyncTTLCache<
  string,
  LargeInsiderTradesResult
>(15 * 60 * 1000, 20)

const INSIDER_TRANSACTION_FORM_TYPES = ['4', '4/A', '5', '5/A', '144', '144/A']

/**
 * Fetch latest insider trades from the database
 */
export async function getLatestInsiderTrades(
  limit: number = 100
): Promise<{ trades: InsiderTrade[] } | { error: string }> {
  const normalizedLimit = Math.min(Math.max(limit, 1), 500)
  const todayStr = getEasternCalendarDate()

  return getCachedInsiderTrades(`latest:${todayStr}:${normalizedLimit}`, async () => {
    try {
      const supabase = createPublicClient()

      const { data, error } = await supabase
        .from('insider_transactions')
        .select('*')
        .lte('transaction_date', todayStr)
        .in('form_type', INSIDER_TRANSACTION_FORM_TYPES)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(normalizedLimit)

      if (error) {
        console.error('Error fetching insider trades:', error)
        return { error: 'Failed to load insider trading data' }
      }

      const trades: InsiderTrade[] = (data || []).map((row) =>
        mapInsiderTradeRow(row as DatabaseInsiderTradeRow)
      )

      return { trades }
    } catch (error) {
      console.error('Error fetching insider trading data:', error)
      return { error: 'Failed to load insider trading data' }
    }
  })
}

/**
 * Fetch insider trades for a specific symbol from the database
 */
export async function getInsiderTradesBySymbol(
  symbol: string,
  limit: number = 100
): Promise<{ trades: InsiderTrade[] } | { error: string }> {
  if (!symbol || symbol.trim() === '') {
    return { error: 'Symbol is required' }
  }

  const normalizedSymbol = symbol.toUpperCase()
  const normalizedLimit = Math.min(Math.max(limit, 1), 200)
  const todayStr = getEasternCalendarDate()

  return getCachedInsiderTrades(
    `${normalizedSymbol}:${todayStr}:${normalizedLimit}`,
    async () => {
      try {
        const supabase = createPublicClient()

        const { data, error } = await supabase
          .from('insider_transactions')
          .select('*')
          .eq('symbol', normalizedSymbol)
          .lte('transaction_date', todayStr)
          .in('form_type', INSIDER_TRANSACTION_FORM_TYPES)
          .order('transaction_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(normalizedLimit)

        if (error) {
          console.error('Error fetching insider trades for symbol:', error)
          return { error: 'Failed to load insider trading data' }
        }

        const trades: InsiderTrade[] = (data || []).map((row) =>
          mapInsiderTradeRow(row as DatabaseInsiderTradeRow)
        )

        return { trades }
      } catch (error) {
        console.error('Error fetching insider trading data for symbol:', error)
        return { error: 'Failed to load insider trading data' }
      }
    }
  )
}

/**
 * Fetch top trades by value within a date range
 */
export async function getTopInsiderTrades(
  days: number = 7,
  limit: number = 100
): Promise<{ trades: InsiderTrade[] } | { error: string }> {
  // Allow local dev to run without Supabase configured.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return { error: 'Supabase not configured' }
  }

  try {
    const supabase = createPublicClient()
    const normalizedDays = Math.min(Math.max(Math.trunc(days), 1), 365)
    const normalizedLimit = Math.min(Math.max(Math.trunc(limit), 1), 500)
    const { fromDate, toDate } = getEasternCalendarDateRange(normalizedDays)
    const formTypes = ['4', '4/A', '5', '5/A']
    const aggregatePrincipalRows = await fetchPotentialAggregatePrincipalRows(
      supabase,
      fromDate,
      toDate,
      formTypes
    )
    const malformedRowCount = aggregatePrincipalRows.filter(isRawAggregatePrincipalRow).length

    const { data, error } = await supabase
      .from('insider_transactions')
      .select('*')
      .gte('transaction_date', fromDate)
      .lte('transaction_date', toDate)
      .in('form_type', formTypes)
      .in('transaction_code', ['P', 'S'])
      .not('value', 'is', null)
      .gt('value', 0)
      .order('value', { ascending: false })
      // Each malformed aggregate-principal row can displace at most one
      // legitimate row from the raw database ranking.
      .limit(normalizedLimit + malformedRowCount)

    if (error) {
      console.error('Error fetching top insider trades:', error)
      return { error: 'Failed to load insider trading data' }
    }

    const trades = rankInsiderTradeRows(
      [
        ...((data || []) as DatabaseInsiderTradeRow[]),
        ...aggregatePrincipalRows,
      ],
      normalizedLimit
    )

    return { trades }
  } catch (error) {
    console.error('Error fetching top insider trading data:', error)
    return { error: 'Failed to load insider trading data' }
  }
}

/**
 * Search trades by insider name
 */
export async function searchInsiderTradesByName(
  query: string,
  limit: number = 100
): Promise<{ trades: InsiderTrade[] } | { error: string }> {
  if (!query || query.trim() === '') {
    return { error: 'Search query is required' }
  }

  try {
    const supabase = createPublicClient()
    const todayStr = getEasternCalendarDate()

    const { data, error } = await supabase
      .from('insider_transactions')
      .select('*')
      .ilike('reporting_name', `%${query.trim()}%`)
      .lte('transaction_date', todayStr)
      .in('form_type', INSIDER_TRANSACTION_FORM_TYPES)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Error searching insider trades:', error)
      return { error: 'Failed to search insider trading data' }
    }

    const trades: InsiderTrade[] = (data || []).map((row) => mapInsiderTradeRow(row as DatabaseInsiderTradeRow))

    return { trades }
  } catch (error) {
    console.error('Error searching insider trading data:', error)
    return { error: 'Failed to search insider trading data' }
  }
}

export interface InsiderProfile {
  id: string
  name: string
  cik: string | null
  totalTrades: number
  totalBuys: number
  totalSells: number
  totalBuyValue: number
  totalSellValue: number
  companies: string[]
  firstTradeDate: string | null
  lastTradeDate: string | null
}

/**
 * Get insider profile by ID
 */
export async function getInsiderById(
  insiderId: string
): Promise<{ insider: InsiderProfile; trades: InsiderTrade[] } | { error: string }> {
  if (!insiderId || insiderId.trim() === '') {
    return { error: 'Insider ID is required' }
  }

  try {
    const supabase = createPublicClient()
    const todayStr = getEasternCalendarDate()

    // Fetch insider info
    const { data: insiderData, error: insiderError } = await supabase
      .from('insiders')
      .select('*')
      .eq('id', insiderId)
      .single()

    if (insiderError || !insiderData) {
      console.error('Error fetching insider:', insiderError)
      return { error: 'Insider not found' }
    }

    // Fetch all trades for this insider
    const { data: tradesData, error: tradesError } = await supabase
      .from('insider_transactions')
      .select('*')
      .eq('insider_id', insiderId)
      .lte('transaction_date', todayStr)
      .in('form_type', INSIDER_TRANSACTION_FORM_TYPES)
      .order('transaction_date', { ascending: false })

    if (tradesError) {
      console.error('Error fetching insider trades:', tradesError)
      return { error: 'Failed to load insider trades' }
    }

    const trades: InsiderTrade[] = (tradesData || []).map((row) => mapInsiderTradeRow(row as DatabaseInsiderTradeRow))

    // Calculate stats
    const buys = trades.filter((trade) => getTradeDirection(trade) === 'buy')
    const sells = trades.filter((trade) => getTradeDirection(trade) === 'sell')
    const companies = [...new Set(trades.map(t => t.symbol))]
    const dates = trades.map(t => t.transactionDate).filter(Boolean).sort()

    const insider: InsiderProfile = {
      id: insiderData.id,
      name: insiderData.name,
      cik: insiderData.cik,
      totalTrades: trades.length,
      totalBuys: buys.length,
      totalSells: sells.length,
      totalBuyValue: buys.reduce((sum, t) => sum + (t.value || 0), 0),
      totalSellValue: sells.reduce((sum, t) => sum + (t.value || 0), 0),
      companies,
      firstTradeDate: dates[0] || null,
      lastTradeDate: dates[dates.length - 1] || null,
    }

    return { insider, trades }
  } catch (error) {
    console.error('Error fetching insider profile:', error)
    return { error: 'Failed to load insider profile' }
  }
}

/**
 * Get insider by normalized name (for linking from trades table)
 */
export async function getInsiderByName(
  name: string
): Promise<{ insiderId: string } | { error: string }> {
  if (!name || name.trim() === '') {
    return { error: 'Name is required' }
  }

  try {
    const supabase = createPublicClient()

    // Normalize the name the same way as the database function
    const normalized = name.toLowerCase().trim().replace(/\s+/g, ' ')

    const { data, error } = await supabase
      .from('insiders')
      .select('id')
      .eq('name_normalized', normalized)
      .single()

    if (error || !data) {
      return { error: 'Insider not found' }
    }

    return { insiderId: data.id }
  } catch (error) {
    console.error('Error finding insider by name:', error)
    return { error: 'Failed to find insider' }
  }
}

interface DatabaseLargeTradeRow {
  symbol: string
  reporting_name: string
  transaction_date: string
  transaction_code: string | null
  shares: number | string
  price: number | string | null
  security_name: string | null
  acquisition_disposition: string | null
  form_type: string | null
}

interface FmpLargeTradeRow {
  symbol: string
  reportingName: string
  transactionDate: string
  transactionType: string | null
  securitiesTransacted: number
  price: number | null
  securityName: string | null
  acquistionOrDisposition: string | null
  formType: string | null
}

function normalizeTransactionCode(value: string | null | undefined): string {
  if (!value) {
    return ''
  }

  return value.trim().charAt(0).toUpperCase()
}

function normalizeAcquisitionDisposition(value: string | null | undefined): string {
  if (!value) {
    return ''
  }

  const normalized = value.trim().charAt(0).toUpperCase()
  return normalized === 'A' || normalized === 'D' ? normalized : ''
}

function canonicalAcquisitionDisposition(
  transactionType: string | null | undefined,
  acquisitionDisposition: string | null | undefined
): string {
  const transactionCode = normalizeTransactionCode(transactionType)

  if (transactionCode === 'P') {
    return 'A'
  }

  if (transactionCode === 'S') {
    return 'D'
  }

  return normalizeAcquisitionDisposition(acquisitionDisposition)
}

function mapInsiderTradeRow(row: DatabaseInsiderTradeRow): InsiderTrade {
  const transactionType = row.transaction_code || row.transaction_type || ''
  const securitiesTransacted = Number(row.shares) || 0
  const rawPrice = row.price === null ? null : Number(row.price)
  const price = rawPrice !== null && Number.isFinite(rawPrice)
    ? normalizeInsiderTradeUnitPrice(securitiesTransacted, rawPrice, row.security_name || '')
    : null

  return {
    symbol: row.symbol,
    filingDate: row.filing_date,
    transactionDate: row.transaction_date,
    reportingName: row.reporting_name,
    typeOfOwner: row.owner_type || '',
    transactionType,
    securitiesTransacted,
    price,
    securitiesOwned: row.shares_owned_after ? Number(row.shares_owned_after) : 0,
    securityName: row.security_name || '',
    link: row.sec_link || '',
    acquistionOrDisposition: canonicalAcquisitionDisposition(transactionType, row.acquisition_disposition),
    formType: row.form_type || '4',
    value: price === null ? null : securitiesTransacted * price,
    insiderId: row.insider_id || null,
  }
}

function isRawAggregatePrincipalRow(row: DatabaseInsiderTradeRow): boolean {
  const shares = Number(row.shares)
  const price = Number(row.price)

  return Number.isFinite(shares)
    && Number.isFinite(price)
    && isAggregatePrincipalInsiderTrade(shares, price, row.security_name || '')
}

function normalizedTradeKey(trade: InsiderTrade): string {
  return [
    trade.symbol.toUpperCase(),
    trade.reportingName.trim().replace(/\s+/g, ' '),
    trade.transactionDate.split('T')[0],
    normalizeTransactionCode(trade.transactionType),
    trade.securitiesTransacted.toFixed(4),
    trade.price?.toFixed(4) || '',
    trade.formType.trim().toUpperCase(),
  ].join('|')
}

function rankInsiderTradeRows(
  rows: DatabaseInsiderTradeRow[],
  limit: number
): InsiderTrade[] {
  const deduped = new Map<string, InsiderTrade>()

  for (const row of rows) {
    const trade = mapInsiderTradeRow(row)
    deduped.set(normalizedTradeKey(trade), trade)
  }

  return Array.from(deduped.values())
    .sort((left, right) => {
      const valueDelta = (right.value || 0) - (left.value || 0)

      if (valueDelta !== 0) {
        return valueDelta
      }

      return right.transactionDate.localeCompare(left.transactionDate)
    })
    .slice(0, limit)
}

function getTradeDirection(trade: Pick<InsiderTrade, 'transactionType' | 'acquistionOrDisposition'>): 'buy' | 'sell' | null {
  const transactionCode = normalizeTransactionCode(trade.transactionType)

  if (transactionCode === 'P') {
    return 'buy'
  }

  if (transactionCode === 'S') {
    return 'sell'
  }

  const acquisitionDisposition = normalizeAcquisitionDisposition(trade.acquistionOrDisposition)

  if (acquisitionDisposition === 'A') {
    return 'buy'
  }

  if (acquisitionDisposition === 'D') {
    return 'sell'
  }

  return null
}

function normalizeFormType(value: string | null | undefined): string {
  if (!value) {
    return '4'
  }

  return value.trim().toUpperCase()
}

function formatErrorForLog(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`
  }

  if (typeof error === 'string') {
    return error
  }

  if (error && typeof error === 'object') {
    const keys = Object.keys(error)

    if (keys.length > 0) {
      try {
        return JSON.stringify(error)
      } catch {
        return `[object with keys: ${keys.join(', ')}]`
      }
    }
  }

  return String(error)
}

function mapDatabaseLargeTradeCandidate(row: DatabaseLargeTradeRow): LargeInsiderTradeCandidate | null {
  const shares = Number(row.shares)
  const price = Number(row.price)

  if (!row.symbol || !row.reporting_name || !row.transaction_date || !Number.isFinite(shares) || !Number.isFinite(price)) {
    return null
  }

  return {
    symbol: row.symbol,
    reportingName: row.reporting_name,
    transactionDate: row.transaction_date,
    transactionCode: normalizeTransactionCode(row.transaction_code),
    shares,
    price,
    securityName: row.security_name || '',
    acquisitionDisposition: canonicalAcquisitionDisposition(row.transaction_code, row.acquisition_disposition),
    formType: normalizeFormType(row.form_type),
  }
}

function mapFmpLargeTradeCandidate(row: FmpLargeTradeRow): LargeInsiderTradeCandidate | null {
  const shares = Number(row.securitiesTransacted)
  const price = Number(row.price)

  if (!row.symbol || !row.reportingName || !row.transactionDate || !Number.isFinite(shares) || !Number.isFinite(price)) {
    return null
  }

  return {
    symbol: row.symbol,
    reportingName: row.reportingName,
    transactionDate: row.transactionDate,
    transactionCode: normalizeTransactionCode(row.transactionType),
    shares,
    price,
    securityName: row.securityName || '',
    acquisitionDisposition: canonicalAcquisitionDisposition(row.transactionType, row.acquistionOrDisposition),
    formType: normalizeFormType(row.formType),
  }
}

function isEligibleLargeTradeCandidate(
  candidate: LargeInsiderTradeCandidate,
  fromDate: string,
  toDate: string
): boolean {
  return candidate.transactionDate >= fromDate
    && candidate.transactionDate <= toDate
    && ['4', '4/A', '5', '5/A', '144', '144/A'].includes(candidate.formType)
    && ['S', 'P'].includes(candidate.transactionCode)
    && Number.isFinite(candidate.shares)
    && Number.isFinite(candidate.price)
    && candidate.shares > 0
    && candidate.price > 0
}

async function fetchDatabaseLargeTradeCandidates(
  supabase: ReturnType<typeof createPublicClient>,
  fromDate: string,
  toDate: string
): Promise<LargeInsiderTradeCandidate[]> {
  const formTypes = ['4', '4/A', '5', '5/A', '144', '144/A']
  const aggregatePrincipalRows = await fetchPotentialAggregatePrincipalRows(
    supabase,
    fromDate,
    toDate,
    formTypes
  )
  const malformedRowCount = aggregatePrincipalRows.filter(isRawAggregatePrincipalRow).length
  const { data, error } = await supabase
    .from('insider_transactions')
    .select('symbol, reporting_name, transaction_date, transaction_code, shares, price, security_name, acquisition_disposition, form_type')
    .gte('transaction_date', fromDate)
    .lte('transaction_date', toDate)
    .in('form_type', formTypes)
    .in('transaction_code', ['S', 'P'])
    .not('value', 'is', null)
    .gt('value', 0)
    .order('value', { ascending: false })
    .limit(500 + malformedRowCount)

  if (error) {
    throw error
  }

  return [
    ...(data || []),
    ...aggregatePrincipalRows,
  ]
    .map((row) => mapDatabaseLargeTradeCandidate(row as DatabaseLargeTradeRow))
    .filter((candidate): candidate is LargeInsiderTradeCandidate => candidate !== null)
}

async function fetchPotentialAggregatePrincipalRows(
  supabase: ReturnType<typeof createPublicClient>,
  fromDate: string,
  toDate: string,
  formTypes: string[]
): Promise<DatabaseInsiderTradeRow[]> {
  const rows: DatabaseInsiderTradeRow[] = []
  const pageSize = 1000

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('insider_transactions')
      .select('*')
      .gte('transaction_date', fromDate)
      .lte('transaction_date', toDate)
      .in('form_type', formTypes)
      .in('transaction_code', ['S', 'P'])
      .or('security_name.ilike.%note%,security_name.ilike.%bond%,security_name.ilike.%debenture%')
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (error) {
      throw error
    }

    const page = (data || []) as DatabaseInsiderTradeRow[]
    rows.push(...page)

    if (page.length < pageSize) {
      break
    }
  }

  return rows
}

async function fetchLiveFmpLargeTradeCandidates(
  fromDate: string,
  toDate: string,
  targetCount: number
): Promise<LargeInsiderTradeCandidate[]> {
  const apiKey = process.env.FMP_API_KEY

  if (!apiKey) {
    return []
  }

  const candidates: LargeInsiderTradeCandidate[] = []
  const pageSize = 100
  const maxPages = 30

  for (let page = 0; page < maxPages; page++) {
    try {
      const response = await fetch(
        `https://financialmodelingprep.com/api/v4/insider-trading?page=${page}&limit=${pageSize}&apikey=${apiKey}`,
        {
          headers: {
            Accept: 'application/json',
          },
          next: {
            revalidate: 900,
          },
        }
      )

      if (!response.ok) {
        console.warn('FMP insider trade fallback failed:', response.status, response.statusText)
        break
      }

      const data: unknown = await response.json()

      if (!Array.isArray(data) || data.length === 0) {
        break
      }

      let oldestDateOnPage: string | null = null

      for (const row of data) {
        const candidate = mapFmpLargeTradeCandidate(row as FmpLargeTradeRow)

        if (!candidate) {
          continue
        }

        if (oldestDateOnPage === null || candidate.transactionDate < oldestDateOnPage) {
          oldestDateOnPage = candidate.transactionDate
        }

        if (isEligibleLargeTradeCandidate(candidate, fromDate, toDate)) {
          candidates.push(candidate)
        }
      }

      if (candidates.length >= targetCount && oldestDateOnPage !== null && oldestDateOnPage < fromDate) {
        break
      }
    } catch (error) {
      console.warn('FMP insider trade fallback threw:', formatErrorForLog(error))
      break
    }
  }

  return candidates
}

/**
 * Fetch largest insider trades by value (shares * price) within a date range
 */
async function loadLargestInsiderTrades(
  weeks: number = 4,
  limit: number = 6,
  asOfDate: string = getEasternCalendarDate(),
  options: {
    saleLimit?: number
    buyLimit?: number
  } = {}
): Promise<{ trades: LargeInsiderTrade[] } | { error: string }> {
  try {
    const supabase = createPublicClient()
    const todayStr = asOfDate
    const fromDateStr = shiftIsoCalendarDate(todayStr, -weeks * 7)

    const [databaseResult, liveFmpResult] = await Promise.allSettled([
      fetchDatabaseLargeTradeCandidates(supabase, fromDateStr, todayStr),
      fetchLiveFmpLargeTradeCandidates(
        fromDateStr,
        todayStr,
        Math.max(limit * 100, 650)
      ),
    ])

    const databaseCandidates = databaseResult.status === 'fulfilled' ? databaseResult.value : []
    const liveFmpCandidates = liveFmpResult.status === 'fulfilled' ? liveFmpResult.value : []

    if (databaseResult.status === 'rejected') {
      console.warn('Largest insider trades database fetch failed:', formatErrorForLog(databaseResult.reason))
    }

    if (liveFmpResult.status === 'rejected') {
      console.warn('Largest insider trades live FMP fetch failed:', formatErrorForLog(liveFmpResult.reason))
    }

    if (databaseCandidates.length === 0 && liveFmpCandidates.length === 0) {
      return { error: 'Failed to load insider trading data' }
    }

    const rankedTrades = rankLargeInsiderTrades([...databaseCandidates, ...liveFmpCandidates], {
      fromDate: fromDateStr,
      toDate: todayStr,
      limit: options.saleLimit || options.buyLimit ? 500 : limit,
    })

    const trades = (() => {
      if (!options.saleLimit && !options.buyLimit) {
        return rankedTrades
      }

      const saleTrades = options.saleLimit
        ? rankedTrades
          .filter((trade) => normalizeTransactionCode(trade.transactionCode) === 'S')
          .slice(0, options.saleLimit)
        : []

      const buyTrades = options.buyLimit
        ? rankedTrades
          .filter((trade) => normalizeTransactionCode(trade.transactionCode) === 'P')
          .slice(0, options.buyLimit)
        : []

      return [...saleTrades, ...buyTrades].slice(0, limit)
    })()

    return { trades }
  } catch (error) {
    console.error('Error fetching largest insider trades:', formatErrorForLog(error))
    return { error: 'Failed to load insider trading data' }
  }
}

export async function getLargestInsiderTrades(
  weeks: number = 4,
  limit: number = 6,
  options: {
    saleLimit?: number
    buyLimit?: number
  } = {}
): Promise<{ trades: LargeInsiderTrade[] } | { error: string }> {
  const normalizedWeeks = Math.min(Math.max(weeks, 1), 52)
  const normalizedLimit = Math.min(Math.max(limit, 1), 100)
  const normalizedSaleLimit = options.saleLimit
    ? Math.min(Math.max(options.saleLimit, 1), normalizedLimit)
    : 0
  const normalizedBuyLimit = options.buyLimit
    ? Math.min(Math.max(options.buyLimit, 1), normalizedLimit)
    : 0
  const asOfDate = getEasternCalendarDate()

  const cacheKey = [
    asOfDate,
    normalizedWeeks,
    normalizedLimit,
    normalizedSaleLimit,
    normalizedBuyLimit,
  ].join(':')

  return getCachedLargeInsiderTrades(cacheKey, () =>
    loadLargestInsiderTrades(normalizedWeeks, normalizedLimit, asOfDate, {
      saleLimit: normalizedSaleLimit || undefined,
      buyLimit: normalizedBuyLimit || undefined,
    })
  )
}
