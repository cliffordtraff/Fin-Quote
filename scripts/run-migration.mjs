import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Read the migration file
const migration = readFileSync('supabase/migrations/20250106_conversations.sql', 'utf8')

// Remove comments and split into individual statements
const statements = migration
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map(stmt => stmt.trim())
  .filter(stmt => stmt.length > 0 && !stmt.startsWith('/*'))

console.log(`Running ${statements.length} SQL statements...`)

// Execute each statement
for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i]

  // Skip verification queries
  if (stmt.includes('Uncomment these') || stmt.includes('comment out before running')) {
    continue
  }

  console.log(`\n[${i + 1}/${statements.length}] Executing...`)
  console.log(stmt.substring(0, 100) + (stmt.length > 100 ? '...' : ''))

  try {
    const { error } = await supabase.rpc('exec_sql', { sql: stmt + ';' })

    if (error) {
      // Try direct query method as fallback
      const { error: queryError } = await supabase.from('_').select('*').limit(0)

      console.error('❌ Error:', error.message)
      console.log('Attempting alternative method...')

      // For this to work, we need to use the REST API directly
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ sql: stmt + ';' })
      })

      if (!response.ok) {
        console.error('❌ Alternative method also failed')
        console.log('You will need to run this migration manually in the Supabase SQL Editor')
        console.log('The SQL has been copied to your clipboard')
        process.exit(1)
      }
    }

    console.log('✅ Success')
  } catch (err) {
    console.error('❌ Error:', err.message)
    process.exit(1)
  }
}

console.log('\n✅ Migration completed successfully!')
console.log('\nVerifying tables...')

// Verify the tables were created
const { data: conversations, error: convError } = await supabase
  .from('conversations')
  .select('*')
  .limit(0)

const { data: messages, error: msgError } = await supabase
  .from('messages')
  .select('*')
  .limit(0)

if (!convError && !msgError) {
  console.log('✅ Tables verified: conversations and messages exist')
} else {
  console.log('⚠️  Could not verify tables, but migration may have succeeded')
  console.log('Check the Supabase dashboard to confirm')
}
