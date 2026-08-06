import { mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'

import { buildNewsletterBlock } from './build-block'
import {
  getDefaultChartingBaseUrl,
  getDefaultPublicChartingBaseUrl,
  resolveChartingPlatformNewsletterChart,
} from './charting-platform-export'
import {
  captureChart,
  captureFullPage,
} from './capture'
import { getEditorialTemplate } from './editorial-templates'
import {
  fetchMarketContext,
  fetchNewsletterContext,
  fetchRecentPicks,
  fetchTickerNews,
  fetchTodayQuote,
  recordPick,
} from './fetch-context'
import {
  assembleNewsletterHtml,
  assembleNewsletterHtmlForBeehiiv,
  buildNewsletterHeader,
} from './assemble'
import { publishChartImages } from './publish'
import {
  buildCopyGenerationMessages,
  buildEditorialHookMessages,
  buildMarketRoundupMessages,
  buildMarketRoundupStockSelectionMessages,
  buildStockPickerMessages,
  buildTemplateSelectionMessages,
  parseCopyGeneration,
  parseEditorialHook,
  parseMarketRoundupIntro,
  parseMarketRoundupStockSelections,
  parseStockPickerResult,
  parseTemplateSelections,
} from './prompts'
import { ensureStockMentionInCopy } from './copy-normalization'
import { normalizeNewsletterSubject } from './delivery-quality'
import { resolveNewsletterOutputDirectory } from './output-directory'
import { resolveEditorialChart } from './resolve-chart'
import { pickFundamentalsYearRange } from './template-scoring'
import {
  createNewsletterModelClient,
  runNewsletterJsonPrompt,
} from './model-client'
import type {
  FeaturedStock,
  GeneratedCopy,
  NewsletterBlock,
  NewsletterContext,
  NewsletterFormat,
  NewsletterOptions,
  NewsletterResult,
  StockPickerResult,
  StockNewsItem,
  TemplateSelection,
  TodayQuote,
} from './types'

const DEFAULT_CHART_BASE_URL = getDefaultChartingBaseUrl()
const DEFAULT_MAX_CHARTS = 3
const DEFAULT_ROUNDUP_SIZE = 4

function normalizeTicker(value: string): string {
  const ticker = value.trim().toUpperCase()
  if (!ticker || !/^[A-Z]{1,5}$/.test(ticker)) {
    throw new Error(`Invalid ticker: "${value}"`)
  }
  return ticker
}

function normalizeFeaturedTickers(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) return []
  const deduped = new Set<string>()
  for (const value of values) {
    const ticker = normalizeTicker(value)
    deduped.add(ticker)
  }
  return Array.from(deduped)
}

function normalizeRoundupSize(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN
  if (!Number.isFinite(parsed)) return DEFAULT_ROUNDUP_SIZE
  return Math.max(3, Math.min(5, Math.floor(parsed)))
}

function resolveNewsletterFormat(
  ticker: string | undefined,
  requestedFormat: NewsletterOptions['format'],
  featuredTickers: string[],
): NewsletterFormat {
  if (ticker) return 'single_stock'
  if (featuredTickers.length > 0) return 'market_roundup'
  return requestedFormat === 'market_roundup' ? 'market_roundup' : 'single_stock'
}

function getCandidatePickSource(
  ticker: string,
  changesPercentage: number,
  headlines: StockNewsItem[],
  recentEarnings: Set<string>,
): FeaturedStock['pickSource'] {
  if (recentEarnings.has(ticker)) return 'earnings'
  if (Math.abs(changesPercentage) >= 5 && headlines.length > 0) return 'big_mover'
  if (headlines.length > 0) return 'news_catalyst'
  return 'fallback'
}

