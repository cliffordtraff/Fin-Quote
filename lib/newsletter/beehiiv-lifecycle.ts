import { randomUUID } from 'crypto'
import type {
  BeehiivDeliveryRecord,
  BeehiivLifecycleStatus,
} from '@/lib/beehiiv/types'
import { getBeehiivPostState } from '@/lib/beehiiv/client'
import {
  claimBeehiivDeliveriesForReconciliation,
  markBeehiivLifecycleApplied,
  recordBeehiivReconciliationError,
  releaseBeehiivReconciliationLease,
  renewBeehiivReconciliationLease,
  updateBeehiivDeliveryLifecycle,
} from '@/lib/beehiiv/store'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  appendNewsletterDraftEvent,
  getNewsletterDraft,
} from './drafts'
import { recordNewsletterPublication } from './publication'

export function classifyBeehiivLifecycle(
  status: string | null,
  publishDate: string | null,
  now = new Date(),
): {
  lifecycleStatus: BeehiivLifecycleStatus
  scheduledAt: string | null
  publishedAt: string | null
} {
  const normalized = status?.trim().toLowerCase() ?? ''
  const parsedPublishDate = publishDate ? new Date(publishDate) : null
  const validPublishDate =
    parsedPublishDate && Number.isFinite(parsedPublishDate.getTime())
      ? parsedPublishDate.toISOString()
      : null

  if (normalized === 'archived') {
    return {
      lifecycleStatus: 'archived',
      scheduledAt: null,
      publishedAt: null,
    }
  }
  if (normalized === 'draft') {
    return {
      lifecycleStatus: 'draft',
      scheduledAt: null,
      publishedAt: null,
    }
  }
  if (
    normalized === 'scheduled' ||
    (normalized === 'confirmed' &&
      parsedPublishDate &&
      parsedPublishDate.getTime() > now.getTime())
  ) {
    return {
      lifecycleStatus: 'scheduled',
      scheduledAt: validPublishDate,
      publishedAt: null,
    }
  }
  if (
    normalized === 'published' ||
    normalized === 'sent' ||
    normalized === 'active' ||
    normalized === 'confirmed'
  ) {
    return {
      lifecycleStatus: 'published',
      scheduledAt: null,
      publishedAt: validPublishDate ?? now.toISOString(),
    }
  }
  return {
    lifecycleStatus: 'unknown',
    scheduledAt: null,
    publishedAt: null,
  }
}

async function loadDraftContext(delivery: BeehiivDeliveryRecord) {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('newsletter_drafts')
    .select('session_id, status')
    .eq('id', delivery.draftId)
    .eq('owner_id', delivery.ownerId)
    .maybeSingle()
  if (error) {
    throw new Error(`Failed to load newsletter draft context: ${error.message}`)
  }
  return data
}

function lifecycleEvent(
  status: BeehiivLifecycleStatus,
): 'beehiiv_scheduled' | 'beehiiv_published' | 'beehiiv_archived' | null {
  if (status === 'scheduled') return 'beehiiv_scheduled'
  if (status === 'published') return 'beehiiv_published'
  if (status === 'archived') return 'beehiiv_archived'
  return null
}

