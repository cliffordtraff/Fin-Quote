import 'dotenv/config';

const apiKey = process.env.FMP_API_KEY;
const today = new Date();
const fifteenYearsAgo = new Date(today);
fifteenYearsAgo.setFullYear(fifteenYearsAgo.getFullYear() - 15);

const fromDate = fifteenYearsAgo.toISOString().split('T')[0];
const toDate = today.toISOString().split('T')[0];

console.log(`Testing FMP API for AAPL from ${fromDate} to ${toDate} (15 years)`);

// Test 1: With explicit date range
const url1 = `https://financialmodelingprep.com/api/v3/historical-price-full/AAPL?apikey=${apiKey}&from=${fromDate}&to=${toDate}`;
console.log('\nTest 1: With explicit from/to dates');
const res1 = await fetch(url1);
const data1 = await res1.json();
console.log(`Records returned: ${data1.historical?.length || 0}`);
if (data1.historical && data1.historical.length > 0) {
  console.log(`Date range: ${data1.historical[data1.historical.length - 1].date} to ${data1.historical[0].date}`);
}

// Test 2: Without date parameters (max data)
const url2 = `https://financialmodelingprep.com/api/v3/historical-price-full/AAPL?apikey=${apiKey}`;
console.log('\nTest 2: Without date parameters (should return all available data)');
const res2 = await fetch(url2);
const data2 = await res2.json();
console.log(`Records returned: ${data2.historical?.length || 0}`);
if (data2.historical && data2.historical.length > 0) {
  console.log(`Date range: ${data2.historical[data2.historical.length - 1].date} to ${data2.historical[0].date}`);
}
