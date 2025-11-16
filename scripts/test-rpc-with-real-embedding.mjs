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

async function testRPCWithRealEmbedding() {
  const query = "What are Apple's main risk factors?"
  console.log(`Testing search_filing_chunks RPC with query: "${query}"\n`)

  // Generate a real embedding
  console.log('Generating embedding...')
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  })

  const queryEmbedding = embeddingResponse.data[0].embedding
  console.log(`✅ Generated ${queryEmbedding.length}-dimensional embedding\n`)

  // Call the RPC function exactly as the action does
  console.log('Calling search_filing_chunks RPC...')
  const { data: result, error } = await supabase.rpc('search_filing_chunks', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_count: 3,
  })

  if (error) {
    console.error('❌ RPC call failed')
    console.log('Error:', error)
  } else {
    console.log(`✅ RPC call succeeded!`)
    console.log(`Returned ${result?.length || 0} results\n`)

    if (result && result.length > 0) {
      result.forEach((r, i) => {
        console.log(`\n=== Result ${i + 1} ===`)
        console.log(`Filing: ${r.filing_type} (${r.filing_date})`)
        console.log(`Fiscal Year: ${r.fiscal_year}${r.fiscal_quarter ? ` Q${r.fiscal_quarter}` : ''}`)
        console.log(`Section: ${r.section_name}`)
        console.log(`Similarity: ${r.similarity?.toFixed(4)}`)
        console.log(`Text: ${r.chunk_text?.substring(0, 150)}...`)
      })
    } else {
      console.log('⚠️ No results returned (but no error)')
    }
  }
}

testRPCWithRealEmbedding().catch(console.error)
