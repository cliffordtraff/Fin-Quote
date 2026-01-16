/**
 * Analyze GOOGL 10-K iXBRL structure to identify segment axes and members
 *
 * Usage:
 *   npx tsx scripts/analyze-googl-ixbrl.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as cheerio from 'cheerio'

async function analyzeIxbrl() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Error: Missing Supabase credentials')
    return
  }

  console.log('Downloading GOOGL 10-K 2024 from Supabase Storage...\n')

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  // Download the filing
  const { data, error } = await supabase.storage
    .from('filings')
    .download('html/googl-10-k-2024.html')

  if (error) {
    console.error('Error downloading filing:', error)
    return
  }

  const html = await data.text()
  console.log(`Downloaded ${(html.length / 1024 / 1024).toFixed(2)} MB\n`)

  // Parse HTML
  const $ = cheerio.load(html)

  // Find all context elements (contains dimensional info)
  console.log('=== XBRL Context Elements (Dimensional) ===\n')

  // Look for segment-related contexts
  const contexts = new Map<string, Set<string>>()
  const segmentMembers = new Set<string>()
  const geographicMembers = new Set<string>()

  // Search for dimension members in the HTML
  // GOOGL uses inline XBRL, so look for ix:nonFraction elements with contextRef

  // Find all explicit dimension members
  $('xbrli\\:context, context').each((_, ctx) => {
    const contextId = $(ctx).attr('id') || ''
    const segments = $(ctx).find('xbrldi\\:explicitMember, explicitMember')

    segments.each((_, seg) => {
      const dimension = $(seg).attr('dimension') || ''
      const member = $(seg).text().trim()

      if (!contexts.has(dimension)) {
        contexts.set(dimension, new Set())
      }
      contexts.get(dimension)!.add(member)

      // Categorize by type
      if (dimension.includes('Segment') || dimension.includes('Business')) {
        segmentMembers.add(`${dimension}: ${member}`)
      }
      if (dimension.includes('Geograph') || dimension.includes('Region') || dimension.includes('country')) {
        geographicMembers.add(`${dimension}: ${member}`)
      }
    })
  })

  console.log('Dimensions found:')
  for (const [dim, members] of contexts) {
    console.log(`\n  ${dim}:`)
    for (const m of members) {
      console.log(`    - ${m}`)
    }
  }

  console.log('\n\n=== Segment-Related Members ===')
  for (const m of segmentMembers) {
    console.log(`  ${m}`)
  }

  console.log('\n\n=== Geographic-Related Members ===')
  for (const m of geographicMembers) {
    console.log(`  ${m}`)
  }

  // Search for revenue facts with segment dimensions
  console.log('\n\n=== Revenue Facts by Segment ===\n')

  // Find ix:nonFraction elements that contain Revenue
  const revenueFacts: Array<{value: string, context: string, name: string}> = []

  $('ix\\:nonFraction, ix\\:nonfraction').each((_, fact) => {
    const name = $(fact).attr('name') || ''
    const contextRef = $(fact).attr('contextref') || ''
    const value = $(fact).text().trim()

    // Look for revenue-related facts
    if (name.toLowerCase().includes('revenue') ||
        name.toLowerCase().includes('sales') ||
        name.includes('RevenueFromContractWithCustomer')) {
      revenueFacts.push({ value, context: contextRef, name })
    }
  })

  // Show unique revenue fact names
  const uniqueRevenueNames = new Set(revenueFacts.map(f => f.name))
  console.log('Revenue-related fact names:')
  for (const name of uniqueRevenueNames) {
    console.log(`  - ${name}`)
  }

  // Look for segment-specific revenue contexts
  console.log('\n\nSample Revenue Facts with Segment Contexts:')
  let count = 0
  for (const fact of revenueFacts) {
    if (fact.context.includes('Segment') ||
        fact.context.includes('Services') ||
        fact.context.includes('Cloud') ||
        fact.context.includes('OtherBets')) {
      console.log(`  ${fact.name} [${fact.context}]: ${fact.value}`)
      count++
      if (count > 20) break
    }
  }

  // Search for specific GOOGL segment terms in the HTML
  console.log('\n\n=== Searching for GOOGL-specific terms ===\n')

  const searchTerms = [
    'GoogleServicesMember',
    'GoogleCloudMember',
    'OtherBetsMember',
    'google:',
    'goog:',
    'StatementBusinessSegmentsAxis',
    'SegmentReportingDisclosure'
  ]

  for (const term of searchTerms) {
    const regex = new RegExp(term, 'gi')
    const matches = html.match(regex)
    if (matches) {
      console.log(`  "${term}": Found ${matches.length} occurrences`)
    } else {
      console.log(`  "${term}": Not found`)
    }
  }

  // Extract actual segment names from text content
  console.log('\n\n=== Segment Names in Document ===\n')
  const segmentPattern = /(Google\s+Services|Google\s+Cloud|Other\s+Bets)/gi
  const segmentMatches = html.match(segmentPattern)
  if (segmentMatches) {
    const counts = new Map<string, number>()
    for (const m of segmentMatches) {
      const normalized = m.replace(/\s+/g, ' ')
      counts.set(normalized, (counts.get(normalized) || 0) + 1)
    }
    for (const [seg, count] of counts) {
      console.log(`  "${seg}": ${count} mentions`)
    }
  }
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

loadEnv().then(() => analyzeIxbrl()).catch(console.error)
