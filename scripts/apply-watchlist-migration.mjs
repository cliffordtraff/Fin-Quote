import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Read environment variables
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing Supabase credentials in environment variables')
  process.exit(1)
}

// Create Supabase client with service role key
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function applyMigration() {
  try {
    // Read the migration file
    const migrationPath = join(__dirname, '../supabase/migrations/20241117000001_create_watchlist_tables.sql')
    const sql = readFileSync(migrationPath, 'utf-8')

    console.log('Applying watchlist migration...')
    console.log('SQL:', sql)

    // Execute the SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql }).catch(async () => {
      // If RPC doesn't exist, try direct execution
      const { data, error } = await supabase.from('_sql').select('*').limit(0)
      if (error) throw error

      // Try using raw SQL execution via REST API
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        },
        body: JSON.stringify({ sql_query: sql })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return { data: await response.json(), error: null }
    })

    if (error) {
      console.error('Error applying migration:', error)
      process.exit(1)
    }

    console.log('✅ Migration applied successfully!')
    console.log('Created tables: watchlists, watchlist_settings')

  } catch (error) {
    console.error('Failed to apply migration:', error)
    console.log('\n⚠️  Falling back to manual SQL execution via Supabase Dashboard')
    console.log('Please run the following SQL in your Supabase SQL Editor:\n')

    const migrationPath = join(__dirname, '../supabase/migrations/20241117000001_create_watchlist_tables.sql')
    const sql = readFileSync(migrationPath, 'utf-8')
    console.log(sql)

    process.exit(1)
  }
}

applyMigration()
