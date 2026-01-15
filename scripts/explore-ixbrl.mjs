/**
 * Explore iXBRL structure in SEC filing HTML
 * Run with: node scripts/explore-ixbrl.mjs
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs/promises'
import * as path from 'path'

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

async function exploreIxbrl() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Missing Supabase credentials')
    return
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  // List available filing HTML files
  console.log('Listing available filing HTML files...\n')
  const { data: files, error: listError } = await supabase.storage
    .from('filings')
    .list('html')

  if (listError) {
    console.error('Error listing files:', listError)
    return
  }

  console.log('Available files:')
  files.forEach(f => console.log(`  - ${f.name}`))
  console.log()

  // Download a 10-K filing (prefer the most recent)
  const tenKFiles = files.filter(f => f.name.includes('10-k'))
  if (tenKFiles.length === 0) {
    console.log('No 10-K files found')
    return
  }

  // Sort by name to get most recent (assuming naming convention includes year)
  tenKFiles.sort((a, b) => b.name.localeCompare(a.name))
  const targetFile = tenKFiles[0].name

  console.log(`Downloading ${targetFile}...\n`)

  const { data: htmlBlob, error: downloadError } = await supabase.storage
    .from('filings')
    .download(`html/${targetFile}`)

  if (downloadError) {
    console.error('Error downloading:', downloadError)
    return
  }

  const html = await htmlBlob.text()
  console.log(`File size: ${(html.length / 1024 / 1024).toFixed(2)} MB\n`)

  // Save locally for manual inspection
  await fs.writeFile('temp-filing.html', html)
  console.log('Saved to temp-filing.html for manual inspection\n')

  // ============================================
  // Explore iXBRL structure
  // ============================================

  console.log('=== iXBRL STRUCTURE ANALYSIS ===\n')

  // 1. Find ix:header (contains context definitions)
  const headerMatch = html.match(/<ix:header[^>]*>([\s\S]*?)<\/ix:header>/i)
  if (headerMatch) {
    console.log('✓ Found ix:header (context definitions)')

    // Extract context definitions
    const contextMatches = headerMatch[1].matchAll(/<xbrli:context[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/xbrli:context>/gi)
    const contexts = {}

    for (const match of contextMatches) {
      const contextId = match[1]
      const contextContent = match[2]

      // Check if this context has segment/dimension info
      if (contextContent.includes('xbrldi:') || contextContent.includes('segment')) {
        contexts[contextId] = {
          hasSegment: true,
          content: contextContent.substring(0, 500) // truncate for display
        }
      }
    }

    const segmentContexts = Object.keys(contexts).filter(k => contexts[k].hasSegment)
    console.log(`  Found ${segmentContexts.length} contexts with segment/dimension qualifiers`)

    if (segmentContexts.length > 0) {
      console.log('\n  Sample segment contexts:')
      segmentContexts.slice(0, 5).forEach(id => {
        console.log(`\n  Context ID: ${id}`)
        console.log(`  ${contexts[id].content.replace(/\s+/g, ' ').substring(0, 300)}...`)
      })
    }
  } else {
    console.log('✗ No ix:header found')
  }

  console.log('\n')

  // 2. Find ix:nonFraction elements (numeric facts)
  const numericFactMatches = [...html.matchAll(/<ix:nonFraction[^>]*>([\s\S]*?)<\/ix:nonFraction>/gi)]
  console.log(`✓ Found ${numericFactMatches.length} ix:nonFraction elements (numeric facts)`)

  // Sample a few
  if (numericFactMatches.length > 0) {
    console.log('\n  Sample numeric facts:')
    numericFactMatches.slice(0, 5).forEach((match, i) => {
      const tag = match[0].substring(0, 300)
      console.log(`\n  [${i + 1}] ${tag.replace(/\s+/g, ' ')}...`)
    })
  }

  console.log('\n')

  // 3. Look for revenue-related facts with dimensional qualifiers
  console.log('=== SEARCHING FOR SEGMENT REVENUE DATA ===\n')

  // Search for revenue facts
  const revenuePatterns = [
    /Revenue/gi,
    /NetSales/gi,
    /SalesRevenueNet/gi,
    /Revenues/gi
  ]

  const revenueFacts = numericFactMatches.filter(m =>
    revenuePatterns.some(p => p.test(m[0]))
  )

  console.log(`Found ${revenueFacts.length} revenue-related facts`)

  if (revenueFacts.length > 0) {
    console.log('\nRevenue facts with context references:')
    revenueFacts.slice(0, 10).forEach((match, i) => {
      // Extract context reference and name
      const contextMatch = match[0].match(/contextRef="([^"]+)"/i)
      const nameMatch = match[0].match(/name="([^"]+)"/i)
      const value = match[1]

      console.log(`\n  [${i + 1}]`)
      console.log(`    Name: ${nameMatch ? nameMatch[1] : 'unknown'}`)
      console.log(`    Context: ${contextMatch ? contextMatch[1] : 'unknown'}`)
      console.log(`    Value: ${value}`)
    })
  }

  console.log('\n')

  // 4. Look for segment/product/geographic axes
  console.log('=== SEARCHING FOR DIMENSIONAL AXES ===\n')

  const axisPatterns = [
    /ProductOrService/gi,
    /Segment/gi,
    /Geographic/gi,
    /StatementBusinessSegments/gi,
    /RevenueFromContractWithCustomer/gi
  ]

  axisPatterns.forEach(pattern => {
    const matches = html.match(new RegExp(`[a-z:]*${pattern.source}[^"<>]*`, 'gi'))
    if (matches) {
      const unique = [...new Set(matches)]
      console.log(`Pattern "${pattern.source}": ${unique.length} unique matches`)
      unique.slice(0, 5).forEach(m => console.log(`  - ${m}`))
      console.log()
    }
  })

  // 5. Look for Apple's specific product/region members
  console.log('=== SEARCHING FOR APPLE-SPECIFIC MEMBERS ===\n')

  const applePatterns = [
    /iPhone/gi,
    /iPad/gi,
    /Mac/gi,
    /Services/gi,
    /Wearables/gi,
    /Americas/gi,
    /Europe/gi,
    /China/gi,
    /Japan/gi,
    /Asia/gi
  ]

  applePatterns.forEach(pattern => {
    const matches = html.match(new RegExp(`[a-z:]*${pattern.source}[^"<>\\s]*`, 'gi'))
    if (matches) {
      const unique = [...new Set(matches)]
      console.log(`"${pattern.source}": ${unique.length} unique matches`)
      unique.slice(0, 8).forEach(m => console.log(`  - ${m}`))
      console.log()
    }
  })

  console.log('\n=== DONE ===')
  console.log('Check temp-filing.html for full content')
}

loadEnv().then(() => exploreIxbrl()).catch(console.error)