function buildFeaturedStockHook(stock: {
  name: string
  changesPercentage: number
  pickSource?: FeaturedStock['pickSource']
}): string {
  const sign = stock.changesPercentage >= 0 ? '+' : ''
  const move = `${sign}${stock.changesPercentage.toFixed(2)}%`

  switch (stock.pickSource) {
    case 'earnings':
      return `${stock.name} is in focus after a fresh earnings update while shares moved ${move}.`
    case 'big_mover':
      return `${stock.name} is one of today's biggest movers at ${move} on fresh headlines.`
    case 'news_catalyst':
      return `${stock.name} is moving ${move} as investors react to new company-specific headlines.`
    default:
      return `${stock.name} is moving ${move} today, putting it on the market roundup radar.`
  }
}

async function buildFeaturedStock(
  ticker: string,
  market: Awaited<ReturnType<typeof fetchMarketContext>>,
): Promise<FeaturedStock> {
  const upperTicker = normalizeTicker(ticker)
  const candidate = market.candidates.find((entry) => entry.symbol === upperTicker)
  const headlines =
    market.newsBySymbol[upperTicker]?.slice(0, 3) ??
    (await fetchTickerNews(upperTicker, 3))
  const earningsSet = new Set((market.earningsReports ?? []).map((entry) => entry.symbol))
  const quote = candidate ? null : await fetchTodayQuote(upperTicker)
  const changesPercentage = candidate?.changesPercentage ?? quote?.changesPercentage ?? 0
  const name = candidate?.name ?? quote?.name ?? upperTicker
  const pickSource = getCandidatePickSource(
    upperTicker,
    changesPercentage,
    headlines,
    earningsSet,
  )

  return {
    ticker: upperTicker,
    name,
    changesPercentage,
    editorialHook: buildFeaturedStockHook({ name, changesPercentage, pickSource }),
    topHeadlines: headlines,
    pickSource,
  }
}

function scoreRoundupCandidate(
  candidate: { symbol: string; changesPercentage: number },
  market: Awaited<ReturnType<typeof fetchMarketContext>>,
): number {
  const headlines = market.newsBySymbol[candidate.symbol] ?? []
  const earningsReport = (market.earningsReports ?? []).find(
    (entry) => entry.symbol === candidate.symbol,
  )
  const recentPick = (market.recentPicks ?? []).find(
    (entry) => entry.ticker === candidate.symbol,
  )

  let score = Math.abs(candidate.changesPercentage) * 4
  score += headlines.length > 0 ? 18 : -8
  if (Math.abs(candidate.changesPercentage) >= 5) score += 12
  if (earningsReport) {
    score += 35
    score -= Math.min(Math.abs(earningsReport.hoursAgo), 48) / 4
  }
  if (recentPick && !earningsReport && Math.abs(candidate.changesPercentage) < 10) {
    score -= 25
  }

  return score
}

async function selectMarketRoundupStocks(
  modelClient: ReturnType<typeof createNewsletterModelClient>,
  market: Awaited<ReturnType<typeof fetchMarketContext>>,
  roundupSize: number,
  explicitTickers: string[],
  generationPrompt?: string,
): Promise<FeaturedStock[]> {
  if (explicitTickers.length > 0) {
    return Promise.all(explicitTickers.slice(0, roundupSize).map((ticker) => buildFeaturedStock(ticker, market)))
  }

  const sortedSymbols = [...market.candidates]
    .sort((a, b) => scoreRoundupCandidate(b, market) - scoreRoundupCandidate(a, market))
    .map((candidate) => candidate.symbol)

  const fallbackSymbols = Array.from(new Set(sortedSymbols)).slice(0, roundupSize)
  let selectedSymbols = fallbackSymbols

  if (generationPrompt?.trim()) {
    const selectionText = await runNewsletterJsonPrompt(
      modelClient,
      'msg_roundup_pick',
      buildMarketRoundupStockSelectionMessages(market, roundupSize, generationPrompt),
      { temperature: 0, maxOutputTokens: 700 },
    )
    const promptSymbols = parseMarketRoundupStockSelections(
      selectionText,
      market,
      roundupSize,
    )
    if (promptSymbols.length > 0) {
      selectedSymbols = [
        ...promptSymbols,
        ...fallbackSymbols.filter((symbol) => !promptSymbols.includes(symbol)),
      ].slice(0, roundupSize)
    }
  }

  return Promise.all(selectedSymbols.map((ticker) => buildFeaturedStock(ticker, market)))
}

