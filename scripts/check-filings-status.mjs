import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkFilingsData() {
  console.log('Checking SEC filings data...\n')

  // Check filings table
  const { data: filings, error: filingsError } = await supabase
    .from('filings')
    .select('*')
    .limit(5)

  if (filingsError) {
    console.error('Error fetching filings:', filingsError)
  } else {
    console.log(`📄 Filings table: ${filings?.length || 0} filings found (showing first 5)`)
    if (filings && filings.length > 0) {
      console.log('Sample filing:', JSON.stringify(filings[0], null, 2))
    }
  }

  // Get total count of filings
  const { count: filingsCount, error: countError } = await supabase
    .from('filings')
    .select('*', { count: 'exact', head: true })

  if (!countError) {
    console.log(`Total filings in database: ${filingsCount}\n`)
  }

  // Check filing_chunks table
  const { data: chunks, error: chunksError } = await supabase
    .from('filing_chunks')
    .select('id, filing_id, chunk_index, content')
    .limit(3)

  if (chunksError) {
    console.error('Error fetching filing chunks:', chunksError)
  } else {
    console.log(`📝 Filing chunks table: ${chunks?.length || 0} chunks found (showing first 3)`)
    if (chunks && chunks.length > 0) {
      console.log('Sample chunk:', {
        id: chunks[0].id,
        filing_id: chunks[0].filing_id,
        chunk_index: chunks[0].chunk_index,
        content_preview: chunks[0].content?.substring(0, 100) + '...'
      })
    }
  }

  // Get total count of chunks
  const { count: chunksCount, error: chunksCountError } = await supabase
    .from('filing_chunks')
    .select('*', { count: 'exact', head: true })

  if (!chunksCountError) {
    console.log(`Total filing chunks in database: ${chunksCount}\n`)
  }

  // Check if embeddings exist (check if embedding column has non-null values)
  const { data: withEmbeddings, error: embeddingsError } = await supabase
    .from('filing_chunks')
    .select('id')
    .not('embedding', 'is', null)
    .limit(1)

  if (!embeddingsError) {
    if (withEmbeddings && withEmbeddings.length > 0) {
      console.log('✅ Embeddings are present in filing_chunks table')
    } else {
      console.log('❌ No embeddings found in filing_chunks table')
    }
  }
}

checkFilingsData().catch(console.error)
