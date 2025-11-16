import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('Checking financial_metrics table...\n');

const { data, error, count } = await supabase
  .from('financial_metrics')
  .select('*', { count: 'exact', head: true });

if (error) {
  console.error('Error:', error.message);
} else {
  console.log('Total rows in financial_metrics:', count);

  if (count === 0) {
    console.log('\n⚠️  financial_metrics table is EMPTY');
    console.log('You need to run:');
    console.log('  npm run fetch:metrics');
    console.log('  npm run ingest:metrics');
  } else {
    // Get sample data
    const { data: sample } = await supabase
      .from('financial_metrics')
      .select('date, peRatio, marketCap, returnOnEquity')
      .order('date', { ascending: false })
      .limit(3);

    console.log('\nRecent entries:');
    sample?.forEach(row => {
      console.log(`  Date: ${row.date}, P/E: ${row.peRatio}, Market Cap: ${row.marketCap}, ROE: ${row.returnOnEquity}`);
    });
  }
}
