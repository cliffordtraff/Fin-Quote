import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const metrics = ['pbRatio', 'priceSalesRatio', 'enterpriseValueMultiple', 'pegRatio', 'freeCashFlowYield'];

for (const metric of metrics) {
  const { data, error } = await supabase
    .from('financial_metrics')
    .select('year, metric_value')
    .eq('symbol', 'AAPL')
    .eq('metric_name', metric)
    .order('year', { ascending: false })
    .limit(10);

  if (error) {
    console.log(metric + ': ERROR - ' + error.message);
  } else if (!data || data.length === 0) {
    console.log(metric + ': NO DATA');
  } else {
    const years = data.map(d => d.year + ':' + (d.metric_value ? d.metric_value.toFixed(2) : 'null')).join(', ');
    console.log(metric + ' (' + data.length + ' years): ' + years);
  }
}
