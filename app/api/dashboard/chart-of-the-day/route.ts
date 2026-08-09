export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import type { DashboardChartOfTheDaySetting } from '@/lib/dashboard/chart-of-the-day-settings'
import {
  loadDashboardChartOfTheDayFallbackImage,
  resolveCurrentDashboardChartOfTheDay,
  transformDashboardChartImageForDarkTheme,
} from '@/lib/dashboard/chart-of-the-day'
import { getDashboardChartOfTheDaySetting } from '@/lib/dashboard/chart-of-the-day-settings'
import {
  buildDashboardChartRenderIdentity,
  DashboardChartRenderPendingError,
  DashboardChartRenderUnavailableError,
  ensureDashboardChartRenderAsset,
  type DashboardChartRenderAsset,
} from '@/lib/dashboard/chart-render-assets'
import {
  getNewsletterRenderHeaders,
  readBoundedResponseBytes,
} from '@/lib/newsletter/render-request'

const RENDER_TIMEOUT_MS = 35_000
const MAX_RENDER_BYTES = 8 * 1024 * 1024
const RENDER_CACHE_TTL_MS = 5 * 60_000
const MAX_RENDER_CACHE_ENTRIES = 8
const SETTINGS_CACHE_TTL_MS = 5_000

interface RenderedChartImage {
  bytes: Uint8Array
  contentType: 'image/png'
}

interface RenderCacheEntry {
  expiresAt: number
  promise: Promise<DashboardChartRenderAsset>
}

const renderCache = new Map<string, RenderCacheEntry>()

interface SettingCacheEntry {
  expiresAt: number
  settled: boolean
  promise: Promise<DashboardChartOfTheDaySetting>
}

let settingCache: SettingCacheEntry | null = null

function cachedSetting(): Promise<DashboardChartOfTheDaySetting> {
  const now = Date.now()
  if (
    settingCache &&
    (!settingCache.settled || settingCache.expiresAt > now)
  ) {
    return settingCache.promise
  }

  const entry: SettingCacheEntry = {
    expiresAt: Number.POSITIVE_INFINITY,
    settled: false,
    promise: getDashboardChartOfTheDaySetting(),
  }
  settingCache = entry
  void entry.promise.then(
    () => {
      entry.settled = true
      entry.expiresAt =
        Date.now() + (process.env.NODE_ENV === 'test' ? 0 : SETTINGS_CACHE_TTL_MS)
    },
    () => {
      entry.settled = true
      entry.expiresAt = 0
      if (settingCache === entry) settingCache = null
    },
  )
  return entry.promise
}

function pruneRenderCache(now: number) {
  for (const [key, entry] of renderCache) {
    if (entry.expiresAt <= now) renderCache.delete(key)
  }
  while (renderCache.size >= MAX_RENDER_CACHE_ENTRIES) {
    const oldestKey = renderCache.keys().next().value as string | undefined
    if (!oldestKey) break
    renderCache.delete(oldestKey)
  }
}

async function readBoundedPng(response: Response): Promise<Uint8Array> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().startsWith('image/png')) {
    throw new Error('Chart renderer returned an unsupported content type')
  }
  return readBoundedResponseBytes(response, MAX_RENDER_BYTES)
}

async function renderChartImage(
  theme: 'light' | 'dark',
  setting: DashboardChartOfTheDaySetting,
): Promise<RenderedChartImage> {
  try {
    const resolvedChart = await resolveCurrentDashboardChartOfTheDay(
      { theme },
      setting,
    )
    const response = await fetch(resolvedChart.renderUrl, {
      method: 'POST',
      headers: getNewsletterRenderHeaders(),
      body: JSON.stringify({
        spec: resolvedChart.captureSpec,
        timeoutMs: 30_000,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
    })

    if (!response.ok) {
      throw new Error(`Chart renderer returned HTTP ${response.status}`)
    }

    const sourceBytes = await readBoundedPng(response)
    const bytes =
      theme === 'dark'
        ? Uint8Array.from(
            await transformDashboardChartImageForDarkTheme(
              Buffer.from(sourceBytes),
            ),
          )
        : sourceBytes
    if (bytes.byteLength > MAX_RENDER_BYTES) {
      throw new Error('Themed chart exceeded the image size limit')
    }
    return { bytes, contentType: 'image/png' }
  } catch (error) {
    const fallbackImage =
      setting.source === 'template' && setting.selection
        ? await loadDashboardChartOfTheDayFallbackImage(
            theme,
            setting.selection,
            MAX_RENDER_BYTES,
          )
        : null
    if (fallbackImage) {
      if (fallbackImage.buffer.byteLength > MAX_RENDER_BYTES) {
        throw new Error('Chart fallback exceeded the image size limit')
      }
      return {
        bytes: Uint8Array.from(fallbackImage.buffer),
        contentType: fallbackImage.contentType,
      }
    }
    throw error
  }
}

function cachedChartAsset(
  theme: 'light' | 'dark',
  setting: DashboardChartOfTheDaySetting,
): { cacheStatus: 'HIT' | 'MISS'; promise: Promise<DashboardChartRenderAsset> } {
  const now = Date.now()
  const identity = buildDashboardChartRenderIdentity(theme, setting)
  const key = identity.renderKey
  const cached = renderCache.get(key)
  if (cached && cached.expiresAt > now) {
    return { cacheStatus: 'HIT', promise: cached.promise }
  }

  pruneRenderCache(now)
  const promise = ensureDashboardChartRenderAsset({
    identity,
    render: () => renderChartImage(theme, setting),
  })
  const entry = {
    expiresAt: now + RENDER_CACHE_TTL_MS,
    promise,
  }
  renderCache.set(key, entry)
  void promise.catch(() => {
    if (renderCache.get(key) === entry) renderCache.delete(key)
  })
  return { cacheStatus: 'MISS', promise }
}

function parseTheme(request: NextRequest): 'light' | 'dark' | null {
  const entries = Array.from(request.nextUrl.searchParams.entries())
  if (entries.length === 0) return 'light'
  if (entries.length !== 1 || entries[0]?.[0] !== 'theme') return null
  const theme = entries[0]?.[1]
  return theme === 'light' || theme === 'dark' ? theme : null
}

export async function GET(request: NextRequest) {
  const theme = parseTheme(request)
  if (!theme) {
    return new Response('Invalid chart request', {
      status: 400,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      },
    })
  }

  try {
    const setting = await cachedSetting()
    const rendered = cachedChartAsset(theme, setting)
    const asset = await rendered.promise
    return new Response(null, {
      status: 307,
      headers: {
        'Cache-Control':
          'public, max-age=60, s-maxage=300, stale-while-revalidate=3600',
        Location: asset.publicUrl,
        'X-Chart-Asset': asset.source,
        'X-Chart-Cache': rendered.cacheStatus,
      },
    })
  } catch (error) {
    if (error instanceof DashboardChartRenderPendingError) {
      return new Response('Chart render in progress', {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': 'text/plain; charset=utf-8',
          'Retry-After': String(error.retryAfterSeconds),
        },
      })
    }
    if (error instanceof DashboardChartRenderUnavailableError) {
      return new Response('Chart render unavailable', {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': 'text/plain; charset=utf-8',
          ...(error.retryAfterSeconds
            ? { 'Retry-After': String(error.retryAfterSeconds) }
            : {}),
        },
      })
    }
    console.error('[chart-of-the-day] Render failed:', error)
    return new Response('Chart render failed', {
      status: 502,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      },
    })
  }
}
