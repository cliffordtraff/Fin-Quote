export interface BeehiivPublication {
  id: string
  name: string
  description: string | null
  url: string | null
}

export interface BeehiivIntegrationStatus {
  connected: boolean
  publication: BeehiivPublication | null
  connectedAt: string | null
  lastVerifiedAt: string | null
}

export type BeehiivLifecycleStatus =
  | 'draft'
  | 'scheduled'
  | 'published'
  | 'archived'
  | 'unknown'

export type BeehiivSyncOperationKind = 'create' | 'update'

export type BeehiivSyncState =
  | 'claimed'
  | 'creating'
  | 'updating'
  | 'remote_recorded'
  | 'completed'
  | 'failed'
  | 'ambiguous'

export interface BeehiivSyncOperationRecord {
  draftId: string
  ownerId: string
  publicationId: string
  operationKind: BeehiivSyncOperationKind
  operationKey: string
  contentHash: string
  title: string
  syncState: BeehiivSyncState
  remotePostId: string | null
  remotePreviewUrl: string | null
  remoteEditorUrl: string | null
  leaseToken: string | null
  leaseExpiresAt: string | null
  attemptCount: number
  lastError: string | null
  startedAt: string
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface BeehiivDeliveryRecord {
  id: string
  draftId: string
  ownerId: string
  publicationId: string
  postId: string
  title: string
  previewUrl: string | null
  editorUrl: string
  webUrl: string | null
  contentHash: string
  lifecycleStatus: BeehiivLifecycleStatus
  lifecycleAppliedStatus: BeehiivLifecycleStatus | null
  lifecycleAppliedAt: string | null
  beehiivStatus: string | null
  scheduledAt: string | null
  publishedAt: string | null
  stats: Record<string, unknown>
  syncedAt: string
  lastReconciledAt: string | null
  lastReconcileError: string | null
  createdAt: string
  updatedAt: string
}

export interface BeehiivPostState {
  postId: string
  status: string | null
  publishDate: string | null
  webUrl: string | null
  stats: Record<string, unknown> | null
}

export type BeehiivDeliveryMode = 'created' | 'updated' | 'unchanged'

export interface BeehiivDeliveryResponse {
  delivery: BeehiivDeliveryRecord
  mode: BeehiivDeliveryMode
}
