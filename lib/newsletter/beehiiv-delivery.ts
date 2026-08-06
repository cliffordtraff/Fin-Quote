import { createHash, randomUUID } from 'crypto'
import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { load } from 'cheerio'
import {
  BeehiivReconnectRequiredError,
  BeehiivToolRejectedError,
  createBeehiivPostDraft,
  getBeehiivPostState,
  listBeehiivPublications,
  updateBeehiivPostDraft,
} from '@/lib/beehiiv/client'
import {
  BeehiivPublicationSelectionError,
  selectBeehiivPublication,
} from '@/lib/beehiiv/publication'
import {
  beginBeehiivSyncRemoteCall,
  claimBeehiivSyncOperation,
  completeBeehiivSyncOperation,
  getBeehiivDelivery,
  getBeehiivIntegration,
  getBeehiivSyncOperation,
  recordBeehiivSyncFailure,
  recordBeehiivSyncRemoteResult,
  saveBeehiivDelivery,
  saveBeehiivPublication,
} from '@/lib/beehiiv/store'
import type {
  BeehiivDeliveryMode,
  BeehiivDeliveryRecord,
  BeehiivPublication,
  BeehiivSyncOperationRecord,
} from '@/lib/beehiiv/types'
import {
  NewsletterDraftAuthError,
  appendNewsletterDraftEvent,
  type NewsletterDraftScope,
} from './drafts'
import { buildNewsletterDraftBeehiivExport } from './beehiiv-export'
import { canSetNewsletterDraftStatus } from './workflow'
import {
  assertNewsletterHtmlSize,
  normalizeNewsletterPreviewText,
  normalizeNewsletterSubject,
} from './delivery-quality'

export type BeehiivDeliveryConflictCode =
  | 'ambiguous_create'
  | 'busy'
  | 'draft_not_ready'
  | 'publication_mismatch'
  | 'post_not_draft'
  | 'asset_preflight_failed'
  | 'recovery_conflict'

export class BeehiivDeliveryConflictError extends Error {
  readonly code: BeehiivDeliveryConflictCode

  constructor(code: BeehiivDeliveryConflictCode, message: string) {
    super(message)
    this.name = 'BeehiivDeliveryConflictError'
    this.code = code
  }
}

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
  return normalizeNewsletterPreviewText(text)
}

async function resolvePublication(
  ownerId: string,
): Promise<BeehiivPublication> {
  const integration = await getBeehiivIntegration(ownerId)
  if (!integration) {
    throw new Error('Connect Beehiiv before creating a newsletter draft.')
  }
  const configuredId = process.env.BEEHIIV_PUBLICATION_ID?.trim()
  if (
    integration.publication &&
    (!configuredId || integration.publication.id === configuredId)
  ) {
    return integration.publication
  }

  const publication = selectBeehiivPublication(
    await listBeehiivPublications(ownerId),
  )
  if (!publication) {
    throw new Error('No Beehiiv publication is available for this account.')
  }
  await saveBeehiivPublication(ownerId, publication)
  return publication
}

const ASSET_PREFLIGHT_TIMEOUT_MS = 10_000
const ASSET_PREFLIGHT_MAX_REDIRECTS = 3
const ASSET_PREFLIGHT_MAX_BYTES = 5 * 1024 * 1024
const ASSET_PREFLIGHT_MAX_PROBE_BYTES = 64 * 1024
const ASSET_PREFLIGHT_MAX_URLS = 20
const ASSET_PREFLIGHT_MAX_DIMENSION = 10_000
const ASSET_PREFLIGHT_MAX_PIXELS = 40_000_000
const FIRST_PARTY_ASSET_HOSTS = [
  'charts.theintraday.com',
  'charting-platform-six.vercel.app',
  'financialmodelingprep.com',
  'www.theintraday.com',
  'theintraday.com',
] as const

const nonPublicIpv4 = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  nonPublicIpv4.addSubnet(address, prefix, 'ipv4')
}

