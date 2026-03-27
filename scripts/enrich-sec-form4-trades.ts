/**
 * Enrich recent Form 4 / 5 insider trades by re-parsing the linked SEC
 * ownership.xml filings. This fills in missing P/S line items that vendor
 * feeds sometimes omit and repairs contradictory acquisition/disposition flags.
 *
 * Usage:
 *   npx tsx scripts/enrich-sec-form4-trades.ts
 *   npx tsx scripts/enrich-sec-form4-trades.ts --since 2026-03-01
 *   npx tsx scripts/enrich-sec-form4-trades.ts --since 2026-03-01 --symbol FLOC
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { getOwnershipDocumentUrl, parseSecOwnershipDocument } from '../lib/sec-form-ownership'

dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const SEC_USER_AGENT = process.env.SEC_USER_AGENT || 'Fin Quote App contact@example.com'
const SEC_MIN_REQUEST_INTERVAL_MS = 250
const SEC_MAX_RETRIES = 5
const ELIGIBLE_FORM_TYPES = ['4', '4/A', '5', '5/A']
const ELIGIBLE_TRANSACTION_CODES = new Set(['P', 'S'])

interface FilingAnchor {
  insider_id: string | null
  symbol: string
  filing_date: string
  transaction_date: string
  reporting_name: string
  owner_type: string | null
  security_name: string | null
  form_type: string | null
  sec_link: string
}

interface ExistingTradeRow {
  id: string
  symbol: string
  reporting_name: string
  transaction_date: string
  transaction_code: string | null
  shares: number | string
  price: number | string | null
  acquisition_disposition: string | null
  value: number | string | null
  security_name: string | null
}

function toIsoDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function parseArgs(): { sinceDate: string; symbol: string | null } {
  const args = process.argv.slice(2)
  let sinceDate: string | null = null
  let symbol: string | null = null

  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--since' && args[index + 1]) {
      sinceDate = args[index + 1]
      index += 1
      continue
    }

    if (args[index] === '--symbol' && args[index + 1]) {
      symbol = args[index + 1].toUpperCase()
      index += 1
    }
  }

  if (!sinceDate) {
    const defaultSince = new Date()
    defaultSince.setDate(defaultSince.getDate() - 14)
    sinceDate = toIsoDate(defaultSince)
  }

  return { sinceDate, symbol }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function fetchSecText(url: string, attempt = 1): Promise<string> {
  await delay(SEC_MIN_REQUEST_INTERVAL_MS)

  const response = await fetch(url, {
    headers: {
      'User-Agent': SEC_USER_AGENT,
      Accept: 'application/xml,text/xml,text/html;q=0.9,*/*;q=0.8',
    },
  })

  if (response.ok) {
    return response.text()
  }

  const shouldRetry =
    attempt < SEC_MAX_RETRIES &&
    (response.status === 429 || response.status === 403 || response.status >= 500)

  if (shouldRetry) {
    const retryAfterSeconds = Number(response.headers.get('retry-after') || '0')
    const backoffMs =
      retryAfterSeconds > 0
        ? retryAfterSeconds * 1000
        : SEC_MIN_REQUEST_INTERVAL_MS * Math.pow(2, attempt)

    await delay(backoffMs)
    return fetchSecText(url, attempt + 1)
  }

  throw new Error(`SEC request failed for ${url}: ${response.status} ${response.statusText}`)
}

function normalizeTransactionCode(value: string | null | undefined): string {
  return value?.trim().charAt(0).toUpperCase() || ''
}

function normalizeAcquisitionDisposition(
  transactionCode: string | null | undefined,
  acquisitionDisposition: string | null | undefined
): string {
  const normalizedTransactionCode = normalizeTransactionCode(transactionCode)

  if (normalizedTransactionCode === 'P') {
    return 'A'
  }

  if (normalizedTransactionCode === 'S') {
    return 'D'
  }

  return acquisitionDisposition?.trim().charAt(0).toUpperCase() || ''
}

function normalizeStoredAcquisitionDisposition(value: string | null | undefined): string {
  return value?.trim().charAt(0).toUpperCase() || ''
}

function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase()
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function normalizePrice(value: number | string | null | undefined): string {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue.toFixed(6) : 'null'
}

function normalizeShares(value: number | string): string {
  return Number(value).toFixed(4)
}

function exactTradeKey(row: {
  symbol: string
  reporting_name: string
  transaction_date: string
  transaction_code: string | null
  shares: number | string
  price: number | string | null
}): string {
  return [
    normalizeSymbol(row.symbol),
    normalizeName(row.reporting_name),
    row.transaction_date,
    normalizeTransactionCode(row.transaction_code),
    normalizeShares(row.shares),
    normalizePrice(row.price),
  ].join('|')
}

function looseTradeKey(row: {
  symbol: string
  reporting_name: string
  transaction_date: string
  transaction_code: string | null
  shares: number | string
}): string {
  return [
    normalizeSymbol(row.symbol),
    normalizeName(row.reporting_name),
    row.transaction_date,
    normalizeTransactionCode(row.transaction_code),
    normalizeShares(row.shares),
  ].join('|')
}

