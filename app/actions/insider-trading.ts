'use server'

import { createServerClient } from '@/lib/supabase/server'
import { rankLargeInsiderTrades, type LargeInsiderTrade, type LargeInsiderTradeCandidate } from '@/lib/insider-large-trades'

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

/**
 * Fetch latest insider trades from the database
 */
export async function getLatestInsiderTrades(
  limit: number = 100
): Promise<{ trades: InsiderTrade[] } | { error: string }> {
  try {
    const supabase = await createServerClient()

    const { data, error } = await supabase
      .from('insider_transactions')
      .select('*')
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Error fetching insider trades:', error)
      return { error: 'Failed to load insider trading data' }
    }

    const trades: InsiderTrade[] = (data || []).map((row) => mapInsiderTradeRow(row as DatabaseInsiderTradeRow))

    return { trades }
  } catch (error) {
    console.error('Error fetching insider trading data:', error)
    return { error: 'Failed to load insider trading data' }
  }
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

  try {
    const supabase = await createServerClient()

    const { data, error } = await supabase
      .from('insider_transactions')
      .select('*')
      .eq('symbol', symbol.toUpperCase())
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Error fetching insider trades for symbol:', error)
      return { error: 'Failed to load insider trading data' }
    }

    const trades: InsiderTrade[] = (data || []).map((row) => mapInsiderTradeRow(row as DatabaseInsiderTradeRow))

    return { trades }
  } catch (error) {
    console.error('Error fetching insider trading data for symbol:', error)
    return { error: 'Failed to load insider trading data' }
  }
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
    const supabase = await createServerClient()

    // Calculate date range
    const today = new Date()
    const todayStr = toIsoDate(today)
    const fromDate = new Date(today)
    fromDate.setDate(fromDate.getDate() - days)
    const fromDateStr = toIsoDate(fromDate)

    const { data, error } = await supabase
      .from('insider_transactions')
      .select('*')
      .gte('transaction_date', fromDateStr)
      .lte('transaction_date', todayStr)
      .in('form_type', ['4', '4/A', '5', '5/A'])
      .in('transaction_code', ['P', 'S'])
      .not('value', 'is', null)
      .gt('value', 0)
      .order('value', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Error fetching top insider trades:', error)
      return { error: 'Failed to load insider trading data' }
    }

    const trades: InsiderTrade[] = (data || []).map((row) => mapInsiderTradeRow(row as DatabaseInsiderTradeRow))

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
    const supabase = await createServerClient()

    const { data, error } = await supabase
      .from('insider_transactions')
      .select('*')
      .ilike('reporting_name', `%${query.trim()}%`)
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
    const supabase = await createServerClient()

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
    const supabase = await createServerClient()

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
  acquistionOrDisposition: string | null
  formType: string | null
}

function toIsoDate(date: Date): string {
  return date.toISOString().split('T')[0]
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

  return {
    symbol: row.symbol,
    filingDate: row.filing_date,
    transactionDate: row.transaction_date,
    reportingName: row.reporting_name,
    typeOfOwner: row.owner_type || '',
    transactionType,
    securitiesTransacted: Number(row.shares) || 0,
    price: row.price ? Number(row.price) : null,
    securitiesOwned: row.shares_owned_after ? Number(row.shares_owned_after) : 0,
    securityName: row.security_name || '',
    link: row.sec_link || '',
    acquistionOrDisposition: canonicalAcquisitionDisposition(transactionType, row.acquisition_disposition),
    formType: row.form_type || '4',
    value: row.value ? Number(row.value) : null,
    insiderId: row.insider_id || null,
  }
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
    && ['P', 'S'].includes(candidate.transactionCode)
    && Number.isFinite(candidate.shares)
    && Number.isFinite(candidate.price)
    && candidate.shares > 0
    && candidate.price > 0
}

async function fetchDatabaseLargeTradeCandidates(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  fromDate: string,
  toDate: string
): Promise<LargeInsiderTradeCandidate[]> {
  const { data, error } = await supabase
    .from('insider_transactions')
    .select('symbol, reporting_name, transaction_date, transaction_code, shares, price, acquisition_disposition, form_type')
    .gte('transaction_date', fromDate)
    .lte('transaction_date', toDate)
    .in('form_type', ['4', '4/A', '5', '5/A', '144', '144/A'])
    .in('transaction_code', ['P', 'S'])
    .not('value', 'is', null)
    .gt('value', 0)
    .order('value', { ascending: false })
    .limit(500)

  if (error) {
    throw error
  }

  return (data || [])
    .map((row) => mapDatabaseLargeTradeCandidate(row as DatabaseLargeTradeRow))
    .filter((candidate): candidate is LargeInsiderTradeCandidate => candidate !== null)
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
      console.error('FMP insider trade fallback failed:', response.status, response.statusText)
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
  }

  return candidates
}

/**
 * Fetch largest insider trades by value (shares * price) within a date range
 */
export async function getLargestInsiderTrades(
  weeks: number = 4,
  limit: number = 6
): Promise<{ trades: LargeInsiderTrade[] } | { error: string }> {
  try {
    const supabase = await createServerClient()

    const today = new Date()
    const todayStr = toIsoDate(today)
    const fromDate = new Date(today)
    fromDate.setDate(fromDate.getDate() - weeks * 7)
    const fromDateStr = toIsoDate(fromDate)

    const databaseCandidates = await fetchDatabaseLargeTradeCandidates(supabase, fromDateStr, todayStr)
    const liveFmpCandidates = await fetchLiveFmpLargeTradeCandidates(
      fromDateStr,
      todayStr,
      Math.max(limit * 100, 650)
    )

    const trades = rankLargeInsiderTrades([...databaseCandidates, ...liveFmpCandidates], {
      fromDate: fromDateStr,
      toDate: todayStr,
      limit,
    })

    return { trades }
  } catch (error) {
    console.error('Error fetching largest insider trades:', error)
    return { error: 'Failed to load insider trading data' }
  }
}