export async function reconcileBeehiivDelivery(
  delivery: BeehiivDeliveryRecord,
  input: { leaseToken: string; now?: Date },
): Promise<BeehiivDeliveryRecord> {
  const now = input.now ?? new Date()
  try {
    const state = await getBeehiivPostState(
      delivery.ownerId,
      delivery.publicationId,
      delivery.postId,
    )
    const lifecycle = classifyBeehiivLifecycle(
      state.status,
      state.publishDate,
      now,
    )
    const updated = await updateBeehiivDeliveryLifecycle({
      ownerId: delivery.ownerId,
      draftId: delivery.draftId,
      postId: delivery.postId,
      leaseToken: input.leaseToken,
      lifecycleStatus: lifecycle.lifecycleStatus,
      beehiivStatus: state.status,
      scheduledAt: lifecycle.scheduledAt,
      publishedAt: lifecycle.publishedAt,
      webUrl: state.webUrl,
      stats: state.stats ?? delivery.stats,
    })

    if (delivery.lifecycleAppliedStatus !== updated.lifecycleStatus) {
      await renewBeehiivReconciliationLease({
        ownerId: delivery.ownerId,
        draftId: delivery.draftId,
        leaseToken: input.leaseToken,
      })
      const context = await loadDraftContext(delivery)
      const event = lifecycleEvent(updated.lifecycleStatus)
      if (context) {
        const scope = {
          ownerId: delivery.ownerId,
          sessionId: context.session_id,
        }
        if (
          updated.lifecycleStatus === 'published' &&
          updated.webUrl &&
          context.status !== 'published'
        ) {
          try {
            await renewBeehiivReconciliationLease({
              ownerId: delivery.ownerId,
              draftId: delivery.draftId,
              leaseToken: input.leaseToken,
            })
            await recordNewsletterPublication(
              scope,
              delivery.draftId,
              updated.webUrl,
              updated.publishedAt
                ? new Date(updated.publishedAt)
                : now,
            )
          } catch (error) {
            // Saving a draft and appending its history are separate database
            // writes. If persistence succeeded before a history write failed,
            // verify the durable draft state and continue the idempotent
            // Beehiiv transition instead of stranding a published delivery.
            const persisted = await getNewsletterDraft(scope, delivery.draftId)
            if (
              persisted.status !== 'published' ||
              persisted.beehiivUrl !== new URL(updated.webUrl).toString()
            ) {
              throw error
            }
          }
        }
        if (event) {
          await renewBeehiivReconciliationLease({
            ownerId: delivery.ownerId,
            draftId: delivery.draftId,
            leaseToken: input.leaseToken,
          })
          await appendNewsletterDraftEvent(scope, delivery.draftId, {
            type: event,
            beehiivUrl: updated.webUrl,
            metadata: {
              beehiivPostId: updated.postId,
              beehiivStatus: updated.beehiivStatus,
              scheduledAt: updated.scheduledAt,
              publishedAt: updated.publishedAt,
            },
            dedupeKey: `beehiiv-lifecycle:${updated.postId}:${updated.lifecycleStatus}`,
          })
        }
      }
      await renewBeehiivReconciliationLease({
        ownerId: delivery.ownerId,
        draftId: delivery.draftId,
        leaseToken: input.leaseToken,
      })
      return markBeehiivLifecycleApplied({
        ownerId: updated.ownerId,
        draftId: updated.draftId,
        leaseToken: input.leaseToken,
        lifecycleStatus: updated.lifecycleStatus,
      })
    }
    return updated
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await recordBeehiivReconciliationError({
      ownerId: delivery.ownerId,
      draftId: delivery.draftId,
      leaseToken: input.leaseToken,
      error: message,
    }).catch(() => undefined)
    throw error
  }
}

export async function reconcileBeehiivDeliveryQueue(
  limit = 12,
  concurrency = 4,
): Promise<{
  attempted: number
  updated: number
  failed: Array<{ draftId: string; error: string }>
}> {
  const leaseToken = randomUUID()
  const deliveries = await claimBeehiivDeliveriesForReconciliation({
    leaseToken,
    limit,
  })
  let updated = 0
  const failed: Array<{ draftId: string; error: string }> = []
  const queue = [...deliveries]
  const workerCount = Math.max(1, Math.min(6, concurrency, queue.length || 1))
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (queue.length > 0) {
        const delivery = queue.shift()
        if (!delivery) return
        try {
          await reconcileBeehiivDelivery(delivery, { leaseToken })
          updated += 1
        } catch (error) {
          failed.push({
            draftId: delivery.draftId,
            error: error instanceof Error ? error.message : String(error),
          })
        } finally {
          await releaseBeehiivReconciliationLease({
            ownerId: delivery.ownerId,
            draftId: delivery.draftId,
            leaseToken,
          }).catch(() => undefined)
        }
      }
    }),
  )
  return { attempted: deliveries.length, updated, failed }
}
