import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function findSegmentFacts() {
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
      // Check if any dim is relevant
      const hasRelevant = dims.some(d => relevantAxes.includes(d.axis));
      if (hasRelevant) {
        contextDimensions.set(contextId, dims);
      }
    }
  }

  console.log('Found', contextDimensions.size, 'contexts with segment/geographic dimensions');
  console.log('');

  // Show sample contexts
  let count = 0;
  contextDimensions.forEach((dims, id) => {
    if (count < 5) {
      console.log('Context:', id);
      dims.forEach(d => console.log('  ', d.axis, '->', d.member));
      count++;
    }
  });
  console.log('');

  // Parse facts - match any ix:nonFraction element
  const factRegex = /<ix:nonFraction([^>]*)>([^<]*)<\/ix:nonFraction>/gi;

  const segmentFacts = new Map(); // factName -> Set of members
  let factCount = 0;
  let matchedCount = 0;

  while ((match = factRegex.exec(html)) !== null) {
    factCount++;
    const attrs = match[1];

    // Extract name and contextRef from attributes
    const nameMatch = attrs.match(/name="([^"]+)"/);
    const contextMatch = attrs.match(/contextRef="([^"]+)"/);

    if (!nameMatch || !contextMatch) continue;

    const factName = nameMatch[1];
    const contextId = contextMatch[1];

    const dims = contextDimensions.get(contextId);
    if (!dims) continue;

    matchedCount++;

    for (const dim of dims) {
      if (relevantAxes.includes(dim.axis)) {
        if (!segmentFacts.has(factName)) segmentFacts.set(factName, new Set());
        segmentFacts.get(factName).add(dim.member);
      }
    }
  }

  console.log('Total ix:nonFraction facts found:', factCount);
  console.log('Facts with segment context:', matchedCount);
  console.log('');
  console.log('=== Facts with Segment/Geographic Dimensions ===');
  console.log('Total unique fact types:', segmentFacts.size);
  console.log('');

  segmentFacts.forEach((members, factName) => {
    console.log('Fact:', factName);
    console.log('  Members:', [...members].join(', '));
    console.log('');
  });
}

findSegmentFacts();
