import { readFileSync } from 'fs'
import 'dotenv/config'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Read migration SQL
const sql = readFileSync('supabase/migrations/20250106_conversations.sql', 'utf8')

console.log('🚀 Running migration on Supabase...\n')

// Use Supabase's SQL endpoint
const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Prefer': 'return=representation'
  },
  body: JSON.stringify({
    query: sql
  })
})

if (!response.ok) {
  const error = await response.text()
  console.error('❌ Migration failed:', error)
  console.log('\n📋 Please run the migration manually:')
  console.log('1. Go to https://supabase.com/dashboard')
  console.log('2. Select your project')
  console.log('3. Go to SQL Editor')
  console.log('4. Paste the contents of: supabase/migrations/20250106_conversations.sql')
  console.log('5. Click Run')
  process.exit(1)
}

const result = await response.json()
console.log('✅ Migration executed successfully!')
console.log(result)
