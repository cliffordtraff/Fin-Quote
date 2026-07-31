import type { OAuthClientInformationMixed, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'
import type { Json } from '@/lib/database.types'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type {
  BeehiivLifecycleStatus,
  BeehiivDeliveryRecord,
  BeehiivIntegrationStatus,
  BeehiivPublication,
} from './types'
import {
  decryptBeehiivPayload,
  encryptBeehiivPayload,
} from './crypto'
import type { BeehiivOAuthCredentials } from './oauth-provider'

const PROVIDER = 'beehiiv'

interface BeehiivIntegrationRow {
  owner_id: string
  provider: string
  credentials_ciphertext: string
  publication_id: string | null
  publication_name: string | null
  publication_url: string | null
  connected_at: string
  last_verified_at: string | null
}

interface BeehiivDeliveryRow {
  id: string
  draft_id: string
  owner_id: string
  publication_id: string
  beehiiv_post_id: string
  title: string
  preview_url: string | null
  editor_url: string
  content_hash: string
  lifecycle_status: string
  beehiiv_status: string | null
  scheduled_at: string | null
  published_at: string | null
  web_url: string | null
  stats_json: unknown
  synced_at: string
  last_reconciled_at: string | null
  last_reconcile_error: string | null
  created_at: string
  updated_at: string
}

export interface BeehiivIntegrationRecord {
  ownerId: string
  credentials: BeehiivOAuthCredentials
  publication: BeehiivPublication | null
  connectedAt: string
  lastVerifiedAt: string | null
}

function mapPublication(
  row: BeehiivIntegrationRow,
): BeehiivPublication | null {
  if (!row.publication_id || !row.publication_name) return null
  return {
    id: row.publication_id,
    name: row.publication_name,
    description: null,
    url: row.publication_url,
  }
}

function mapIntegrationRow(
  row: BeehiivIntegrationRow,
): BeehiivIntegrationRecord {
  return {
    ownerId: row.owner_id,
    credentials: decryptBeehiivPayload<BeehiivOAuthCredentials>(
      row.credentials_ciphertext,
    ),
    publication: mapPublication(row),
    connectedAt: row.connected_at,
    lastVerifiedAt: row.last_verified_at,
  }
}

function mapDeliveryRow(row: BeehiivDeliveryRow): BeehiivDeliveryRecord {
  return {
    id: row.id,
    draftId: row.draft_id,
    ownerId: row.owner_id,
    publicationId: row.publication_id,
    postId: row.beehiiv_post_id,
    title: row.title,
    previewUrl: row.preview_url,
    editorUrl: row.editor_url,
    webUrl: row.web_url,
    contentHash: row.content_hash,
    lifecycleStatus: row.lifecycle_status as BeehiivLifecycleStatus,
    beehiivStatus: row.beehiiv_status,
    scheduledAt: row.scheduled_at,
    publishedAt: row.published_at,
    stats:
      row.stats_json &&
      typeof row.stats_json === 'object' &&
      !Array.isArray(row.stats_json)
        ? (row.stats_json as Record<string, unknown>)
        : {},
    syncedAt: row.synced_at,
    lastReconciledAt: row.last_reconciled_at,
    lastReconcileError: row.last_reconcile_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getBeehiivIntegration(
  ownerId: string,
): Promise<BeehiivIntegrationRecord | null> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('newsletter_integrations')
    .select(
      'owner_id, provider, credentials_ciphertext, publication_id, publication_name, publication_url, connected_at, last_verified_at',
    )
    .eq('owner_id', ownerId)
    .eq('provider', PROVIDER)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load Beehiiv connection: ${error.message}`)
  }
  return data ? mapIntegrationRow(data as BeehiivIntegrationRow) : null
}

export async function getBeehiivIntegrationStatus(
  ownerId: string,
): Promise<BeehiivIntegrationStatus> {
  const integration = await getBeehiivIntegration(ownerId)
  return {
    connected: Boolean(integration),
    publication: integration?.publication ?? null,
    connectedAt: integration?.connectedAt ?? null,
    lastVerifiedAt: integration?.lastVerifiedAt ?? null,
  }
}

export async function saveBeehiivIntegrationConnection(
  ownerId: string,
  credentials: BeehiivOAuthCredentials,
): Promise<void> {
  const supabase = createServiceRoleClient()
  const timestamp = new Date().toISOString()
  const { error } = await supabase
    .from('newsletter_integrations')
    .upsert(
      {
        owner_id: ownerId,
        provider: PROVIDER,
        credentials_ciphertext: encryptBeehiivPayload(credentials),
        connected_at: timestamp,
        updated_at: timestamp,
      },
      { onConflict: 'owner_id,provider' },
    )

  if (error) {
    throw new Error(`Failed to save Beehiiv connection: ${error.message}`)
  }
}

export async function saveBeehiivRefreshedCredentials(
  ownerId: string,
  redirectUri: string,
  clientInformation: OAuthClientInformationMixed,
  tokens: OAuthTokens,
): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('newsletter_integrations')
    .update({
      credentials_ciphertext: encryptBeehiivPayload({
        redirectUri,
        clientInformation,
        tokens,
      } satisfies BeehiivOAuthCredentials),
    })
    .eq('owner_id', ownerId)
    .eq('provider', PROVIDER)

  if (error) {
    throw new Error(`Failed to refresh Beehiiv connection: ${error.message}`)
  }
}

export async function saveBeehiivPublication(
  ownerId: string,
  publication: BeehiivPublication,
): Promise<void> {
  const timestamp = new Date().toISOString()
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('newsletter_integrations')
    .update({
      publication_id: publication.id,
      publication_name: publication.name,
      publication_url: publication.url,
      last_verified_at: timestamp,
    })
    .eq('owner_id', ownerId)
    .eq('provider', PROVIDER)

  if (error) {
    throw new Error(`Failed to save Beehiiv publication: ${error.message}`)
  }
}

export async function deleteBeehiivIntegration(ownerId: string): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('newsletter_integrations')
    .delete()
    .eq('owner_id', ownerId)
    .eq('provider', PROVIDER)

  if (error) {
    throw new Error(`Failed to disconnect Beehiiv: ${error.message}`)
  }
}

export async function getBeehiivDelivery(
  ownerId: string,
  draftId: string,
): Promise<BeehiivDeliveryRecord | null> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('newsletter_beehiiv_deliveries')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('draft_id', draftId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load Beehiiv delivery: ${error.message}`)
  }
  return data ? mapDeliveryRow(data as BeehiivDeliveryRow) : null
}

