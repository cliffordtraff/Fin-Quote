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

async function checkRPCFunction() {
  console.log('Checking if search_filing_chunks function exists...\n')

  // Try calling with a dummy embedding
  const dummyEmbedding = Array(1536).fill(0)
  const { data: result, error: callError } = await supabase.rpc('search_filing_chunks', {
    query_embedding: JSON.stringify(dummyEmbedding),
    match_count: 1,
  })

  if (callError) {
    console.error('❌ Function call failed')
    console.log('Error message:', callError.message)
    console.log('Error code:', callError.code)
    console.log('Error hint:', callError.hint)
    console.log('\n🔧 The function needs to be created in the database.')
  } else {
    console.log('✅ Function exists and is callable!')
    console.log(`Returned ${result?.length || 0} results`)
    if (result && result.length > 0) {
      console.log('Sample result keys:', Object.keys(result[0]))
    }
  }
}

checkRPCFunction().catch(console.error)
