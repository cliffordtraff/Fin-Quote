import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function exploreAAPLMetrics() {
  const { data: htmlBlob, error } = await supabase.storage
    .from('filings')
    .download('html/aapl-10-k-2024.html');

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  const html = await htmlBlob.text();

  // Find ix:header
  const headerMatch = html.match(/<ix:header[^>]*>([\s\S]*?)<\/ix:header>/i);
  if (!headerMatch) {
    console.log('No ix:header found');
    return;
  }
  const header = headerMatch[1];

  // Parse contexts from header
  const contextRegex = /<xbrli:context[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/xbrli:context>/gi;

  const contextDimensions = new Map(); // contextId -> [{axis, member}]
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
    if (dims.length > 0) {
      const hasRelevant = dims.some(d => relevantAxes.includes(d.axis));
      if (hasRelevant) {
        contextDimensions.set(contextId, dims);
      }
    }
  }

  console.log('Found', contextDimensions.size, 'contexts with segment/geographic dimensions\n');

  // Parse facts with values
  const factRegex = /<ix:nonFraction[^>]*name="([^"]+)"[^>]*contextRef="([^"]+)"[^>]*>([^<]+)<\/ix:nonFraction>/gi;
  
  const segmentFacts = new Map(); // factName -> [{contextId, value, dimensions}]
  const factValueRegex = />([^<]+)</;

  while ((match = factRegex.exec(html)) !== null) {
    const factName = match[1];
    const contextId = match[2];
    const fullMatch = match[0];
    const valueMatch = fullMatch.match(/>([^<]+)</);
    const value = valueMatch ? valueMatch[1].trim() : '';

    const dims = contextDimensions.get(contextId);
    if (!dims) continue;

    if (!segmentFacts.has(factName)) {
      segmentFacts.set(factName, []);
    }
    
    segmentFacts.get(factName).push({
      contextId,
      value,
      dimensions: dims
    });
  }

  console.log('=== Metrics Available in Apple 10-K (Segment/Geographic Dimensions) ===\n');
  console.log(`Total unique metric types: ${segmentFacts.size}\n`);

  // Group by metric category
  const segmentReporting = [];
  const revenueDisaggregation = [];
  
  segmentFacts.forEach((instances, factName) => {
    // Check if this is segment operating income (segment reporting)
    if (factName.includes('OperatingIncome') || factName.includes('OperatingProfit')) {
      segmentReporting.push({ factName, instances: instances.length });
    }
    // Check if this is revenue (could be segment or disaggregation)
    else if (factName.includes('Revenue') || factName.includes('SalesRevenueNet')) {
      // Check if it has operating income context (segment) or just revenue (disaggregation)
      const hasOperatingIncome = Array.from(segmentFacts.keys()).some(f => 
        f.includes('OperatingIncome') && instances.some(i => 
          segmentFacts.get(f)?.some(oi => oi.contextId === i.contextId)
        )
      );
      if (hasOperatingIncome) {
        segmentReporting.push({ factName, instances: instances.length });
      } else {
        revenueDisaggregation.push({ factName, instances: instances.length });
      }
    }
    // Other segment metrics
    else if (factName.includes('Assets') || factName.includes('Depreciation') || factName.includes('CapitalExpenditures')) {
      segmentReporting.push({ factName, instances: instances.length });
    }
  });

  console.log('📊 SEGMENT REPORTING (ASC 280) Metrics:');
  if (segmentReporting.length > 0) {
    segmentReporting.forEach(({ factName, instances }) => {
      console.log(`  • ${factName} (${instances} data points)`);
    });
  } else {
    console.log('  (None found - may need to check different fact names)');
  }
  console.log('');

  console.log('💰 REVENUE DISAGGREGATION (ASC 606) Metrics:');
  if (revenueDisaggregation.length > 0) {
    revenueDisaggregation.forEach(({ factName, instances }) => {
      console.log(`  • ${factName} (${instances} data points)`);
    });
  } else {
    console.log('  (None found - Apple may only use segment reporting)');
  }
  console.log('');

  // Show all facts for manual review
  console.log('📋 ALL Facts with Segment/Geographic Dimensions:');
  segmentFacts.forEach((instances, factName) => {
    console.log(`\n  ${factName}:`);
    console.log(`    Instances: ${instances.length}`);
    // Show sample dimensions
    if (instances.length > 0) {
      const sampleDims = instances[0].dimensions;
      console.log(`    Sample dimensions: ${sampleDims.map(d => `${d.axis}->${d.member}`).join(', ')}`);
    }
  });

  // Now check for Operating KPIs in text (not XBRL)
  console.log('\n\n=== OPERATING KPIs (Voluntary) ===');
  console.log('These are typically in MD&A section, not in XBRL tags.');
  console.log('Common Apple KPIs to look for:');
  console.log('  • Active device base');
  console.log('  • Paid subscriptions');
  console.log('  • App Store transactions');
  console.log('  • Services revenue per device');
  console.log('  • Geographic distribution of revenue (if not in segments)');
}

exploreAAPLMetrics().catch(console.error);
