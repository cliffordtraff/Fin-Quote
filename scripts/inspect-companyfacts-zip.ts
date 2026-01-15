/**
 * Inspect SEC companyfacts.zip to see what data is available for AAPL
 * 
 * This script:
 * 1. Downloads the nightly companyfacts.zip from SEC
 * 2. Extracts and finds AAPL's JSON file (CIK0000320193.json)
 * 3. Parses and displays key information about what data is available
 * 
 * Run with: npx tsx scripts/inspect-companyfacts-zip.ts
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { pipeline } from 'stream/promises'
import { createWriteStream } from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

const SEC_COMPANYFACTS_URL = 'https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip'
const AAPL_CIK = '0000320193'
const TEMP_DIR = path.join(process.cwd(), 'temp')
const ZIP_PATH = path.join(TEMP_DIR, 'companyfacts.zip')

async function downloadCompanyFactsZip() {
  console.log('📥 Downloading companyfacts.zip from SEC...\n')
  
  // Ensure temp directory exists
  await fs.mkdir(TEMP_DIR, { recursive: true })
  
  const response = await fetch(SEC_COMPANYFACTS_URL, {
    headers: {
      'User-Agent': 'Fin Quote App contact@example.com',
      Accept: 'application/zip',
    },
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const fileStream = createWriteStream(ZIP_PATH)
  await pipeline(response.body as any, fileStream)
  
  const stats = await fs.stat(ZIP_PATH)
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2)
  console.log(`✓ Downloaded ${sizeMB} MB\n`)
  
  return ZIP_PATH
}

async function extractAndFindAAPL(zipPath: string) {
  console.log('📦 Extracting ZIP file...\n')
  
  const extractDir = path.join(TEMP_DIR, 'companyfacts')
  await fs.mkdir(extractDir, { recursive: true })
  
  // Use unzip command (available on macOS/Linux) or node's built-in capabilities
  try {
    // Try using unzip command first
    await execAsync(`unzip -q -o "${zipPath}" -d "${extractDir}"`)
    console.log('✓ Extraction complete\n')
  } catch (error) {
    // Fallback: try using Node.js yauzl or adm-zip if available
    console.log('⚠ unzip command not available, trying alternative...\n')
    throw new Error('ZIP extraction requires unzip command or additional npm package')
  }
  
  // Find AAPL's JSON file
  const aaplFile = path.join(extractDir, `CIK${AAPL_CIK}.json`)
  
  try {
    await fs.access(aaplFile)
    console.log(`✓ Found AAPL file: CIK${AAPL_CIK}.json\n`)
    return aaplFile
  } catch {
    // Try to find it in subdirectories
    const files = await fs.readdir(extractDir, { recursive: true })
    const foundFile = files.find((f: string) => f.includes(`CIK${AAPL_CIK}`))
    
    if (foundFile) {
      const fullPath = path.join(extractDir, foundFile)
      console.log(`✓ Found AAPL file: ${foundFile}\n`)
      return fullPath
    } else {
      throw new Error(`Could not find CIK${AAPL_CIK}.json in ZIP`)
    }
  }
}

async function analyzeAAPLData(jsonPath: string) {
  console.log('📊 Analyzing AAPL data...\n')
  
  const fileContent = await fs.readFile(jsonPath, 'utf-8')
  const data = JSON.parse(fileContent)
  
  console.log('='.repeat(60))
  console.log('AAPL COMPANY FACTS SUMMARY')
  console.log('='.repeat(60))
  console.log(`\nCompany: ${data.entityName || 'N/A'}`)
  console.log(`CIK: ${data.cik || 'N/A'}`)
  console.log(`SIC: ${data.sic || 'N/A'}`)
  console.log(`SIC Description: ${data.sicDescription || 'N/A'}`)
  
  if (data.facts) {
    console.log('\n' + '='.repeat(60))
    console.log('AVAILABLE DATA CATEGORIES')
    console.log('='.repeat(60))
    
    // Count facts by taxonomy
    const taxonomies = Object.keys(data.facts)
    console.log(`\nTaxonomies: ${taxonomies.join(', ')}`)
    
    // Analyze us-gaap facts (most common)
    if (data.facts['us-gaap']) {
      const usgaapFacts = data.facts['us-gaap']
      const factNames = Object.keys(usgaapFacts)
      
      console.log(`\nUS-GAAP Facts Available: ${factNames.length}`)
      
      // Group by category (common financial statement items)
      const categories: Record<string, string[]> = {
        'Revenue & Sales': [],
        'Income Statement': [],
        'Balance Sheet': [],
        'Cash Flow': [],
        'Per Share': [],
        'Ratios': [],
        'Other': [],
      }
      
      factNames.forEach(fact => {
        const lower = fact.toLowerCase()
        if (lower.includes('revenue') || lower.includes('sales') || lower.includes('net sales')) {
          categories['Revenue & Sales'].push(fact)
        } else if (lower.includes('income') || lower.includes('profit') || lower.includes('ebit') || lower.includes('expense')) {
          categories['Income Statement'].push(fact)
        } else if (lower.includes('asset') || lower.includes('liabilit') || lower.includes('equity') || lower.includes('debt')) {
          categories['Balance Sheet'].push(fact)
        } else if (lower.includes('cash') || lower.includes('flow')) {
          categories['Cash Flow'].push(fact)
        } else if (lower.includes('share') || lower.includes('per share')) {
          categories['Per Share'].push(fact)
        } else if (lower.includes('ratio') || lower.includes('margin') || lower.includes('return')) {
          categories['Ratios'].push(fact)
        } else {
          categories['Other'].push(fact)
        }
      })
      
      // Display by category
      Object.entries(categories).forEach(([category, facts]) => {
        if (facts.length > 0) {
          console.log(`\n${category} (${facts.length}):`)
          facts.slice(0, 10).forEach(fact => {
            const factData = usgaapFacts[fact]
            const units = Object.keys(factData.units || {})
            const unitCount = units.length
            const firstUnit = units[0]
            const valueCount = firstUnit ? factData.units[firstUnit].length : 0
            
            console.log(`  - ${fact}`)
            console.log(`    Units: ${unitCount} (${units.slice(0, 3).join(', ')}${units.length > 3 ? '...' : ''})`)
            console.log(`    Data points: ${valueCount}`)
            
            // Show sample value if available
            if (firstUnit && factData.units[firstUnit].length > 0) {
              const latest = factData.units[firstUnit][factData.units[firstUnit].length - 1]
              console.log(`    Latest: ${latest.val?.toLocaleString()} ${firstUnit} (${latest.end || 'N/A'})`)
            }
          })
          if (facts.length > 10) {
            console.log(`  ... and ${facts.length - 10} more`)
          }
        }
      })
    }
    
    // Show sample of specific metrics you're interested in
    console.log('\n' + '='.repeat(60))
    console.log('KEY METRICS SAMPLE')
    console.log('='.repeat(60))
    
    const keyMetrics = [
      'Revenues',
      'NetIncomeLoss',
      'Assets',
      'Liabilities',
      'StockholdersEquity',
      'OperatingCashFlow',
      'EarningsPerShareBasic',
    ]
    
    if (data.facts['us-gaap']) {
      keyMetrics.forEach(metric => {
        const fact = data.facts['us-gaap'][metric]
        if (fact) {
          console.log(`\n${metric}:`)
          const units = Object.keys(fact.units)
          units.forEach(unit => {
            const values = fact.units[unit]
            console.log(`  Unit: ${unit}`)
            console.log(`  Data points: ${values.length}`)
            if (values.length > 0) {
              const latest = values[values.length - 1]
              const oldest = values[0]
              console.log(`  Latest: ${latest.val?.toLocaleString()} (${latest.end || 'N/A'})`)
              console.log(`  Oldest: ${oldest.val?.toLocaleString()} (${oldest.end || 'N/A'})`)
              console.log(`  Years covered: ${new Date(latest.end).getFullYear() - new Date(oldest.end).getFullYear() + 1}`)
            }
          })
        } else {
          console.log(`\n${metric}: Not found`)
        }
      })
    }
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('FILE SIZE')
  console.log('='.repeat(60))
  const stats = await fs.stat(jsonPath)
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2)
  console.log(`AAPL JSON file: ${sizeMB} MB\n`)
  
  // Save a sample to file for inspection
  const samplePath = path.join(process.cwd(), 'data', 'aapl-companyfacts-sample.json')
  await fs.mkdir(path.dirname(samplePath), { recursive: true })
  await fs.writeFile(samplePath, JSON.stringify(data, null, 2))
  console.log(`✓ Saved sample to: ${samplePath}\n`)
}

async function cleanup() {
  console.log('🧹 Cleaning up temporary files...\n')
  try {
    await fs.rm(TEMP_DIR, { recursive: true, force: true })
    console.log('✓ Cleanup complete\n')
  } catch (err) {
    console.warn('⚠ Could not clean up temp files:', err)
  }
}

async function main() {
  try {
    const zipPath = await downloadCompanyFactsZip()
    const aaplJsonPath = await extractAndFindAAPL(zipPath)
    await analyzeAAPLData(aaplJsonPath)
    await cleanup()
    
    console.log('✅ Analysis complete!')
    console.log('\nNext steps:')
    console.log('1. Review data/aapl-companyfacts-sample.json')
    console.log('2. Compare with your current FMP API data')
    console.log('3. Decide if you want to switch to SEC XBRL data')
  } catch (error) {
    console.error('❌ Error:', error)
    await cleanup()
    process.exit(1)
  }
}

main()
