import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function verifyTables() {
  console.log('Checking watchlist tables...\n')

  // Check watchlists table
  const { data: watchlists, error: watchlistsError } = await supabase
    .from('watchlists')
    .select('*')
    .limit(1)

  if (watchlistsError) {
    console.error('❌ watchlists table:', watchlistsError.message)
  } else {
    console.log('✅ watchlists table exists')
  }

  // Check watchlist_settings table
  const { data: settings, error: settingsError } = await supabase
    .from('watchlist_settings')
    .select('*')
    .limit(1)

  if (settingsError) {
    console.error('❌ watchlist_settings table:', settingsError.message)
  } else {
    console.log('✅ watchlist_settings table exists')
  }

  if (!watchlistsError && !settingsError) {
    console.log('\n🎉 All watchlist tables created successfully!')
  }
}

verifyTables()
