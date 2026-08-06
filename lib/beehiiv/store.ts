import type { OAuthClientInformationMixed, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'
import type { Database, Json } from '@/lib/database.types'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type {
  BeehiivLifecycleStatus,
  BeehiivDeliveryRecord,
  BeehiivIntegrationStatus,
  BeehiivPublication,
  BeehiivSyncOperationKind,
  BeehiivSyncOperationRecord,
  BeehiivSyncState,
} from './types'
import {
  decryptBeehiivPayload,
  encryptBeehiivPayload,
} from './crypto'
import type { BeehiivOAuthCredentials } from './oauth-provider'

const PROVIDER = 'beehiiv'

export class BeehiivReconciliationLeaseLostError extends Error {
  constructor() {
    super(
      'Beehiiv reconciliation lease expired or was superseded before the update could be applied.',
    )
    this.name = 'BeehiivReconciliationLeaseLostError'
  }
}

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
  lifecycle_applied_status: string | null
  lifecycle_applied_at: string | null
  beehiiv_status: string | null
  scheduled_at: string | null
  published_at: string | null
  web_url: string | null
  stats_json: unknown
  synced_at: string
  last_reconciled_at: string | null
  last_reconcile_error: string | null
  reconcile_lease_token: string | null
  reconcile_lease_expires_at: string | null
  created_at: string
  updated_at: string
}

interface BeehiivSyncOperationRow {
  draft_id: string
  owner_id: string
  publication_id: string
  operation_kind: string
  operation_key: string
  content_hash: string
  title: string
  sync_state: string
  remote_post_id: string | null
  remote_preview_url: string | null
  remote_editor_url: string | null
  lease_token: string | null
  lease_expires_at: string | null
  attempt_count: number
  last_error: string | null
  started_at: string
  completed_at: string | null
  created_at: string
  updated_at: string
}

type BeehiivSyncOperationUpdate =
  Database['public']['Tables']['newsletter_beehiiv_sync_operations']['Update']

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
    lifecycleAppliedStatus: row.lifecycle_applied_status as BeehiivLifecycleStatus | null,
    lifecycleAppliedAt: row.lifecycle_applied_at,
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

function mapSyncOperationRow(
  row: BeehiivSyncOperationRow,
): BeehiivSyncOperationRecord {
  return {
    draftId: row.draft_id,
    ownerId: row.owner_id,
    publicationId: row.publication_id,
    operationKind: row.operation_kind as BeehiivSyncOperationKind,
    operationKey: row.operation_key,
    contentHash: row.content_hash,
    title: row.title,
    syncState: row.sync_state as BeehiivSyncState,
    remotePostId: row.remote_post_id,
    remotePreviewUrl: row.remote_preview_url,
    remoteEditorUrl: row.remote_editor_url,
    leaseToken: row.lease_token,
    leaseExpiresAt: row.lease_expires_at,
    attemptCount: row.attempt_count,
    lastError: row.last_error,
    startedAt: row.started_at,
    completedAt: row.completed_at,
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
        publication_id: null,
        publication_name: null,
        publication_url: null,
        last_verified_at: null,
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

export async function claimBeehiivSyncOperation(input: {
  ownerId: string
  draftId: string
  publicationId: string
  operationKind: BeehiivSyncOperationKind
  operationKey: string
  contentHash: string
  title: string
  leaseToken: string
  leaseSeconds?: number
}): Promise<BeehiivSyncOperationRecord | null> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.rpc(
    'claim_newsletter_beehiiv_sync',
    {
      p_owner_id: input.ownerId,
      p_draft_id: input.draftId,
      p_publication_id: input.publicationId,
      p_operation_kind: input.operationKind,
      p_operation_key: input.operationKey,
      p_content_hash: input.contentHash,
      p_title: input.title,
      p_lease_token: input.leaseToken,
      p_lease_seconds: input.leaseSeconds ?? 90,
    },
  )
  if (error) {
    throw new Error(`Failed to claim Beehiiv sync: ${error.message}`)
  }
  const row = (data?.[0] ?? null) as BeehiivSyncOperationRow | null
  return row ? mapSyncOperationRow(row) : null
}

export async function getBeehiivSyncOperation(
  ownerId: string,
  draftId: string,
): Promise<BeehiivSyncOperationRecord | null> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('newsletter_beehiiv_sync_operations')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('draft_id', draftId)
    .maybeSingle()
  if (error) {
    throw new Error(`Failed to load Beehiiv sync state: ${error.message}`)
  }
  return data
    ? mapSyncOperationRow(data as BeehiivSyncOperationRow)
    : null
}

async function updateClaimedBeehiivSyncOperation(input: {
  ownerId: string
  draftId: string
  leaseToken: string
  values: BeehiivSyncOperationUpdate
}): Promise<BeehiivSyncOperationRecord> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('newsletter_beehiiv_sync_operations')
    .update(input.values)
    .eq('owner_id', input.ownerId)
    .eq('draft_id', input.draftId)
    .eq('lease_token', input.leaseToken)
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(
      `Failed to update Beehiiv sync claim: ${
        error?.message ?? 'The claim is no longer owned by this request'
      }`,
    )
  }
  return mapSyncOperationRow(data as BeehiivSyncOperationRow)
}

export async function beginBeehiivSyncRemoteCall(input: {
  ownerId: string
  draftId: string
  leaseToken: string
  operationKind: BeehiivSyncOperationKind
}): Promise<BeehiivSyncOperationRecord> {
  return updateClaimedBeehiivSyncOperation({
    ...input,
    values: {
      sync_state: input.operationKind === 'create' ? 'creating' : 'updating',
      last_error: null,
    },
  })
}

