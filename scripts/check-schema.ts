import { createServerClient } from '@/lib/supabase/server'

async function checkSchema() {
  const supabase = createServerClient()

  // Fetch one row to see all available columns
  const { data, error } = await supabase
    .from('financials_std')
    .select('*')
    .limit(1)

  if (error) {
    console.error('Error:', error)
    return
  }

  console.log('Available columns in financials_std:')
  if (data && data.length > 0) {
    console.log(Object.keys(data[0]))
  } else {
    console.log('No data in table')
  }
}

checkSchema()
