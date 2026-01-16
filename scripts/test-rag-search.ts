/**
 * Test RAG search for filing content with symbol filter
 *
 * Usage:
 *   npx tsx scripts/test-rag-search.ts AAPL "revenue growth"
 *   npx tsx scripts/test-rag-search.ts GOOGL "advertising revenue"
 */

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import * as fs from 'fs/promises'
import * as path from 'path'

// Parse command line arguments
const args = process.argv.slice(2)
const SYMBOL = args[0]?.toUpperCase() || 'GOOGL'
const QUERY = args.slice(1).join(' ') || 'What are the main revenue drivers?'

async function testRagSearch() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !OPENAI_API_KEY) {
    console.error('Error: Missing credentials in .env.local')
    return
  }

  console.log(`Testing RAG search for ${SYMBOL}`)
  console.log(`Query: "${QUERY}"\n`)

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

  // Step 1: Generate embedding for query
  console.log('Generating embedding...')
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: QUERY,
  })
  const queryEmbedding = embeddingResponse.data[0].embedding
  console.log(`✓ Embedding generated (${embeddingResponse.usage?.total_tokens} tokens)\n`)

  // Step 2: Search using manual query with ticker filter (since RPC may not have ticker support)
  console.log(`Searching filing chunks for ${SYMBOL}...`)

  // Query filing_chunks with ticker filter via joined filings table
  let queryBuilder = supabase
    .from('filing_chunks')
    .select(`
      chunk_text,
      section_name,
      embedding,
      filings!inner(filing_type, filing_date, fiscal_year, fiscal_quarter, ticker)
    `)
    .not('embedding', 'is', null)
    .eq('filings.ticker', SYMBOL)
    .limit(100) // Get more to sort by similarity

  const { data: allChunks, error } = await queryBuilder

  if (error) {
    console.error('Error searching:', error)
    return
  }

  // Sort by vector similarity (cosine distance)
  // Note: This is client-side sorting since we can't use pgvector operators via REST API
  const chunksWithSimilarity = (allChunks || []).map((chunk: any) => {
    // Calculate cosine similarity
    // Embedding is stored as a string representation of vector, parse it
    let embedding: number[]
    if (typeof chunk.embedding === 'string') {
      // Parse pgvector format: "[0.1,0.2,...]"
      embedding = JSON.parse(chunk.embedding.replace(/^\[/, '[').replace(/\]$/, ']'))
    } else {
      embedding = chunk.embedding as number[]
    }

    let dotProduct = 0
    let normA = 0
    let normB = 0
    for (let i = 0; i < queryEmbedding.length && i < embedding.length; i++) {
      dotProduct += queryEmbedding[i] * embedding[i]
      normA += queryEmbedding[i] ** 2
      normB += embedding[i] ** 2
    }
    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))

    return {
      chunk_text: chunk.chunk_text,
      section_name: chunk.section_name || 'Unknown',
      filing_type: chunk.filings.filing_type,
      filing_date: chunk.filings.filing_date,
      fiscal_year: chunk.filings.fiscal_year,
      fiscal_quarter: chunk.filings.fiscal_quarter,
      similarity,
    }
  })

  // Sort by similarity descending and take top 5
  chunksWithSimilarity.sort((a, b) => b.similarity - a.similarity)
  const chunks = chunksWithSimilarity.slice(0, 5)

  console.log(`✓ Found ${chunks?.length || 0} relevant passages\n`)

  // Step 3: Display results
  if (chunks && chunks.length > 0) {
    console.log('--- Results ---\n')
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      console.log(`[${i + 1}] ${chunk.filing_type} FY${chunk.fiscal_year} - ${chunk.section_name}`)
      console.log(`    Similarity: ${(chunk.similarity * 100).toFixed(1)}%`)
      console.log(`    Preview: ${chunk.chunk_text.slice(0, 200).replace(/\n/g, ' ')}...`)
      console.log()
    }
  } else {
    console.log('No results found. Make sure filings have been chunked and embedded.')
  }
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

loadEnv().then(() => testRagSearch()).catch(console.error)
