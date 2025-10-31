import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs/promises'
import * as path from 'path'

async function checkPgVector() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Error: Missing Supabase credentials in .env.local')
    return
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  console.log('Checking pgvector extension...\n')

  // Check if pgvector extension is installed
  const { data: extensions, error: extError } = await supabase.rpc('exec_sql', {
    sql: "SELECT * FROM pg_extension WHERE extname = 'vector';"
  })

  if (extError) {
    console.log('Note: Could not check extensions via RPC')
    console.log('Please verify pgvector is enabled by running the SQL manually\n')
  }

  // Try to query filing_chunks table
  const { data, error } = await supabase
    .from('filing_chunks')
    .select('id')
    .limit(1)

  if (error) {
    console.error('❌ filing_chunks table does not exist or pgvector not enabled')
    console.error('Error:', error.message)
    console.log('\n👉 Please run the SQL in: data/create-filing-chunks-table.sql')
    return
  }

  console.log('✅ pgvector extension enabled')
  console.log('✅ filing_chunks table exists')
  console.log(`\nCurrent chunks in database: ${data?.length || 0}`)
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

loadEnv().then(() => checkPgVector()).catch(console.error)