function accessionNumberFromSecLink(secLink: string): string | null {
  const match = secLink.match(/\/(\d{10}-\d{2}-\d{6})-index\.htm$/i)
  return match?.[1] || null
}

function transactionTypeFromCode(transactionCode: string): string {
  if (transactionCode === 'P') {
    return 'P-Purchase'
  }

  if (transactionCode === 'S') {
    return 'S-Sale'
  }

  return transactionCode
}

async function fetchAnchors(sinceDate: string, symbol: string | null): Promise<FilingAnchor[]> {
  let query = supabase
    .from('insider_transactions')
    .select('insider_id, symbol, filing_date, transaction_date, reporting_name, owner_type, security_name, form_type, sec_link')
    .eq('source', 'fmp')
    .gte('transaction_date', sinceDate)
    .in('form_type', ELIGIBLE_FORM_TYPES)
    .not('sec_link', 'is', null)
    .order('transaction_date', { ascending: false })
    .limit(2000)

  if (symbol) {
    query = query.eq('symbol', symbol)
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  const uniqueAnchors = new Map<string, FilingAnchor>()

  for (const row of (data || []) as FilingAnchor[]) {
    const key = [
      row.sec_link,
      normalizeSymbol(row.symbol),
      normalizeName(row.reporting_name),
    ].join('|')

    if (!uniqueAnchors.has(key)) {
      uniqueAnchors.set(key, row)
    }
  }

  return Array.from(uniqueAnchors.values())
}

async function fetchExistingTrades(sinceDate: string, symbol: string | null): Promise<ExistingTradeRow[]> {
  let query = supabase
    .from('insider_transactions')
    .select('id, symbol, reporting_name, transaction_date, transaction_code, shares, price, acquisition_disposition, value, security_name')
    .gte('transaction_date', sinceDate)
    .in('form_type', ELIGIBLE_FORM_TYPES)
    .limit(5000)

  if (symbol) {
    query = query.eq('symbol', symbol)
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  return (data || []) as ExistingTradeRow[]
}

async function main() {
  const { sinceDate, symbol } = parseArgs()
  const startedAt = new Date().toISOString()
  const startMs = Date.now()

  console.log('SEC Form 4 Trade Enrichment')
  console.log('===========================')
  console.log(`Since: ${sinceDate}`)
  if (symbol) {
    console.log(`Symbol: ${symbol}`)
  }
  console.log('')

  const { data: logEntry } = await supabase
    .from('ingestion_logs')
    .insert({
      source: 'sec-form4-enrich',
      started_at: startedAt,
    })
    .select()
    .single()

  const logId = logEntry?.id

  let filingsProcessed = 0
  let rowsInserted = 0
  let rowsUpdated = 0
  let rowsSkipped = 0

  try {
    const anchors = await fetchAnchors(sinceDate, symbol)
    const existingTrades = await fetchExistingTrades(sinceDate, symbol)

    console.log(`Anchors: ${anchors.length}`)
    console.log(`Existing recent trades: ${existingTrades.length}`)

    const exactExistingMap = new Map<string, ExistingTradeRow[]>()
    const looseExistingMap = new Map<string, ExistingTradeRow[]>()

    for (const row of existingTrades) {
      const exactKey = exactTradeKey(row)
      const looseKey = looseTradeKey(row)

      exactExistingMap.set(exactKey, [...(exactExistingMap.get(exactKey) || []), row])
      looseExistingMap.set(looseKey, [...(looseExistingMap.get(looseKey) || []), row])
    }

    for (const anchor of anchors) {
      filingsProcessed += 1

      try {
        const xml = await fetchSecText(getOwnershipDocumentUrl(anchor.sec_link))
        const document = parseSecOwnershipDocument(xml)

        if (!document) {
          rowsSkipped += 1
          continue
        }

        const reportingOwnerCount = document.reportingOwners.length

        for (const transaction of document.transactions) {
          if (!ELIGIBLE_TRANSACTION_CODES.has(transaction.transactionCode)) {
            continue
          }

          if (!Number.isFinite(transaction.price) || (transaction.price ?? 0) <= 0) {
            continue
          }

          const exactKey = exactTradeKey({
            symbol: anchor.symbol,
            reporting_name: anchor.reporting_name,
            transaction_date: transaction.transactionDate,
            transaction_code: transaction.transactionCode,
            shares: transaction.shares,
            price: transaction.price,
          })

          const looseKey = looseTradeKey({
            symbol: anchor.symbol,
            reporting_name: anchor.reporting_name,
            transaction_date: transaction.transactionDate,
            transaction_code: transaction.transactionCode,
            shares: transaction.shares,
          })

          const exactMatches = exactExistingMap.get(exactKey) || []
          const looseMatches = looseExistingMap.get(looseKey) || []
          const canonicalAcquisitionDisposition = normalizeAcquisitionDisposition(
            transaction.transactionCode,
            transaction.acquisitionDisposition
          )

          if (exactMatches.length > 0) {
            for (const match of exactMatches) {
              const nextSecurityName = match.security_name || transaction.securityName || anchor.security_name

              const shouldUpdate =
                normalizeStoredAcquisitionDisposition(match.acquisition_disposition) !== canonicalAcquisitionDisposition ||
                (!match.security_name && Boolean(nextSecurityName))

              if (!shouldUpdate) {
                continue
              }

              const { error: updateError } = await supabase
                .from('insider_transactions')
                .update({
                  acquisition_disposition: canonicalAcquisitionDisposition,
                  security_name: nextSecurityName,
                })
                .eq('id', match.id)

              if (updateError) {
                throw updateError
              }

              rowsUpdated += 1
              match.acquisition_disposition = canonicalAcquisitionDisposition
              match.security_name = nextSecurityName || null
            }

            continue
          }

          const looseMatchWithMissingValue = looseMatches.find((match) => {
            const existingPrice = Number(match.price)
            return !Number.isFinite(existingPrice) || existingPrice <= 0
          })

          if (looseMatchWithMissingValue) {
            const { error: updateError } = await supabase
              .from('insider_transactions')
              .update({
                price: transaction.price,
                acquisition_disposition: canonicalAcquisitionDisposition,
                security_name: looseMatchWithMissingValue.security_name || transaction.securityName || anchor.security_name,
              })
              .eq('id', looseMatchWithMissingValue.id)

            if (updateError) {
              throw updateError
            }

            rowsUpdated += 1

            looseMatchWithMissingValue.price = transaction.price
            looseMatchWithMissingValue.acquisition_disposition = canonicalAcquisitionDisposition
            looseMatchWithMissingValue.security_name =
              looseMatchWithMissingValue.security_name || transaction.securityName || anchor.security_name

            const refreshedExactKey = exactTradeKey({
              symbol: anchor.symbol,
              reporting_name: anchor.reporting_name,
              transaction_date: transaction.transactionDate,
              transaction_code: transaction.transactionCode,
              shares: transaction.shares,
              price: transaction.price,
            })

            exactExistingMap.set(
              refreshedExactKey,
              [...(exactExistingMap.get(refreshedExactKey) || []), looseMatchWithMissingValue]
            )

            continue
          }

          if (reportingOwnerCount > 1) {
            rowsSkipped += 1
            continue
          }

          const accessionNumber = accessionNumberFromSecLink(anchor.sec_link)

          const record = {
            insider_id: anchor.insider_id,
            symbol: anchor.symbol,
            accession_number: accessionNumber,
            filing_date: anchor.filing_date,
            transaction_date: transaction.transactionDate,
            transaction_type: transactionTypeFromCode(transaction.transactionCode),
            transaction_code: transaction.transactionCode,
            acquisition_disposition: canonicalAcquisitionDisposition,
            shares: transaction.shares,
            price: transaction.price,
            shares_owned_after: transaction.sharesOwnedAfter,
            reporting_name: anchor.reporting_name,
            owner_type: anchor.owner_type,
            officer_title: null,
            security_name: transaction.securityName || anchor.security_name,
            form_type: anchor.form_type || '4',
            source: 'sec-form4',
            source_id: [
              accessionNumber || anchor.sec_link,
              anchor.reporting_name,
              transaction.transactionDate,
              transaction.transactionCode,
              transaction.shares,
            ].join('|'),
            sec_link: anchor.sec_link,
          }

          const { error: insertError } = await supabase
            .from('insider_transactions')
            .insert(record)

          if (insertError) {
            throw insertError
          }

          rowsInserted += 1

          const insertedRow: ExistingTradeRow = {
            id: record.source_id,
            symbol: record.symbol,
            reporting_name: record.reporting_name,
            transaction_date: record.transaction_date,
            transaction_code: record.transaction_code,
            shares: record.shares,
            price: record.price,
            acquisition_disposition: record.acquisition_disposition,
            value: record.value,
            security_name: record.security_name,
          }

          exactExistingMap.set(exactKey, [...(exactExistingMap.get(exactKey) || []), insertedRow])
          looseExistingMap.set(looseKey, [...(looseExistingMap.get(looseKey) || []), insertedRow])
        }
      } catch (error) {
        console.error(`Failed to enrich ${anchor.symbol} / ${anchor.reporting_name}:`, error)
      }
    }

    const duration = Date.now() - startMs

    if (logId) {
      await supabase
        .from('ingestion_logs')
        .update({
          completed_at: new Date().toISOString(),
          status: 'success',
          rows_fetched: filingsProcessed,
          rows_inserted: rowsInserted,
          rows_skipped: rowsSkipped,
          duration_ms: duration,
          error_message: null,
        })
        .eq('id', logId)
    }

    console.log('')
    console.log('===========================')
    console.log('COMPLETE')
    console.log(`  Filings Processed: ${filingsProcessed}`)
    console.log(`  Rows Inserted: ${rowsInserted}`)
    console.log(`  Rows Updated: ${rowsUpdated}`)
    console.log(`  Rows Skipped: ${rowsSkipped}`)
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
          rows_fetched: filingsProcessed,
          rows_inserted: rowsInserted,
          rows_skipped: rowsSkipped,
          duration_ms: Date.now() - startMs,
        })
        .eq('id', logId)
    }

    process.exit(1)
  }
}

main()
