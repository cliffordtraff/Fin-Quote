import { createHash } from 'node:crypto'
import type { DashboardChartOfTheDaySetting } from './chart-of-the-day-settings'
import {
  describeImmutableNewsletterImage,
  isImmutableAssetAlreadyStored,
} from '@/lib/newsletter/immutable-assets'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

type DashboardServiceClient = ReturnType<typeof createServiceRoleClient>

const STORAGE_BUCKET = 'newsletter-charts'
const LEASE_SECONDS = 90
const FAILURE_RETRY_SECONDS = 60
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

export const DASHBOARD_CHART_RENDERER_VERSION =
  'dashboard-chart-of-day-assets-v1'

export interface DashboardChartRenderIdentity {
  renderKey: string
  theme: 'light' | 'dark'
  settingVersion: string
  specHash: string
  rendererVersion: string
}

export interface DashboardChartRenderAsset {
  publicUrl: string
  storagePath: string
  source: 'ready' | 'rendered'
}

export interface DashboardChartRenderedImage {
  bytes: Uint8Array
  contentType: 'image/png'
}

interface AcquireRow {
  disposition: 'acquired' | 'ready' | 'wait' | 'failed'
  lease_token: string | null
  storage_path: string | null
  retry_after_seconds: number
  attempt_count: number
}

interface CompleteRow {
  disposition: 'completed' | 'ready' | 'lost'
  storage_path: string | null
}

export class DashboardChartRenderPendingError extends Error {
  readonly retryAfterSeconds: number

  constructor(retryAfterSeconds: number) {
    super('Dashboard chart render is already in progress')
    this.name = 'DashboardChartRenderPendingError'
    this.retryAfterSeconds = Math.max(
      1,
      Math.min(180, Math.trunc(retryAfterSeconds) || 1),
    )
  }
}

export class DashboardChartRenderUnavailableError extends Error {
  readonly retryAfterSeconds: number | null

