import type { Database, Json } from '@/lib/database.types'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type {
  NewsletterNotification,
  NewsletterNotificationSeverity,
  NewsletterNotificationType,
} from './daily-types'
import {
  getNewsletterDailyScopeKey,
} from './daily-runs'
import type { NewsletterDraftScope } from './drafts'

const TABLE = 'newsletter_notifications'

type NotificationRow =
  Database['public']['Tables']['newsletter_notifications']['Row']

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function mapRow(row: NotificationRow): NewsletterNotification {
  return {
    id: row.id,
    marketDate: row.market_date,
    type: row.notification_type as NewsletterNotificationType,
    severity: row.severity as NewsletterNotificationSeverity,
    title: row.title,
    message: row.message,
    actionUrl: row.action_url,
    metadata: isRecord(row.metadata_json) ? row.metadata_json : {},
    readAt: row.read_at,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at,
  }
}

export async function createNewsletterNotification(
  scope: NewsletterDraftScope,
  input: {
    marketDate: string
    type: NewsletterNotificationType
    severity: NewsletterNotificationSeverity
    title: string
    message: string
    actionUrl?: string | null
    metadata?: Record<string, unknown>
    dedupeKey: string
  },
): Promise<{ notification: NewsletterNotification; created: boolean }> {
  const supabase = createServiceRoleClient()
  const scopeKey = getNewsletterDailyScopeKey(scope)
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      scope_key: scopeKey,
      owner_id: scope.ownerId,
      session_id: scope.sessionId,
      market_date: input.marketDate,
      notification_type: input.type,
      severity: input.severity,
      title: input.title,
      message: input.message,
      action_url: input.actionUrl ?? null,
      metadata_json: (input.metadata ?? {}) as Json,
      dedupe_key: input.dedupeKey,
    })
    .select('*')
    .single()

  if (error?.code === '23505') {
    // A dedupe key identifies one operator-facing notification, not immutable
    // copy. Recovery runs must refresh stale counts and severity while keeping
    // the original read/delivery timestamps intact.
    const existing = await supabase
      .from(TABLE)
      .update({
        market_date: input.marketDate,
        notification_type: input.type,
        severity: input.severity,
        title: input.title,
        message: input.message,
        action_url: input.actionUrl ?? null,
        metadata_json: (input.metadata ?? {}) as Json,
      })
      .eq('scope_key', scopeKey)
      .eq('dedupe_key', input.dedupeKey)
      .select('*')
      .single()
    if (existing.error || !existing.data) {
      throw new Error(
        `Failed to refresh existing notification: ${
          existing.error?.message ?? 'No row returned'
        }`,
      )
    }
    return {
      notification: mapRow(existing.data as NotificationRow),
      created: false,
    }
  }
  if (error || !data) {
    throw new Error(
      `Failed to create newsletter notification: ${
        error?.message ?? 'No row returned'
      }`,
    )
  }

  // The database trigger writes or refreshes the durable webhook outbox in the
  // same transaction. Network delivery is deliberately decoupled from the
  // morning pipeline and handled by the bounded retry processor.
  return { notification: mapRow(data as NotificationRow), created: true }
}

export async function listNewsletterNotifications(
  scope: NewsletterDraftScope,
  options: { marketDate?: string; limit?: number } = {},
): Promise<NewsletterNotification[]> {
  const supabase = createServiceRoleClient()
  let query = supabase
    .from(TABLE)
    .select('*')
    .eq('scope_key', getNewsletterDailyScopeKey(scope))
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(50, options.limit ?? 12)))
  if (options.marketDate) {
    query = query.eq('market_date', options.marketDate)
  }
  const { data, error } = await query
  if (error) {
    throw new Error(`Failed to load newsletter notifications: ${error.message}`)
  }
  return ((data ?? []) as NotificationRow[]).map(mapRow)
}

export async function markNewsletterNotificationsRead(
  scope: NewsletterDraftScope,
  ids: string[],
): Promise<void> {
  const normalized = Array.from(new Set(ids.filter(Boolean)))
  if (normalized.length === 0) return
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from(TABLE)
    .update({ read_at: new Date().toISOString() })
    .eq('scope_key', getNewsletterDailyScopeKey(scope))
    .in('id', normalized)
  if (error) {
    throw new Error(`Failed to mark notifications read: ${error.message}`)
  }
}
