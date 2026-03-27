#!/usr/bin/env npx tsx
/**
 * Generate a complete AI-powered newsletter.
 *
 * When --ticker is provided, generates for that stock.
 * When omitted, AI picks today's best story from most-active S&P 500 stocks.
 *
 * Prerequisites:
 *   - Dev server must be running (npm run dev)
 *   - Environment variables in .env.local (Supabase, OpenAI, FMP)
 *
 * Usage:
 *   npx tsx scripts/generate-newsletter.ts                    # AI picks stock
 *   npx tsx scripts/generate-newsletter.ts --ticker AAPL      # Manual override
 *   npx tsx scripts/generate-newsletter.ts --ticker MSFT --base-url https://theintraday.com
 *   npx tsx scripts/generate-newsletter.ts --output-dir ./newsletters
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import {
  getDefaultChartingBaseUrl,
  getDefaultPublicChartingBaseUrl,
} from '@/lib/newsletter/charting-platform-export'

interface CliOptions {
  ticker: string | undefined
  format: 'single_stock' | 'market_roundup'
  baseUrl: string
  chartBaseUrl: string
  publicChartBaseUrl: string
  outputDir: string
  maxCharts: number
  roundupSize: number
  publish: boolean
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2)
  const opts: CliOptions = {
    ticker: undefined,
    format: 'single_stock',
    baseUrl: 'http://localhost:3000',
    chartBaseUrl: getDefaultChartingBaseUrl(),
    publicChartBaseUrl: getDefaultPublicChartingBaseUrl(),
    outputDir: './public/newsletter-charts',
    maxCharts: 3,
    roundupSize: 4,
    publish: false,
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--ticker':
        opts.ticker = args[++i]
        break
      case '--base-url':
        opts.baseUrl = args[++i]
        break
      case '--format':
        opts.format = args[++i] === 'market_roundup' ? 'market_roundup' : 'single_stock'
        break
      case '--chart-base-url':
        opts.chartBaseUrl = args[++i]
        break
      case '--public-chart-base-url':
        opts.publicChartBaseUrl = args[++i]
        break
      case '--output-dir':
        opts.outputDir = args[++i]
        break
      case '--max-charts':
        opts.maxCharts = parseInt(args[++i], 10)
        break
      case '--roundup-size':
        opts.roundupSize = Math.max(3, Math.min(5, parseInt(args[++i], 10)))
        break
      case '--publish':
        opts.publish = true
        break
      case '--help':
        console.log(`
Usage: npx tsx scripts/generate-newsletter.ts [options]

Options:
  --ticker <SYMBOL>    Stock ticker (optional — AI picks if omitted)
  --format <mode>      single_stock | market_roundup (default: single_stock)
  --base-url <url>     Fin Quote app base URL (default: http://localhost:3000)
  --chart-base-url <url>
                       Charting Platform base URL used for chart capture
  --public-chart-base-url <url>
                       Public Charting Platform URL used in newsletter links
  --output-dir <path>  Output directory for charts + HTML (default: ./public/newsletter-charts)
  --max-charts <n>     Maximum chart sections (default: 3)
  --roundup-size <n>   Number of stocks in market_roundup mode (default: 4, min 3, max 5)
  --publish            Upload chart PNGs to Supabase Storage and rewrite image URLs
  --help               Show this help
`)
        process.exit(0)
    }
  }

  return opts
}

async function healthCheck(label: string, urls: string[]): Promise<void> {
  // Hit /api/health or fall back to / with a generous timeout.
  // The landing page can take 15s+ to compile on first request in dev mode.
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(15000),
      })
      // Any response (even 405) means the server is up
      return
    } catch {
      continue
    }
  }
  console.error(`Error: ${label} not reachable.`)
  for (const url of urls) {
    console.error(`  Tried: ${url}`)
  }
  process.exit(1)
}

async function main() {
  const opts = parseArgs()

  if (opts.ticker && opts.format === 'market_roundup') {
    console.error('\n--ticker cannot be combined with --format market_roundup')
    process.exit(1)
  }

  if (opts.format === 'market_roundup') {
    console.log(`\nGenerating market roundup newsletter...`)
  } else if (opts.ticker) {
    const ticker = opts.ticker.toUpperCase()
    console.log(`\nGenerating newsletter for ${ticker}...`)
  } else {
    console.log(`\nNo --ticker provided. AI will pick today's stock...`)
  }
  console.log(`  Format: ${opts.format}`)
  console.log(`  Base URL: ${opts.baseUrl}`)
  console.log(`  Charting Base URL: ${opts.chartBaseUrl}`)
  console.log(`  Public Charting URL: ${opts.publicChartBaseUrl}`)
  console.log(`  Output:   ${opts.outputDir}`)
  console.log(`  Max charts: ${opts.maxCharts}`)
  if (opts.format === 'market_roundup') {
    console.log(`  Roundup size: ${opts.roundupSize}`)
  }
  if (opts.publish) console.log(`  Publish:  ON (uploading to Supabase Storage)`)
  console.log()

  // Health check both services needed for newsletter generation.
  await healthCheck('Fin Quote app', [`${opts.baseUrl}/api/newsletter/generate`, opts.baseUrl])
  await healthCheck('Charting Platform app', [`${opts.chartBaseUrl}/health`, `${opts.chartBaseUrl}/tos/AAPL`])

  // Dynamic import to avoid loading heavy dependencies until after env + health check
  const { generateNewsletter } = await import('@/lib/newsletter/orchestrate')

  const result = await generateNewsletter(opts.ticker, {
    baseUrl: opts.baseUrl,
    chartBaseUrl: opts.chartBaseUrl,
    publicChartBaseUrl: opts.publicChartBaseUrl,
    outputDir: opts.outputDir,
    maxCharts: opts.maxCharts,
    format: opts.format,
    roundupSize: opts.roundupSize,
    publish: opts.publish,
  })

  console.log(`\nNewsletter generated successfully!`)
  console.log(`\n--- Subject Line ---`)
  console.log(`  Subject: ${result.subjectLine}`)

  // Show stock pick details if auto-picked
  if (result.format === 'market_roundup') {
    console.log(`\n--- Featured Stocks ---`)
    for (const ticker of result.featuredTickers) {
      console.log(`  ${ticker}`)
    }
  } else if (result.autoPickedStock && result.stockPickerResult) {
    const pick = result.stockPickerResult
    const sign = pick.changesPercentage >= 0 ? '+' : ''
    console.log(`\n--- AI Stock Pick ---`)
    console.log(`  Stock: ${pick.ticker} (${pick.name})`)
    console.log(`  Move:  ${sign}${pick.changesPercentage.toFixed(2)}%`)
    console.log(`  Hook:  ${pick.editorialHook}`)
    if (pick.topHeadlines.length > 0) {
      console.log(`  Headlines:`)
      for (const h of pick.topHeadlines) {
        console.log(`    - "${h.title}" (${h.site})`)
      }
    }
  }

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

  console.log(`\n--- Preview Screenshot ---`)
  console.log(`  ${result.previewPath}`)

  if (result.publishedUrls) {
    console.log(`\n--- Published URLs ---`)
    for (const [filename, url] of Object.entries(result.publishedUrls)) {
      console.log(`  ${filename}`)
      console.log(`    → ${url}`)
    }
  }

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
