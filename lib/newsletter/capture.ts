import { writeFileSync } from 'fs'
import type { NewsletterChartSpec } from './types'
import { resolveChartingPlatformNewsletterChart } from './charting-platform-export'

type Browser = import('puppeteer').Browser
const DEFAULT_RENDER_ROUTE_PATH = '/tos/api/newsletter/render'
export const DEFAULT_CHART_RENDER_WIDTH = 1400
export const DEFAULT_CHART_RENDER_HEIGHT = 960
export const DEFAULT_EDITOR_CHART_RENDER_WIDTH = 1280
export const DEFAULT_EDITOR_CHART_RENDER_HEIGHT = 900

export interface CaptureChartOptions {
  /** File path to save the PNG screenshot */
  outputPath: string
  /** Base URL of the Charting Platform app (e.g. 'http://localhost:3001') */
  chartBaseUrl: string
  /** Viewport width (default: 1400) */
  width?: number
  /** Viewport height (default: 960) */
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
 * Capture a chart as a PNG by calling the Charting Platform render API.
 *
 * Returns the saved file path.
 */
export async function captureChart(
  spec: NewsletterChartSpec,
  options: CaptureChartOptions,
): Promise<string> {
  const {
    outputPath,
    chartBaseUrl,
    width = DEFAULT_CHART_RENDER_WIDTH,
    height = DEFAULT_CHART_RENDER_HEIGHT,
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
