/**
 * One-time script to fetch AAPL SEC filings from SEC EDGAR API
 * Saves to data/aapl-filings.json for ingestion
 *
 * SEC API docs: https://www.sec.gov/edgar/sec-api-documentation
 * Important: SEC requires User-Agent header with contact info
 */

// AAPL CIK (Central Index Key) with leading zeros removed for API
const AAPL_CIK = '0000320193'

async function fetchSecFilings() {
  console.log('Fetching AAPL SEC filings from EDGAR API...\n')

  // SEC requires a User-Agent header with contact information
  const headers = {
    'User-Agent': 'Fin Quote App contact@example.com',
    Accept: 'application/json',
  }

  const url = `https://data.sec.gov/submissions/CIK${AAPL_CIK}.json`

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

        // Determine fiscal quarter for 10-Q
        let fiscalQuarter = null
        if (form === '10-Q') {
          const month = new Date(reportDate).getMonth() + 1
          // AAPL fiscal year ends in September
          // Q1: Oct-Dec (month 12, 1, 2)
          // Q2: Jan-Mar (month 3, 4, 5)
          // Q3: Apr-Jun (month 6, 7, 8)
          // Q4: Jul-Sep (month 9, 10, 11) - but 10-K is filed for this period
          if (month >= 10 || month <= 12) fiscalQuarter = 1
          else if (month >= 1 && month <= 3) fiscalQuarter = 2
          else if (month >= 4 && month <= 6) fiscalQuarter = 3
          else if (month >= 7 && month <= 9) fiscalQuarter = 4
        }

        // Construct document URL
        // Format: https://www.sec.gov/Archives/edgar/data/{CIK}/{accession-no-dashes}/{primary-document}
        const accessionNoDashes = accessionNumber.replace(/-/g, '')
        const documentUrl = `https://www.sec.gov/Archives/edgar/data/${AAPL_CIK.replace(/^0+/, '')}/${accessionNoDashes}/${primaryDocument}`

        filings.push({
          ticker: 'AAPL',
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

    const filePath = path.join(dataDir, 'aapl-filings.json')
    await fs.writeFile(filePath, JSON.stringify(recentFilings10Years, null, 2))

    console.log(`✓ Saved ${recentFilings10Years.length} filings to data/aapl-filings.json\n`)

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
