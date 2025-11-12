import { createServerClient } from '@/lib/supabase/server'

async function createFilingsTable() {
  const supabase = createServerClient()

  console.log('Creating filings table...')

  // Drop table if exists (for development)
  const { error: dropError } = await (supabase as any).rpc('exec_sql', {
    sql: 'DROP TABLE IF EXISTS filings CASCADE;'
  })

  if (dropError) {
    console.log('Note: Could not drop existing table (might not exist or RPC not available)')
  }

  // Create the table using raw SQL
  const { error: createError } = await (supabase as any).rpc('exec_sql', {
    sql: `
      CREATE TABLE filings (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        ticker TEXT NOT NULL,
        filing_type TEXT NOT NULL,
        filing_date DATE NOT NULL,
        period_end_date DATE NOT NULL,
        accession_number TEXT UNIQUE NOT NULL,
        document_url TEXT NOT NULL,
        fiscal_year INTEGER NOT NULL,
        fiscal_quarter INTEGER
      );

      CREATE INDEX idx_filings_ticker_date ON filings(ticker, filing_date DESC);
      CREATE INDEX idx_filings_accession ON filings(accession_number);

      COMMENT ON TABLE filings IS 'SEC filing metadata (10-K, 10-Q) for AAPL and other companies';
    `
  })

  if (createError) {
    console.error('Error creating table:', createError)
    console.log('\nPlease run the SQL manually in Supabase SQL Editor:')
    console.log('File: data/create-filings-table.sql')
    return
  }

  console.log('✅ Filings table created successfully!')
}

createFilingsTable()
