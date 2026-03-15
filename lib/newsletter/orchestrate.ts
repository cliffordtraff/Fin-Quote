import { mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import OpenAI from 'openai'

import { resolveEditorialChart } from './resolve-chart'
import { getEditorialTemplate } from './editorial-templates'
import { buildNewsletterBlock } from './build-block'
import { fetchNewsletterContext, fetchMarketContext, fetchTodayQuote, fetchTickerNews, fetchRecentPicks, recordPick } from './fetch-context'
import {
  buildStockPickerMessages,
  parseStockPickerResult,
  buildEditorialHookMessages,
  parseEditorialHook,
  buildTemplateSelectionMessages,
  parseTemplateSelections,
  buildCopyGenerationMessages,
  parseCopyGeneration,
} from './prompts'
import { captureChart, captureFullPage } from './capture'
import { assembleNewsletterHtml } from './assemble'
import { publishChartImages } from './publish'
import type {
  NewsletterOptions,
  NewsletterResult,
  NewsletterBlock,
  GeneratedCopy,
  StockPickerResult,
  StockNewsItem,
  TodayQuote,
} from './types'

const DEFAULT_BASE_URL = 'http://localhost:3000'
const DEFAULT_OUTPUT_DIR = './public/newsletter-charts'
const DEFAULT_MAX_CHARTS = 3

/**
 * Generate a complete newsletter.
 *
 * When `ticker` is provided, it's used directly (manual override).
 * When omitted, the AI stock picker selects the best story from
 * today's most-active S&P 500 stocks.
 *
 * End-to-end flow:
 *   0. (Optional) AI stock picker — picks ticker from most-active stocks
 *   1. Fetch financial context
 *   2. AI selects best editorial chart templates
 *   3. Resolve each selection into a ChartExportSpec
 *   4. Puppeteer captures chart screenshots
 *   5. AI generates editorial copy (with news context if auto-picked)
 *   6. Build newsletter blocks + assemble full HTML
 *   7. Save to disk and return result
 */
export async function generateNewsletter(
  ticker?: string,
  options?: NewsletterOptions,
): Promise<NewsletterResult> {
  const baseUrl = options?.baseUrl ?? DEFAULT_BASE_URL
  const outputDir = options?.outputDir ?? DEFAULT_OUTPUT_DIR
  const maxCharts = options?.maxCharts ?? DEFAULT_MAX_CHARTS
  const publish = options?.publish ?? false

  const tStart = Date.now()
  const timings: Record<string, number> = {}
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')

  // Ensure output directory exists
  const absOutputDir = resolve(outputDir)
  mkdirSync(absOutputDir, { recursive: true })

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const isGpt5 = model.includes('gpt-5')

  let tickerUpper: string
  let autoPickedStock = false
  let stockPickerResult: StockPickerResult | undefined

  // -----------------------------------------------------------------------
  // Step 0: AI Stock Picker (when no ticker provided)
  // -----------------------------------------------------------------------
  if (ticker) {
    tickerUpper = ticker.toUpperCase().trim()
    if (!tickerUpper || !/^[A-Z]{1,5}$/.test(tickerUpper)) {
      throw new Error(`Invalid ticker: "${ticker}"`)
    }
  } else {
    const t0pick = Date.now()

    // Fetch market context and recent picks in parallel
    const [market, recentPicks] = await Promise.all([
      fetchMarketContext(),
      fetchRecentPicks(),
    ])
    timings.fetchMarketContext = Date.now() - t0pick

    // Attach recent picks to market context before building prompt
    market.recentPicks = recentPicks

    const tPick = Date.now()
    const pickerMessages = buildStockPickerMessages(market)

    const pickerResponse = await openai.responses.create({
      model,
      input: pickerMessages.map((m, i) => ({
        id: `msg_pick_${i}`,
        role: m.role,
        content: [{ type: 'input_text' as const, text: m.content }],
        type: 'message' as const,
      })),
      ...(isGpt5 ? {} : { temperature: 0 }),
      max_output_tokens: isGpt5 ? 20000 : 500,
      ...(isGpt5 ? { reasoning: { effort: 'minimal' as const } } : {}),
      text: { format: { type: 'json_object' } },
    })

    const pickerText = pickerResponse.output_text ?? ''
    stockPickerResult = parseStockPickerResult(pickerText, market)
    tickerUpper = stockPickerResult.ticker
    autoPickedStock = true
    timings.aiStockPicker = Date.now() - tPick

    // Record the pick (fire and forget)
    recordPick(stockPickerResult).catch(console.warn)
  }

  // -----------------------------------------------------------------------
  // Step 1: Fetch financial context + today's quote (in parallel)
  // -----------------------------------------------------------------------
  const t0 = Date.now()
  const [context, todayQuote] = await Promise.all([
    fetchNewsletterContext(tickerUpper),
    fetchTodayQuote(tickerUpper),
  ])
  // Attach stock picker result if present
  if (stockPickerResult) {
    context.stockPickerResult = stockPickerResult
  }
  timings.fetchContext = Date.now() - t0

  // -----------------------------------------------------------------------
  // Step 1b: Generate editorial hook (for manual tickers without stock picker)
  // -----------------------------------------------------------------------
  let editorialHook: string
  let subjectLine: string
  let topHeadlines: StockNewsItem[] = []
  if (stockPickerResult) {
    editorialHook = stockPickerResult.editorialHook
    subjectLine = stockPickerResult.subjectLine
    topHeadlines = stockPickerResult.topHeadlines
  } else {
    const tHook = Date.now()
    topHeadlines = await fetchTickerNews(tickerUpper, 5)
    const hookMessages = buildEditorialHookMessages(todayQuote, topHeadlines)

    const hookResponse = await openai.responses.create({
      model,
      input: hookMessages.map((m, i) => ({
        id: `msg_hook_${i}`,
        role: m.role,
        content: [{ type: 'input_text' as const, text: m.content }],
        type: 'message' as const,
      })),
      ...(isGpt5 ? {} : { temperature: 0.3 }),
      max_output_tokens: isGpt5 ? 20000 : 300,
      ...(isGpt5 ? { reasoning: { effort: 'minimal' as const } } : {}),
      text: { format: { type: 'json_object' } },
    })

    const hookResult = parseEditorialHook(hookResponse.output_text ?? '', tickerUpper)
    editorialHook = hookResult.editorialHook
    subjectLine = hookResult.subjectLine
    timings.aiEditorialHook = Date.now() - tHook
  }

  // -----------------------------------------------------------------------
  // Step 2: AI selects templates
  // -----------------------------------------------------------------------
  const t1 = Date.now()
  const selectionMessages = buildTemplateSelectionMessages(context, maxCharts)

  const selectionResponse = await openai.responses.create({
    model,
    input: selectionMessages.map((m, i) => ({
      id: `msg_sel_${i}`,
      role: m.role,
      content: [{ type: 'input_text' as const, text: m.content }],
      type: 'message' as const,
    })),
    ...(isGpt5 ? {} : { temperature: 0 }),
    max_output_tokens: isGpt5 ? 20000 : 500,
    ...(isGpt5 ? { reasoning: { effort: 'minimal' as const } } : {}),
    text: { format: { type: 'json_object' } },
  })

  const selectionText = selectionResponse.output_text ?? ''
  const selections = parseTemplateSelections(selectionText, maxCharts)

  if (selections.length === 0) {
    throw new Error('AI selected no valid templates')
  }

  timings.aiTemplateSelection = Date.now() - t1

  // -----------------------------------------------------------------------
  // Step 3: Resolve each selection into a ChartExportSpec
  // -----------------------------------------------------------------------
  const resolvedCharts = selections.map((sel) =>
    resolveEditorialChart(sel.templateId, { ticker: tickerUpper }),
  )

  // -----------------------------------------------------------------------
  // Step 4: Puppeteer captures chart screenshots
  // -----------------------------------------------------------------------
  const t2 = Date.now()
  const puppeteer = await import('puppeteer')
  const browser = await puppeteer.launch({ headless: true })
  const chartPaths: string[] = []

  for (let i = 0; i < resolvedCharts.length; i++) {
    const resolved = resolvedCharts[i]
    const filename = `${tickerUpper}_${resolved.templateId}_${dateStr}.png`
    const outputPath = resolve(absOutputDir, filename)

    await captureChart(browser, resolved.spec, {
      outputPath,
      baseUrl,
    })

    chartPaths.push(outputPath)
  }

  timings.chartCapture = Date.now() - t2

  // -----------------------------------------------------------------------
  // Step 5: AI generates copy for each chart (with news context if auto-picked)
  // -----------------------------------------------------------------------
  const t3 = Date.now()
  const generatedCopies: GeneratedCopy[] = []

  for (const sel of selections) {
    const template = getEditorialTemplate(sel.templateId)
    if (!template) continue

    const copyMessages = buildCopyGenerationMessages(
      context,
      sel.templateId,
      template.label,
      sel.reason,
      stockPickerResult,
    )

    const copyResponse = await openai.responses.create({
      model,
      input: copyMessages.map((m, i) => ({
        id: `msg_copy_${i}`,
        role: m.role,
        content: [{ type: 'input_text' as const, text: m.content }],
        type: 'message' as const,
      })),
      ...(isGpt5 ? {} : { temperature: 0.3 }),
      max_output_tokens: isGpt5 ? 20000 : 500,
      ...(isGpt5 ? { reasoning: { effort: 'minimal' as const } } : {}),
      text: { format: { type: 'json_object' } },
    })

    const copyText = copyResponse.output_text ?? ''
    generatedCopies.push(parseCopyGeneration(copyText))
  }

  timings.aiCopyGeneration = Date.now() - t3

  // -----------------------------------------------------------------------
  // Step 6: Build newsletter blocks
  // -----------------------------------------------------------------------
  const blocks: NewsletterBlock[] = []

  for (let i = 0; i < selections.length; i++) {
    const copy = generatedCopies[i]
    const chartPath = chartPaths[i]

    // Use just the filename — HTML and PNGs live in the same directory
    const chartImageUrl = chartPath.split('/').pop()!
    // Link to the interactive /charts page, not the headless /charts/export page
    const chartExportUrl = `${baseUrl}${resolvedCharts[i].exportUrl.replace('/charts/export', '/charts')}`

    const block = buildNewsletterBlock('chart_plus_commentary', {
      heading: copy.headline,
      body: copy.body,
      chartImageUrl,
      chartExportUrl,
      chartAlt: `${tickerUpper} ${selections[i].templateId.replace(/_/g, ' ')} chart`,
    })

    blocks.push(block)
  }

  // -----------------------------------------------------------------------
  // Step 7: Assemble full email HTML and save
  // -----------------------------------------------------------------------
  let fullHtml = assembleNewsletterHtml(tickerUpper, blocks, now, todayQuote, editorialHook, subjectLine, topHeadlines)
  const htmlFilename = `${tickerUpper}_newsletter_${dateStr}.html`
  const htmlPath = resolve(absOutputDir, htmlFilename)
  writeFileSync(htmlPath, fullHtml, 'utf-8')

  // -----------------------------------------------------------------------
  // Step 8: Full-page preview screenshot
  // -----------------------------------------------------------------------
  const previewFilename = `${tickerUpper}_newsletter_preview_${dateStr}.png`
  const previewPath = resolve(absOutputDir, previewFilename)
  await captureFullPage(browser, htmlPath, previewPath)
  await browser.close()

  // -----------------------------------------------------------------------
  // Step 9 (optional): Upload to Supabase Storage and rewrite image URLs
  // -----------------------------------------------------------------------
  let publishedUrls: Record<string, string> | undefined

  if (publish) {
    const t4 = Date.now()
    const allImagePaths = [...chartPaths, previewPath]
    publishedUrls = await publishChartImages(allImagePaths)

    // Rewrite bare filenames in the HTML to absolute public URLs
    let publishedHtml = fullHtml
    for (const [localFilename, publicUrl] of Object.entries(publishedUrls)) {
      publishedHtml = publishedHtml.replaceAll(
        `src="${localFilename}"`,
        `src="${publicUrl}"`,
      )
    }

    // Rewrite localhost chart click-through links to production URL
    const prodUrl = 'https://theintraday.com'
    publishedHtml = publishedHtml.replaceAll(
      `href="${baseUrl}/charts`,
      `href="${prodUrl}/charts`,
    )

    // Overwrite the HTML file with public URLs
    writeFileSync(htmlPath, publishedHtml, 'utf-8')
    fullHtml = publishedHtml
    timings.publish = Date.now() - t4
  }

  timings.total = Date.now() - tStart

  return {
    ticker: tickerUpper,
    generatedAt: now.toISOString(),
    subjectLine,
    selections,
    blocks,
    fullHtml,
    chartPaths,
    htmlPath,
    previewPath,
    timings,
    autoPickedStock,
    stockPickerResult,
    publishedUrls,
  }
}
