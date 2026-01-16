/**
 * Script to fetch SEC filings from SEC EDGAR API for any stock symbol
 * Saves to data/{symbol}-filings.json for ingestion
 *
 * Usage:
 *   npx tsx scripts/fetch-sec-filings.ts AAPL    # Fetch AAPL filings
 *   npx tsx scripts/fetch-sec-filings.ts GOOGL   # Fetch GOOGL filings
 *
 * SEC API docs: https://www.sec.gov/edgar/sec-api-documentation
 * Important: SEC requires User-Agent header with contact info
 */

// CIK (Central Index Key) lookup by symbol
const CIK_MAP: Record<string, string> = {
  'AAPL': '0000320193',
  'GOOGL': '0001652044',
  'MSFT': '0000789019',
  'AMZN': '0001018724',
  'META': '0001326801',
}

// Fiscal year end month by symbol (1-12)
const FISCAL_YEAR_END_MONTH: Record<string, number> = {
  'AAPL': 9,   // September
  'GOOGL': 12, // December
  'MSFT': 6,   // June
  'AMZN': 12,  // December
  'META': 12,  // December
}

// Parse command line arguments
const args = process.argv.slice(2)
const SYMBOL = args[0]?.toUpperCase() || 'AAPL'

async function fetchSecFilings() {
  const CIK = CIK_MAP[SYMBOL]
  if (!CIK) {
    console.error(`Error: Unknown symbol "${SYMBOL}". Supported symbols: ${Object.keys(CIK_MAP).join(', ')}`)
    process.exit(1)
  }

  const fiscalYearEndMonth = FISCAL_YEAR_END_MONTH[SYMBOL] || 12

  console.log(`Fetching ${SYMBOL} SEC filings from EDGAR API...`)
  console.log(`  CIK: ${CIK}`)
  console.log(`  Fiscal year end: Month ${fiscalYearEndMonth}\n`)

  // SEC requires a User-Agent header with contact information
  const headers = {
    'User-Agent': 'Fin Quote App contact@example.com',
    Accept: 'application/json',
  }

  const url = `https://data.sec.gov/submissions/CIK${CIK}.json`

  try {
    const response = await fetch(url, { headers })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()

    console.log(`✓ Fetched company info for: ${data.name} (${data.tickers.join(', ')})`)

    // Extract recent filings
    const recentFilings = data.filings.recent

    // Filter for 10-K and 10-Q only
    const filings = []
    for (let i = 0; i < recentFilings.form.length; i++) {
      const form = recentFilings.form[i]

      if (form === '10-K' || form === '10-Q') {
        const accessionNumber = recentFilings.accessionNumber[i]
        const filingDate = recentFilings.filingDate[i]
        const reportDate = recentFilings.reportDate[i]
        const primaryDocument = recentFilings.primaryDocument[i]

        // Extract fiscal year from report date
        const fiscalYear = new Date(reportDate).getFullYear()

        // Determine fiscal quarter for 10-Q based on company's fiscal year end
        let fiscalQuarter = null
        if (form === '10-Q') {
          const month = new Date(reportDate).getMonth() + 1
          // Calculate fiscal quarter based on fiscal year end month
          // For December year-end: Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec (but 10-K filed for Q4)
          // For September year-end (AAPL): Q1=Oct-Dec, Q2=Jan-Mar, Q3=Apr-Jun, Q4=Jul-Sep (but 10-K filed for Q4)
          const fiscalMonthOffset = (month - fiscalYearEndMonth + 11) % 12 // Months since fiscal year start
          fiscalQuarter = Math.floor(fiscalMonthOffset / 3) + 1
        }

        // Construct document URL
        // Format: https://www.sec.gov/Archives/edgar/data/{CIK}/{accession-no-dashes}/{primary-document}
        const accessionNoDashes = accessionNumber.replace(/-/g, '')
        const documentUrl = `https://www.sec.gov/Archives/edgar/data/${CIK.replace(/^0+/, '')}/${accessionNoDashes}/${primaryDocument}`

        filings.push({
          ticker: SYMBOL,
          filing_type: form,
          filing_date: filingDate,
          period_end_date: reportDate,
          accession_number: accessionNumber,
          document_url: documentUrl,
          fiscal_year: fiscalYear,
          fiscal_quarter: fiscalQuarter,
        })
      }
    }

    console.log(`✓ Filtered ${filings.length} filings (10-K and 10-Q only)`)

    // Sort by filing date descending (most recent first)
    filings.sort((a, b) => new Date(b.filing_date).getTime() - new Date(a.filing_date).getTime())

    // Limit to last 10 years (approximately 40-50 filings)
    const tenYearsAgo = new Date()
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10)

    const recentFilings10Years = filings.filter(
      (f) => new Date(f.filing_date) >= tenYearsAgo
    )

    console.log(`✓ Limited to last 10 years: ${recentFilings10Years.length} filings\n`)

    // Save to file
    const fs = await import('fs/promises')
    const path = await import('path')

    const dataDir = path.join(process.cwd(), 'data')
    await fs.mkdir(dataDir, { recursive: true })

    const symbolLower = SYMBOL.toLowerCase()
    const filePath = path.join(dataDir, `${symbolLower}-filings.json`)
    await fs.writeFile(filePath, JSON.stringify(recentFilings10Years, null, 2))

    console.log(`✓ Saved ${recentFilings10Years.length} filings to data/${symbolLower}-filings.json\n`)

    // Show summary by type
    const tenKCount = recentFilings10Years.filter((f) => f.filing_type === '10-K').length
    const tenQCount = recentFilings10Years.filter((f) => f.filing_type === '10-Q').length

    console.log('Summary:')
    console.log(`  10-K (Annual): ${tenKCount}`)
    console.log(`  10-Q (Quarterly): ${tenQCount}`)
    console.log('\nSample filing (most recent):')
    console.log(JSON.stringify(recentFilings10Years[0], null, 2))
  } catch (error) {
    console.error('Error fetching SEC filings:', error)
    throw error
  }
}

fetchSecFilings().catch(console.error)
