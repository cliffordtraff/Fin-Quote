export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { existsSync, readFileSync } from 'fs'
import { basename, resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  NewsletterDraftNotFoundError,
  getNewsletterDraft,
  normalizeNewsletterDraftDocument,
  renderNewsletterDraftBeehiivHtml,
} from '@/lib/newsletter/drafts'
import {
  attachNewsletterDraftSessionCookie,
  resolveNewsletterDraftScope,
} from '@/lib/newsletter/draft-session'
import { getDefaultPublicChartingBaseUrlForHost } from '@/lib/newsletter/charting-platform-export'

const BUCKET = 'newsletter-charts'

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for image publishing',
    )
  }
  return createClient(url, key)
}

/**
 * Upload a local newsletter chart image to Supabase Storage.
 * Returns the public URL.
 */
async function publishLocalImage(localPath: string): Promise<string> {
  const supabase = createServiceClient()
  const filename = basename(localPath)
  const datePrefix = new Date().toISOString().slice(0, 10)
  const storagePath = `${datePrefix}/${filename}`

  const fileBuffer = readFileSync(localPath)

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: 'image/png',
      upsert: true,
    })

  if (error) {
    throw new Error(`Failed to upload ${filename}: ${error.message}`)
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(storagePath)

  return urlData.publicUrl
}

/**
 * Given a relative image URL like /newsletter-charts/AAPL_chart.png,
 * resolve to local file path, upload to Supabase, and return public URL.
 */
async function resolveImageToPublicUrl(imageUrl: string): Promise<string> {
  // Already a public URL
  if (/^https?:\/\//i.test(imageUrl)) {
    return imageUrl
  }

  // Relative path - resolve to local file
  const relativePath = imageUrl.startsWith('/')
    ? imageUrl.slice(1)
    : imageUrl

  const localPath = resolve(process.cwd(), 'public', relativePath)

  if (!existsSync(localPath)) {
    console.warn(`Image not found locally: ${localPath}`)
    return imageUrl // Return as-is, will be broken but at least won't crash
  }

  return publishLocalImage(localPath)
}

function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof NewsletterDraftNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }

  const message =
    error instanceof Error ? error.message : 'Newsletter draft request failed'
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { scope, createdSessionId } = await resolveNewsletterDraftScope(request)
    const draft = await getNewsletterDraft(scope, id)
    const host = request.headers.get('host')
    const publicChartBaseUrl = getDefaultPublicChartingBaseUrlForHost(host)
    const normalizedDraft = normalizeNewsletterDraftDocument(
      draft.draft,
      publicChartBaseUrl,
    )

    // Collect all image URLs from blocks
    const imageUrls = normalizedDraft.blocks
      .map((block) => block.chartImageUrl)
      .filter((url): url is string => Boolean(url))

    // Publish any local images to Supabase Storage
    const urlMap: Record<string, string> = {}
    for (const imageUrl of imageUrls) {
      if (!/^https?:\/\//i.test(imageUrl)) {
        urlMap[imageUrl] = await resolveImageToPublicUrl(imageUrl)
      }
    }

    // Generate HTML
    let beehiivHtml = renderNewsletterDraftBeehiivHtml(
      normalizedDraft,
      publicChartBaseUrl,
    )

    // Replace relative URLs with public URLs
    for (const [localUrl, publicUrl] of Object.entries(urlMap)) {
      beehiivHtml = beehiivHtml.replaceAll(`src="${localUrl}"`, `src="${publicUrl}"`)
    }

    const response = NextResponse.json({ html: beehiivHtml })
    return attachNewsletterDraftSessionCookie(response, createdSessionId)
  } catch (error) {
    return toErrorResponse(error)
  }
}
