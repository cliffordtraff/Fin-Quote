import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type {
  NewsletterDraftDocument,
  NewsletterDraftSourceType,
  NewsletterDraftStatus,
  NewsletterDraftSummary,
} from './types'

const NEWSLETTER_DRAFTS_TABLE = 'newsletter_drafts'
const NEWSLETTER_DRAFT_SUMMARY_LOOKUP_CHUNK_SIZE = 100
const NEWSLETTER_DRAFT_SUMMARY_COLUMNS =
  'id,ticker,status,source_type,source_review_key,beehiiv_url,published_at,archived_at,format,featured_tickers,generated_at,block_count,attached_chart_count,subject_line,created_at,updated_at'
const NEWSLETTER_DRAFT_SESSION_MIGRATION_HINT =
  'Newsletter drafts are missing the anonymous-session migration. Run supabase migration 20260326000003_allow_anonymous_newsletter_drafts.sql.'

export interface NewsletterDraftSummaryReadScope {
  ownerId: string
}

interface NewsletterDraftSummaryRow {
  id: string
  ticker: string
  status: NewsletterDraftStatus
  source_type: NewsletterDraftSourceType
  source_review_key: string | null
  beehiiv_url: string | null
  published_at: string | null
  archived_at: string | null
  format: NewsletterDraftDocument['format']
  featured_tickers: string[]
  generated_at: string
  block_count: number
  attached_chart_count: number
  subject_line: string
  created_at: string
  updated_at: string
}

function formatNewsletterDraftStorageError(message: string): string {
  const normalized = message.toLowerCase()
  if (
    normalized.includes('newsletter_drafts') &&
    normalized.includes('session_id')
  ) {
    return NEWSLETTER_DRAFT_SESSION_MIGRATION_HINT
  }
  return message
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Missing Supabase service role configuration for newsletter drafts',
    )
  }

  return createSupabaseClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function normalizeLookupValues(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function sortRows(rows: NewsletterDraftSummaryRow[]) {
  return rows.sort((left, right) => {
    const updatedOrder = right.updated_at.localeCompare(left.updated_at)
    return updatedOrder || right.id.localeCompare(left.id)
  })
}

function mapRow(row: NewsletterDraftSummaryRow): NewsletterDraftSummary {
  return {
    id: row.id,
    ticker: row.ticker,
    format: row.format,
    featuredTickers: row.featured_tickers,
    status: row.status,
    sourceType: row.source_type,
    sourceReviewKey: row.source_review_key,
    beehiivUrl: row.beehiiv_url,
    publishedAt: row.published_at,
    archivedAt: row.archived_at,
    attachedChartCount: row.attached_chart_count,
    subjectLine: row.subject_line,
    generatedAt: row.generated_at,
    blockCount: row.block_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Read only the scalar draft fields needed by the Why Moved review queue.
 *
 * This deliberately accepts an authenticated owner scope. Anonymous draft
 * storage is a separate local-development concern and importing that machinery
 * here would pull the full draft generation/capture graph into the admin page.
 */
export async function listNewsletterDraftSummariesBySourceReviewKeys(
  scope: NewsletterDraftSummaryReadScope,
  rawSourceReviewKeys: string[],
  signal?: AbortSignal,
): Promise<NewsletterDraftSummary[]> {
  signal?.throwIfAborted()
  const sourceReviewKeys = normalizeLookupValues(rawSourceReviewKeys)
  if (sourceReviewKeys.length === 0) return []

  const chunks = Array.from(
    {
      length: Math.ceil(
        sourceReviewKeys.length /
          NEWSLETTER_DRAFT_SUMMARY_LOOKUP_CHUNK_SIZE,
      ),
    },
    (_, index) =>
      sourceReviewKeys.slice(
        index * NEWSLETTER_DRAFT_SUMMARY_LOOKUP_CHUNK_SIZE,
        (index + 1) * NEWSLETTER_DRAFT_SUMMARY_LOOKUP_CHUNK_SIZE,
      ),
  )
  const supabase = getServiceClient()
  const rowGroups = await Promise.all(
    chunks.map(async (chunk) => {
      signal?.throwIfAborted()
      let query = supabase
        .from(NEWSLETTER_DRAFTS_TABLE)
        .select(NEWSLETTER_DRAFT_SUMMARY_COLUMNS)
        .in('source_review_key', chunk)
        .eq('owner_id', scope.ownerId)
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false })

      if (signal) query = query.abortSignal(signal)
      const { data, error } = await query
      if (error) {
        throw new Error(
          `Failed to look up newsletter drafts: ${formatNewsletterDraftStorageError(error.message)}`,
        )
      }
      return (data ?? []) as NewsletterDraftSummaryRow[]
    }),
  )

  signal?.throwIfAborted()
  return sortRows(rowGroups.flat()).map(mapRow)
}
