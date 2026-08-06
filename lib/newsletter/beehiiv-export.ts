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
import {
  describeImmutableNewsletterImage,
  isImmutableAssetAlreadyStored,
} from './immutable-assets'

const BUCKET = 'newsletter-charts'

async function publishLocalImage(localPath: string): Promise<string> {
  const supabase = createServiceRoleClient()
  const fileBuffer = readFileSync(localPath)
  const asset = describeImmutableNewsletterImage(fileBuffer)

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(asset.storagePath, fileBuffer, {
      contentType: asset.contentType,
      cacheControl: asset.cacheControl,
      upsert: false,
      metadata: {
        sha256: asset.digest,
        width: asset.width,
        height: asset.height,
      },
    })
  if (error && !isImmutableAssetAlreadyStored(error)) {
    throw new Error(`Failed to upload ${basename(localPath)}: ${error.message}`)
  }

  return supabase.storage
    .from(BUCKET)
    .getPublicUrl(asset.storagePath).data.publicUrl
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
    throw new Error(
      `Newsletter chart image is not durable or available locally: ${imageUrl}`,
    )
  }
  return publishLocalImage(localPath)
}

export interface NewsletterBeehiivExport {
  html: string
  record: NewsletterDraftRecord
  draft: NewsletterDraftDocument
  resolvedImageUrls: string[]
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
  const blockImageUrls = draft.blocks
    .map((block) => block.chartImageUrl)
    .filter((url): url is string => Boolean(url))
  const headerImageUrls = [
    draft.header?.logoUrl,
    ...(draft.header?.logoUrls ?? []),
  ].filter((url): url is string => Boolean(url?.trim()))
  const imageUrls = [...new Set([...blockImageUrls, ...headerImageUrls])]
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

  return {
    html,
    record,
    draft,
    resolvedImageUrls: imageUrls.map((imageUrl) => urlMap[imageUrl] ?? imageUrl),
  }
}
