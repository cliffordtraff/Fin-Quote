/**
 * S&P 500 Insider Trades Ingestion Script
 *
 * Fetches insider trades for all S&P 500 companies from FMP API.
 * Filters to trades since a given date (default: Jan 1, 2026).
 *
 * Usage:
 *   npx tsx scripts/ingest-sp500-insiders.ts                    # Default: since Jan 1, 2026
 *   npx tsx scripts/ingest-sp500-insiders.ts --since 2026-01-15 # Custom start date
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { getEasternCalendarDate } from '../lib/calendar-date'
import { normalizeInsiderTradeUnitPrice } from '../lib/insider-large-trades'

dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const FMP_API_KEY = process.env.FMP_API_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

if (!FMP_API_KEY) {
  console.error('Missing FMP_API_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const TRANSACTION_FORM_TYPES = new Set(['4', '4/A', '5', '5/A', '144', '144/A'])

interface FMPInsiderTrade {
  symbol: string
  filingDate: string
  transactionDate: string
  reportingCik: string
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
}

async function getSP500Symbols(): Promise<string[]> {
  const url = `https://financialmodelingprep.com/api/v3/sp500_constituent?apikey=${FMP_API_KEY}`
  const res = await fetch(url)
  const data = await res.json()

  if (!Array.isArray(data)) {
    throw new Error('Failed to fetch S&P 500 constituents')
  }

  return data.map((c: { symbol: string }) => c.symbol)
}

async function fetchInsiderTradesForSymbol(symbol: string, sinceDate: string): Promise<FMPInsiderTrade[]> {
  const url = `https://financialmodelingprep.com/api/v4/insider-trading?symbol=${symbol}&limit=100&apikey=${FMP_API_KEY}`

  const res = await fetch(url)
  const data = await res.json()

  if (!Array.isArray(data)) {
    return []
  }

  // Filter to trades since the given date
  return data.filter((t: FMPInsiderTrade) => t.transactionDate >= sinceDate)
}

function normalizeTransactionCode(type: string | null): string | null {
  if (!type) return null
  const firstChar = type.charAt(0).toUpperCase()
  const validCodes = ['P', 'S', 'A', 'D', 'F', 'I', 'M', 'C', 'E', 'H', 'O', 'X', 'G', 'L', 'W', 'Z', 'J', 'K', 'U']
  return validCodes.includes(firstChar) ? firstChar : null
}

function normalizeAcqDisp(value: string | null): string | null {
  if (!value) return null
  const firstChar = value.charAt(0).toUpperCase()
  return firstChar === 'A' || firstChar === 'D' ? firstChar : null
}

function normalizeFormType(value: string | null): string {
  return value?.trim().toUpperCase() || '4'
}

function hashString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16)
}

async function main() {
  const args = process.argv.slice(2)
  let sinceDate = '2026-01-01'

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--since' && args[i + 1]) {
      sinceDate = args[i + 1]
      i++
    }
  }

  console.log('S&P 500 Insider Trades Ingestion')
  console.log('================================')
  console.log(`Since: ${sinceDate}`)
  console.log('')

  const startTime = Date.now()

  // Create ingestion log
  const { data: logEntry } = await supabase
    .from('ingestion_logs')
    .insert({
      source: 'fmp-sp500',
      started_at: new Date().toISOString()
    })
    .select()
    .single()

  const logId = logEntry?.id

  let totalFetched = 0
  let totalInserted = 0
  let totalUpdated = 0
  let totalSkipped = 0
  let totalErrors = 0
  const todayStr = getEasternCalendarDate()

  try {
    // Get S&P 500 symbols
    console.log('Fetching S&P 500 constituents...')
    const symbols = await getSP500Symbols()
    console.log(`Found ${symbols.length} symbols`)
    console.log('')

    // Process each symbol
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i]

      try {
        const trades = await fetchInsiderTradesForSymbol(symbol, sinceDate)

        if (trades.length === 0) {
          // Progress every 50 symbols
          if ((i + 1) % 50 === 0) {
            console.log(`Progress: ${i + 1}/${symbols.length} symbols (${totalInserted} inserted)`)
          }
          continue
        }

        totalFetched += trades.length

        // Process each trade
        for (const trade of trades) {
          const transactionCode = normalizeTransactionCode(trade.transactionType)
          const formType = normalizeFormType(trade.formType)
          if (
            !trade.symbol
            || !trade.reportingName
            || !trade.transactionDate
            || trade.transactionDate > todayStr
            || !trade.securitiesTransacted
            || !transactionCode
            || !TRANSACTION_FORM_TYPES.has(formType)
          ) {
            totalSkipped++
            continue
          }

          // Get or create insider
          const { data: insiderId } = await supabase.rpc('get_or_create_insider', {
            p_name: trade.reportingName,
            p_cik: trade.reportingCik || null
          })
          const shares = Math.abs(trade.securitiesTransacted)
          const rawPrice = trade.price === null ? null : Number(trade.price)
          const price = rawPrice !== null && Number.isFinite(rawPrice)
            ? normalizeInsiderTradeUnitPrice(shares, rawPrice, trade.securityName)
            : null

          const record = {
            insider_id: insiderId || null,
            symbol: trade.symbol.toUpperCase(),
            accession_number: null,
            filing_date: trade.filingDate,
            transaction_date: trade.transactionDate,
            transaction_type: trade.transactionType || null,
            transaction_code: transactionCode,
            acquisition_disposition: normalizeAcqDisp(trade.acquistionOrDisposition),
            shares,
            price,
            shares_owned_after: trade.securitiesOwned || null,
            reporting_name: trade.reportingName,
            owner_type: trade.typeOfOwner || null,
            officer_title: null,
            security_name: trade.securityName || null,
            form_type: formType,
            source: 'fmp',
            source_id: trade.link ? hashString(trade.link) : null,
            sec_link: trade.link || null
          }

          if (rawPrice !== null && price !== null && price !== rawPrice) {
            const { data: repairedRows, error: repairError } = await supabase
              .from('insider_transactions')
              .update({ price })
              .eq('symbol', record.symbol)
              .eq('reporting_name', record.reporting_name)
              .eq('transaction_date', record.transaction_date)
              .eq('transaction_code', record.transaction_code)
              .eq('shares', shares)
              .eq('price', rawPrice)
              .eq('filing_date', record.filing_date)
              .select('id')

            if (repairError) {
              totalErrors++
              continue
            }

            if ((repairedRows || []).length > 0) {
              totalUpdated += repairedRows.length
              continue
            }
          }

          const { error: insertError } = await supabase
            .from('insider_transactions')
            .insert(record)

          if (insertError) {
            if (insertError.code === '23505') {
              totalSkipped++
            } else {
              totalErrors++
            }
          } else {
            totalInserted++
          }
        }

        // Progress update
        if ((i + 1) % 50 === 0 || trades.length > 0) {
          console.log(`${symbol}: ${trades.length} trades (${totalInserted} total inserted)`)
        }

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 50))

      } catch (err) {
        console.error(`Error processing ${symbol}:`, err)
        totalErrors++
      }
    }

    const duration = Date.now() - startTime

    // Update log
    if (logId) {
      await supabase
        .from('ingestion_logs')
        .update({
          completed_at: new Date().toISOString(),
          status: totalErrors > 0 ? 'partial' : 'success',
          rows_fetched: totalFetched,
          rows_inserted: totalInserted,
          rows_updated: totalUpdated,
          rows_skipped: totalSkipped,
          error_message: totalErrors > 0 ? `${totalErrors} errors` : null,
          duration_ms: duration
        })
        .eq('id', logId)
    }

    console.log('')
    console.log('================================')
    console.log('COMPLETE')
    console.log(`  Symbols processed: ${symbols.length}`)
    console.log(`  Trades fetched: ${totalFetched}`)
    console.log(`  Inserted: ${totalInserted}`)
    console.log(`  Updated: ${totalUpdated}`)
    console.log(`  Skipped (dupes): ${totalSkipped}`)
    console.log(`  Errors: ${totalErrors}`)
    console.log(`  Duration: ${(duration / 1000).toFixed(1)}s`)

  } catch (error) {
    console.error('Fatal error:', error)

    if (logId) {
      await supabase
        .from('ingestion_logs')
        .update({
          completed_at: new Date().toISOString(),
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          duration_ms: Date.now() - startTime
        })
        .eq('id', logId)
    }

    process.exit(1)
  }
}

main()
