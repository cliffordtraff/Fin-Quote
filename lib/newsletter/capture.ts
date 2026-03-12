import type { ChartExportSpec } from '@/types/chart-export'
import { encodeChartSpec } from '@/lib/chart-export'

type Browser = import('puppeteer').Browser

export interface CaptureChartOptions {
  /** File path to save the PNG screenshot */
  outputPath: string
  /** Base URL of the running app (e.g. 'http://localhost:3000') */
  baseUrl: string
  /** Viewport width (default: 1200) */
  width?: number
  /** Viewport height (default: 700) */
  height?: number
  /** Max wait time in ms (default: 30000) */
  timeout?: number
}

/**
 * Capture a chart as a PNG screenshot using an existing Puppeteer browser instance.
 *
 * The orchestrator creates one browser and reuses it across all charts,
 * saving ~2-3s per chart on browser launch overhead.
 *
 * Returns the saved file path.
 */
export async function captureChart(
  browser: Browser,
  spec: ChartExportSpec,
  options: CaptureChartOptions,
): Promise<string> {
  const {
    outputPath,
    baseUrl,
    width = 1200,
    height = 700,
    timeout = 30000,
  } = options

  const specBase64 = encodeChartSpec(spec)
  const exportUrl = `${baseUrl}/charts/export?spec=${specBase64}`

  const page = await browser.newPage()

  try {
    // Log browser console messages for debugging
    page.on('console', (msg) => {
      const type = msg.type()
      if (type === 'error' || type === 'warning') {
        console.error(`  [browser ${type}] ${msg.text()}`)
      }
    })
    page.on('pageerror', (err) => {
      console.error(`  [browser error] ${err.message}`)
    })
    page.on('requestfailed', (req) => {
      console.error(`  [404] ${req.url().slice(0, 120)}`)
    })

    await page.setViewport({ width, height })
    await page.goto(exportUrl, { waitUntil: 'networkidle0', timeout })

    // Wait for the chart to signal it's ready
    try {
      await page.waitForFunction(
        () => (window as any).__CHART_EXPORT_READY__ === true,
        { timeout },
      )
    } catch {
      // Check what state the page is in
      const pageState = await page.evaluate(() => {
        const el = document.querySelector('[data-export-ready]')
        const bodyText = document.body?.innerText?.slice(0, 500) ?? ''
        return { readyAttr: el?.getAttribute('data-export-ready'), bodyText }
      })
      throw new Error(
        `Chart not ready after ${timeout}ms. Page state: ${JSON.stringify(pageState)}`,
      )
    }

    // Small extra delay for any final CSS settling
    await new Promise((r) => setTimeout(r, 200))

    // Find the export container and screenshot just that element
    const container = await page.$('[data-export-ready="true"]')
    if (container) {
      await container.screenshot({ path: outputPath, type: 'png' })
    } else {
      // Fallback to full page screenshot
      await page.screenshot({ path: outputPath, type: 'png' })
    }
  } finally {
    await page.close()
  }

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
 * Convenience wrapper: launches its own browser, captures one chart, closes.
 * Use `captureChart()` with a shared browser when capturing multiple charts.
 */
export async function captureChartStandalone(
  spec: ChartExportSpec,
  options: CaptureChartOptions,
): Promise<string> {
  const puppeteer = await import('puppeteer')
  const browser = await puppeteer.launch({ headless: true })

  try {
    return await captureChart(browser, spec, options)
  } finally {
    await browser.close()
  }
}