  constructor(retryAfterSeconds: number | null) {
    super('Dashboard chart render is temporarily unavailable')
    this.name = 'DashboardChartRenderUnavailableError'
    this.retryAfterSeconds =
      retryAfterSeconds === null || retryAfterSeconds < 0
        ? null
        : Math.max(1, Math.min(21_600, Math.trunc(retryAfterSeconds) || 1))
  }
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    return JSON.stringify(Number.isFinite(value) ? value : null)
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`
  }
  return 'null'
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function buildDashboardChartRenderIdentity(
  theme: 'light' | 'dark',
  setting: DashboardChartOfTheDaySetting,
): DashboardChartRenderIdentity {
  const canonicalSpec = stableJson(setting.chartSpec)
  const specHash = sha256(canonicalSpec)
  const canonicalSetting = stableJson({
    selection: setting.selection,
    source: setting.source,
    chartSpec: setting.chartSpec,
  })
  const settingVersion = setting.updatedAt?.trim() || sha256(canonicalSetting)
  const rendererVersion = DASHBOARD_CHART_RENDERER_VERSION
  const renderKey = sha256(
    stableJson({
      rendererVersion,
      settingVersion,
      specHash,
      theme,
    }),
  )

  return {
    renderKey,
    theme,
    settingVersion,
    specHash,
    rendererVersion,
  }
}

async function acquireAsset(
  client: DashboardServiceClient,
  identity: DashboardChartRenderIdentity,
): Promise<AcquireRow> {
  const { data, error } = await client.rpc(
    'acquire_dashboard_chart_render_asset',
    {
      p_render_key: identity.renderKey,
      p_theme: identity.theme,
      p_setting_version: identity.settingVersion,
      p_spec_hash: identity.specHash,
      p_renderer_version: identity.rendererVersion,
      p_lease_seconds: LEASE_SECONDS,
    },
  )
  const row = data?.[0] as AcquireRow | undefined
  if (error || !row) {
    throw new DashboardChartRenderUnavailableError(null)
  }
  return row
}

function publicAssetUrl(
  client: DashboardServiceClient,
  storagePath: string,
): string {
  const { data } = client.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath)
  const publicUrl = data.publicUrl
  const parsed = new URL(publicUrl)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new DashboardChartRenderUnavailableError(null)
  }
  return publicUrl
}

async function uploadImmutableAsset(
  client: DashboardServiceClient,
  bytes: Uint8Array,
): Promise<{
  storagePath: string
  digest: string
  byteSize: number
}> {
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('Dashboard chart exceeded the image size limit')
  }

  const buffer = Buffer.from(bytes)
  const asset = describeImmutableNewsletterImage(buffer)
  const { error } = await client.storage
    .from(STORAGE_BUCKET)
    .upload(asset.storagePath, buffer, {
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
    throw new Error('Dashboard chart asset upload failed')
  }

  return {
    storagePath: asset.storagePath,
    digest: asset.digest,
    byteSize: buffer.byteLength,
  }
}

async function completeAsset(
  client: DashboardServiceClient,
  identity: DashboardChartRenderIdentity,
  leaseToken: string,
  asset: { storagePath: string; digest: string; byteSize: number },
): Promise<CompleteRow> {
  const { data, error } = await client.rpc(
    'complete_dashboard_chart_render_asset',
    {
      p_render_key: identity.renderKey,
      p_lease_token: leaseToken,
      p_storage_path: asset.storagePath,
      p_image_sha256: asset.digest,
      p_byte_size: asset.byteSize,
    },
  )
  const row = data?.[0] as CompleteRow | undefined
  if (error || !row) {
    throw new DashboardChartRenderUnavailableError(null)
  }
  return row
}

async function recordFailure(
  client: DashboardServiceClient,
  identity: DashboardChartRenderIdentity,
  leaseToken: string,
): Promise<void> {
  try {
    const { error } = await client.rpc(
      'fail_dashboard_chart_render_asset',
      {
        p_render_key: identity.renderKey,
        p_lease_token: leaseToken,
        p_retry_after_seconds: FAILURE_RETRY_SECONDS,
      },
    )
    if (!error) return
  } catch {
    // Preserve the original renderer/upload failure below.
  }
  console.error('[chart-of-the-day] Failed to release render lease')
}

async function readyAssetExists(
  client: DashboardServiceClient,
  storagePath: string,
): Promise<boolean> {
  try {
    const { data } = await client.storage
      .from(STORAGE_BUCKET)
      .exists(storagePath)
    return data === true
  } catch {
    throw new DashboardChartRenderUnavailableError(null)
  }
}

async function invalidateMissingAsset(
  client: DashboardServiceClient,
  identity: DashboardChartRenderIdentity,
  storagePath: string,
): Promise<void> {
  const { error } = await client.rpc(
    'invalidate_dashboard_chart_render_asset',
    {
      p_render_key: identity.renderKey,
      p_storage_path: storagePath,
    },
  )
  if (error) {
    throw new DashboardChartRenderUnavailableError(null)
  }
}

function resultFromReadyPath(
  client: DashboardServiceClient,
  storagePath: string,
  source: DashboardChartRenderAsset['source'],
): DashboardChartRenderAsset {
  return {
    publicUrl: publicAssetUrl(client, storagePath),
    storagePath,
    source,
  }
}

/**
 * Resolve or create one immutable chart asset. Postgres decides which isolate
 * may call the renderer. Other isolates fail quickly with Retry-After instead
 * of waiting on or duplicating an expensive render.
 */
export async function ensureDashboardChartRenderAsset(options: {
  identity: DashboardChartRenderIdentity
  render: () => Promise<DashboardChartRenderedImage>
}): Promise<DashboardChartRenderAsset> {
  const client = createServiceRoleClient()
  let claim = await acquireAsset(client, options.identity)

  if (claim.disposition === 'ready' && claim.storage_path) {
    if (await readyAssetExists(client, claim.storage_path)) {
      return resultFromReadyPath(client, claim.storage_path, 'ready')
    }
    await invalidateMissingAsset(client, options.identity, claim.storage_path)
    claim = await acquireAsset(client, options.identity)
    if (claim.disposition === 'ready' && claim.storage_path) {
      return resultFromReadyPath(client, claim.storage_path, 'ready')
    }
  }
  if (claim.disposition === 'wait') {
    throw new DashboardChartRenderPendingError(claim.retry_after_seconds)
  }
  if (claim.disposition === 'failed') {
    throw new DashboardChartRenderUnavailableError(
      claim.retry_after_seconds < 0 ? null : claim.retry_after_seconds,
    )
  }
  if (!claim.lease_token) {
    throw new DashboardChartRenderUnavailableError(null)
  }

  try {
    const rendered = await options.render()
    if (rendered.contentType !== 'image/png') {
      throw new Error('Dashboard chart renderer returned an unsupported image')
    }
    const immutableAsset = await uploadImmutableAsset(client, rendered.bytes)
    const completion = await completeAsset(
      client,
      options.identity,
      claim.lease_token,
      immutableAsset,
    )
    if (
      (completion.disposition === 'completed' ||
        completion.disposition === 'ready') &&
      completion.storage_path
    ) {
      return resultFromReadyPath(
        client,
        completion.storage_path,
        completion.disposition === 'completed' ? 'rendered' : 'ready',
      )
    }

    // The lease was replaced after expiring. Do not call acquire again here:
    // that could claim and then abandon a fresh lease. A bounded retry lets a
    // later request read the winner without this stale worker rendering again.
    throw new DashboardChartRenderPendingError(5)
  } catch (error) {
    await recordFailure(client, options.identity, claim.lease_token)
    throw error
  }
}
