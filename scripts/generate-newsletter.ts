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

interface CliOptions {
  ticker: string | undefined
  baseUrl: string
  outputDir: string
  maxCharts: number
  publish: boolean
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2)
  const opts: CliOptions = {
    ticker: undefined,
    baseUrl: 'http://localhost:3000',
    outputDir: './public/newsletter-charts',
    maxCharts: 3,
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
      case '--output-dir':
        opts.outputDir = args[++i]
        break
      case '--max-charts':
        opts.maxCharts = parseInt(args[++i], 10)
        break
      case '--publish':
        opts.publish = true
        break
      case '--help':
        console.log(`
Usage: npx tsx scripts/generate-newsletter.ts [options]

Options:
  --ticker <SYMBOL>    Stock ticker (optional — AI picks if omitted)
  --base-url <url>     App base URL (default: http://localhost:3005)
  --output-dir <path>  Output directory for charts + HTML (default: ./public/newsletter-charts)
  --max-charts <n>     Maximum chart sections (default: 3)
  --publish            Upload chart PNGs to Supabase Storage and rewrite image URLs
  --help               Show this help
`)
        process.exit(0)
    }
  }

  return opts
}

async function healthCheck(baseUrl: string): Promise<void> {
  // Hit /api/health or fall back to / with a generous timeout.
  // The landing page can take 15s+ to compile on first request in dev mode.
  const urls = [`${baseUrl}/api/newsletter/generate`, baseUrl]
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
  console.error(`Error: Dev server not reachable at ${baseUrl}`)
  console.error('Start it with: npm run dev')
  process.exit(1)
}

async function main() {
  const opts = parseArgs()

  if (opts.ticker) {
    const ticker = opts.ticker.toUpperCase()
    console.log(`\nGenerating newsletter for ${ticker}...`)
  } else {
    console.log(`\nNo --ticker provided. AI will pick today's stock...`)
  }
  console.log(`  Base URL: ${opts.baseUrl}`)
  console.log(`  Output:   ${opts.outputDir}`)
  console.log(`  Max charts: ${opts.maxCharts}`)
  if (opts.publish) console.log(`  Publish:  ON (uploading to Supabase Storage)`)
  console.log()

  // Health check the dev server (needed for Puppeteer chart captures)
  await healthCheck(opts.baseUrl)

  // Dynamic import to avoid loading heavy dependencies until after env + health check
  const { generateNewsletter } = await import('@/lib/newsletter/orchestrate')

  const result = await generateNewsletter(opts.ticker, {
    baseUrl: opts.baseUrl,
    outputDir: opts.outputDir,
    maxCharts: opts.maxCharts,
    publish: opts.publish,
  })

  console.log(`\nNewsletter generated successfully!`)
  console.log(`\n--- Subject Line ---`)
  console.log(`  Subject: ${result.subjectLine}`)

  // Show stock pick details if auto-picked
  if (result.autoPickedStock && result.stockPickerResult) {
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
