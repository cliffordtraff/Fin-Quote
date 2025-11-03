/**
 * Verify 20 years of AAPL data in Supabase
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs/promises'
import * as path from 'path'

async function verifyData() {
  // Load environment variables from .env.local
  const envPath = path.join(process.cwd(), '.env.local')
  const envContent = await fs.readFile(envPath, 'utf-8')

  let SUPABASE_URL = ''
  let SUPABASE_ANON_KEY = ''

  envContent.split('\n').forEach((line) => {
    const match = line.match(/^([^=:#]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim()
      if (key === 'NEXT_PUBLIC_SUPABASE_URL') SUPABASE_URL = value
      if (key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') SUPABASE_ANON_KEY = value
    }
  })

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  console.log('Verifying AAPL data in Supabase...\n')

  // Get all AAPL data
  const { data, error } = await supabase
    .from('financials_std')
    .select('year, revenue, net_income')
    .eq('symbol', 'AAPL')
    .order('year', { ascending: true })

  if (error) {
    console.error('❌ Error:', error.message)
    return
  }

  console.log(`✅ Found ${data.length} years of data\n`)

  const years = data.map(d => d.year)
  console.log('Years in database:')
  console.log(years.join(', '))
  console.log()
  console.log(`Earliest year: ${years[0]}`)
  console.log(`Latest year: ${years[years.length - 1]}`)
  console.log(`Total span: ${years[years.length - 1] - years[0] + 1} years`)
  console.log()

  // Show oldest data
  const oldest = data[0]
  console.log(`Sample from oldest year (${oldest.year}):`)
  console.log(`  Revenue: $${(oldest.revenue / 1e9).toFixed(1)}B`)
  console.log(`  Net Income: $${(oldest.net_income / 1e9).toFixed(1)}B`)
  console.log()

  // Show newest data
  const newest = data[data.length - 1]
  console.log(`Sample from newest year (${newest.year}):`)
  console.log(`  Revenue: $${(newest.revenue / 1e9).toFixed(1)}B`)
  console.log(`  Net Income: $${(newest.net_income / 1e9).toFixed(1)}B`)
}

verifyData()
