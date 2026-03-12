import { mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import OpenAI from 'openai'

import { resolveEditorialChart } from './resolve-chart'
import { getEditorialTemplate } from './editorial-templates'
import { buildNewsletterBlock } from './build-block'
import { fetchNewsletterContext } from './fetch-context'
import {
  buildTemplateSelectionMessages,
  parseTemplateSelections,
  buildCopyGenerationMessages,
  parseCopyGeneration,
} from './prompts'
import { captureChart } from './capture'
import { assembleNewsletterHtml } from './assemble'
import type {
  NewsletterOptions,
  NewsletterResult,
  NewsletterBlock,
  GeneratedCopy,
} from './types'

const DEFAULT_BASE_URL = 'http://localhost:3005'
const DEFAULT_OUTPUT_DIR = './public/newsletter-charts'
const DEFAULT_MAX_CHARTS = 3

/**
 * Generate a complete newsletter for a given ticker.
 *
 * End-to-end flow:
 *   1. Fetch financial context
 *   2. AI selects best editorial chart templates
 *   3. Resolve each selection into a ChartExportSpec
 *   4. Puppeteer captures chart screenshots
 *   5. AI generates editorial copy for each chart
 *   6. Build newsletter blocks + assemble full HTML
 *   7. Save to disk and return result
 */
export async function generateNewsletter(
  ticker: string,
  options?: NewsletterOptions,
): Promise<NewsletterResult> {
  const baseUrl = options?.baseUrl ?? DEFAULT_BASE_URL
  const outputDir = options?.outputDir ?? DEFAULT_OUTPUT_DIR
  const maxCharts = options?.maxCharts ?? DEFAULT_MAX_CHARTS
  const tickerUpper = ticker.toUpperCase().trim()

  if (!tickerUpper || !/^[A-Z]{1,5}$/.test(tickerUpper)) {
    throw new Error(`Invalid ticker: "${ticker}"`)
  }

  const timings: Record<string, number> = {}
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')

  // Ensure output directory exists
  const absOutputDir = resolve(outputDir)
  mkdirSync(absOutputDir, { recursive: true })

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const isGpt5 = model.includes('gpt-5')

  // -----------------------------------------------------------------------
  // Step 1: Fetch financial context
  // -----------------------------------------------------------------------
  const t0 = Date.now()
  const context = await fetchNewsletterContext(tickerUpper)
  timings.fetchContext = Date.now() - t0

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

  try {
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
  } finally {
    await browser.close()
  }

  timings.chartCapture = Date.now() - t2

  // -----------------------------------------------------------------------
  // Step 5: AI generates copy for each chart
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

    // Use a relative URL for the chart image (relative to public/)
    const chartImageUrl = chartPath.includes('/public/')
      ? chartPath.split('/public')[1]
      : `/newsletter-charts/${chartPath.split('/').pop()}`

    const block = buildNewsletterBlock('chart_plus_commentary', {
      heading: copy.headline,
      body: copy.body,
      chartImageUrl,
      chartAlt: `${tickerUpper} ${selections[i].templateId.replace(/_/g, ' ')} chart`,
      caption: copy.caption,
    })

    blocks.push(block)
  }

  // -----------------------------------------------------------------------
  // Step 7: Assemble full email HTML and save
  // -----------------------------------------------------------------------
  const fullHtml = assembleNewsletterHtml(tickerUpper, blocks, now)
  const htmlFilename = `${tickerUpper}_newsletter_${dateStr}.html`
  const htmlPath = resolve(absOutputDir, htmlFilename)
  writeFileSync(htmlPath, fullHtml, 'utf-8')

  timings.total = Date.now() - t0

  return {
    ticker: tickerUpper,
    generatedAt: now.toISOString(),
    selections,
    blocks,
    fullHtml,
    chartPaths,
    htmlPath,
    timings,
  }
}
