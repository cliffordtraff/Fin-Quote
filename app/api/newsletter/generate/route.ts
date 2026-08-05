import { NextRequest, NextResponse } from 'next/server'
import { AdminAccessError, requireAdminUser } from '@/lib/auth/admin'
import { generateNewsletterWithBackend } from '@/lib/newsletter/generation'
import {
  getDefaultChartingBaseUrlForHost,
  getDefaultPublicChartingBaseUrlForHost,
} from '@/lib/newsletter/charting-platform-export'
import type { NewsletterOptions } from '@/lib/newsletter/types'

const MAX_GENERATION_PROMPT_LENGTH = 500

function adminErrorResponse(error: AdminAccessError): NextResponse {
  const unauthenticated = error.message.toLowerCase().includes('signed in')
  return NextResponse.json(
    {
      error: unauthenticated
        ? 'Authentication required.'
        : 'Admin access required.',
    },
    { status: unauthenticated ? 401 : 403 },
  )
}

function normalizeFormat(value: unknown): NewsletterOptions['format'] {
  if (value === 'market_roundup' || value === 'single_stock' || value === 'auto') {
    return value
  }
  return undefined
}

function normalizeRoundupSize(value: unknown): number | undefined {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN
  if (!Number.isFinite(parsed)) return undefined
  return Math.max(3, Math.min(5, Math.floor(parsed)))
}

function normalizeGenerationPrompt(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const prompt = value.trim()
  if (!prompt) return undefined
  if (prompt.length > MAX_GENERATION_PROMPT_LENGTH) {
    throw new Error(
      `generationPrompt must be ${MAX_GENERATION_PROMPT_LENGTH} characters or fewer`,
    )
  }
  return prompt
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate before parsing input or starting any provider, model, or
    // browser work. This route can incur several external costs per request.
    await requireAdminUser()
    const body = await request.json().catch(() => ({}))
    const ticker = body?.ticker
    const format = normalizeFormat(body?.format)
    const roundupSize = normalizeRoundupSize(body?.roundupSize)
    const generationPrompt = normalizeGenerationPrompt(body?.generationPrompt)

    // Validate ticker format if provided (empty/missing triggers AI stock picker)
    if (ticker != null && typeof ticker === 'string' && ticker.trim() !== '') {
      const cleaned = ticker.toUpperCase().trim()
      if (!/^[A-Z]{1,5}$/.test(cleaned)) {
        return NextResponse.json(
          { error: `Invalid ticker format: "${ticker}"` },
          { status: 400 },
        )
      }
    }

    if (format === 'market_roundup' && ticker && typeof ticker === 'string' && ticker.trim() !== '') {
      return NextResponse.json(
        { error: 'ticker cannot be combined with market_roundup mode' },
        { status: 400 },
      )
    }

    const cleanedTicker =
      ticker && typeof ticker === 'string' && ticker.trim() !== ''
        ? ticker.toUpperCase().trim()
        : undefined

    // Determine base URL from the request
    const proto = request.headers.get('x-forwarded-proto') ?? 'http'
    const host = request.headers.get('host') ?? 'localhost:3000'
    const baseUrl = `${proto}://${host}`
    const chartBaseUrl = getDefaultChartingBaseUrlForHost(host)
    const publicChartBaseUrl = getDefaultPublicChartingBaseUrlForHost(host)

    const result = await generateNewsletterWithBackend(cleanedTicker, {
      baseUrl,
      chartBaseUrl,
      publicChartBaseUrl,
      editorMode: true,
      publish: true,
      format,
      roundupSize,
      generationPrompt,
    })

    return NextResponse.json({
      ticker: result.ticker,
      format: result.format,
      featuredTickers: result.featuredTickers,
      generatedAt: result.generatedAt,
      autoPickedStock: result.autoPickedStock,
      stockPickerResult: result.stockPickerResult,
      selections: result.selections,
      chartPaths: result.chartPaths,
      publishedUrls: result.publishedUrls,
      htmlPath: result.htmlPath,
      previewPath: result.previewPath,
      timings: result.timings,
    })
  } catch (err) {
    if (err instanceof AdminAccessError) return adminErrorResponse(err)
    console.error('Newsletter generation failed:', err)
    if (
      err instanceof Error &&
      err.message.startsWith('generationPrompt must be')
    ) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Newsletter generation failed',
      },
      { status: 500 },
    )
  }
}
