export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  createBlankNewsletterDraft,
  createNewsletterDraft,
  listNewsletterDraftArchivePage,
  NewsletterDraftArchiveValidationError,
} from '@/lib/newsletter/drafts'
import {
  attachNewsletterDraftSessionCookie,
  resolveNewsletterDraftScope,
} from '@/lib/newsletter/draft-session'
import {
  getDefaultChartingBaseUrlForHost,
  getDefaultPublicChartingBaseUrlForHost,
} from '@/lib/newsletter/charting-platform-export'
import type {
  NewsletterDraftStatus,
  NewsletterOptions,
} from '@/lib/newsletter/types'

const MAX_GENERATION_PROMPT_LENGTH = 500
type DraftCreationMode = 'generate' | 'blank'

function getRequestBaseUrl(request: NextRequest): string {
  const proto = request.headers.get('x-forwarded-proto') ?? 'http'
  const host = request.headers.get('host') ?? 'localhost:3005'
  return `${proto}://${host}`
}

function normalizeTicker(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const ticker = value.trim().toUpperCase()
  if (!ticker) return undefined
  if (!/^[A-Z]{1,5}$/.test(ticker)) {
    throw new Error(`Invalid ticker format: "${value}"`)
  }
  return ticker
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

function normalizeCreationMode(value: unknown): DraftCreationMode {
  return value === 'blank' ? 'blank' : 'generate'
}

function toErrorResponse(error: unknown): NextResponse {
  const message =
    error instanceof Error ? error.message : 'Newsletter draft request failed'
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function GET(request: NextRequest) {
  try {
    const { scope, createdSessionId } = await resolveNewsletterDraftScope(request)
    if (process.env.NODE_ENV === 'production' && !scope.ownerId) {
      return NextResponse.json(
        { error: 'Sign in to view newsletter history.' },
        { status: 401 },
      )
    }
    const params = request.nextUrl.searchParams
    const rawLimit = params.get('limit')
    const pageSize = rawLimit == null ? undefined : Number(rawLimit)
    const page = await listNewsletterDraftArchivePage(
      scope,
      {
        search: params.get('q') ?? undefined,
        status: (params.get('status') ?? undefined) as
          | NewsletterDraftStatus
          | 'all'
          | undefined,
        ticker: params.get('ticker') ?? undefined,
        from: params.get('from') ?? undefined,
        to: params.get('to') ?? undefined,
        visibility: (params.get('archive') ?? undefined) as
          | 'active'
          | 'archived'
          | 'all'
          | undefined,
        cursor: params.get('cursor') ?? undefined,
        pageSize,
      },
      request.signal,
    )
    const response = NextResponse.json(page)
    return attachNewsletterDraftSessionCookie(response, createdSessionId)
  } catch (error) {
    if (error instanceof NewsletterDraftArchiveValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return toErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { scope, createdSessionId } = await resolveNewsletterDraftScope(request)
    if (process.env.NODE_ENV === 'production' && !scope.ownerId) {
      return NextResponse.json(
        { error: 'Sign in to create and save newsletter drafts.' },
        { status: 401 },
      )
    }

    const body = await request.json().catch(() => ({}))
    const ticker = normalizeTicker(body?.ticker)
    const format = normalizeFormat(body?.format)
    const roundupSize = normalizeRoundupSize(body?.roundupSize)
    const generationPrompt = normalizeGenerationPrompt(body?.generationPrompt)
    const creationMode = normalizeCreationMode(body?.creationMode)
    const host = request.headers.get('host')

    if (format === 'market_roundup' && ticker) {
      return NextResponse.json(
        { error: 'ticker cannot be combined with market_roundup mode' },
        { status: 400 },
      )
    }

    const options = {
      baseUrl: getRequestBaseUrl(request),
      chartBaseUrl: getDefaultChartingBaseUrlForHost(host),
      publicChartBaseUrl: getDefaultPublicChartingBaseUrlForHost(host),
      editorMode: true,
      format,
      roundupSize,
      generationPrompt,
    }
    const draft =
      creationMode === 'blank'
        ? await createBlankNewsletterDraft(scope, ticker, options)
        : await createNewsletterDraft(scope, ticker, options)

    const response = NextResponse.json({ draft }, { status: 201 })
    return attachNewsletterDraftSessionCookie(response, createdSessionId)
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.startsWith('Invalid ticker format') ||
        error.message.startsWith('Ticker is required') ||
        error.message.startsWith('generationPrompt must be'))
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return toErrorResponse(error)
  }
}