const nonPublicIpv6 = new BlockList()
for (const [address, prefix] of [
  // Only the currently allocated 2000::/3 global-unicast space is accepted.
  ['::', 3],
  ['4000::', 2],
  ['8000::', 1],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
] as const) {
  nonPublicIpv6.addSubnet(address, prefix, 'ipv6')
}

type BeehiivAssetPreflightOptions = {
  fetchImpl?: typeof fetch
  resolveHostname?: (hostname: string) => Promise<string[]>
  allowedHostnames?: Iterable<string>
  timeoutMs?: number
  maxRedirects?: number
  maxAssetBytes?: number
}

type ResolvedBeehiivAssetPreflightOptions = Omit<
  Required<BeehiivAssetPreflightOptions>,
  'allowedHostnames'
> & { allowedHostnames: ReadonlySet<string> }

function configuredAssetHostnames(): Set<string> {
  const hostnames = new Set<string>(FIRST_PARTY_ASSET_HOSTS)
  for (const value of [
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEWSLETTER_PUBLIC_CHARTING_URL,
    process.env.NEXT_PUBLIC_CHARTING_URL,
  ]) {
    if (!value?.trim()) continue
    try {
      const parsed = new URL(value)
      if (parsed.protocol === 'https:') {
        hostnames.add(normalizeHostname(parsed.hostname))
      }
    } catch {
      // Invalid application configuration is ignored here and will fail closed
      // if an asset later tries to use that hostname.
    }
  }
  return hostnames
}

function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
}

function isPublicIpAddress(address: string): boolean {
  const normalized = normalizeHostname(address).split('%', 1)[0]
  const family = isIP(normalized)
  if (family === 4) return !nonPublicIpv4.check(normalized, 'ipv4')
  if (family === 6) return !nonPublicIpv6.check(normalized, 'ipv6')
  return false
}

async function defaultResolveHostname(hostname: string): Promise<string[]> {
  const resolved = await lookup(hostname, { all: true, verbatim: true })
  return resolved.map(({ address }) => address)
}

function parsePublicAssetUrl(value: string): URL {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new BeehiivDeliveryConflictError(
      'asset_preflight_failed',
      `Newsletter chart is not a valid public URL: ${value}`,
    )
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    (parsed.port && parsed.port !== '443')
  ) {
    throw new BeehiivDeliveryConflictError(
      'asset_preflight_failed',
      `Newsletter chart must use a public HTTPS URL: ${value}`,
    )
  }
  const hostname = normalizeHostname(parsed.hostname)
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local')
  ) {
    throw new BeehiivDeliveryConflictError(
      'asset_preflight_failed',
      `Newsletter chart must use a public HTTPS URL: ${value}`,
    )
  }
  return parsed
}

async function assertPublicAssetAddress(
  url: URL,
  resolveHostname: (hostname: string) => Promise<string[]>,
  signal: AbortSignal,
): Promise<void> {
  const hostname = normalizeHostname(url.hostname)
  let addresses: string[]
  if (isIP(hostname)) {
    addresses = [hostname]
  } else {
    try {
      addresses = await new Promise<string[]>((resolve, reject) => {
        const onAbort = () => reject(signal.reason)
        if (signal.aborted) {
          reject(signal.reason)
          return
        }
        signal.addEventListener('abort', onAbort, { once: true })
        resolveHostname(hostname).then(
          (value) => {
            signal.removeEventListener('abort', onAbort)
            resolve(value)
          },
          (error) => {
            signal.removeEventListener('abort', onAbort)
            reject(error)
          },
        )
      })
    } catch (error) {
      throw new BeehiivDeliveryConflictError(
        'asset_preflight_failed',
        `Newsletter chart hostname could not be resolved: ${hostname} (${
          error instanceof Error ? error.message : String(error)
        })`,
      )
    }
  }
  if (
    addresses.length === 0 ||
    addresses.some((address) => !isPublicIpAddress(address))
  ) {
    throw new BeehiivDeliveryConflictError(
      'asset_preflight_failed',
      `Newsletter chart hostname does not resolve exclusively to public addresses: ${hostname}`,
    )
  }
}

