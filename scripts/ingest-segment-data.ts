/**
 * Ingest Apple Segment Revenue Data into company_metrics table
 *
 * Data Sources:
 * - Product segments: Apple 10-K filings, Bullfincher, stockanalysis.com
 * - Geographic segments: stockanalysis.com, Bullfincher
 *
 * Coverage: FY2020-FY2024
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// Use service role key to bypass RLS for data ingestion
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Product Segment Revenue Data (in millions USD)
// Sources: Apple 10-K filings, Bullfincher, stockanalysis.com
const productSegmentData = [
  // FY2020 (ended Sep 26, 2020)
  { year: 2020, segment: 'iPhone', value: 137781 },
  { year: 2020, segment: 'Mac', value: 28622 },
  { year: 2020, segment: 'iPad', value: 23724 },
  { year: 2020, segment: 'Wearables, Home and Accessories', value: 30620 },
  { year: 2020, segment: 'Services', value: 53768 },

  // FY2021 (ended Sep 25, 2021)
  { year: 2021, segment: 'iPhone', value: 191973 },
  { year: 2021, segment: 'Mac', value: 35190 },
  { year: 2021, segment: 'iPad', value: 31862 },
  { year: 2021, segment: 'Wearables, Home and Accessories', value: 38367 },
  { year: 2021, segment: 'Services', value: 68425 },

  // FY2022 (ended Sep 24, 2022)
  { year: 2022, segment: 'iPhone', value: 205489 },
  { year: 2022, segment: 'Mac', value: 40177 },
  { year: 2022, segment: 'iPad', value: 29292 },
  { year: 2022, segment: 'Wearables, Home and Accessories', value: 41241 },
  { year: 2022, segment: 'Services', value: 78129 },

  // FY2023 (ended Sep 30, 2023)
  { year: 2023, segment: 'iPhone', value: 200583 },
  { year: 2023, segment: 'Mac', value: 29357 },
  { year: 2023, segment: 'iPad', value: 28300 },
  { year: 2023, segment: 'Wearables, Home and Accessories', value: 39845 },
  { year: 2023, segment: 'Services', value: 85200 },

  // FY2024 (ended Sep 28, 2024)
  { year: 2024, segment: 'iPhone', value: 201183 },
  { year: 2024, segment: 'Mac', value: 29984 },
  { year: 2024, segment: 'iPad', value: 26694 },
  { year: 2024, segment: 'Wearables, Home and Accessories', value: 37005 },
  { year: 2024, segment: 'Services', value: 96169 },
];

// Geographic Segment Revenue Data (in millions USD)
// Source: stockanalysis.com/stocks/aapl/metrics/revenue-by-geography/
const geographicSegmentData = [
  // FY2020
  { year: 2020, segment: 'Americas', value: 129500 },
  { year: 2020, segment: 'Europe', value: 72700 },
  { year: 2020, segment: 'Greater China', value: 48000 },
  { year: 2020, segment: 'Japan', value: 23500 },
  { year: 2020, segment: 'Rest of Asia Pacific', value: 20400 },

  // FY2021
  { year: 2021, segment: 'Americas', value: 153300 },
  { year: 2021, segment: 'Europe', value: 89300 },
  { year: 2021, segment: 'Greater China', value: 68400 },
  { year: 2021, segment: 'Japan', value: 28500 },
  { year: 2021, segment: 'Rest of Asia Pacific', value: 26400 },

  // FY2022
  { year: 2022, segment: 'Americas', value: 169700 },
  { year: 2022, segment: 'Europe', value: 95100 },
  { year: 2022, segment: 'Greater China', value: 74500 },
  { year: 2022, segment: 'Japan', value: 26000 },
  { year: 2022, segment: 'Rest of Asia Pacific', value: 29400 },

  // FY2023
  { year: 2023, segment: 'Americas', value: 162560 },
  { year: 2023, segment: 'Europe', value: 94290 },
  { year: 2023, segment: 'Greater China', value: 72560 },
  { year: 2023, segment: 'Japan', value: 24260 },
  { year: 2023, segment: 'Rest of Asia Pacific', value: 29620 },

  // FY2024
  { year: 2024, segment: 'Americas', value: 167050 },
  { year: 2024, segment: 'Europe', value: 101330 },
  { year: 2024, segment: 'Greater China', value: 66950 },
  { year: 2024, segment: 'Japan', value: 25050 },
  { year: 2024, segment: 'Rest of Asia Pacific', value: 30660 },
];

async function ingestSegmentData() {
  console.log('Starting segment data ingestion...\n');

  // Prepare all rows for insertion
  const rows: Array<{
    symbol: string;
    year: number;
    period: string;
    metric_name: string;
    metric_value: number;
    unit: string;
    dimension_type: string;
    dimension_value: string;
    data_source: string;
  }> = [];

  // Add product segment data
  for (const item of productSegmentData) {
    rows.push({
      symbol: 'AAPL',
      year: item.year,
      period: 'FY',
      metric_name: 'segment_revenue',
      metric_value: item.value * 1_000_000, // Convert to actual dollars
      unit: 'currency',
      dimension_type: 'product',
      dimension_value: item.segment,
      data_source: 'SEC',
    });
  }

  // Add geographic segment data
  for (const item of geographicSegmentData) {
    rows.push({
      symbol: 'AAPL',
      year: item.year,
      period: 'FY',
      metric_name: 'segment_revenue',
      metric_value: item.value * 1_000_000, // Convert to actual dollars
      unit: 'currency',
      dimension_type: 'geographic',
      dimension_value: item.segment,
      data_source: 'SEC',
    });
  }

  console.log(`Prepared ${rows.length} rows for insertion`);
  console.log(`- Product segments: ${productSegmentData.length} rows`);
  console.log(`- Geographic segments: ${geographicSegmentData.length} rows`);
  console.log('');

  // Clear existing data first
  console.log('Clearing existing segment data...');
  const { error: deleteError } = await supabase
    .from('company_metrics')
    .delete()
    .eq('symbol', 'AAPL')
    .eq('metric_name', 'segment_revenue');

  if (deleteError) {
    console.error('Error clearing existing data:', deleteError);
    return;
  }
  console.log('Existing data cleared.\n');

  // Insert new data
  console.log('Inserting new segment data...');
  const { data, error } = await supabase
    .from('company_metrics')
    .insert(rows)
    .select();

  if (error) {
    console.error('Error inserting data:', error);
    return;
  }

  console.log(`Successfully inserted ${data.length} rows!\n`);

  // Verify insertion with summary
  console.log('Verification Summary:');
  console.log('='.repeat(50));

  // Check product segments
  const { data: productCheck } = await supabase
    .from('company_metrics')
    .select('year, dimension_value, metric_value')
    .eq('symbol', 'AAPL')
    .eq('dimension_type', 'product')
    .order('year', { ascending: true })
    .order('dimension_value', { ascending: true });

  console.log('\nProduct Segments by Year:');
  const productByYear: Record<number, Record<string, number>> = {};
  for (const row of productCheck || []) {
    if (!productByYear[row.year]) productByYear[row.year] = {};
    productByYear[row.year][row.dimension_value] = row.metric_value / 1_000_000_000;
  }
  for (const year of Object.keys(productByYear).sort()) {
    const segments = productByYear[Number(year)];
    const total = Object.values(segments).reduce((a, b) => a + b, 0);
    console.log(`  FY${year}: Total = $${total.toFixed(1)}B`);
    for (const [seg, val] of Object.entries(segments)) {
      console.log(`    - ${seg}: $${val.toFixed(1)}B`);
    }
  }

  // Check geographic segments
  const { data: geoCheck } = await supabase
    .from('company_metrics')
    .select('year, dimension_value, metric_value')
    .eq('symbol', 'AAPL')
    .eq('dimension_type', 'geographic')
    .order('year', { ascending: true })
    .order('dimension_value', { ascending: true });

  console.log('\nGeographic Segments by Year:');
  const geoByYear: Record<number, Record<string, number>> = {};
  for (const row of geoCheck || []) {
    if (!geoByYear[row.year]) geoByYear[row.year] = {};
    geoByYear[row.year][row.dimension_value] = row.metric_value / 1_000_000_000;
  }
  for (const year of Object.keys(geoByYear).sort()) {
    const segments = geoByYear[Number(year)];
    const total = Object.values(segments).reduce((a, b) => a + b, 0);
    console.log(`  FY${year}: Total = $${total.toFixed(1)}B`);
    for (const [seg, val] of Object.entries(segments)) {
      console.log(`    - ${seg}: $${val.toFixed(1)}B`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('Segment data ingestion complete!');
}

ingestSegmentData().catch(console.error);
