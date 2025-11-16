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

async function checkSchema() {
  console.log('Checking filing_chunks schema...\n')

  // Get a sample chunk to see what columns exist
  const { data: chunks, error } = await supabase
    .from('filing_chunks')
    .select('*')
    .limit(1)

  if (error) {
    console.error('Error:', error)
  } else if (chunks && chunks.length > 0) {
    console.log('Available columns:')
    console.log(Object.keys(chunks[0]))
    console.log('\nSample chunk data:')
    const chunk = chunks[0]
    for (const [key, value] of Object.entries(chunk)) {
      if (key === 'embedding') {
        console.log(`  ${key}: [vector with ${value?.length || 0} dimensions]`)
      } else if (typeof value === 'string' && value.length > 100) {
        console.log(`  ${key}: ${value.substring(0, 100)}...`)
      } else {
        console.log(`  ${key}:`, value)
      }
    }
  }
}

checkSchema().catch(console.error)