function assertApprovedAssetHostname(
  url: URL,
  allowedHostnames: ReadonlySet<string>,
): void {
  const hostname = normalizeHostname(url.hostname)
  if (!allowedHostnames.has(hostname)) {
    throw new BeehiivDeliveryConflictError(
      'asset_preflight_failed',
      `Newsletter chart hostname is not an approved asset host: ${hostname}`,
    )
  }
}

function responseAssetSize(response: Response): number | null {
  const contentLength = response.headers.get('content-length')
  const contentRange = response.headers.get('content-range')
  const rangeTotal = contentRange?.match(/\/(\d+)\s*$/)?.[1]
  // A 206 Content-Length describes only the returned slice. Without a total
  // Content-Range, the full object size is unknowable and must fail closed.
  const candidate = response.status === 206 ? rangeTotal : contentLength
  if (!candidate || !/^\d+$/.test(candidate)) return null
  const parsed = Number(candidate)
  return Number.isSafeInteger(parsed) ? parsed : Number.POSITIVE_INFINITY
}

async function readBoundedAssetProbe(response: Response): Promise<Uint8Array> {
  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array()
  let received = 0
  const chunks: Uint8Array[] = []
  try {
    while (received < ASSET_PREFLIGHT_MAX_PROBE_BYTES) {
      const chunk = await reader.read()
      if (chunk.done) break
      const remaining = ASSET_PREFLIGHT_MAX_PROBE_BYTES - received
      const value = chunk.value.subarray(0, remaining)
      chunks.push(value)
      received += value.byteLength
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  const probe = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    probe.set(chunk, offset)
    offset += chunk.byteLength
  }
  return probe
}

function imageDimensionsFromProbe(
  bytes: Uint8Array,
): { format: string; width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (
    bytes.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every(
      (value, index) => bytes[index] === value,
    )
  ) {
    return {
      format: 'PNG',
      width: view.getUint32(16),
      height: view.getUint32(20),
    }
  }
  if (
    bytes.length >= 10 &&
    String.fromCharCode(...bytes.subarray(0, 6)).match(/^GIF8[79]a$/)
  ) {
    return {
      format: 'GIF',
      width: view.getUint16(6, true),
      height: view.getUint16(8, true),
    }
  }
  if (
    bytes.length >= 30 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8
  ) {
    let offset = 2
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1
        continue
      }
      const marker = bytes[offset + 1]
      offset += 2
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) continue
      if (offset + 2 > bytes.length) break
      const segmentLength = view.getUint16(offset)
      if (segmentLength < 2 || offset + segmentLength > bytes.length) break
      const isStartOfFrame =
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker)
      if (isStartOfFrame && segmentLength >= 7) {
        return {
          format: 'JPEG',
          height: view.getUint16(offset + 3),
          width: view.getUint16(offset + 5),
        }
      }
      offset += segmentLength
    }
  }
  if (
    bytes.length >= 30 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  ) {
    const chunkType = String.fromCharCode(...bytes.subarray(12, 16))
    if (chunkType === 'VP8X') {
      return {
        format: 'WebP',
        width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
        height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
      }
    }
    if (
      chunkType === 'VP8 ' &&
      bytes[23] === 0x9d &&
      bytes[24] === 0x01 &&
      bytes[25] === 0x2a
    ) {
      return {
        format: 'WebP',
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      }
    }
    if (chunkType === 'VP8L' && bytes[20] === 0x2f) {
      return {
        format: 'WebP',
        width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
        height:
          1 +
          (bytes[22] >> 6) +
          (bytes[23] << 2) +
          ((bytes[24] & 0x0f) << 10),
      }
    }
  }
  return null
}

