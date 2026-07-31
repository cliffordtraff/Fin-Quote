import { existsSync, readFileSync } from 'fs'
import { basename, resolve } from 'path'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  getNewsletterDraft,
  normalizeNewsletterDraftDocument,
  renderNewsletterDraftBeehiivHtml,
  type NewsletterDraftScope,
} from './drafts'
import { getDefaultPublicChartingBaseUrlForHost } from './charting-platform-export'
import type {
  NewsletterDraftDocument,
  NewsletterDraftRecord,
} from './types'

const BUCKET = 'newsletter-charts'

async function publishLocalImage(localPath: string): Promise<string> {
  const supabase = createServiceRoleClient()
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

  return supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl
}

async function resolveImageToPublicUrl(imageUrl: string): Promise<string> {
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl

  const filename = basename(imageUrl)
  const outputPath = resolve(process.cwd(), '.newsletter-output', filename)
  const legacyPath = resolve(process.cwd(), 'public/newsletter-charts', filename)
  const localPath = existsSync(outputPath)
    ? outputPath
    : existsSync(legacyPath)
      ? legacyPath
      : null

  if (!localPath) {
    console.warn(`Newsletter chart image not found locally: ${outputPath}`)
    return imageUrl
  }
  return publishLocalImage(localPath)
}

export interface NewsletterBeehiivExport {
  html: string
  record: NewsletterDraftRecord
  draft: NewsletterDraftDocument
}

export async function buildNewsletterDraftBeehiivExport(
  scope: NewsletterDraftScope,
  draftId: string,
  host: string | null,
): Promise<NewsletterBeehiivExport> {
  const record = await getNewsletterDraft(scope, draftId)
  const publicChartBaseUrl = getDefaultPublicChartingBaseUrlForHost(host)
  const draft = normalizeNewsletterDraftDocument(
    record.draft,
    publicChartBaseUrl,
  )
  const imageUrls = draft.blocks
    .map((block) => block.chartImageUrl)
    .filter((url): url is string => Boolean(url))
  const urlMap: Record<string, string> = {}

  for (const imageUrl of imageUrls) {
    if (!/^https?:\/\//i.test(imageUrl)) {
      urlMap[imageUrl] = await resolveImageToPublicUrl(imageUrl)
    }
  }

  let html = renderNewsletterDraftBeehiivHtml(draft, publicChartBaseUrl)
  for (const [localUrl, publicUrl] of Object.entries(urlMap)) {
    html = html.replaceAll(`src="${localUrl}"`, `src="${publicUrl}"`)
  }

  return { html, record, draft }
}
