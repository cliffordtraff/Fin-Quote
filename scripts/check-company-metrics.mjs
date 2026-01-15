import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Check table structure and existing data
const { data, error } = await supabase
  .from('company_metrics')
  .select('*')
  .limit(10);

if (error) {
  console.log('Error:', error.message);
} else {
  console.log('Row count:', data.length);
  if (data.length > 0) {
    console.log('Sample rows:');
    data.forEach(row => {
      console.log(`  ${row.year} | ${row.dimension_type} | ${row.dimension_value} | ${row.metric_name}: ${row.metric_value}`);
    });
  } else {
    console.log('Table is empty');
  }
}

// Check distinct dimension types if any
const { data: dims, error: dimsError } = await supabase
  .from('company_metrics')
  .select('dimension_type, dimension_value')
  .limit(100);

if (!dimsError && dims && dims.length > 0) {
  const uniqueDims = [...new Set(dims.map(d => d.dimension_type + ':' + d.dimension_value))];
  console.log('\nUnique dimensions:', uniqueDims);
}