export async function recordBeehiivSyncRemoteResult(input: {
  ownerId: string
  draftId: string
  leaseToken: string
  postId: string
  previewUrl: string | null
  editorUrl: string
}): Promise<BeehiivSyncOperationRecord> {
  return updateClaimedBeehiivSyncOperation({
    ...input,
    values: {
      sync_state: 'remote_recorded',
      remote_post_id: input.postId,
      remote_preview_url: input.previewUrl,
      remote_editor_url: input.editorUrl,
      last_error: null,
    },
  })
}

export async function completeBeehiivSyncOperation(input: {
  ownerId: string
  draftId: string
  leaseToken: string
}): Promise<void> {
  await updateClaimedBeehiivSyncOperation({
    ...input,
    values: {
      sync_state: 'completed',
      lease_token: null,
      lease_expires_at: null,
      completed_at: new Date().toISOString(),
      last_error: null,
    },
  })
}

export async function recordBeehiivSyncFailure(input: {
  ownerId: string
  draftId: string
  leaseToken: string
  state: Extract<BeehiivSyncState, 'failed' | 'ambiguous'>
  error: string
}): Promise<void> {
  await updateClaimedBeehiivSyncOperation({
    ...input,
    values: {
      sync_state: input.state,
      lease_token: null,
      lease_expires_at: null,
      last_error: input.error,
    },
  })
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

export async function claimBeehiivDeliveriesForReconciliation(input: {
  leaseToken: string
  limit?: number
  leaseSeconds?: number
}): Promise<BeehiivDeliveryRecord[]> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.rpc(
    'claim_newsletter_beehiiv_reconciliation',
    {
      p_lease_token: input.leaseToken,
      p_limit: input.limit ?? 12,
      p_lease_seconds: input.leaseSeconds ?? 90,
    },
  )
  if (error) {
    throw new Error(`Failed to claim Beehiiv reconciliation: ${error.message}`)
  }
  return ((data ?? []) as BeehiivDeliveryRow[]).map(mapDeliveryRow)
}

export async function releaseBeehiivReconciliationLease(input: {
  ownerId: string
  draftId: string
  leaseToken: string
}): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('newsletter_beehiiv_deliveries')
    .update({
      reconcile_lease_token: null,
      reconcile_lease_expires_at: null,
    })
    .eq('owner_id', input.ownerId)
    .eq('draft_id', input.draftId)
    .eq('reconcile_lease_token', input.leaseToken)
  if (error) {
    throw new Error(`Failed to release Beehiiv reconciliation: ${error.message}`)
  }
}

export async function renewBeehiivReconciliationLease(input: {
  ownerId: string
  draftId: string
  leaseToken: string
  leaseSeconds?: number
}): Promise<BeehiivDeliveryRecord> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.rpc(
    'renew_newsletter_beehiiv_reconciliation',
    {
      p_owner_id: input.ownerId,
      p_draft_id: input.draftId,
      p_lease_token: input.leaseToken,
      p_lease_seconds: input.leaseSeconds ?? 90,
    },
  )
  const row = (data?.[0] ?? null) as BeehiivDeliveryRow | null
  if (error) {
    throw new Error(`Failed to renew Beehiiv reconciliation: ${error.message}`)
  }
  if (!row) throw new BeehiivReconciliationLeaseLostError()
  return mapDeliveryRow(row)
}

export async function updateBeehiivDeliveryLifecycle(input: {
  ownerId: string
  draftId: string
  postId: string
  leaseToken: string
  lifecycleStatus: BeehiivLifecycleStatus
  beehiivStatus: string | null
  scheduledAt: string | null
  publishedAt: string | null
  webUrl: string | null
  stats: Record<string, unknown>
  error?: string | null
}): Promise<BeehiivDeliveryRecord> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.rpc(
    'update_newsletter_beehiiv_lifecycle_claim',
    {
      p_owner_id: input.ownerId,
      p_draft_id: input.draftId,
      p_post_id: input.postId,
      p_lease_token: input.leaseToken,
      p_lifecycle_status: input.lifecycleStatus,
      p_beehiiv_status: input.beehiivStatus,
      p_scheduled_at: input.scheduledAt,
      p_published_at: input.publishedAt,
      p_web_url: input.webUrl,
      p_stats_json: input.stats as Json,
      p_error: input.error ?? null,
    },
  )
  const row = (data?.[0] ?? null) as BeehiivDeliveryRow | null

  if (error) {
    throw new Error(
      `Failed to update Beehiiv lifecycle: ${error.message}`,
    )
  }
  if (!row) throw new BeehiivReconciliationLeaseLostError()
  return mapDeliveryRow(row)
}

export async function markBeehiivLifecycleApplied(input: {
  ownerId: string
  draftId: string
  leaseToken: string
  lifecycleStatus: BeehiivLifecycleStatus
}): Promise<BeehiivDeliveryRecord> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.rpc(
    'mark_newsletter_beehiiv_lifecycle_applied',
    {
      p_owner_id: input.ownerId,
      p_draft_id: input.draftId,
      p_lease_token: input.leaseToken,
      p_lifecycle_status: input.lifecycleStatus,
    },
  )
  const row = (data?.[0] ?? null) as BeehiivDeliveryRow | null
  if (error) {
    throw new Error(
      `Failed to mark Beehiiv lifecycle applied: ${error.message}`,
    )
  }
  if (!row) throw new BeehiivReconciliationLeaseLostError()
  return mapDeliveryRow(row)
}

export async function recordBeehiivReconciliationError(input: {
  ownerId: string
  draftId: string
  leaseToken: string
  error: string
}): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase.rpc(
    'record_newsletter_beehiiv_reconcile_error',
    {
      p_owner_id: input.ownerId,
      p_draft_id: input.draftId,
      p_lease_token: input.leaseToken,
      p_error: input.error,
    },
  )
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
