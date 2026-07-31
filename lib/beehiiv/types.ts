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
  stats: Record<string, unknown>
}

export type BeehiivDeliveryMode = 'created' | 'updated' | 'unchanged'

export interface BeehiivDeliveryResponse {
  delivery: BeehiivDeliveryRecord
  mode: BeehiivDeliveryMode
}
