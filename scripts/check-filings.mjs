import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('Checking AAPL filings...\n');

// Check filings table
const { data: filings, error: filingsError } = await supabase
  .from('filings')
  .select('*')
  .eq('ticker', 'AAPL')
  .order('filing_date', { ascending: false });

if (filingsError) {
  console.error('Error fetching filings:', filingsError);
} else {
  console.log('AAPL Filings:');
  console.log('=============');
  filings.forEach(filing => {
    console.log(`${filing.filing_type} | ${filing.filing_date} | Period: ${filing.period_end_date || 'N/A'}`);
  });
  console.log(`\nTotal filings: ${filings.length}`);

  const tenKs = filings.filter(f => f.filing_type === '10-K');
  const tenQs = filings.filter(f => f.filing_type === '10-Q');
  console.log(`10-K filings: ${tenKs.length}`);
  console.log(`10-Q filings: ${tenQs.length}`);

  if (tenKs.length > 0) {
    console.log('\nMost recent 10-K:');
    console.log(JSON.stringify(tenKs[0], null, 2));
  }
}

// Check filing_chunks table
console.log('\n\nChecking filing_chunks table...');
const { data: chunks, error: chunksError } = await supabase
  .from('filing_chunks')
  .select('filing_id, chunk_index, section_name, filings!inner(filing_type, filing_date)')
  .limit(10);

if (chunksError) {
  console.error('Error fetching chunks:', chunksError);
  console.log('filing_chunks table may not exist yet');
} else {
  console.log(`Found ${chunks.length} chunks (showing first 10)`);
  if (chunks.length > 0) {
    console.log('\nSample chunk:');
    console.log(JSON.stringify(chunks[0], null, 2));

    // Count by filing type
    const { data: allChunks, error: countError } = await supabase
      .from('filing_chunks')
      .select('filing_id, filings!inner(filing_type)');

    if (!countError && allChunks) {
      const tenKChunks = allChunks.filter(c => c.filings.filing_type === '10-K');
      const tenQChunks = allChunks.filter(c => c.filings.filing_type === '10-Q');
      console.log(`\nTotal chunks in database: ${allChunks.length}`);
      console.log(`10-K chunks: ${tenKChunks.length}`);
      console.log(`10-Q chunks: ${tenQChunks.length}`);
    }
  }
}