function assertValidImageProbe(bytes: Uint8Array, url: URL): void {
  const dimensions = imageDimensionsFromProbe(bytes)
  if (!dimensions) {
    throw new BeehiivDeliveryConflictError(
      'asset_preflight_failed',
      `Newsletter image bytes are not a supported PNG, JPEG, GIF, or WebP file: ${url.toString()}`,
    )
  }
  const { width, height } = dimensions
  if (
    width < 1 ||
    height < 1 ||
    width > ASSET_PREFLIGHT_MAX_DIMENSION ||
    height > ASSET_PREFLIGHT_MAX_DIMENSION ||
    width * height > ASSET_PREFLIGHT_MAX_PIXELS
  ) {
    throw new BeehiivDeliveryConflictError(
      'asset_preflight_failed',
      `Newsletter ${dimensions.format} image has unsafe dimensions ${width}x${height}: ${url.toString()}`,
    )
  }
}

async function preflightOneBeehiivAsset(
  value: string,
  options: ResolvedBeehiivAssetPreflightOptions,
): Promise<void> {
  let currentUrl = parsePublicAssetUrl(value)
  const signal = AbortSignal.timeout(options.timeoutMs)

  for (let redirectCount = 0; ; redirectCount += 1) {
    assertApprovedAssetHostname(currentUrl, options.allowedHostnames)
    await assertPublicAssetAddress(
      currentUrl,
      options.resolveHostname,
      signal,
    )

    let response: Response
    try {
      response = await options.fetchImpl(currentUrl, {
        method: 'GET',
        headers: {
          Range: `bytes=0-${ASSET_PREFLIGHT_MAX_PROBE_BYTES - 1}`,
        },
        redirect: 'manual',
        signal,
      })
    } catch (error) {
      throw new BeehiivDeliveryConflictError(
        'asset_preflight_failed',
        `Newsletter chart could not be reached: ${currentUrl.toString()} (${
          error instanceof Error ? error.message : String(error)
        })`,
      )
    }

    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => undefined)
      if (redirectCount >= options.maxRedirects) {
        throw new BeehiivDeliveryConflictError(
          'asset_preflight_failed',
          `Newsletter chart exceeded ${options.maxRedirects} redirects: ${value}`,
        )
      }
      const location = response.headers.get('location')
      if (!location) {
        throw new BeehiivDeliveryConflictError(
          'asset_preflight_failed',
          `Newsletter chart returned a redirect without a destination: ${currentUrl.toString()}`,
        )
      }
      currentUrl = parsePublicAssetUrl(
        new URL(location, currentUrl).toString(),
      )
      continue
    }

    const reportedFinalUrl = response.url
      ? parsePublicAssetUrl(response.url)
      : currentUrl
    if (reportedFinalUrl.toString() !== currentUrl.toString()) {
      assertApprovedAssetHostname(
        reportedFinalUrl,
        options.allowedHostnames,
      )
      await assertPublicAssetAddress(
        reportedFinalUrl,
        options.resolveHostname,
        signal,
      )
    }
    const contentType =
      response.headers.get('content-type')?.toLowerCase() ?? ''
    const assetSize = responseAssetSize(response)
    if (
      !response.ok ||
      !contentType.startsWith('image/') ||
      assetSize === null ||
      (assetSize !== null && assetSize > options.maxAssetBytes)
    ) {
      await response.body?.cancel().catch(() => undefined)
      const sizeDetail =
        assetSize === null
          ? '; full asset size was not reported'
          : assetSize > options.maxAssetBytes
          ? `; asset exceeds ${options.maxAssetBytes} bytes`
          : ''
      throw new BeehiivDeliveryConflictError(
        'asset_preflight_failed',
        `Newsletter chart preflight failed for ${currentUrl.toString()}: HTTP ${
          response.status
        } ${contentType || 'without an image content type'}${sizeDetail}.`,
      )
    }
    const probe = await readBoundedAssetProbe(response)
    assertValidImageProbe(probe, reportedFinalUrl)
    return
  }
}

