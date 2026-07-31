import { createHash } from 'crypto'
import { load } from 'cheerio'
import {
  createBeehiivPostDraft,
  listBeehiivPublications,
  updateBeehiivPostDraft,
} from '@/lib/beehiiv/client'
import {
  getBeehiivDelivery,
  getBeehiivIntegration,
  saveBeehiivDelivery,
  saveBeehiivPublication,
} from '@/lib/beehiiv/store'
import type {
  BeehiivDeliveryMode,
  BeehiivDeliveryRecord,
  BeehiivPublication,
} from '@/lib/beehiiv/types'
import {
  NewsletterDraftAuthError,
  appendNewsletterDraftEvent,
  type NewsletterDraftScope,
} from './drafts'
import { buildNewsletterDraftBeehiivExport } from './beehiiv-export'

function escapeHtmlText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export function wrapNewsletterHtmlForBeehiivMcp(html: string): string {
  return [
    '<pre data-type="htmlSnippet">',
    '<code class="language-html">',
    escapeHtmlText(html),
    '</code>',
    '</pre>',
  ].join('')
}

export function createBeehiivDeliveryContentHash(input: {
  title: string
  subjectLine: string
  previewText: string
  htmlContent: string
}): string {
  return createHash('sha256')
    .update(JSON.stringify(input))
    .digest('hex')
}

export function buildBeehiivPreviewText(value: string): string {
  const text = load(`<body>${value}</body>`)('body')
    .text()
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= 180) return text
  return `${text.slice(0, 177).trimEnd()}...`
}

function selectPublication(
  publications: BeehiivPublication[],
): BeehiivPublication | null {
  const configuredId = process.env.BEEHIIV_PUBLICATION_ID?.trim()
  if (configuredId) {
    const configured = publications.find(
      (publication) => publication.id === configuredId,
    )
    if (configured) return configured
  }
  return (
    publications.find(
      (publication) => publication.name.toLowerCase() === 'the intraday',
    ) ??
    publications[0] ??
    null
  )
}

async function resolvePublication(
  ownerId: string,
): Promise<BeehiivPublication> {
  const integration = await getBeehiivIntegration(ownerId)
  if (!integration) {
    throw new Error('Connect Beehiiv before creating a newsletter draft.')
  }
  if (integration.publication) return integration.publication

  const publication = selectPublication(
    await listBeehiivPublications(ownerId),
  )
  if (!publication) {
    throw new Error('No Beehiiv publication is available for this account.')
  }
  await saveBeehiivPublication(ownerId, publication)
  return publication
}

export async function deliverNewsletterDraftToBeehiiv(input: {
  scope: NewsletterDraftScope
  draftId: string
  host: string | null
}): Promise<{
  delivery: BeehiivDeliveryRecord
  mode: BeehiivDeliveryMode
}> {
  const ownerId = input.scope.ownerId
  if (!ownerId) {
    throw new NewsletterDraftAuthError(
      'Sign in before connecting or sending a draft to Beehiiv.',
    )
  }

  const publication = await resolvePublication(ownerId)
  const beehiivExport = await buildNewsletterDraftBeehiivExport(
    input.scope,
    input.draftId,
    input.host,
  )
  const title =
    beehiivExport.draft.subjectLine.trim() ||
    beehiivExport.draft.header?.title?.trim() ||
    `${beehiivExport.draft.ticker} newsletter`
  const subjectLine = beehiivExport.draft.subjectLine.trim() || title
  const previewText = buildBeehiivPreviewText(
    beehiivExport.draft.introText,
  )
  const htmlContent = wrapNewsletterHtmlForBeehiivMcp(beehiivExport.html)
  const contentHash = createBeehiivDeliveryContentHash({
    title,
    subjectLine,
    previewText,
    htmlContent,
  })
  const existing = await getBeehiivDelivery(ownerId, input.draftId)

  if (
    existing &&
    existing.contentHash === contentHash &&
    existing.publicationId === publication.id
  ) {
    return { delivery: existing, mode: 'unchanged' }
  }

  let postId: string
  let previewUrl: string | null
  let editorUrl: string
  let mode: BeehiivDeliveryMode

  if (existing) {
    await updateBeehiivPostDraft(ownerId, existing.postId, {
      publicationId: publication.id,
      title,
      htmlContent,
      subjectLine,
      previewText,
    })
    postId = existing.postId
    previewUrl = existing.previewUrl
    editorUrl = existing.editorUrl
    mode = 'updated'
  } else {
    const created = await createBeehiivPostDraft(ownerId, {
      publicationId: publication.id,
      title,
      htmlContent,
      subjectLine,
      previewText,
    })
    postId = created.postId
    previewUrl = created.previewUrl
    editorUrl = created.editorUrl
    mode = 'created'
  }

  const delivery = await saveBeehiivDelivery({
    ownerId,
    draftId: input.draftId,
    publicationId: publication.id,
    postId,
    title,
    previewUrl,
    editorUrl,
    contentHash,
  })
  await appendNewsletterDraftEvent(input.scope, input.draftId, {
    type: mode === 'created' ? 'beehiiv_draft_created' : 'beehiiv_draft_synced',
    metadata: {
      beehiivPostId: postId,
      beehiivEditorUrl: editorUrl,
      publicationId: publication.id,
    },
  })

  return { delivery, mode }
}
