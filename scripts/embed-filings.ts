/**
 * Generate embeddings for filing chunks using OpenAI API
 * Run with: npx tsx scripts/embed-filings.ts
 */

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import * as fs from 'fs/promises'
import * as path from 'path'

const BATCH_SIZE = 10 // Process 10 chunks at a time

async function embedFilings() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !OPENAI_API_KEY) {
    console.error('Error: Missing credentials in .env.local')
    return
  }

  console.log('Starting embedding generation...\n')

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

  // Get chunks that don't have embeddings yet
  const { data: chunks, error: fetchError } = await supabase
    .from('filing_chunks')
    .select('id, chunk_text')
    .is('embedding', null)
    .order('id')

  if (fetchError || !chunks) {
    console.error('Error fetching chunks:', fetchError)
    return
  }

  console.log(`Found ${chunks.length} chunks without embeddings\n`)

  if (chunks.length === 0) {
    console.log('✅ All chunks already have embeddings!')
    return
  }

  let embedded = 0
  let errors = 0

  // Process in batches
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE)
    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)} (${batch.length} chunks)`)

    for (const chunk of batch) {
      try {
        // Generate embedding
        const response = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: chunk.chunk_text,
        })

        const embedding = response.data[0].embedding

        // Update chunk with embedding
        const { error: updateError } = await supabase
          .from('filing_chunks')
          .update({ embedding: JSON.stringify(embedding) })
          .eq('id', chunk.id)

        if (updateError) {
          throw updateError
        }

        embedded++
        process.stdout.write(`  ✓ ${embedded}/${chunks.length}\r`)
      } catch (err) {
        console.error(`\n  ✗ Error embedding chunk ${chunk.id}:`, err instanceof Error ? err.message : err)
        errors++
      }
    }

    // Small delay between batches to respect rate limits
    if (i + BATCH_SIZE < chunks.length) {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  console.log('\n\n--- Summary ---')
  console.log(`Embedded: ${embedded}`)
  console.log(`Errors: ${errors}`)
  console.log(`Total: ${chunks.length}`)

  // Estimate cost (text-embedding-3-small: $0.00002 per 1K tokens, ~750 words = 1K tokens)
  const estimatedTokens = chunks.length * 800 * 1.33 // 800 words per chunk * 1.33 tokens per word
  const estimatedCost = (estimatedTokens / 1000) * 0.00002
  console.log(`\nEstimated cost: $${estimatedCost.toFixed(4)}`)
}

// Load environment variables from .env.local
async function loadEnv() {
  try {
    const envPath = path.join(process.cwd(), '.env.local')
    const envContent = await fs.readFile(envPath, 'utf-8')

    envContent.split('\n').forEach((line) => {
      const match = line.match(/^([^=:#]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        const value = match[2].trim()
        process.env[key] = value
      }
    })
  } catch (error) {
    console.error('Error loading .env.local:', error)
  }
}

loadEnv().then(() => embedFilings()).catch(console.error)
