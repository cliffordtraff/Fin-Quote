/**
 * Download 10-Q SEC filing HTML documents from EDGAR and save to Supabase Storage
 *
 * Usage:
 *   npx tsx scripts/download-10q-filings.ts           # Download all missing
 *   npx tsx scripts/download-10q-filings.ts --limit 5  # Download first 5 missing
 *   npx tsx scripts/download-10q-filings.ts --recent   # Download only recent (2023+)
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'

dotenv.config({ path: '.env.local' })

interface MissingFiling {
  filename: string
  periodEnd: string
  url: string
}

// Supabase client
function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase credentials')
  }

  return createClient(url, key)
}

/**
 * Download HTML from SEC EDGAR
 */
async function downloadFromSEC(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      // SEC requires a User-Agent with contact info
      'User-Agent': 'Fin Quote App contact@example.com',
      'Accept': 'text/html,application/xhtml+xml',
    },
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  return response.text()
}

/**
 * Upload HTML to Supabase Storage
 */
async function uploadToStorage(
  supabase: ReturnType<typeof getSupabaseClient>,
  filename: string,
  content: string
): Promise<void> {
  const storagePath = `html/${filename}`

  const { error } = await supabase.storage
    .from('filings')
    .upload(storagePath, content, {
      contentType: 'text/html',
      upsert: true, // Overwrite if exists
    })

  if (error) {
    throw error
  }
}

async function main() {
  const args = process.argv.slice(2)

  // Parse arguments
  let limit: number | null = null
  let recentOnly = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1])
      i++
    } else if (args[i] === '--recent') {
      recentOnly = true
    }
  }

  console.log('10-Q Filing Downloader')
  console.log('======================\n')

  // Load missing filings list
  const missingPath = path.join(process.cwd(), 'data', 'missing-10q-filings.json')

  if (!fs.existsSync(missingPath)) {
    console.error('Missing filings list not found.')
    console.error('Run first: npx tsx scripts/check-10q-storage.ts')
    process.exit(1)
  }

  let missing: MissingFiling[] = JSON.parse(fs.readFileSync(missingPath, 'utf-8'))
  console.log(`Found ${missing.length} missing 10-Q filings`)

  // Apply filters
  if (recentOnly) {
    missing = missing.filter(f => {
      const year = parseInt(f.filename.split('-')[3])
      return year >= 2023
    })
    console.log(`Filtered to ${missing.length} recent filings (2023+)`)
  }

  if (limit !== null && limit > 0) {
    missing = missing.slice(0, limit)
    console.log(`Limited to ${missing.length} filings`)
  }

  if (missing.length === 0) {
    console.log('\nNo filings to download.')
    return
  }

  console.log(`\nWill download ${missing.length} filings:\n`)
  missing.forEach(f => console.log(`  - ${f.filename}`))

  const supabase = getSupabaseClient()

  let downloaded = 0
  let errors = 0

  console.log('\n--- Starting Downloads ---\n')

  for (const filing of missing) {
    console.log(`Processing: ${filing.filename}`)

    try {
      // Download from SEC
      console.log(`  ↓ Downloading from SEC...`)
      const html = await downloadFromSEC(filing.url)

      const sizeMB = (html.length / 1024 / 1024).toFixed(2)
      console.log(`  ✓ Downloaded ${sizeMB} MB`)

      // Check if HTML contains iXBRL
      const hasIxbrl = html.includes('<ix:header') || html.includes('<ix:nonFraction')
      console.log(`  ℹ iXBRL content: ${hasIxbrl ? 'Yes' : 'No'}`)

      // Upload to Supabase Storage
      console.log(`  ↑ Uploading to storage...`)
      await uploadToStorage(supabase, filing.filename, html)
      console.log(`  ✓ Uploaded successfully`)

      downloaded++

      // Rate limit: wait 1 second between SEC requests (SEC policy)
      console.log(`  ⏳ Waiting 1s (SEC rate limit)...\n`)
      await new Promise(resolve => setTimeout(resolve, 1000))
    } catch (err) {
      console.error(`  ✗ Error: ${err instanceof Error ? err.message : err}\n`)
      errors++

      // Still wait to avoid hammering SEC on errors
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  console.log('--- Summary ---')
  console.log(`Downloaded: ${downloaded}`)
  console.log(`Errors: ${errors}`)
  console.log(`Total attempted: ${missing.length}`)

  if (downloaded > 0) {
    console.log('\nNext step: Run parser on downloaded filings')
    console.log('  npx tsx scripts/parse-ixbrl-segments.ts --ticker AAPL --filing-type 10-q')
  }
}

main().catch(console.error)
