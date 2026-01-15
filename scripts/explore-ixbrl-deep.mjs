/**
 * Deep exploration of iXBRL segment data in SEC filing
 * Run with: node scripts/explore-ixbrl-deep.mjs
 */

import * as fs from 'fs/promises'

async function deepExplore() {
  console.log('Reading temp-filing.html...\n')
  const html = await fs.readFile('temp-filing.html', 'utf-8')

  // ============================================
  // Extract ALL contexts with their full definitions
  // ============================================

  console.log('=== EXTRACTING ALL CONTEXT DEFINITIONS ===\n')

  const headerMatch = html.match(/<ix:header[^>]*>([\s\S]*?)<\/ix:header>/i)
  if (!headerMatch) {
    console.log('No ix:header found')
    return
  }

  const header = headerMatch[1]

  // Parse all contexts
  const contextRegex = /<xbrli:context[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/xbrli:context>/gi
  const contexts = {}

  let match
  while ((match = contextRegex.exec(header)) !== null) {
    const contextId = match[1]
    const contextContent = match[2]

    // Extract period
    const periodMatch = contextContent.match(/<xbrli:period>([\s\S]*?)<\/xbrli:period>/i)
    let period = null
    if (periodMatch) {
      const startMatch = periodMatch[1].match(/<xbrli:startDate>([^<]+)/i)
      const endMatch = periodMatch[1].match(/<xbrli:endDate>([^<]+)/i)
      const instantMatch = periodMatch[1].match(/<xbrli:instant>([^<]+)/i)

      if (instantMatch) {
        period = { type: 'instant', date: instantMatch[1] }
      } else if (startMatch && endMatch) {
        period = { type: 'duration', start: startMatch[1], end: endMatch[1] }
      }
    }

    // Extract dimensions/segments
    const dimensions = []
    const dimRegex = /<xbrldi:explicitMember\s+dimension="([^"]+)"[^>]*>([^<]+)<\/xbrldi:explicitMember>/gi
    let dimMatch
    while ((dimMatch = dimRegex.exec(contextContent)) !== null) {
      dimensions.push({
        axis: dimMatch[1],
        member: dimMatch[2]
      })
    }

    contexts[contextId] = { period, dimensions }
  }

  console.log(`Total contexts: ${Object.keys(contexts).length}`)
  console.log(`Contexts with dimensions: ${Object.values(contexts).filter(c => c.dimensions.length > 0).length}`)

  // Show some contexts with segment dimensions
  console.log('\n--- Sample contexts with Product or Geo dimensions ---')
  Object.entries(contexts)
    .filter(([_, c]) => c.dimensions.some(d =>
      d.axis.includes('ProductOrService') ||
      d.axis.includes('BusinessSegments') ||
      d.axis.includes('Geographical')
    ))
    .slice(0, 10)
    .forEach(([id, c]) => {
      console.log(`\n${id}:`)
      console.log(`  Period: ${JSON.stringify(c.period)}`)
      c.dimensions.forEach(d => {
        console.log(`  Dim: ${d.axis} = ${d.member}`)
      })
    })

  // ============================================
  // Find ALL numeric facts
  // ============================================

  console.log('\n\n=== ALL NUMERIC FACTS (ix:nonFraction) ===\n')

  const allFacts = []
  // Match ALL ix:nonFraction elements
  const factRegex = /<ix:nonFraction[^>]+>/gi

  while ((match = factRegex.exec(html)) !== null) {
    const tag = match[0]

    const nameMatch = tag.match(/name="([^"]+)"/i)
    const contextMatch = tag.match(/contextRef="([^"]+)"/i)
    const scaleMatch = tag.match(/scale="([^"]+)"/i)

    if (nameMatch && contextMatch) {
      allFacts.push({
        name: nameMatch[1],
        contextId: contextMatch[1],
        scale: scaleMatch ? parseInt(scaleMatch[1]) : 0,
        fullTag: tag
      })
    }
  }

  console.log(`Total numeric facts: ${allFacts.length}`)

  // Find facts that have dimensional contexts
  const dimensionalFacts = allFacts.filter(f => {
    const ctx = contexts[f.contextId]
    return ctx && ctx.dimensions.length > 0
  })

  console.log(`Facts with dimensional context: ${dimensionalFacts.length}`)

  // Group by dimension axis
  const factsByAxis = {}
  dimensionalFacts.forEach(f => {
    const ctx = contexts[f.contextId]
    ctx.dimensions.forEach(d => {
      if (!factsByAxis[d.axis]) factsByAxis[d.axis] = []
      factsByAxis[d.axis].push({ ...f, member: d.member, period: ctx.period })
    })
  })

  console.log('\nFacts by dimension axis:')
  Object.entries(factsByAxis).forEach(([axis, facts]) => {
    console.log(`  ${axis}: ${facts.length} facts`)
  })

  // ============================================
  // Product segment facts
  // ============================================

  console.log('\n=== PRODUCT SEGMENT FACTS ===\n')

  const productFacts = factsByAxis['srt:ProductOrServiceAxis'] || []
  if (productFacts.length > 0) {
    // Filter for revenue-like facts
    const revFacts = productFacts.filter(f =>
      f.name.toLowerCase().includes('revenue') ||
      f.name.toLowerCase().includes('sales') ||
      f.name.toLowerCase().includes('netsales')
    )

    console.log(`Revenue-related product facts: ${revFacts.length}`)

    // Get unique members
    const members = [...new Set(revFacts.map(f => f.member))]
    console.log(`Product members: ${members.join(', ')}`)

    // Show sample facts
    console.log('\nSample product revenue facts:')
    revFacts.slice(0, 15).forEach(f => {
      const memberShort = f.member.split(':').pop()
      console.log(`  ${f.name} | ${memberShort} | ${f.period?.end || f.period?.date}`)
    })
  } else {
    console.log('No product-axis facts found')
  }

  // ============================================
  // Geographic segment facts
  // ============================================

  console.log('\n=== GEOGRAPHIC SEGMENT FACTS ===\n')

  const geoFacts = factsByAxis['us-gaap:StatementBusinessSegmentsAxis'] || []
  if (geoFacts.length > 0) {
    // Filter for revenue-like facts
    const revFacts = geoFacts.filter(f =>
      f.name.toLowerCase().includes('revenue') ||
      f.name.toLowerCase().includes('sales') ||
      f.name.toLowerCase().includes('netsales')
    )

    console.log(`Revenue-related geo facts: ${revFacts.length}`)

    // Get unique members
    const members = [...new Set(revFacts.map(f => f.member))]
    console.log(`Geo members: ${members.join(', ')}`)

    // Show sample facts
    console.log('\nSample geo revenue facts:')
    revFacts.slice(0, 15).forEach(f => {
      const memberShort = f.member.split(':').pop()
      console.log(`  ${f.name} | ${memberShort} | ${f.period?.end || f.period?.date}`)
    })
  } else {
    console.log('No business-segment-axis facts found')
  }

  // ============================================
  // Now let's extract actual values
  // ============================================

  console.log('\n=== EXTRACTING ACTUAL VALUES ===\n')

  // Find revenue facts with values
  const revenueFactPattern = /<ix:nonFraction[^>]*name="[^"]*(?:Revenue|Sales)[^"]*"[^>]*contextRef="([^"]+)"[^>]*scale="(\d+)"[^>]*>([^<]+)<\/ix:nonFraction>/gi

  const revenueValues = []
  while ((match = revenueFactPattern.exec(html)) !== null) {
    const contextId = match[1]
    const scale = parseInt(match[2])
    const rawValue = match[3].replace(/,/g, '').trim()
    const value = parseFloat(rawValue) * Math.pow(10, scale)

    const ctx = contexts[contextId]
    if (ctx && ctx.dimensions.length > 0) {
      revenueValues.push({
        contextId,
        value,
        valueB: (value / 1e9).toFixed(2),
        period: ctx.period,
        dimensions: ctx.dimensions
      })
    }
  }

  console.log(`Revenue values with dimensions: ${revenueValues.length}`)

  // Group by product
  const productRevenue = revenueValues.filter(v =>
    v.dimensions.some(d => d.axis.includes('ProductOrService'))
  )

  if (productRevenue.length > 0) {
    console.log('\n--- Revenue by Product ---')

    // Group by year
    const byYear = {}
    productRevenue.forEach(v => {
      const year = (v.period?.end || '').substring(0, 4)
      if (!byYear[year]) byYear[year] = {}

      const product = v.dimensions.find(d => d.axis.includes('ProductOrService'))?.member || ''
      const productName = product.split(':').pop().replace('Member', '')

      byYear[year][productName] = v.valueB
    })

    Object.keys(byYear).sort().reverse().forEach(year => {
      console.log(`\nFY ${year}:`)
      Object.entries(byYear[year]).forEach(([product, value]) => {
        console.log(`  ${product}: $${value}B`)
      })
    })
  }

  // Group by geography
  const geoRevenue = revenueValues.filter(v =>
    v.dimensions.some(d =>
      d.axis.includes('BusinessSegments') ||
      d.axis.includes('Geographical')
    )
  )

  if (geoRevenue.length > 0) {
    console.log('\n--- Revenue by Geography ---')

    // Group by year
    const byYear = {}
    geoRevenue.forEach(v => {
      const year = (v.period?.end || '').substring(0, 4)
      if (!byYear[year]) byYear[year] = {}

      const geo = v.dimensions.find(d =>
        d.axis.includes('BusinessSegments') || d.axis.includes('Geographical')
      )?.member || ''
      const geoName = geo.split(':').pop().replace('SegmentMember', '').replace('Member', '')

      byYear[year][geoName] = v.valueB
    })

    Object.keys(byYear).sort().reverse().forEach(year => {
      console.log(`\nFY ${year}:`)
      Object.entries(byYear[year]).forEach(([geo, value]) => {
        console.log(`  ${geo}: $${value}B`)
      })
    })
  }

  console.log('\n=== DONE ===')
}

deepExplore().catch(console.error)
