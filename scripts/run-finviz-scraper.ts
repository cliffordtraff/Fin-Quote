// Must load env BEFORE any imports that use env vars
import { config } from 'dotenv'
config({ path: '.env.local' })

// Get start/end from command line args
const start = parseInt(process.argv[2] || '0', 10)
const end = parseInt(process.argv[3] || '503', 10)

async function run() {
  const { getStockWhyMovingData } = await import('../lib/stock-why-moving')
  const { createClient } = await import('@supabase/supabase-js')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabase
    .from('sp500_constituents')
    .select('symbol')
    .eq('is_active', true)

  if (error || !data) {
    console.error('Failed to fetch S&P 500:', error)
    return
  }

  const allSymbols = data.map(d => d.symbol).filter(Boolean)
  const symbols = allSymbols.slice(start, end)

  console.log(`Processing stocks ${start}-${end} (${symbols.length} stocks)`)

  let found = 0, notFound = 0, errors = 0

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i]
    try {
      const result = await getStockWhyMovingData(symbol, { forceRefresh: true })
      if (result.status === 'found') {
        found++
        console.log(`✓ ${symbol}: ${result.headline?.slice(0, 50)}...`)
      } else if (result.status === 'not_found') {
        notFound++
        console.log(`- ${symbol}: no data`)
      } else {
        errors++
        console.log(`✗ ${symbol}: error`)
      }
    } catch (err) {
      errors++
      console.log(`✗ ${symbol}: ${err}`)
    }

    // 3 second delay between requests
    if (i + 1 < symbols.length) {
      await new Promise(r => setTimeout(r, 3000))
    }
  }

  console.log(`\nBatch ${start}-${end} done! Found: ${found}, Not found: ${notFound}, Errors: ${errors}`)
}

run().catch(console.error)
