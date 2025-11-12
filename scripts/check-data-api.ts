/**
 * Test what data the API actually returns
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs/promises'
import * as path from 'path'

async function checkData() {
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

  console.log('Testing what data the API returns...\n')

  // Simulate what the API does
  const { data, error } = await supabase
    .from('financials_std')
    .select('year, revenue')
    .eq('symbol', 'AAPL')
    .order('year', { ascending: false })
    .limit(10)

  if (error) {
    console.error('❌ Error:', error.message)
    return
  }

  console.log(`✅ API returns ${data.length} rows\n`)
  console.log('Years returned (descending order):')
  data.forEach(row => {
    console.log(`  ${row.year}: $${(row.revenue / 1e9).toFixed(1)}B`)
  })

  const years = data.map(d => d.year).sort((a, b) => a - b)
  console.log()
  console.log(`Year range: ${years[0]} - ${years[years.length - 1]}`)
}

checkData()
