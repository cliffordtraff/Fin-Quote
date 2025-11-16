import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import OpenAI from 'openai'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const openaiKey = process.env.OPENAI_API_KEY

if (!supabaseUrl || !supabaseKey || !openaiKey) {
  console.error('Missing credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)
const openai = new OpenAI({ apiKey: openaiKey })

async function testFilingsSearch() {
  console.log('Testing SEC filings search...\n')

  const testQuery = "What are Apple's main risk factors?"

  console.log(`Query: "${testQuery}"\n`)

  // Generate embedding for the query
  console.log('Generating embedding...')
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: testQuery,
  })

  const queryEmbedding = embeddingResponse.data[0].embedding
  console.log(`Embedding generated: ${queryEmbedding.length} dimensions\n`)

  // Search using the RPC function
  console.log('Searching filing chunks...')
  const { data: results, error } = await supabase.rpc('search_filing_chunks', {
    query_embedding: queryEmbedding,
    match_threshold: 0.5,
    match_count: 3,
  })

  if (error) {
    console.error('Search error:', error)
    return
  }

  console.log(`Found ${results?.length || 0} results\n`)

  if (results && results.length > 0) {
    results.forEach((result, i) => {
      console.log(`\n=== Result ${i + 1} ===`)
      console.log(`Filing ID: ${result.filing_id}`)
      console.log(`Similarity: ${result.similarity?.toFixed(4)}`)
      console.log(`Section: ${result.section_name || 'Unknown'}`)
      console.log(`Word count: ${result.word_count}`)
      console.log(`Text preview: ${result.chunk_text?.substring(0, 200)}...`)
    })
  } else {
    console.log('No results found')
  }
}

testFilingsSearch().catch(console.error)
