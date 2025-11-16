'use server'

import { createServerClient } from '@/lib/supabase/server'

export async function checkFinancialsSchema() {
  const supabase = await createServerClient()

  // Fetch one row to see all available columns
  const { data, error } = await supabase
    .from('financials_std')
    .select('*')
    .limit(1)

  if (error) {
    return { error: error.message, columns: null }
  }

  if (data && data.length > 0) {
    return { error: null, columns: Object.keys(data[0]) }
  }

  return { error: 'No data in table', columns: null }
}
