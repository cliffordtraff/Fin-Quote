// Test FMP API with explicit from parameter for 20 years
import { config } from 'dotenv';
config({ path: '.env.local' });

const apiKey = process.env.FMP_API_KEY;

console.log('Testing FMP API with explicit from/to parameters for 20 years...\n');

const today = new Date();
const twentyYearsAgo = new Date(today);
twentyYearsAgo.setFullYear(twentyYearsAgo.getFullYear() - 20);

const fromDate = twentyYearsAgo.toISOString().split('T')[0];
const toDate = today.toISOString().split('T')[0];

const url = `https://financialmodelingprep.com/api/v3/historical-price-full/AAPL?apikey=${apiKey}&from=${fromDate}&to=${toDate}`;
console.log(`Fetching from ${fromDate} to ${toDate}`);

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
  console.log('Unexpected response:', data);
}
