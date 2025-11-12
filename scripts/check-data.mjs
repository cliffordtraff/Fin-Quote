import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('Checking AAPL financial data...\n');

const { data, error } = await supabase
  .from('financials_std')
  .select('year, net_income')
  .eq('symbol', 'AAPL')
  .order('year', { ascending: false });

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

console.log('AAPL Net Income Data by Year:');
console.log('============================');
data.forEach(row => {
  console.log(`Year ${row.year}: $${(row.net_income / 1_000_000_000).toFixed(2)}B`);
});

console.log(`\nTotal years in database: ${data.length}`);

const years = data.map(r => r.year);
console.log(`Year range: ${Math.min(...years)} - ${Math.max(...years)}`);

const has2020 = data.find(row => row.year === 2020);
console.log(`\nHas 2020 data? ${has2020 ? 'YES ✓' : 'NO ✗'}`);
if (has2020) {
  console.log(`2020 Net Income: $${(has2020.net_income / 1_000_000_000).toFixed(2)}B`);
} else {
  console.log('2020 is MISSING from the database!');
}