async function generateSingleStockNewsletter(params: {
  modelClient: ReturnType<typeof createNewsletterModelClient>
  ticker?: string
  maxCharts: number
  chartBaseUrl: string
  publicChartBaseUrl: string
  absOutputDir: string
  runStamp: string
  chartRenderWidth?: number
  chartRenderHeight?: number
  timings: Record<string, number>
  generationPrompt?: string
}): Promise<{
  ticker: string
  featuredTickers: string[]
  subjectLine: string
  editorialHook: string
  todayQuote?: TodayQuote
  selections: TemplateSelection[]
  blocks: NewsletterBlock[]
  chartSpecs: NewsletterResult['chartSpecs']
  chartPaths: string[]
  autoPickedStock: boolean
  stockPickerResult?: StockPickerResult
  generationPrompt?: string
}> {
  const {
    modelClient,
    ticker,
    maxCharts,
    chartBaseUrl,
    publicChartBaseUrl,
    absOutputDir,
    runStamp,
    chartRenderWidth,
    chartRenderHeight,
    timings,
    generationPrompt,
  } = params

  let tickerUpper: string
  let autoPickedStock = false
  let stockPickerResult: StockPickerResult | undefined

  if (ticker) {
    tickerUpper = normalizeTicker(ticker)
  } else {
    const tMarket = Date.now()
    const [market, recentPicks] = await Promise.all([
      fetchMarketContext(),
      fetchRecentPicks(),
    ])
    market.recentPicks = recentPicks
    timings.fetchMarketContext = Date.now() - tMarket

    const tPick = Date.now()
    const pickerText = await runNewsletterJsonPrompt(
      modelClient,
      'msg_pick',
      buildStockPickerMessages(market, generationPrompt),
      { temperature: 0, maxOutputTokens: 500 },
    )

    stockPickerResult = parseStockPickerResult(pickerText, market)
    tickerUpper = stockPickerResult.ticker
    autoPickedStock = true
    timings.aiStockPicker = Date.now() - tPick

    recordPick(stockPickerResult).catch(console.warn)
  }

  const tContext = Date.now()
  const [context, todayQuote] = await Promise.all([
    fetchNewsletterContext(tickerUpper),
    fetchTodayQuote(tickerUpper),
  ])
  if (stockPickerResult) {
    context.stockPickerResult = stockPickerResult
  }
  timings.fetchContext = Date.now() - tContext

  let editorialHook = ''
  let subjectLine = ''
  let editorialContext: FeaturedStock | undefined = stockPickerResult

  if (!stockPickerResult) {
    const tHook = Date.now()
    const topHeadlines = await fetchTickerNews(tickerUpper, 5)
    const hookText = await runNewsletterJsonPrompt(
      modelClient,
      'msg_hook',
      buildEditorialHookMessages(todayQuote, topHeadlines, generationPrompt),
      { temperature: 0.3, maxOutputTokens: 300 },
    )

    const hookResult = parseEditorialHook(hookText, tickerUpper)
    editorialHook = hookResult.editorialHook
    subjectLine = hookResult.subjectLine
    editorialContext = {
      ticker: tickerUpper,
      name: todayQuote.name,
      changesPercentage: todayQuote.changesPercentage,
      editorialHook,
      topHeadlines,
      pickSource: topHeadlines.length > 0 ? 'news_catalyst' : 'fallback',
    }
    timings.aiEditorialHook = Date.now() - tHook
  } else {
    editorialHook = stockPickerResult.editorialHook
    subjectLine = stockPickerResult.subjectLine
  }

  const tSelection = Date.now()
  const selectionText = await runNewsletterJsonPrompt(
    modelClient,
    'msg_sel',
    buildTemplateSelectionMessages(context, maxCharts, {
      mode: 'single_stock',
      editorialContext,
      generationPrompt,
    }),
    { temperature: 0, maxOutputTokens: 700 },
  )
  const selections = parseTemplateSelections(selectionText, maxCharts)
  if (selections.length === 0) {
    throw new Error('AI selected no valid templates')
  }
  timings.aiTemplateSelection = Date.now() - tSelection

  const resolvedCharts = selections.map((selection) => {
    const template = getEditorialTemplate(selection.templateId)
    const yearOverride =
      template && template.mode !== 'price'
        ? pickFundamentalsYearRange(
            template,
            context,
            selection.periodType ?? template.defaultPeriodType,
          )
        : null
    return resolveEditorialChart(selection.templateId, {
      ticker: tickerUpper,
      periodType: selection.periodType,
      ...(yearOverride ? { yearOverride } : {}),
    })
  })

  const tCapture = Date.now()
  const chartPaths = await Promise.all(
    resolvedCharts.map(async (resolved, index) => {
      const selection = selections[index]
      const filename = `${tickerUpper}_${selection.templateId}_${runStamp}.png`
      const outputPath = resolve(absOutputDir, filename)

      await captureChart(resolved.spec, {
        outputPath,
        chartBaseUrl,
        width: chartRenderWidth,
        height: chartRenderHeight,
      })

      return outputPath
    }),
  )
  timings.chartCapture = Date.now() - tCapture

  const tCopy = Date.now()
  const generatedCopies: GeneratedCopy[] = await Promise.all(
    selections.map(async (selection, index) => {
      const template = getEditorialTemplate(selection.templateId)
      if (!template) {
        throw new Error(`Unknown editorial template: ${selection.templateId}`)
      }

      const copyText = await runNewsletterJsonPrompt(
        modelClient,
        `msg_copy_${index}`,
        buildCopyGenerationMessages(
          context,
          selection.templateId,
          template.label,
          selection.reason,
          resolvedCharts[index].spec,
          editorialContext,
          generationPrompt,
        ),
        { temperature: 0.3, maxOutputTokens: 500 },
      )

      return parseCopyGeneration(copyText)
    }),
  )
  timings.aiCopyGeneration = Date.now() - tCopy

  const blocks = selections.map((selection, index) => {
    const copy = generatedCopies[index]
    const chartImageUrl = chartPaths[index].split('/').pop() || ''
    const chartExportUrl = resolveChartingPlatformNewsletterChart(
      resolvedCharts[index].spec,
      {
        chartBaseUrl: publicChartBaseUrl,
        theme: 'light',
      },
    ).interactiveUrl

    return buildNewsletterBlock('chart_plus_commentary', {
      heading: copy.headline,
      body: copy.body,
      chartImageUrl,
      chartExportUrl,
      chartAlt: `${tickerUpper} ${selection.templateId.replace(/_/g, ' ')} chart`,
    })
  })

  return {
    ticker: tickerUpper,
    featuredTickers: [tickerUpper],
    subjectLine,
    editorialHook,
    todayQuote,
    selections,
    blocks,
    chartSpecs: resolvedCharts.map((resolved) => resolved.spec),
    chartPaths,
    autoPickedStock,
    stockPickerResult,
    generationPrompt,
  }
}

