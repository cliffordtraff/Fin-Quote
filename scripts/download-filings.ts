/**
 * Download SEC filing HTML documents from EDGAR and save to Supabase Storage
 * Run with: npx tsx scripts/download-filings.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs/promises'
import * as path from 'path'

async function downloadFilings() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Error: Missing Supabase credentials in .env.local')
    return
  }

  console.log('Starting SEC filing downloads...\n')

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  // Get filings from database (10 years of 10-K filings)
  const { data: filings, error: fetchError } = await supabase
    .from('filings')
    .select('*')
    .eq('ticker', 'AAPL')
    .eq('filing_type', '10-K')
    .order('filing_date', { ascending: false })
    .limit(10)

  if (fetchError || !filings) {
    console.error('Error fetching filings:', fetchError)
    return
  }

  console.log(`Found ${filings.length} filings to download\n`)

  let downloaded = 0
  let skipped = 0
  let errors = 0

  for (const filing of filings) {
    const fileName = `${filing.ticker.toLowerCase()}-${filing.filing_type.toLowerCase()}-${filing.fiscal_year}${filing.fiscal_quarter ? '-q' + filing.fiscal_quarter : ''}.html`
    const storagePath = `html/${fileName}`

    console.log(`Processing: ${filing.filing_type} ${filing.filing_date} (FY${filing.fiscal_year})`)

    // Check if already downloaded
    const { data: existingFile } = await supabase.storage
      .from('filings')
      .list('html', {
        search: fileName,
      })

    if (existingFile && existingFile.length > 0) {
      console.log(`  ⊘ Already downloaded: ${fileName}`)
      skipped++
      continue
    }

    // Download from SEC with required User-Agent
    try {
      console.log(`  ↓ Downloading from SEC...`)
      const response = await fetch(filing.document_url, {
        headers: {
          'User-Agent': 'Fin Quote App contact@example.com', // SEC requires this
          Accept: 'text/html,application/xhtml+xml',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const html = await response.text()
      const fileSizeMB = (html.length / 1024 / 1024).toFixed(2)
      console.log(`  ✓ Downloaded ${fileSizeMB} MB`)

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('filings')
        .upload(storagePath, html, {
          contentType: 'text/html',
          upsert: false,
        })

      if (uploadError) {
        throw uploadError
      }

      console.log(`  ✓ Uploaded to storage: ${storagePath}`)

      // Update filing record to mark as downloaded
      const { error: updateError } = await supabase
        .from('filings')
        .update({
          // We'll add a 'downloaded' column later, for now just log
        })
        .eq('id', filing.id)

      downloaded++

      // Rate limit: wait 1 second between SEC requests (be polite)
      await new Promise((resolve) => setTimeout(resolve, 1000))
    } catch (err) {
      console.error(
        `  ✗ Error downloading ${filing.filing_type} ${filing.filing_date}:`,
        err instanceof Error ? err.message : err
      )
      errors++
    }

    console.log() // blank line
  }

  console.log('--- Summary ---')
  console.log(`Downloaded: ${downloaded}`)
  console.log(`Skipped (already exists): ${skipped}`)
  console.log(`Errors: ${errors}`)
  console.log(`Total processed: ${filings.length}`)
}

// Load environment variables from .env.local
async function loadEnv() {
  try {
    const envPath = path.join(process.cwd(), '.env.local')
    const envContent = await fs.readFile(envPath, 'utf-8')

    envContent.split('\n').forEach((line) => {
      const match = line.match(/^([^=:#]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        const value = match[2].trim()
        process.env[key] = value
      }
    })
  } catch (error) {
    console.error('Error loading .env.local:', error)
  }
}

loadEnv().then(() => downloadFilings()).catch(console.error)
