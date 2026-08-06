import { writeFileSync } from 'fs'
import type { NewsletterChartSpec, PriceNewsletterChartSpec } from './types'
import { isPriceNewsletterChartSpec } from './chart-spec'
import { buildPriceExportEditorBaseSpec } from './chart-editor'
import { resolveChartingPlatformNewsletterChart } from './charting-platform-export'
import { getNewsletterChartRenderDimensions } from './render-dimensions'

type Browser = import('puppeteer').Browser
const DEFAULT_RENDER_ROUTE_PATH = '/tos/api/newsletter/render'
const CHART_EXPORT_RENDER_ROUTE_PATH = '/api/chart-export/render'
const DEFAULT_RENDER_ATTEMPTS = 4
const DEFAULT_RETRY_DELAY_MS = 1_000
const MAX_RETRY_DELAY_MS = 65_000
const DEFAULT_TOTAL_TIMEOUT_MS = 40_000
const MAX_TOTAL_TIMEOUT_MS = 55_000
const RETRYABLE_RENDER_STATUSES = new Set([408, 425, 429, 502, 503, 504])

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
  /** Total render attempts for transient failures (default: 4). */
  maxAttempts?: number
  /** Base delay when the service does not return Retry-After (default: 1000). */
  retryDelayMs?: number
  /** Absolute budget across retries and fallback routes (default: 40000). */
  totalTimeoutMs?: number
  /** Optional caller cancellation signal. */
  signal?: AbortSignal
}

class ChartRenderRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs: number | null,
  ) {
    super(message)
    this.name = 'ChartRenderRequestError'
  }
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

function renderHeaders(): Record<string, string> {
  const apiKey = process.env.NEWSLETTER_RENDER_API_KEY?.trim()
  return {
    Accept: 'image/png',
    'Content-Type': 'application/json',
    ...(apiKey ? { 'X-Newsletter-Render-Key': apiKey } : {}),
  }
}

function retryAfterMs(response: Response): number | null {
  const raw = response.headers.get('retry-after')?.trim()
  if (!raw) return null
  const seconds = Number(raw)
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.min(MAX_RETRY_DELAY_MS, seconds * 1_000))
  }
  const timestamp = Date.parse(raw)
  if (!Number.isFinite(timestamp)) return null
  return Math.max(0, Math.min(MAX_RETRY_DELAY_MS, timestamp - Date.now()))
}

async function renderErrorDetail(response: Response): Promise<string> {
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
  } catch {}
  return detail
}

function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!signal) {
      setTimeout(resolve, delayMs)
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(signal.reason ?? new Error('Chart render cancelled'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, delayMs)
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function totalTimeoutMs(options: CaptureChartOptions): number {
  return Math.max(
    1,
    Math.min(
      MAX_TOTAL_TIMEOUT_MS,
      Math.floor(options.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS),
    ),
  )
}

function deadlineError(errorPrefix: string, budgetMs: number): Error {
  return new Error(`${errorPrefix} exceeded its ${budgetMs}ms execution budget`)
}

async function requestChartImage(
  renderUrl: string,
  body: Record<string, unknown>,
  errorPrefix: string,
  options: CaptureChartOptions,
  deadlineAt: number,
): Promise<Buffer> {
  const maxAttempts = Math.max(
    1,
    Math.min(6, Math.floor(options.maxAttempts ?? DEFAULT_RENDER_ATTEMPTS)),
  )
  const baseDelayMs = Math.max(
    0,
    Math.min(
      10_000,
      Math.floor(options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS),
    ),
  )
  const budgetMs = totalTimeoutMs(options)

  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new Error(`${errorPrefix} was cancelled`)
    }
    const remainingMs = deadlineAt - Date.now()
    if (remainingMs <= 0) throw deadlineError(errorPrefix, budgetMs)
    try {
      const attemptTimeoutMs = Math.max(
        1,
        Math.min(Math.floor(options.timeout ?? 30_000), remainingMs),
      )
      const timeoutSignal = AbortSignal.timeout(attemptTimeoutMs)
      const signal = options.signal
        ? AbortSignal.any([options.signal, timeoutSignal])
        : timeoutSignal
      const response = await fetch(renderUrl, {
        method: 'POST',
        headers: renderHeaders(),
        body: JSON.stringify(body),
        signal,
      })
      if (!response.ok) {
        throw new ChartRenderRequestError(
          `${errorPrefix}: ${await renderErrorDetail(response)}`,
          response.status,
          retryAfterMs(response),
        )
      }

      const pngBytes = Buffer.from(await response.arrayBuffer())
      if (pngBytes.length === 0) {
        throw new Error(`${errorPrefix} returned an empty PNG response`)
      }
      return pngBytes
    } catch (error) {
      lastError = error
      if (options.signal?.aborted) {
        throw options.signal.reason ?? error
      }
      if (Date.now() >= deadlineAt) {
        throw deadlineError(errorPrefix, budgetMs)
      }
      const retryable =
        error instanceof ChartRenderRequestError
          ? RETRYABLE_RENDER_STATUSES.has(error.status)
          : true
      if (!retryable || attempt >= maxAttempts) throw error

      const fallbackDelay = Math.min(
        MAX_RETRY_DELAY_MS,
        baseDelayMs * 2 ** (attempt - 1),
      )
      const requestedDelay =
        error instanceof ChartRenderRequestError &&
          error.retryAfterMs != null
          ? error.retryAfterMs
          : fallbackDelay
      const remainingBeforeDelay = deadlineAt - Date.now()
      if (remainingBeforeDelay <= 1) {
        throw deadlineError(errorPrefix, budgetMs)
      }
      await wait(
        Math.min(requestedDelay, remainingBeforeDelay - 1),
        options.signal,
      )
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`${errorPrefix} failed`)
}

async function captureChartFromExportSpec(
  spec: PriceNewsletterChartSpec,
  options: CaptureChartOptions,
): Promise<string> {
  const deadlineAt = Date.now() + totalTimeoutMs(options)
  const chartExportSpec = buildPriceExportEditorBaseSpec(spec, {
    theme: spec.chartExportSpec?.theme === 'dark' ? 'dark' : 'light',
  })
  if (!chartExportSpec) {
    throw new Error('captureChartFromExportSpec called without chartExportSpec')
  }
  let pngBytes: Buffer
  try {
    pngBytes = await requestChartImage(
      getChartExportRenderUrl(options.chartBaseUrl),
      {
        spec: chartExportSpec,
        format: 'png',
        timeoutMs: options.timeout ?? 30000,
      },
      'Chart export render failed',
      options,
      deadlineAt,
    )
  } catch (error) {
    const routeUnavailable =
      error instanceof ChartRenderRequestError &&
      [404, 405, 501].includes(error.status)
    if (!routeUnavailable) throw error

    const { captureSpec } = resolveChartingPlatformNewsletterChart(spec, {
      chartBaseUrl: options.chartBaseUrl,
      width: options.width ?? chartExportSpec.width,
      height: options.height ?? chartExportSpec.height,
      theme: chartExportSpec.theme === 'dark' ? 'dark' : 'light',
    })
    pngBytes = await requestChartImage(
      getChartingPlatformRenderUrl(options.chartBaseUrl),
      {
        spec: captureSpec,
        timeoutMs: options.timeout ?? 30000,
      },
      'Legacy chart render failed',
      options,
      deadlineAt,
    )
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
  const deadlineAt = Date.now() + totalTimeoutMs(options)

  const pngBytes = await requestChartImage(
    renderUrl,
    {
      spec: captureSpec,
      timeoutMs: timeout,
    },
    'Chart render failed',
    options,
    deadlineAt,
  )

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