export async function listBeehiivDeliveries(
  ownerId: string,
  draftIds: string[] = [],
): Promise<BeehiivDeliveryRecord[]> {
  const normalizedIds = Array.from(new Set(draftIds.filter(Boolean)))
  if (draftIds.length > 0 && normalizedIds.length === 0) return []

  const supabase = createServiceRoleClient()
  let query = supabase
    .from('newsletter_beehiiv_deliveries')
    .select('*')
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false })
  if (normalizedIds.length > 0) {
    query = query.in('draft_id', normalizedIds)
  }
  const { data, error } = await query
  if (error) {
    throw new Error(`Failed to load Beehiiv deliveries: ${error.message}`)
  }
  return ((data ?? []) as BeehiivDeliveryRow[]).map(mapDeliveryRow)
}

export async function listBeehiivDeliveriesForReconciliation(
  limit = 12,
): Promise<BeehiivDeliveryRecord[]> {
  const supabase = createServiceRoleClient()
  const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString()
  const { data, error } = await supabase
    .from('newsletter_beehiiv_deliveries')
    .select('*')
    .in('lifecycle_status', ['draft', 'scheduled', 'unknown'])
    .or(
      `last_reconciled_at.is.null,last_reconciled_at.lt.${staleBefore}`,
    )
    .order('last_reconciled_at', {
      ascending: true,
      nullsFirst: true,
    })
    .limit(Math.max(1, Math.min(50, limit)))

  if (error) {
    throw new Error(
      `Failed to load Beehiiv reconciliation queue: ${error.message}`,
    )
  }
  return ((data ?? []) as BeehiivDeliveryRow[]).map(mapDeliveryRow)
}

export async function updateBeehiivDeliveryLifecycle(input: {
  ownerId: string
  draftId: string
  lifecycleStatus: BeehiivLifecycleStatus
  beehiivStatus: string | null
  scheduledAt: string | null
  publishedAt: string | null
  webUrl: string | null
  stats: Record<string, unknown>
  error?: string | null
}): Promise<BeehiivDeliveryRecord> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('newsletter_beehiiv_deliveries')
    .update({
      lifecycle_status: input.lifecycleStatus,
      beehiiv_status: input.beehiivStatus,
      scheduled_at: input.scheduledAt,
      published_at: input.publishedAt,
      web_url: input.webUrl,
      stats_json: input.stats as Json,
      last_reconciled_at: new Date().toISOString(),
      last_reconcile_error: input.error ?? null,
    })
    .eq('owner_id', input.ownerId)
    .eq('draft_id', input.draftId)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(
      `Failed to update Beehiiv lifecycle: ${
        error?.message ?? 'No row returned'
      }`,
    )
  }
  return mapDeliveryRow(data as BeehiivDeliveryRow)
}

export async function recordBeehiivReconciliationError(input: {
  ownerId: string
  draftId: string
  error: string
}): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('newsletter_beehiiv_deliveries')
    .update({
      last_reconciled_at: new Date().toISOString(),
      last_reconcile_error: input.error,
    })
    .eq('owner_id', input.ownerId)
    .eq('draft_id', input.draftId)
  if (error) {
    throw new Error(
      `Failed to record Beehiiv reconciliation error: ${error.message}`,
    )
  }
}

export async function saveBeehiivDelivery(input: {
  ownerId: string
  draftId: string
  publicationId: string
  postId: string
  title: string
  previewUrl: string | null
  editorUrl: string
  contentHash: string
}): Promise<BeehiivDeliveryRecord> {
  const timestamp = new Date().toISOString()
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('newsletter_beehiiv_deliveries')
    .upsert(
      {
        owner_id: input.ownerId,
        draft_id: input.draftId,
        publication_id: input.publicationId,
        beehiiv_post_id: input.postId,
        title: input.title,
        preview_url: input.previewUrl,
        editor_url: input.editorUrl,
        content_hash: input.contentHash,
        synced_at: timestamp,
      },
      { onConflict: 'draft_id' },
    )
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(
      `Failed to save Beehiiv delivery: ${error?.message ?? 'No row returned'}`,
    )
  }
  return mapDeliveryRow(data as BeehiivDeliveryRow)
}