export async function preflightBeehiivImageAssets(
  imageUrls: string[],
  options: BeehiivAssetPreflightOptions = {},
): Promise<void> {
  const uniqueUrls = [
    ...new Set(imageUrls.map((url) => url.trim()).filter(Boolean)),
  ]
  if (uniqueUrls.length === 0) {
    throw new BeehiivDeliveryConflictError(
      'asset_preflight_failed',
      'Newsletter draft has no durable chart images.',
    )
  }
  if (uniqueUrls.length > ASSET_PREFLIGHT_MAX_URLS) {
    throw new BeehiivDeliveryConflictError(
      'asset_preflight_failed',
      `Newsletter draft has more than ${ASSET_PREFLIGHT_MAX_URLS} chart images.`,
    )
  }

  const resolvedOptions: ResolvedBeehiivAssetPreflightOptions = {
    fetchImpl: options.fetchImpl ?? fetch,
    resolveHostname: options.resolveHostname ?? defaultResolveHostname,
    allowedHostnames: new Set(
      [...(options.allowedHostnames ?? configuredAssetHostnames())].map(
        normalizeHostname,
      ),
    ),
    timeoutMs: Math.max(1, options.timeoutMs ?? ASSET_PREFLIGHT_TIMEOUT_MS),
    maxRedirects: Math.max(
      0,
      Math.min(5, options.maxRedirects ?? ASSET_PREFLIGHT_MAX_REDIRECTS),
    ),
    maxAssetBytes: Math.max(
      1,
      options.maxAssetBytes ?? ASSET_PREFLIGHT_MAX_BYTES,
    ),
  }

  await Promise.all(
    uniqueUrls.map((value) =>
      preflightOneBeehiivAsset(value, resolvedOptions),
    ),
  )
}

export function createBeehiivRecoveryMarker(
  draftId: string,
  contentFingerprint: string,
): string {
  return `finquote-delivery:${draftId}:${contentFingerprint.slice(0, 24)}`
}

function beehiivSyncOperationMatches(input: {
  operation: BeehiivSyncOperationRecord
  publicationId: string
  operationKind: BeehiivSyncOperationRecord['operationKind']
  operationKey: string
  contentHash: string
}): boolean {
  return (
    input.operation.publicationId === input.publicationId &&
    input.operation.operationKind === input.operationKind &&
    input.operation.operationKey === input.operationKey &&
    input.operation.contentHash === input.contentHash
  )
}

function isDefinitiveBeehiivCreateFailure(error: unknown): boolean {
  return (
    error instanceof BeehiivReconnectRequiredError ||
    error instanceof BeehiivToolRejectedError
  )
}

function recoveryConflict(): BeehiivDeliveryConflictError {
  return new BeehiivDeliveryConflictError(
    'recovery_conflict',
    'A different Beehiiv operation already recorded a remote post for this newsletter. Resolve that recovery record before syncing new content.',
  )
}

