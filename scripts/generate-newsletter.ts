#!/usr/bin/env npx tsx
/**
 * Generate a complete AI-powered newsletter for a given ticker.
 *
 * Prerequisites:
 *   - Dev server must be running (npm run dev)
 *   - Environment variables in .env.local (Supabase, OpenAI)
 *
 * Usage:
 *   npx tsx scripts/generate-newsletter.ts --ticker AAPL
 *   npx tsx scripts/generate-newsletter.ts --ticker MSFT --base-url https://theintraday.com
 *   npx tsx scripts/generate-newsletter.ts --ticker GOOGL --output-dir ./newsletters
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

interface CliOptions {
  ticker: string
  baseUrl: string
  outputDir: string
  maxCharts: number
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2)
  const opts: CliOptions = {
    ticker: '',
    baseUrl: 'http://localhost:3005',
    outputDir: './public/newsletter-charts',
    maxCharts: 3,
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--ticker':
        opts.ticker = args[++i]
        break
      case '--base-url':
        opts.baseUrl = args[++i]
        break
      case '--output-dir':
        opts.outputDir = args[++i]
        break
      case '--max-charts':
        opts.maxCharts = parseInt(args[++i], 10)
        break
      case '--help':
        console.log(`
Usage: npx tsx scripts/generate-newsletter.ts [options]

Options:
  --ticker <SYMBOL>    Stock ticker (required, e.g., AAPL, MSFT, GOOGL)
  --base-url <url>     App base URL (default: http://localhost:3000)
  --output-dir <path>  Output directory for charts + HTML (default: ./public/newsletter-charts)
  --max-charts <n>     Maximum chart sections (default: 3)
  --help               Show this help
`)
        process.exit(0)
    }
  }

  if (!opts.ticker) {
    console.error('Error: --ticker is required')
    console.error('Run with --help for usage info')
    process.exit(1)
  }

  return opts
}

async function healthCheck(baseUrl: string): Promise<void> {
  try {
    const res = await fetch(baseUrl, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
  } catch (err) {
    console.error(`Error: Dev server not reachable at ${baseUrl}`)
    console.error('Start it with: npm run dev')
    process.exit(1)
  }
}

async function main() {
  const opts = parseArgs()
  const ticker = opts.ticker.toUpperCase()

  console.log(`\nGenerating newsletter for ${ticker}...`)
  console.log(`  Base URL: ${opts.baseUrl}`)
  console.log(`  Output:   ${opts.outputDir}`)
  console.log(`  Max charts: ${opts.maxCharts}\n`)

  // Health check the dev server (needed for Puppeteer chart captures)
  await healthCheck(opts.baseUrl)

  // Dynamic import to avoid loading heavy dependencies until after env + health check
  const { generateNewsletter } = await import('@/lib/newsletter/orchestrate')

  const result = await generateNewsletter(ticker, {
    baseUrl: opts.baseUrl,
    outputDir: opts.outputDir,
    maxCharts: opts.maxCharts,
  })

  console.log(`\nNewsletter generated successfully!`)
  console.log(`\n--- Selected Templates ---`)
  for (const sel of result.selections) {
    console.log(`  ${sel.templateId}: ${sel.reason}`)
  }

  console.log(`\n--- Chart PNGs ---`)
  for (const path of result.chartPaths) {
    console.log(`  ${path}`)
  }

  console.log(`\n--- Full HTML ---`)
  console.log(`  ${result.htmlPath}`)

  console.log(`\n--- Timings ---`)
  for (const [step, ms] of Object.entries(result.timings)) {
    console.log(`  ${step}: ${(ms / 1000).toFixed(1)}s`)
  }

  console.log(`\nDone! Open the HTML file in a browser to preview.`)
}

main().catch((err) => {
  console.error('\nNewsletter generation failed:', err.message)
  process.exit(1)
})
