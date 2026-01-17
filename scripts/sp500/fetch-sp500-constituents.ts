/**
 * Phase 1: Fetch S&P 500 constituents from Financial Modeling Prep API
 *
 * Downloads the current list of S&P 500 companies and saves to a JSON file
 * for review before database ingestion.
 *
 * Usage:
 *   npx tsx scripts/sp500/fetch-sp500-constituents.ts
 */

import * as fs from 'fs/promises'
import * as path from 'path'

interface FMPSP500Constituent {
  symbol: string
  name: string
  sector: string
  subSector: string
  headQuarter: string
  dateFirstAdded: string | null
  cik: string | null
  founded: string | null
}

interface SP500Constituent {
  symbol: string
  name: string
  sector: string
  sub_industry: string
  headquarters_location: string
  date_added: string | null
  cik: string | null
  is_active: boolean
  alternate_symbols: Record<string, string>
}

// Symbols with known vendor variations
const SYMBOL_VARIATIONS: Record<string, { fmp: string; canonical: string }> = {
  'BRK-B': { fmp: 'BRK-B', canonical: 'BRK.B' },
  'BF-B': { fmp: 'BF-B', canonical: 'BF.B' },
}

function normalizeSymbol(fmpSymbol: string): { canonical: string; alternate_symbols: Record<string, string> } {
  const variation = SYMBOL_VARIATIONS[fmpSymbol]
  if (variation) {
    return {
      canonical: variation.canonical,
      alternate_symbols: {
        fmp: variation.fmp,
        ui: variation.canonical,
      },
    }
  }
  return {
    canonical: fmpSymbol,
    alternate_symbols: {},
  }
}

async function fetchSP500Constituents(): Promise<SP500Constituent[]> {
  const FMP_API_KEY = process.env.FMP_API_KEY
  if (!FMP_API_KEY) {
    throw new Error('FMP_API_KEY not found in environment')
  }

  const url = `https://financialmodelingprep.com/api/v3/sp500_constituent?apikey=${FMP_API_KEY}`

  console.log('Fetching S&P 500 constituents from FMP API...')
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`FMP API error: ${response.status} ${response.statusText}`)
  }

  const fmpData: FMPSP500Constituent[] = await response.json()
  console.log(`✓ Received ${fmpData.length} constituents from FMP\n`)

  // Transform to our schema
  const constituents: SP500Constituent[] = fmpData.map((item) => {
    const { canonical, alternate_symbols } = normalizeSymbol(item.symbol)

    return {
      symbol: canonical,
      name: item.name,
      sector: item.sector,
      sub_industry: item.subSector,
      headquarters_location: item.headQuarter,
      date_added: item.dateFirstAdded || null,
      cik: item.cik || null,
      is_active: true,
      alternate_symbols,
    }
  })

  return constituents
}

function generateReport(constituents: SP500Constituent[]): void {
  console.log('='.repeat(60))
  console.log('S&P 500 CONSTITUENTS REPORT')
  console.log('='.repeat(60))
  console.log()

  // Count by sector
  const sectorCounts = new Map<string, number>()
  for (const c of constituents) {
    const sector = c.sector || 'Unknown'
    sectorCounts.set(sector, (sectorCounts.get(sector) || 0) + 1)
  }

  console.log('By Sector:')
  const sortedSectors = Array.from(sectorCounts.entries()).sort((a, b) => b[1] - a[1])
  for (const [sector, count] of sortedSectors) {
    console.log(`  ${sector}: ${count}`)
  }
  console.log()

  // Check for special symbols
  const specialSymbols = constituents.filter((c) => Object.keys(c.alternate_symbols).length > 0)
  if (specialSymbols.length > 0) {
    console.log('Special Symbols (with vendor variations):')
    for (const c of specialSymbols) {
      console.log(`  ${c.symbol} -> FMP uses: ${c.alternate_symbols.fmp}`)
    }
    console.log()
  }

  // Check for missing CIKs
  const missingCIKs = constituents.filter((c) => !c.cik)
  if (missingCIKs.length > 0) {
    console.log(`Missing CIKs: ${missingCIKs.length} stocks`)
    console.log(`  (CIK is optional - only needed for SEC integration)`)
    console.log()
  }

  // Check for missing dates
  const missingDates = constituents.filter((c) => !c.date_added)
  console.log(`Missing date_added: ${missingDates.length} stocks`)
  console.log()

  console.log('Summary:')
  console.log(`  Total constituents: ${constituents.length}`)
  console.log(`  With CIK: ${constituents.length - missingCIKs.length}`)
  console.log(`  With date_added: ${constituents.length - missingDates.length}`)
}

async function main() {
  console.log('='.repeat(60))
  console.log('PHASE 1: Fetch S&P 500 Constituents')
  console.log('='.repeat(60))
  console.log()

  // Load environment variables
  const envPath = path.join(process.cwd(), '.env.local')
  try {
    const envContent = await fs.readFile(envPath, 'utf-8')
    envContent.split('\n').forEach((line) => {
      const match = line.match(/^([^=:#]+)=(.*)$/)
      if (match) {
        process.env[match[1].trim()] = match[2].trim()
      }
    })
  } catch {
    console.error('Error: Could not load .env.local')
    process.exit(1)
  }

  // Fetch constituents
  const constituents = await fetchSP500Constituents()

  // Generate report
  generateReport(constituents)

  // Save to JSON file
  const outputDir = path.join(process.cwd(), 'data')
  await fs.mkdir(outputDir, { recursive: true })

  const outputPath = path.join(outputDir, 'sp500-constituents.json')
  await fs.writeFile(outputPath, JSON.stringify(constituents, null, 2))

  console.log(`\n✓ Saved to ${outputPath}`)
  console.log('\nNext step: Review the JSON file, then run:')
  console.log('  npx tsx scripts/sp500/ingest-sp500-constituents.ts')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
