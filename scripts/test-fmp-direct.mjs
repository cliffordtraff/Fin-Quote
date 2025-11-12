// Direct test of FMP API without Next.js caching
import { config } from 'dotenv';
config({ path: '.env.local' });

const apiKey = process.env.FMP_API_KEY;

if (!apiKey) {
  console.error('FMP_API_KEY not found in .env.local');
  process.exit(1);
}

console.log('Testing FMP API directly (no caching)...\n');

// Test without any date parameters to get ALL available data
const url = `https://financialmodelingprep.com/api/v3/historical-price-full/AAPL?apikey=${apiKey}`;
console.log('Fetching: https://financialmodelingprep.com/api/v3/historical-price-full/AAPL?apikey=***');

try {
  const response = await fetch(url);
  const data = await response.json();

  if (data['Error Message']) {
    console.error('API Error:', data['Error Message']);
  } else if (data.historical && data.historical.length > 0) {
    console.log(`\n✅ Success!`);
    console.log(`Total records: ${data.historical.length}`);
    console.log(`Oldest date: ${data.historical[data.historical.length - 1].date}`);
    console.log(`Most recent date: ${data.historical[0].date}`);

    // Calculate years
    const oldestDate = new Date(data.historical[data.historical.length - 1].date);
    const newestDate = new Date(data.historical[0].date);
    const yearsDiff = (newestDate - oldestDate) / (365.25 * 24 * 60 * 60 * 1000);
    console.log(`Years of data: ${yearsDiff.toFixed(1)} years`);
  } else {
    console.log('Unexpected response format:', JSON.stringify(data, null, 2));
  }
} catch (error) {
  console.error('Fetch error:', error.message);
}
