import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const query = "10-K insights";

console.log(`Searching for: "${query}"\n`);

// Generate embedding
const embeddingResponse = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: query,
});

const queryEmbedding = embeddingResponse.data[0].embedding;

// Detect filing type filter (same logic as searchFilings action)
const filingTypeMatch = query.match(/10-[KQ]/i);
const filingTypeFilter = filingTypeMatch ? filingTypeMatch[0].toUpperCase() : null;

console.log(`Filing type filter: ${filingTypeFilter || 'none'}\n`);

// Search using RPC function with filing type filter
const { data: chunks, error: searchError } = await supabase.rpc(
  'search_filing_chunks',
  {
    query_embedding: JSON.stringify(queryEmbedding),
    match_count: 5,
    filing_type_filter: filingTypeFilter,
  }
);

if (searchError) {
  console.error('Search error:', searchError);
} else {
  console.log(`Found ${chunks.length} chunks:\n`);
  chunks.forEach((chunk, i) => {
    console.log(`${i + 1}. ${chunk.filing_type} | ${chunk.filing_date} | FY${chunk.fiscal_year} | ${chunk.section_name}`);
    console.log(`   Similarity: ${chunk.similarity.toFixed(4)}`);
    console.log(`   Text preview: ${chunk.chunk_text.substring(0, 100)}...`);
    console.log('');
  });

  // Check filing type distribution
  const filingTypes = chunks.reduce((acc, chunk) => {
    acc[chunk.filing_type] = (acc[chunk.filing_type] || 0) + 1;
    return acc;
  }, {});

  console.log('Filing type distribution:');
  Object.entries(filingTypes).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
}
