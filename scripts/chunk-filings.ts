/**
 * Parse downloaded HTML filings and chunk them into passages
 * Run with: npx tsx scripts/chunk-filings.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs/promises'
import * as path from 'path'

const CHUNK_SIZE = 800 // words per chunk
const CHUNK_OVERLAP = 100 // words overlap between chunks

async function chunkFilings() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Error: Missing Supabase credentials in .env.local')
    return
  }

  console.log('Starting filing chunking process...\n')

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  // List downloaded HTML files
  const { data: files, error: listError } = await supabase.storage
    .from('filings')
    .list('html')

  if (listError || !files) {
    console.error('Error listing files:', listError)
    return
  }

  console.log(`Found ${files.length} HTML files in storage\n`)

  let processed = 0
  let totalChunks = 0

  for (const file of files) {
    if (!file.name.endsWith('.html')) continue

    console.log(`Processing: ${file.name}`)

    // Download HTML from storage
    const { data: htmlBlob, error: downloadError } = await supabase.storage
      .from('filings')
      .download(`html/${file.name}`)

    if (downloadError || !htmlBlob) {
      console.error(`  ✗ Error downloading: ${downloadError?.message}`)
      continue
    }

    const html = await htmlBlob.text()

    // Parse filename to get filing info
    // Format: aapl-10-k-2024.html or aapl-10-q-2024-q1.html
    const fileNameMatch = file.name.match(/(\w+)-(\d+)-?([kq])-(\d{4})(?:-q(\d))?\.html/)
    if (!fileNameMatch) {
      console.error(`  ✗ Could not parse filename: ${file.name}`)
      continue
    }

    const [, ticker, , filingTypeLetter, fiscalYear, fiscalQuarter] = fileNameMatch
    const filingType = filingTypeLetter === 'k' ? '10-K' : '10-Q'

    // Find filing in database
    const { data: filings, error: filingError } = await supabase
      .from('filings')
      .select('id')
      .eq('ticker', ticker.toUpperCase())
      .eq('filing_type', filingType)
      .eq('fiscal_year', parseInt(fiscalYear))

    if (filingError || !filings || filings.length === 0) {
      console.error(`  ✗ Could not find filing in database`)
      continue
    }

    const filingId = filings[0].id

    // Check if already chunked
    const { data: existingChunks } = await supabase
      .from('filing_chunks')
      .select('id')
      .eq('filing_id', filingId)
      .limit(1)

    if (existingChunks && existingChunks.length > 0) {
      console.log(`  ⊘ Already chunked`)
      continue
    }

    // Extract clean text from HTML
    const cleanText = extractTextFromHtml(html)
    console.log(`  ✓ Extracted ${cleanText.length.toLocaleString()} characters`)

    // Split into chunks
    const chunks = createChunks(cleanText, CHUNK_SIZE, CHUNK_OVERLAP)
    console.log(`  ✓ Created ${chunks.length} chunks`)

    // Insert chunks into database (without embeddings for now)
    let insertedCount = 0
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]

      const { error: insertError } = await supabase.from('filing_chunks').insert({
        filing_id: filingId,
        chunk_index: i,
        chunk_text: chunk.text,
        section_name: detectSection(chunk.text),
        word_count: chunk.wordCount,
        embedding: null, // Will be added by embed-filings.ts
      })

      if (insertError) {
        console.error(`  ✗ Error inserting chunk ${i}:`, insertError.message)
      } else {
        insertedCount++
      }
    }

    console.log(`  ✓ Inserted ${insertedCount}/${chunks.length} chunks into database\n`)

    processed++
    totalChunks += insertedCount
  }

  console.log('--- Summary ---')
  console.log(`Files processed: ${processed}`)
  console.log(`Total chunks created: ${totalChunks}`)
}

function extractTextFromHtml(html: string): string {
  // Remove script and style tags
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')

  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, ' ')

  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))

  // Clean up whitespace
  text = text.replace(/\s+/g, ' ')
  text = text.trim()

  return text
}

function createChunks(
  text: string,
  chunkSize: number,
  overlap: number
): Array<{ text: string; wordCount: number }> {
  const words = text.split(/\s+/)
  const chunks: Array<{ text: string; wordCount: number }> = []

  let i = 0
  while (i < words.length) {
    const chunkWords = words.slice(i, i + chunkSize)
    const chunkText = chunkWords.join(' ')

    chunks.push({
      text: chunkText,
      wordCount: chunkWords.length,
    })

    // Move forward by (chunkSize - overlap) to create overlap
    i += chunkSize - overlap
  }

  return chunks
}

function detectSection(text: string): string {
  // Simple section detection based on keywords
  const lowerText = text.toLowerCase().substring(0, 500)

  if (lowerText.includes('risk factor')) return 'Risk Factors'
  if (lowerText.includes('management discussion') || lowerText.includes('md&a'))
    return 'MD&A'
  if (lowerText.includes('business description') || lowerText.includes('item 1.'))
    return 'Business'
  if (lowerText.includes('financial statement')) return 'Financial Statements'
  if (lowerText.includes('note to financial')) return 'Notes to Financials'

  return 'Other'
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

loadEnv().then(() => chunkFilings()).catch(console.error)
