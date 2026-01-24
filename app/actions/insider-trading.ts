'use server'

import { createServerClient } from '@/lib/supabase/server'

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

    const trades: InsiderTrade[] = (data || []).map((row) => ({
      symbol: row.symbol,
      filingDate: row.filing_date,
      transactionDate: row.transaction_date,
      reportingName: row.reporting_name,
      typeOfOwner: row.owner_type || '',
      transactionType: row.transaction_code || row.transaction_type || '',
      securitiesTransacted: Number(row.shares) || 0,
      price: row.price ? Number(row.price) : null,
      securitiesOwned: row.shares_owned_after ? Number(row.shares_owned_after) : 0,
      securityName: row.security_name || '',
      link: row.sec_link || '',
      acquistionOrDisposition: row.acquisition_disposition || '',
      formType: row.form_type || '4',
      value: row.value ? Number(row.value) : null,
      insiderId: row.insider_id || null,
    }))

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

    const trades: InsiderTrade[] = (data || []).map((row) => ({
      symbol: row.symbol,
      filingDate: row.filing_date,
      transactionDate: row.transaction_date,
      reportingName: row.reporting_name,
      typeOfOwner: row.owner_type || '',
      transactionType: row.transaction_code || row.transaction_type || '',
      securitiesTransacted: Number(row.shares) || 0,
      price: row.price ? Number(row.price) : null,
      securitiesOwned: row.shares_owned_after ? Number(row.shares_owned_after) : 0,
      securityName: row.security_name || '',
      link: row.sec_link || '',
      acquistionOrDisposition: row.acquisition_disposition || '',
      formType: row.form_type || '4',
      value: row.value ? Number(row.value) : null,
      insiderId: row.insider_id || null,
    }))

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
  try {
    const supabase = await createServerClient()

    // Calculate date range
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - days)
    const fromDateStr = fromDate.toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('insider_transactions')
      .select('*')
      .gte('transaction_date', fromDateStr)
      .not('value', 'is', null)
      .gt('value', 0)
      .order('value', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Error fetching top insider trades:', error)
      return { error: 'Failed to load insider trading data' }
    }

    const trades: InsiderTrade[] = (data || []).map((row) => ({
      symbol: row.symbol,
      filingDate: row.filing_date,
      transactionDate: row.transaction_date,
      reportingName: row.reporting_name,
      typeOfOwner: row.owner_type || '',
      transactionType: row.transaction_code || row.transaction_type || '',
      securitiesTransacted: Number(row.shares) || 0,
      price: row.price ? Number(row.price) : null,
      securitiesOwned: row.shares_owned_after ? Number(row.shares_owned_after) : 0,
      securityName: row.security_name || '',
      link: row.sec_link || '',
      acquistionOrDisposition: row.acquisition_disposition || '',
      formType: row.form_type || '4',
      value: row.value ? Number(row.value) : null,
      insiderId: row.insider_id || null,
    }))

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

    const trades: InsiderTrade[] = (data || []).map((row) => ({
      symbol: row.symbol,
      filingDate: row.filing_date,
      transactionDate: row.transaction_date,
      reportingName: row.reporting_name,
      typeOfOwner: row.owner_type || '',
      transactionType: row.transaction_code || row.transaction_type || '',
      securitiesTransacted: Number(row.shares) || 0,
      price: row.price ? Number(row.price) : null,
      securitiesOwned: row.shares_owned_after ? Number(row.shares_owned_after) : 0,
      securityName: row.security_name || '',
      link: row.sec_link || '',
      acquistionOrDisposition: row.acquisition_disposition || '',
      formType: row.form_type || '4',
      value: row.value ? Number(row.value) : null,
      insiderId: row.insider_id || null,
    }))

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

    const trades: InsiderTrade[] = (tradesData || []).map((row) => ({
      symbol: row.symbol,
      filingDate: row.filing_date,
      transactionDate: row.transaction_date,
      reportingName: row.reporting_name,
      typeOfOwner: row.owner_type || '',
      transactionType: row.transaction_code || row.transaction_type || '',
      securitiesTransacted: Number(row.shares) || 0,
      price: row.price ? Number(row.price) : null,
      securitiesOwned: row.shares_owned_after ? Number(row.shares_owned_after) : 0,
      securityName: row.security_name || '',
      link: row.sec_link || '',
      acquistionOrDisposition: row.acquisition_disposition || '',
      formType: row.form_type || '4',
      value: row.value ? Number(row.value) : null,
      insiderId: row.insider_id || null,
    }))

    // Calculate stats
    const buys = trades.filter(t => t.acquistionOrDisposition === 'A' || t.transactionType === 'P')
    const sells = trades.filter(t => t.acquistionOrDisposition === 'D' || t.transactionType === 'S')
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
