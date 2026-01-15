import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function findAllSegmentMetrics() {
  const { data: htmlBlob, error } = await supabase.storage
    .from('filings')
    .download('html/aapl-10-k-2024.html');

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  const html = await htmlBlob.text();

  // Parse contexts (same as existing parser)
  const headerMatch = html.match(/<ix:header[^>]*>([\s\S]*?)<\/ix:header>/i);
  if (!headerMatch) return;
  const header = headerMatch[1];

  const contextRegex = /<xbrli:context[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/xbrli:context>/gi;
  const contextDimensions = new Map();
  const relevantAxes = [
    'srt:ProductOrServiceAxis',
    'us-gaap:StatementBusinessSegmentsAxis',
    'srt:StatementGeographicalAxis'
  ];

  let match;
  while ((match = contextRegex.exec(header)) !== null) {
    const contextId = match[1];
    const contextContent = match[2];
    const dims = [];
    const dimRegex = /<xbrldi:explicitMember\s+dimension="([^"]+)"[^>]*>([^<]+)<\/xbrldi:explicitMember>/gi;
    let dimMatch;
    while ((dimMatch = dimRegex.exec(contextContent)) !== null) {
      dims.push({ axis: dimMatch[1], member: dimMatch[2] });
    }
    if (dims.length > 0 && dims.some(d => relevantAxes.includes(d.axis))) {
      contextDimensions.set(contextId, dims);
    }
  }

  console.log(`Found ${contextDimensions.size} contexts with segment/geographic dimensions\n`);

  // Parse ALL facts (not just revenue) - using same regex as parser
  const factRegex = /<ix:nonFraction([^>]*)>([^<]*)<\/ix:nonFraction>/gi;
  const allFacts = [];

  while ((match = factRegex.exec(html)) !== null) {
    const attrs = match[1];
    const rawValue = match[2].replace(/,/g, '').trim();

    const nameMatch = attrs.match(/name="([^"]+)"/i);
    const contextMatch = attrs.match(/contextRef="([^"]+)"/i);
    const scaleMatch = attrs.match(/scale="([^"]+)"/i);

    if (!nameMatch || !contextMatch) continue;

    const name = nameMatch[1];
    const contextId = contextMatch[1];
    const scale = scaleMatch ? parseInt(scaleMatch[1]) : 0;
    let value = parseFloat(rawValue);

    if (isNaN(value)) continue;

    // Apply scale
    if (scale) {
      value = value * Math.pow(10, scale);
    }

    // Only include facts that have segment/geographic dimensions
    const dims = contextDimensions.get(contextId);
    if (!dims) continue;

    allFacts.push({
      name,
      contextId,
      value,
      scale,
      dimensions: dims
    });
  }

  console.log(`Found ${allFacts.length} facts with segment/geographic dimensions\n`);

  // Group by fact name
  const metricsByType = new Map();
  allFacts.forEach(fact => {
    if (!metricsByType.has(fact.name)) {
      metricsByType.set(fact.name, []);
    }
    metricsByType.get(fact.name).push(fact);
  });

  console.log(`=== Available Metrics in Apple 10-K ===\n`);
  console.log(`Total unique metric types: ${metricsByType.size}\n`);

  // Categorize
  const segmentReporting = [];
  const revenueDisaggregation = [];
  const other = [];

  metricsByType.forEach((instances, factName) => {
    const lowerName = factName.toLowerCase();
    const sample = instances[0];
    const sampleDims = sample.dimensions.map(d => d.member).join(', ');

    if (lowerName.includes('operatingincome') || lowerName.includes('operatingprofit')) {
      segmentReporting.push({
        factName,
        instances: instances.length,
        sampleValue: sample.value,
        sampleDimensions: sampleDims
      });
    }
    else if (lowerName.includes('revenue') || lowerName.includes('salesrevenuenet')) {
      // Check if there's corresponding operating income
      const hasOperatingIncome = Array.from(metricsByType.keys()).some(f => {
        if (!f.toLowerCase().includes('operatingincome')) return false;
        const oiInstances = metricsByType.get(f);
        return oiInstances.some(oi => 
          instances.some(r => r.contextId === oi.contextId)
        );
      });
      
      if (hasOperatingIncome) {
        segmentReporting.push({
          factName,
          instances: instances.length,
          sampleValue: sample.value,
          sampleDimensions: sampleDims
        });
      } else {
        revenueDisaggregation.push({
          factName,
          instances: instances.length,
          sampleValue: sample.value,
          sampleDimensions: sampleDims
        });
      }
    }
    else {
      other.push({
        factName,
        instances: instances.length,
        sampleValue: sample.value,
        sampleDimensions: sampleDims
      });
    }
  });

  console.log('📊 SEGMENT REPORTING (ASC 280) Metrics:');
  if (segmentReporting.length > 0) {
    segmentReporting.forEach(m => {
      console.log(`  • ${m.factName}`);
      console.log(`    - ${m.instances} data points`);
      console.log(`    - Sample value: ${m.sampleValue.toLocaleString()}`);
      console.log(`    - Sample dimensions: ${m.sampleDimensions}`);
    });
  } else {
    console.log('  (None found)');
  }
  console.log('');

  console.log('💰 REVENUE DISAGGREGATION (ASC 606) Metrics:');
  if (revenueDisaggregation.length > 0) {
    revenueDisaggregation.forEach(m => {
      console.log(`  • ${m.factName}`);
      console.log(`    - ${m.instances} data points`);
      console.log(`    - Sample value: ${m.sampleValue.toLocaleString()}`);
      console.log(`    - Sample dimensions: ${m.sampleDimensions}`);
    });
  } else {
    console.log('  (None found - Apple primarily uses segment reporting)');
  }
  console.log('');

  console.log('📋 OTHER Segment-Related Metrics:');
  if (other.length > 0) {
    other.forEach(m => {
      console.log(`  • ${m.factName}`);
      console.log(`    - ${m.instances} data points`);
      console.log(`    - Sample value: ${m.sampleValue.toLocaleString()}`);
      console.log(`    - Sample dimensions: ${m.sampleDimensions}`);
    });
  } else {
    console.log('  (None found)');
  }
  console.log('');

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log(`Segment Reporting metrics: ${segmentReporting.length}`);
  console.log(`Revenue Disaggregation metrics: ${revenueDisaggregation.length}`);
  console.log(`Other segment metrics: ${other.length}`);
  console.log(`\n💡 Recommendation: Focus on extracting segment operating income next!`);
}

findAllSegmentMetrics().catch(console.error);
