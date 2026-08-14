#!/usr/bin/env npx tsx
/**
 * Lightweight chart screenshot capture script.
 *
 * Takes a ChartExportSpec (as JSON or base64) and produces a PNG screenshot
 * using Puppeteer headless browser against the /charts/export route.
 *
 * Usage:
 *   # From base64 spec
 *   npx tsx scripts/capture-chart.ts --spec eyJzdG9ja3MiOlsiQUFQTCJdLCJtZXRyaWNzIjpbInJldmVudWUiXX0=
 *
 *   # From JSON file
 *   npx tsx scripts/capture-chart.ts --file chart-spec.json
 *
 *   # With custom output path
 *   npx tsx scripts/capture-chart.ts --spec <base64> --out chart.png
 *
 *   # With custom base URL (defaults to http://localhost:3000)
 *   npx tsx scripts/capture-chart.ts --spec <base64> --base-url https://markets.theintraday.com
 *
 * Prerequisites:
 *   npm install puppeteer  (or: npx puppeteer install)
 *   Dev server must be running (npm run dev) unless using a remote --base-url
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

interface CaptureOptions {
  spec?: string       // base64-encoded spec
  file?: string       // path to JSON spec file
  out: string         // output PNG path
  baseUrl: string     // base URL of the app
  width: number       // viewport width
  height: number      // viewport height
  timeout: number     // max wait time in ms
}

function parseArgs(): CaptureOptions {
  const args = process.argv.slice(2)
  const opts: CaptureOptions = {
    out: 'chart.png',
    baseUrl: 'http://localhost:3000',
    width: 1200,
    height: 700,
    timeout: 30000,
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--spec':
        opts.spec = args[++i]
        break
      case '--file':
        opts.file = args[++i]
        break
      case '--out':
        opts.out = args[++i]
        break
      case '--base-url':
        opts.baseUrl = args[++i]
        break
      case '--width':
        opts.width = parseInt(args[++i], 10)
        break
      case '--height':
        opts.height = parseInt(args[++i], 10)
        break
      case '--timeout':
        opts.timeout = parseInt(args[++i], 10)
        break
      case '--help':
        console.log(`
Usage: npx tsx scripts/capture-chart.ts [options]

Options:
  --spec <base64>     Base64-encoded ChartExportSpec
  --file <path>       Path to JSON file containing ChartExportSpec
  --out <path>        Output PNG path (default: chart.png)
  --base-url <url>    App base URL (default: http://localhost:3000)
  --width <px>        Viewport width (default: 1200)
  --height <px>       Viewport height (default: 700)
  --timeout <ms>      Max wait time (default: 30000)
  --help              Show this help
`)
        process.exit(0)
    }
  }

  return opts
}

async function main() {
  const opts = parseArgs()

  // Resolve the spec to a base64 string
  let specBase64: string

  if (opts.spec) {
    specBase64 = opts.spec
  } else if (opts.file) {
    const filePath = resolve(opts.file)
    const json = readFileSync(filePath, 'utf-8')
    // Validate it's valid JSON with required fields
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed.stocks) || !Array.isArray(parsed.metrics)) {
      console.error('Error: JSON must have "stocks" and "metrics" arrays')
      process.exit(1)
    }
    specBase64 = Buffer.from(json).toString('base64')
  } else {
    console.error('Error: Provide --spec <base64> or --file <path>')
    console.error('Run with --help for usage info')
    process.exit(1)
  }

  const exportUrl = `${opts.baseUrl}/charts/export?spec=${specBase64}`

  console.log(`Capturing chart...`)
  console.log(`  URL: ${exportUrl.slice(0, 100)}...`)
  console.log(`  Output: ${opts.out}`)
  console.log(`  Viewport: ${opts.width}x${opts.height}`)

  // Dynamic import so puppeteer is only needed when running this script
  let puppeteer: typeof import('puppeteer')
  try {
    puppeteer = await import('puppeteer')
  } catch {
    console.error('Error: puppeteer is not installed.')
    console.error('Install it with: npm install puppeteer')
    process.exit(1)
  }

  const browser = await puppeteer.launch({ headless: true })

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: opts.width, height: opts.height })

    await page.goto(exportUrl, { waitUntil: 'networkidle0', timeout: opts.timeout })

    // Wait for the chart to signal it's ready
    await page.waitForFunction(
      () => (window as any).__CHART_EXPORT_READY__ === true,
      { timeout: opts.timeout }
    )

    // Small extra delay for any final CSS settling
    await new Promise(r => setTimeout(r, 200))

    // Find the export container and screenshot just that element
    const container = await page.$('[data-export-ready="true"]')
    if (container) {
      await container.screenshot({ path: opts.out, type: 'png' })
    } else {
      // Fallback to full page screenshot
      await page.screenshot({ path: opts.out, type: 'png' })
    }

    console.log(`Done! Screenshot saved to ${opts.out}`)
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error('Capture failed:', err.message)
  process.exit(1)
})
