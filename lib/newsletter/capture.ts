import { writeFileSync } from 'fs'
import type { NewsletterChartSpec, PriceNewsletterChartSpec } from './types'
import { isPriceNewsletterChartSpec } from './chart-spec'
import { resolveChartingPlatformNewsletterChart } from './charting-platform-export'
import { getNewsletterChartRenderDimensions } from './render-dimensions'

type Browser = import('puppeteer').Browser
const DEFAULT_RENDER_ROUTE_PATH = '/tos/api/newsletter/render'
const CHART_EXPORT_RENDER_ROUTE_PATH = '/api/chart-export/render'

export interface CaptureChartOptions {
  /** File path to save the PNG screenshot */
  outputPath: string
  /** Base URL of the Charting Platform app (e.g. 'http://localhost:3001') */
  chartBaseUrl: string
  /** Override viewport width. Defaults to the canonical width for the spec. */
  width?: number
  /** Override viewport height. Defaults to the canonical height for the spec. */
  height?: number
  /** Max wait time in ms (default: 30000) */
  timeout?: number
}

/**
 * Resolve the charting service API endpoint used for newsletter PNG rendering.
 */
export function getChartingPlatformRenderUrl(chartBaseUrl: string): string {
  const trimmed = chartBaseUrl.trim().replace(/\/+$/, '')
  if (!trimmed) {
    throw new Error('chartBaseUrl is required')
  }
  return `${trimmed}${DEFAULT_RENDER_ROUTE_PATH}`
}

/**
 * Endpoint that renders specs produced by the standalone /export-editor
 * (i.e. price newsletter charts saved with a `chartExportSpec`).
 */
export function getChartExportRenderUrl(chartBaseUrl: string): string {
  const trimmed = chartBaseUrl.trim().replace(/\/+$/, '')
  if (!trimmed) {
    throw new Error('chartBaseUrl is required')
  }
  return `${trimmed}${CHART_EXPORT_RENDER_ROUTE_PATH}`
}

async function captureChartFromExportSpec(
  spec: PriceNewsletterChartSpec,
  options: CaptureChartOptions,
): Promise<string> {
  const chartExportSpec = spec.chartExportSpec
  if (!chartExportSpec) {
    throw new Error('captureChartFromExportSpec called without chartExportSpec')
  }
  const renderUrl = getChartExportRenderUrl(options.chartBaseUrl)
  const response = await fetch(renderUrl, {
    method: 'POST',
    headers: { Accept: 'image/png', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      spec: chartExportSpec,
      format: 'png',
      timeoutMs: options.timeout ?? 30000,
    }),
  })
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`.trim()
    try {
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const payload = (await response.json()) as { error?: string }
        if (payload && typeof payload.error === 'string' && payload.error.trim()) {
          detail = payload.error.trim()
        }
      } else {
        const text = (await response.text()).trim()
        if (text) detail = text
      }
    } catch (_err) {}
    throw new Error(`Chart export render failed: ${detail}`)
  }
  const pngBytes = Buffer.from(await response.arrayBuffer())
  if (pngBytes.length === 0) {
    throw new Error('Chart export render returned an empty PNG response')
  }
  writeFileSync(options.outputPath, pngBytes)
  return options.outputPath
}

/**
 * Capture a chart as a PNG by calling the Charting Platform render API.
 *
 * Returns the saved file path.
 */
export async function captureChart(
  spec: NewsletterChartSpec,
  options: CaptureChartOptions,
): Promise<string> {
  // Price newsletter charts edited in the standalone /export-editor carry a
  // `chartExportSpec`. Render those through the new /api/chart-export/render
  // endpoint, which drives /chart-export?spec=... in headless Puppeteer.
  if (isPriceNewsletterChartSpec(spec) && spec.chartExportSpec) {
    return captureChartFromExportSpec(spec, options)
  }
  const defaultDimensions = getNewsletterChartRenderDimensions(spec)
  const {
    outputPath,
    chartBaseUrl,
    width = defaultDimensions.width,
    height = defaultDimensions.height,
    timeout = 30000,
  } = options

  const { captureSpec } = resolveChartingPlatformNewsletterChart(spec, {
    chartBaseUrl,
    width,
    height,
  })
  const renderUrl = getChartingPlatformRenderUrl(chartBaseUrl)

  const response = await fetch(renderUrl, {
    method: 'POST',
    headers: {
      Accept: 'image/png',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      spec: captureSpec,
      timeoutMs: timeout,
    }),
  })

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`.trim()
    try {
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const payload = await response.json() as { error?: string }
        if (payload && typeof payload.error === 'string' && payload.error.trim()) {
          detail = payload.error.trim()
        }
      } else {
        const text = (await response.text()).trim()
        if (text) detail = text
      }
    } catch (_err) {}
    throw new Error(`Chart render failed: ${detail}`)
  }

  const pngBytes = Buffer.from(await response.arrayBuffer())
  if (pngBytes.length === 0) {
    throw new Error('Chart render returned an empty PNG response')
  }

  writeFileSync(outputPath, pngBytes)
  return outputPath
}

/**
 * Capture a full-page screenshot of a local HTML file.
 * Used to preview the final assembled newsletter.
 */
export async function captureFullPage(
  browser: Browser,
  htmlFilePath: string,
  outputPath: string,
  options?: { width?: number },
): Promise<string> {
  const page = await browser.newPage()

  try {
    await page.setViewport({ width: options?.width ?? 700, height: 800 })
    await page.goto(`file://${htmlFilePath}`, { waitUntil: 'networkidle0', timeout: 15000 })
    await new Promise((r) => setTimeout(r, 300))
    await page.screenshot({ path: outputPath, type: 'png', fullPage: true })
  } finally {
    await page.close()
  }

  return outputPath
}

/**
 * Convenience wrapper retained for callers that want a single capture helper.
 */
export async function captureChartStandalone(
  spec: NewsletterChartSpec,
  options: CaptureChartOptions,
): Promise<string> {
  return captureChart(spec, options)
}
