/**
 * Final iXBRL extraction - get actual segment revenue values
 * Run with: node scripts/explore-ixbrl-final.mjs
 */

import * as fs from 'fs/promises'

async function extractSegmentData() {
  console.log('Reading temp-filing.html...\n')
  const html = await fs.readFile('temp-filing.html', 'utf-8')

  // ============================================
  // Extract ALL contexts
  // ============================================

  const headerMatch = html.match(/<ix:header[^>]*>([\s\S]*?)<\/ix:header>/i)
  if (!headerMatch) {
    console.log('No ix:header found')
    return
  }

  const header = headerMatch[1]
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

    // Extract dimensions
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

  console.log(`Parsed ${Object.keys(contexts).length} contexts\n`)

  // ============================================
  // Extract ALL ix:nonFraction elements with values
  // ============================================

  // More flexible regex - captures the whole tag and then we parse attributes
  const factRegex = /<ix:nonFraction([^>]*)>([^<]*)<\/ix:nonFraction>/gi
  const allFacts = []

  while ((match = factRegex.exec(html)) !== null) {
    const attrs = match[1]
    const rawValue = match[2].replace(/,/g, '').trim()

    const nameMatch = attrs.match(/name="([^"]+)"/i)
    const contextMatch = attrs.match(/contextRef="([^"]+)"/i)
    const scaleMatch = attrs.match(/scale="([^"]+)"/i)
    const decimalsMatch = attrs.match(/decimals="([^"]+)"/i)

    if (nameMatch && contextMatch) {
      const scale = scaleMatch ? parseInt(scaleMatch[1]) : 0
      let value = parseFloat(rawValue)
      if (!isNaN(value) && scale) {
        value = value * Math.pow(10, scale)
      }

      allFacts.push({
        name: nameMatch[1],
        contextId: contextMatch[1],
        scale,
        rawValue,
        value: isNaN(value) ? null : value
      })
    }
  }

  console.log(`Parsed ${allFacts.length} numeric facts\n`)

  // ============================================
  // Filter for Revenue facts and join with contexts
  // ============================================

  const revenueFacts = allFacts.filter(f =>
    f.name.toLowerCase().includes('revenuefromcontract')
  )

  console.log(`Found ${revenueFacts.length} RevenueFromContract facts\n`)

  // Enrich with context data
  const enrichedFacts = revenueFacts.map(f => {
    const ctx = contexts[f.contextId] || { period: null, dimensions: [] }
    return {
      ...f,
      period: ctx.period,
      dimensions: ctx.dimensions
    }
  })

  // ============================================
  // PRODUCT SEGMENT REVENUE
  // ============================================

  console.log('=== PRODUCT SEGMENT REVENUE ===\n')

  const productFacts = enrichedFacts.filter(f =>
    f.dimensions.some(d => d.axis === 'srt:ProductOrServiceAxis')
  )

  // Group by fiscal year
  const productByYear = {}
  productFacts.forEach(f => {
    const fiscalYear = f.period?.end?.substring(0, 4)
    if (!fiscalYear) return

    const member = f.dimensions.find(d => d.axis === 'srt:ProductOrServiceAxis')?.member
    if (!member) return

    const productName = member.split(':').pop().replace('Member', '')

    if (!productByYear[fiscalYear]) productByYear[fiscalYear] = {}
    productByYear[fiscalYear][productName] = {
      value: f.value,
      valueB: (f.value / 1e9).toFixed(2),
      period: f.period
    }
  })

  // Display product revenue by year
  Object.keys(productByYear).sort().reverse().forEach(year => {
    console.log(`FY ${year}:`)
    const products = productByYear[year]

    // Sort by value descending
    const sorted = Object.entries(products).sort((a, b) => b[1].value - a[1].value)
    sorted.forEach(([product, data]) => {
      console.log(`  ${product.padEnd(30)} $${data.valueB}B`)
    })
    console.log()
  })

  // ============================================
  // GEOGRAPHIC SEGMENT REVENUE
  // ============================================

  console.log('=== GEOGRAPHIC SEGMENT REVENUE ===\n')

  const geoFacts = enrichedFacts.filter(f =>
    f.dimensions.some(d => d.axis === 'us-gaap:StatementBusinessSegmentsAxis')
  )

  // Group by fiscal year
  const geoByYear = {}
  geoFacts.forEach(f => {
    const fiscalYear = f.period?.end?.substring(0, 4)
    if (!fiscalYear) return

    const member = f.dimensions.find(d => d.axis === 'us-gaap:StatementBusinessSegmentsAxis')?.member
    if (!member) return

    const geoName = member.split(':').pop().replace('SegmentMember', '')

    if (!geoByYear[fiscalYear]) geoByYear[fiscalYear] = {}
    geoByYear[fiscalYear][geoName] = {
      value: f.value,
      valueB: (f.value / 1e9).toFixed(2),
      period: f.period
    }
  })

  // Display geo revenue by year
  Object.keys(geoByYear).sort().reverse().forEach(year => {
    console.log(`FY ${year}:`)
    const regions = geoByYear[year]

    // Sort by value descending
    const sorted = Object.entries(regions).sort((a, b) => b[1].value - a[1].value)
    sorted.forEach(([region, data]) => {
      console.log(`  ${region.padEnd(20)} $${data.valueB}B`)
    })
    console.log()
  })

  // ============================================
  // SUMMARY
  // ============================================

  console.log('=== SUMMARY ===\n')
  console.log('Product segments found:', [...new Set(productFacts.map(f =>
    f.dimensions.find(d => d.axis === 'srt:ProductOrServiceAxis')?.member.split(':').pop().replace('Member', '')
  ))].join(', '))

  console.log('Geographic segments found:', [...new Set(geoFacts.map(f =>
    f.dimensions.find(d => d.axis === 'us-gaap:StatementBusinessSegmentsAxis')?.member.split(':').pop().replace('SegmentMember', '')
  ))].join(', '))

  console.log('\nYears available in this 10-K:',
    [...new Set([...Object.keys(productByYear), ...Object.keys(geoByYear)])].sort().reverse().join(', ')
  )

  console.log('\n=== DONE ===')
}

extractSegmentData().catch(console.error)