async function generateMarketRoundupNewsletter(params: {
  modelClient: ReturnType<typeof createNewsletterModelClient>
  featuredTickers: string[]
  roundupSize: number
  chartBaseUrl: string
  publicChartBaseUrl: string
  absOutputDir: string
  runStamp: string
  chartRenderWidth?: number
  chartRenderHeight?: number
  timings: Record<string, number>
  generationPrompt?: string
}): Promise<{
  ticker: string
  subjectLine: string
  editorialHook: string
  todayQuote?: TodayQuote
  selections: TemplateSelection[]
  blocks: NewsletterBlock[]
  chartSpecs: NewsletterResult['chartSpecs']
  chartPaths: string[]
  autoPickedStock: boolean
  stockPickerResult?: StockPickerResult
  featuredTickers: string[]
  generationPrompt?: string
}> {
  const {
    modelClient,
    featuredTickers,
    roundupSize,
    chartBaseUrl,
    publicChartBaseUrl,
    absOutputDir,
    runStamp,
    chartRenderWidth,
    chartRenderHeight,
    timings,
    generationPrompt,
  } = params

  const tMarket = Date.now()
  const [market, recentPicks] = await Promise.all([
    fetchMarketContext(),
    fetchRecentPicks(),
  ])
  market.recentPicks = recentPicks
  timings.fetchMarketContext = Date.now() - tMarket

  const selectedStocks = await selectMarketRoundupStocks(
    modelClient,
    market,
    roundupSize,
    featuredTickers,
    generationPrompt,
  )
  if (selectedStocks.length < 3) {
    throw new Error('Market roundup requires at least 3 featured stocks')
  }

  const autoPickedStock = featuredTickers.length === 0
  if (autoPickedStock) {
    const roundupSubject = normalizeNewsletterSubject(
      `Market Roundup: ${selectedStocks
        .slice(0, 3)
        .map((entry) => entry.ticker)
        .join(', ')}`,
    )
    Promise.all(
      selectedStocks.map((stock) =>
        recordPick({
          ...stock,
          subjectLine: roundupSubject,
        }),
      ),
    ).catch(console.warn)
  }

  const tIntro = Date.now()
  const roundupIntroText = await runNewsletterJsonPrompt(
    modelClient,
    'msg_roundup',
    buildMarketRoundupMessages(selectedStocks, generationPrompt),
    { temperature: 0.3, maxOutputTokens: 300 },
  )
  const roundupIntro = parseMarketRoundupIntro(roundupIntroText, selectedStocks)
  timings.aiRoundupIntro = Date.now() - tIntro

  const tContext = Date.now()
  const contextsByTicker = new Map<string, NewsletterContext>(
    await Promise.all(
      selectedStocks.map(async (stock) => [
        stock.ticker,
        await fetchNewsletterContext(stock.ticker),
      ] as const),
    ),
  )
  timings.fetchContext = Date.now() - tContext

  const tSelection = Date.now()
  const stockPlans = await Promise.all(
    selectedStocks.map(async (stock, index) => {
      const context = contextsByTicker.get(stock.ticker)
      if (!context) {
        throw new Error(`Missing newsletter context for ${stock.ticker}`)
      }

      const selectionText = await runNewsletterJsonPrompt(
        modelClient,
        `msg_sel_roundup_${index}`,
        buildTemplateSelectionMessages(context, 1, {
          mode: 'market_roundup',
          editorialContext: stock,
          generationPrompt,
        }),
        { temperature: 0, maxOutputTokens: 500 },
      )
      const selection = parseTemplateSelections(selectionText, 1)[0]
      if (!selection) {
        throw new Error(`AI selected no valid template for ${stock.ticker}`)
      }

      const roundupTemplate = getEditorialTemplate(selection.templateId)
      const roundupYearOverride =
        roundupTemplate && roundupTemplate.mode !== 'price'
          ? pickFundamentalsYearRange(
              roundupTemplate,
              context,
              selection.periodType ?? roundupTemplate.defaultPeriodType,
            )
          : null
      const resolved = resolveEditorialChart(selection.templateId, {
        ticker: stock.ticker,
        periodType: selection.periodType,
        ...(roundupYearOverride ? { yearOverride: roundupYearOverride } : {}),
      })

      return {
        stock,
        context,
        selection: { ...selection, ticker: stock.ticker },
        resolved,
      }
    }),
  )
  timings.aiTemplateSelection = Date.now() - tSelection

  const tCapture = Date.now()
  const chartPaths = await Promise.all(
    stockPlans.map(async (plan) => {
      const filename = `${plan.stock.ticker}_${plan.selection.templateId}_${runStamp}.png`
      const outputPath = resolve(absOutputDir, filename)

      await captureChart(plan.resolved.spec, {
        outputPath,
        chartBaseUrl,
        width: chartRenderWidth,
        height: chartRenderHeight,
      })

      return outputPath
    }),
  )
  timings.chartCapture = Date.now() - tCapture

  const tCopy = Date.now()
  const generatedCopies = await Promise.all(
    stockPlans.map(async (plan, index) => {
      const template = getEditorialTemplate(plan.selection.templateId)
      if (!template) {
        throw new Error(`Unknown editorial template: ${plan.selection.templateId}`)
      }

      const copyText = await runNewsletterJsonPrompt(
        modelClient,
        `msg_copy_roundup_${index}`,
        buildCopyGenerationMessages(
          plan.context,
          plan.selection.templateId,
          template.label,
          plan.selection.reason,
          plan.resolved.spec,
          plan.stock,
          generationPrompt,
          { mode: 'market_roundup' },
        ),
        { temperature: 0.3, maxOutputTokens: 500 },
      )

      return ensureStockMentionInCopy(parseCopyGeneration(copyText), plan.stock)
    }),
  )
  timings.aiCopyGeneration = Date.now() - tCopy

  const blocks = stockPlans.map((plan, index) => {
    const copy = generatedCopies[index]
    const chartImageUrl = chartPaths[index].split('/').pop() || ''
    const chartExportUrl = resolveChartingPlatformNewsletterChart(
      plan.resolved.spec,
      {
        chartBaseUrl: publicChartBaseUrl,
        theme: 'light',
      },
    ).interactiveUrl

    return buildNewsletterBlock('chart_plus_commentary', {
      heading: copy.headline,
      body: copy.body,
      chartImageUrl,
      chartExportUrl,
      chartAlt: `${plan.stock.ticker} ${plan.selection.templateId.replace(/_/g, ' ')} chart`,
    })
  })

  return {
    ticker: 'MARKET',
    subjectLine: roundupIntro.subjectLine,
    editorialHook: roundupIntro.introText,
    selections: stockPlans.map((plan) => plan.selection),
    blocks,
    chartSpecs: stockPlans.map((plan) => plan.resolved.spec),
    chartPaths,
    autoPickedStock,
    featuredTickers: selectedStocks.map((stock) => stock.ticker),
    generationPrompt,
  }
}