async function persistRecordedOperation(input: {
  scope: NewsletterDraftScope
  operation: BeehiivSyncOperationRecord
  leaseToken: string
}): Promise<{ delivery: BeehiivDeliveryRecord; mode: BeehiivDeliveryMode }> {
  const { operation } = input
  if (!operation.remotePostId || !operation.remoteEditorUrl) {
    throw new BeehiivDeliveryConflictError(
      'ambiguous_create',
      'Beehiiv returned a draft but its durable identifiers were not recorded. Resolve the ambiguous sync before retrying.',
    )
  }
  const delivery = await saveBeehiivDelivery({
    ownerId: operation.ownerId,
    draftId: operation.draftId,
    publicationId: operation.publicationId,
    postId: operation.remotePostId,
    title: operation.title,
    previewUrl: operation.remotePreviewUrl,
    editorUrl: operation.remoteEditorUrl,
    contentHash: operation.contentHash,
  })
  const mode: BeehiivDeliveryMode =
    operation.operationKind === 'create' ? 'created' : 'updated'
  await appendNewsletterDraftEvent(input.scope, operation.draftId, {
    type: mode === 'created' ? 'beehiiv_draft_created' : 'beehiiv_draft_synced',
    metadata: {
      beehiivPostId: operation.remotePostId,
      beehiivEditorUrl: operation.remoteEditorUrl,
      publicationId: operation.publicationId,
      recoveryMarker: operation.operationKey,
    },
    dedupeKey: `beehiiv-sync:${operation.operationKey}`,
  })
  await completeBeehiivSyncOperation({
    ownerId: operation.ownerId,
    draftId: operation.draftId,
    leaseToken: input.leaseToken,
  })
  return { delivery, mode }
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

  const beehiivExport = await buildNewsletterDraftBeehiivExport(
    input.scope,
    input.draftId,
    input.host,
  )
  const readiness = canSetNewsletterDraftStatus(
    beehiivExport.draft,
    'ready',
  )
  if (beehiivExport.record.status !== 'ready' || !readiness.ready) {
    throw new BeehiivDeliveryConflictError(
      'draft_not_ready',
      readiness.issues.length > 0
        ? `Mark the newsletter Ready after resolving: ${readiness.issues
            .map((issue) => issue.label)
            .join(' ')}`
        : 'Mark the newsletter Ready before syncing it to Beehiiv.',
    )
  }
  await preflightBeehiivImageAssets(beehiivExport.resolvedImageUrls)

  let publication: BeehiivPublication
  try {
    publication = await resolvePublication(ownerId)
  } catch (error) {
    if (error instanceof BeehiivPublicationSelectionError) {
      throw new BeehiivDeliveryConflictError(
        'publication_mismatch',
        error.message,
      )
    }
    throw error
  }
  const normalizedDraftSubject = normalizeNewsletterSubject(
    beehiivExport.draft.subjectLine,
  )
  const title =
    normalizedDraftSubject ||
    normalizeNewsletterSubject(beehiivExport.draft.header?.title ?? '') ||
    normalizeNewsletterSubject(`${beehiivExport.draft.ticker} newsletter`)
  const subjectLine = normalizedDraftSubject || title
  const previewText = buildBeehiivPreviewText(
    beehiivExport.draft.introText,
  )
  const unmarkedHtmlContent = wrapNewsletterHtmlForBeehiivMcp(
    beehiivExport.html,
  )
  assertNewsletterHtmlSize(unmarkedHtmlContent)
  const contentFingerprint = createBeehiivDeliveryContentHash({
    title,
    subjectLine,
    previewText,
    htmlContent: unmarkedHtmlContent,
  })
  const operationKey = createBeehiivRecoveryMarker(
    input.draftId,
    contentFingerprint,
  )
  const htmlContent = wrapNewsletterHtmlForBeehiivMcp(
    `<!-- ${operationKey} -->${beehiivExport.html}`,
  )
  assertNewsletterHtmlSize(htmlContent)
  const contentHash = createBeehiivDeliveryContentHash({
    title,
    subjectLine,
    previewText,
    htmlContent,
  })
  const existing = await getBeehiivDelivery(ownerId, input.draftId)

  if (existing) {
    if (existing.publicationId !== publication.id) {
      throw new BeehiivDeliveryConflictError(
        'publication_mismatch',
        'This newsletter is already linked to a different Beehiiv publication. It was not moved or duplicated.',
      )
    }
    if (!['draft', 'unknown'].includes(existing.lifecycleStatus)) {
      throw new BeehiivDeliveryConflictError(
        'post_not_draft',
        `Beehiiv sync is blocked because this post is ${existing.lifecycleStatus}. Create a reviewed copy instead of editing a scheduled or published post.`,
      )
    }
    const liveState = await getBeehiivPostState(
      ownerId,
      existing.publicationId,
      existing.postId,
    )
    if (liveState.status?.trim().toLowerCase() !== 'draft') {
      throw new BeehiivDeliveryConflictError(
        'post_not_draft',
        `Beehiiv sync is blocked because the live post is ${
          liveState.status ?? 'in an unknown state'
        }.`,
      )
    }
  }

  if (existing && existing.contentHash === contentHash) {
    const pending = await getBeehiivSyncOperation(ownerId, input.draftId)
    if (pending?.syncState === 'remote_recorded') {
      if (
        !beehiivSyncOperationMatches({
          operation: pending,
          publicationId: publication.id,
          operationKind: pending.operationKind,
          operationKey,
          contentHash,
        })
      ) {
        throw recoveryConflict()
      }
      const leaseToken = randomUUID()
      const claimed = await claimBeehiivSyncOperation({
        ownerId,
        draftId: input.draftId,
        publicationId: publication.id,
        operationKind: pending.operationKind,
        operationKey,
        contentHash,
        title,
        leaseToken,
      })
      if (
        claimed &&
        !beehiivSyncOperationMatches({
          operation: claimed,
          publicationId: publication.id,
          operationKind: pending.operationKind,
          operationKey,
          contentHash,
        })
      ) {
        throw recoveryConflict()
      }
      if (claimed?.leaseToken === leaseToken) {
        return persistRecordedOperation({
          scope: input.scope,
          operation: claimed,
          leaseToken,
        })
      }
      throw new BeehiivDeliveryConflictError(
        'busy',
        'Another Beehiiv sync is already recovering this newsletter.',
      )
    }
    return { delivery: existing, mode: 'unchanged' }
  }

  const operationKind = existing ? 'update' : 'create'
  const leaseToken = randomUUID()
  const operation = await claimBeehiivSyncOperation({
    ownerId,
    draftId: input.draftId,
    publicationId: publication.id,
    operationKind,
    operationKey,
    contentHash,
    title,
    leaseToken,
  })
  if (!operation) {
    throw new BeehiivDeliveryConflictError(
      'busy',
      'Beehiiv sync could not be claimed. Try again after the current request finishes.',
    )
  }
  if (
    operation.syncState === 'remote_recorded' &&
    !beehiivSyncOperationMatches({
      operation,
      publicationId: publication.id,
      operationKind,
      operationKey,
      contentHash,
    })
  ) {
    throw recoveryConflict()
  }
  if (operation.syncState === 'ambiguous') {
    throw new BeehiivDeliveryConflictError(
      'ambiguous_create',
      operation.lastError ??
        'A previous Beehiiv create may have succeeded without returning a durable post ID. Resolve that draft before retrying.',
    )
  }
  if (operation.leaseToken !== leaseToken) {
    throw new BeehiivDeliveryConflictError(
      'busy',
      'Another Beehiiv sync is already running for this newsletter.',
    )
  }
  if (operation.syncState === 'remote_recorded') {
    return persistRecordedOperation({
      scope: input.scope,
      operation,
      leaseToken,
    })
  }

  await beginBeehiivSyncRemoteCall({
    ownerId,
    draftId: input.draftId,
    leaseToken,
    operationKind,
  })

  let postId: string
  let previewUrl: string | null
  let editorUrl: string
  try {
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
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await recordBeehiivSyncFailure({
      ownerId,
      draftId: input.draftId,
      leaseToken,
      state:
        operationKind === 'create' &&
        !isDefinitiveBeehiivCreateFailure(error)
          ? 'ambiguous'
          : 'failed',
      error: message,
    }).catch(() => undefined)
    throw error
  }

  const recorded = await recordBeehiivSyncRemoteResult({
    ownerId,
    draftId: input.draftId,
    leaseToken,
    postId,
    previewUrl,
    editorUrl,
  })

  return persistRecordedOperation({
    scope: input.scope,
    operation: recorded,
    leaseToken,
  })
}
