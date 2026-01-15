import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function fetchAndIngestRnD() {
  const apiKey = process.env.FMP_API_KEY;
  const url = `https://financialmodelingprep.com/api/v3/income-statement/AAPL?limit=20&apikey=${apiKey}`;

  console.log('Fetching income statements from FMP...');
  const response = await fetch(url);
  const data = await response.json();

  if (!data || !Array.isArray(data) || data.length === 0) {
    console.log('No data from FMP');
    return;
  }

  console.log('Got', data.length, 'years of data');

  // Extract R&D and weighted shares data
  const rows = [];
  for (const row of data) {
    const year = parseInt(row.calendarYear);

    // R&D Expense
    if (row.researchAndDevelopmentExpenses) {
      rows.push({
        symbol: 'AAPL',
        year: year,
        metric_name: 'researchAndDevelopmentExpenses',
        metric_value: row.researchAndDevelopmentExpenses
      });
    }

    // Weighted Average Shares Outstanding
    if (row.weightedAverageShsOut) {
      rows.push({
        symbol: 'AAPL',
        year: year,
        metric_name: 'weightedAverageShsOut',
        metric_value: row.weightedAverageShsOut
      });
    }

    // Weighted Average Shares Outstanding Diluted
    if (row.weightedAverageShsOutDil) {
      rows.push({
        symbol: 'AAPL',
        year: year,
        metric_name: 'weightedAverageShsOutDil',
        metric_value: row.weightedAverageShsOutDil
      });
    }
  }

  console.log('Prepared', rows.length, 'rows for insert');

  // Delete existing rows first, then insert
  for (const row of rows) {
    await supabase
      .from('financial_metrics')
      .delete()
      .eq('symbol', row.symbol)
      .eq('year', row.year)
      .eq('metric_name', row.metric_name);
  }

  // Insert new data
  const { data: result, error } = await supabase
    .from('financial_metrics')
    .insert(rows)
    .select();

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  console.log('Successfully upserted', result.length, 'rows');

  // Show sample
  console.log('\nSample R&D data:');
  const rnd = rows.filter(r => r.metric_name === 'researchAndDevelopmentExpenses').slice(0, 5);
  rnd.forEach(r => {
    console.log('  ' + r.year + ': $' + (r.metric_value / 1e9).toFixed(2) + 'B');
  });

  console.log('\nSample Shares Outstanding data:');
  const shares = rows.filter(r => r.metric_name === 'weightedAverageShsOut').slice(0, 5);
  shares.forEach(r => {
    console.log('  ' + r.year + ': ' + (r.metric_value / 1e9).toFixed(2) + 'B shares');
  });
}

fetchAndIngestRnD();