export async function generateNewsletter(
  ticker?: string,
  options?: NewsletterOptions,
): Promise<NewsletterResult> {
  const chartBaseUrl = options?.chartBaseUrl ?? DEFAULT_CHART_BASE_URL
  const maxCharts = options?.maxCharts ?? DEFAULT_MAX_CHARTS
  const publish = options?.publish ?? false
  const editorMode = options?.editorMode === true
  const skipPreviewCapture = options?.skipPreviewCapture ?? editorMode
  const chartRenderWidth = options?.chartRenderWidth
  const chartRenderHeight = options?.chartRenderHeight
  const publicChartBaseUrl =
    options?.publicChartBaseUrl ??
    (publish ? getDefaultPublicChartingBaseUrl() : chartBaseUrl)
  const normalizedFeaturedTickers = normalizeFeaturedTickers(options?.featuredTickers)
  const format = resolveNewsletterFormat(
    ticker,
    options?.format,
    normalizedFeaturedTickers,
  )
  const roundupSize = normalizeRoundupSize(options?.roundupSize)
  const generationPrompt = options?.generationPrompt?.trim() || undefined

  if (ticker && format === 'market_roundup') {
    throw new Error('ticker cannot be combined with market_roundup mode')
  }

  const tStart = Date.now()
  const timings: Record<string, number> = {}
  const now = new Date()
  const runStamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)

  const absOutputDir = resolveNewsletterOutputDirectory(options?.outputDir)
  mkdirSync(absOutputDir, { recursive: true })

  const modelClient = createNewsletterModelClient(options?.modelBackend)

  const generationResult =
    format === 'market_roundup'
      ? await generateMarketRoundupNewsletter({
          modelClient,
          featuredTickers: normalizedFeaturedTickers,
          roundupSize,
          chartBaseUrl,
          publicChartBaseUrl,
          absOutputDir,
          runStamp,
          chartRenderWidth,
          chartRenderHeight,
          timings,
          generationPrompt,
        })
      : await generateSingleStockNewsletter({
          modelClient,
          ticker,
          maxCharts,
          chartBaseUrl,
          publicChartBaseUrl,
          absOutputDir,
          runStamp,
          chartRenderWidth,
          chartRenderHeight,
          timings,
          generationPrompt,
        })

  const subjectLine =
    normalizeNewsletterSubject(generationResult.subjectLine) ||
    normalizeNewsletterSubject(`${generationResult.ticker} market update`)

  const headerOverride =
    format === 'market_roundup'
      ? buildNewsletterHeader(generationResult.ticker, now, {
          format,
          featuredTickers: generationResult.featuredTickers,
        })
      : undefined

  const assemblyOptions =
    format === 'market_roundup'
      ? {
          headerOverride,
          introTextOverride: generationResult.editorialHook,
        }
      : undefined

  let fullHtml = assembleNewsletterHtml(
    generationResult.ticker,
    generationResult.blocks,
    now,
    generationResult.todayQuote,
    generationResult.editorialHook,
    subjectLine,
    assemblyOptions,
  )

  let beehiivHtml = assembleNewsletterHtmlForBeehiiv(
    generationResult.ticker,
    generationResult.blocks,
    now,
    generationResult.todayQuote,
    generationResult.editorialHook,
    subjectLine,
    assemblyOptions,
  )

  const htmlFilename = `${generationResult.ticker}_newsletter_${runStamp}.html`
  const htmlPath = resolve(absOutputDir, htmlFilename)
  writeFileSync(htmlPath, fullHtml, 'utf-8')

  const beehiivHtmlFilename = `${generationResult.ticker}_newsletter_beehiiv_${runStamp}.html`
  const beehiivHtmlPath = resolve(absOutputDir, beehiivHtmlFilename)
  writeFileSync(beehiivHtmlPath, beehiivHtml, 'utf-8')

  let previewPath: string | null = null
  if (!skipPreviewCapture) {
    const previewFilename = `${generationResult.ticker}_newsletter_preview_${runStamp}.png`
    previewPath = resolve(absOutputDir, previewFilename)
    const puppeteer = await import('puppeteer')
    const browser = await puppeteer.launch({ headless: true })
    try {
      await captureFullPage(browser, htmlPath, previewPath)
    } finally {
      await browser.close()
    }
  }

  let publishedUrls: Record<string, string> | undefined
  if (publish) {
    const tPublish = Date.now()
    const allImagePaths = previewPath
      ? [...generationResult.chartPaths, previewPath]
      : [...generationResult.chartPaths]
    publishedUrls = await publishChartImages(allImagePaths)

    let publishedHtml = fullHtml
    let publishedBeehiivHtml = beehiivHtml
    for (const [localFilename, publicUrl] of Object.entries(publishedUrls)) {
      publishedHtml = publishedHtml.replaceAll(
        `src="${localFilename}"`,
        `src="${publicUrl}"`,
      )
      publishedBeehiivHtml = publishedBeehiivHtml.replaceAll(
        `src="${localFilename}"`,
        `src="${publicUrl}"`,
      )
    }

    writeFileSync(htmlPath, publishedHtml, 'utf-8')
    writeFileSync(beehiivHtmlPath, publishedBeehiivHtml, 'utf-8')
    fullHtml = publishedHtml
    beehiivHtml = publishedBeehiivHtml
    timings.publish = Date.now() - tPublish
  }

  timings.total = Date.now() - tStart

  return {
    ticker: generationResult.ticker,
    format,
    featuredTickers:
      format === 'market_roundup'
        ? generationResult.featuredTickers
        : [generationResult.ticker],
    generatedAt: now.toISOString(),
    subjectLine,
    generationPrompt,
    selections: generationResult.selections,
    blocks: generationResult.blocks,
    chartSpecs: generationResult.chartSpecs,
    fullHtml,
    beehiivHtml,
    chartPaths: generationResult.chartPaths,
    htmlPath,
    beehiivHtmlPath,
    previewPath,
    timings,
    todayQuote: generationResult.todayQuote,
    editorialHook: generationResult.editorialHook,
    autoPickedStock: generationResult.autoPickedStock,
    stockPickerResult: generationResult.stockPickerResult,
    publishedUrls,
  }
}
