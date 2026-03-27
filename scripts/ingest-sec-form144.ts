/**
 * SEC Form 144 ingestion script.
 *
 * Fetches recent Form 144 / 144/A filings from the SEC current filings feed,
 * parses proposed sale market values from primary_doc.xml, resolves issuer
 * tickers, and inserts them into insider_transactions for homepage ranking.
 *
 * Usage:
 *   npx tsx scripts/ingest-sec-form144.ts
 *   npx tsx scripts/ingest-sec-form144.ts --since 2026-03-01
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import sp500Constituents from '../data/sp500-constituents.json'
import {
  getPrimaryForm144DocumentUrl,
  parseSecForm144Document,
  parseSecForm144Feed,
  type Form144FeedEntry,
  type Form144ParsedDocument,
} from '../lib/sec-form144'

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

const cikToSp500Symbol = new Map<string, string>(
  sp500Constituents
    .filter((row) => Boolean(row.cik) && Boolean(row.symbol))
    .map((row) => [String(row.cik).padStart(10, '0'), row.symbol])
)

function toIsoDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function parseArgsSinceDate(): string {
  const args = process.argv.slice(2)
  let sinceDate: string | null = null

  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--since' && args[index + 1]) {
      sinceDate = args[index + 1]
      index += 1
    }
  }

  if (sinceDate) {
    return sinceDate
  }

  const defaultSince = new Date()
  defaultSince.setDate(defaultSince.getDate() - 14)
  return toIsoDate(defaultSince)
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

async function fetchRecentForm144Entries(sinceDate: string): Promise<Form144FeedEntry[]> {
  const entries: Form144FeedEntry[] = []
  const seenAccessions = new Set<string>()
  const count = 100
  const maxPages = 5

  for (let page = 0; page < maxPages; page++) {
    const start = page * count
    const xml = await fetchSecText(
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=144&owner=only&count=${count}&start=${start}&output=atom`
    )
    const pageEntries = parseSecForm144Feed(xml)

    if (pageEntries.length === 0) {
      break
    }

    let oldestDateOnPage = pageEntries[pageEntries.length - 1]?.filingDate ?? null

    for (const entry of pageEntries) {
      if (entry.filingDate < sinceDate) {
        oldestDateOnPage = entry.filingDate
        continue
      }

      if (seenAccessions.has(entry.accessionNumber)) {
        continue
      }

      seenAccessions.add(entry.accessionNumber)
      entries.push(entry)
    }

    if (oldestDateOnPage && oldestDateOnPage < sinceDate) {
      break
    }
  }

  return entries
}

async function fetchParsedDocuments(entries: Form144FeedEntry[]): Promise<Form144ParsedDocument[]> {
  const parsed: Form144ParsedDocument[] = []
  const batchSize = 1

  for (let index = 0; index < entries.length; index += batchSize) {
    const batch = entries.slice(index, index + batchSize)
    const results = await Promise.all(
      batch.map(async (entry) => {
        try {
          const xml = await fetchSecText(getPrimaryForm144DocumentUrl(entry.filingHref))
          return parseSecForm144Document(xml, entry)
        } catch (error) {
          console.error(`Failed to parse Form 144 ${entry.accessionNumber}:`, error)
          return null
        }
      })
    )

    parsed.push(...results.filter((result): result is Form144ParsedDocument => result !== null))
  }

  return parsed
}

async function resolveSymbols(documents: Form144ParsedDocument[]): Promise<Map<string, string>> {
  const symbols = new Map<string, string>()
  const issuerCiks = [...new Set(documents.map((doc) => doc.issuerCik.padStart(10, '0')))]

  for (const issuerCik of issuerCiks) {
    const sp500Symbol = cikToSp500Symbol.get(issuerCik)
    if (sp500Symbol) {
      symbols.set(issuerCik, sp500Symbol)
      continue
    }

    try {
      const json = await fetchSecText(`https://data.sec.gov/submissions/CIK${issuerCik}.json`)
      const payload = JSON.parse(json)
      const ticker = Array.isArray(payload?.tickers) ? payload.tickers[0] : null

      if (ticker) {
        symbols.set(issuerCik, String(ticker).toUpperCase())
      }
    } catch (error) {
      console.error(`Failed to resolve issuer CIK ${issuerCik}:`, error)
    }
  }

  return symbols
}

async function main() {
  const sinceDate = parseArgsSinceDate()
  const startedAt = new Date().toISOString()
  const startMs = Date.now()

  console.log('SEC Form 144 Ingestion')
  console.log('======================')
  console.log(`Since: ${sinceDate}`)
  console.log('')

  const { data: logEntry } = await supabase
    .from('ingestion_logs')
    .insert({
      source: 'sec-144',
      started_at: startedAt,
    })
    .select()
    .single()

  const logId = logEntry?.id

  let inserted = 0
  let skipped = 0
  let errors = 0
  let rowsFetched = 0

  try {
    const entries = await fetchRecentForm144Entries(sinceDate)
    rowsFetched = entries.length
    console.log(`Fetched ${entries.length} unique Form 144 filings`)

    const parsedDocuments = await fetchParsedDocuments(entries)
    console.log(`Parsed ${parsedDocuments.length} filings with proposed sale values`)

    const symbolMap = await resolveSymbols(parsedDocuments)
    console.log(`Resolved ${symbolMap.size} issuer symbols`)

    for (const document of parsedDocuments) {
      const issuerCik = document.issuerCik.padStart(10, '0')
      const symbol = symbolMap.get(issuerCik)

      if (!symbol) {
        skipped += 1
        continue
      }

      const { data: insiderId } = await supabase.rpc('get_or_create_insider', {
        p_name: document.reportingName,
        p_cik: document.filerCik,
      })

      const shares = document.shares
      const price = document.value / shares

      const record = {
        insider_id: insiderId || null,
        symbol,
        accession_number: document.accessionNumber,
        filing_date: document.filingDate,
        transaction_date: document.transactionDate,
        transaction_type: 'PROPOSED_SALE',
        transaction_code: 'S',
        acquisition_disposition: 'D',
        shares,
        price,
        shares_owned_after: null,
        reporting_name: document.reportingName,
        owner_type: document.ownerType || null,
        officer_title: null,
        security_name: null,
        form_type: document.formType,
        source: 'sec-144',
        source_id: document.accessionNumber,
        sec_link: document.filingHref,
      }

      const { error: insertError } = await supabase
        .from('insider_transactions')
        .insert(record)

      if (insertError) {
        if (insertError.code === '23505') {
          skipped += 1
        } else {
          errors += 1
          console.error(`Insert error for ${symbol} / ${document.reportingName}:`, insertError.message)
        }
      } else {
        inserted += 1
      }
    }

    const duration = Date.now() - startMs

    if (logId) {
      await supabase
        .from('ingestion_logs')
        .update({
          completed_at: new Date().toISOString(),
          status: errors > 0 ? 'partial' : 'success',
          rows_fetched: rowsFetched,
          rows_inserted: inserted,
          rows_skipped: skipped,
          error_message: errors > 0 ? `${errors} errors` : null,
          duration_ms: duration,
        })
        .eq('id', logId)
    }

    console.log('')
    console.log('======================')
    console.log('COMPLETE')
    console.log(`  Fetched: ${rowsFetched}`)
    console.log(`  Inserted: ${inserted}`)
    console.log(`  Skipped: ${skipped}`)
    console.log(`  Errors: ${errors}`)
    console.log(`  Duration: ${(duration / 1000).toFixed(1)}s`)
  } catch (error) {
    console.error('Fatal error:', error)

    if (logId) {
      await supabase
        .from('ingestion_logs')
        .update({
          completed_at: new Date().toISOString(),
          status: 'failed',
          rows_fetched: rowsFetched,
          rows_inserted: inserted,
          rows_skipped: skipped,
          error_message: error instanceof Error ? error.message : 'Unknown error',
          duration_ms: Date.now() - startMs,
        })
        .eq('id', logId)
    }

    process.exit(1)
  }
}

main()
