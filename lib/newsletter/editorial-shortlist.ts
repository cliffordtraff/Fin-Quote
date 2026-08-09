import type { Database, Json } from '@/lib/database.types'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { sha256Hex } from './sha256'
import {
  buildNewsletterEditorialShortlistEvidence,
  fingerprintNewsletterEditorialShortlistEvidence,
  type NewsletterEditorialShortlistEvidence,
} from './editorial-shortlist-evidence'
import {
  getNewsletterDailyRun,
  NewsletterDailyRunNotFoundError,
  type NewsletterDailyReadScope,
} from './daily-runs-read'
import type {
  NewsletterDailyRun,
  NewsletterDailyRunItem,
} from './daily-types'
import {
  NEWSLETTER_SHORTLIST_ALGORITHM_VERSION,
  selectNewsletterRecommendedIssues,
} from './shortlist'

export const NEWSLETTER_EDITORIAL_SHORTLIST_MAX_ITEMS = 5

export const NEWSLETTER_EDITORIAL_SHORTLIST_REASON_CODES = [
  'stronger_catalyst',
  'better_source_depth',
  'fresh_earnings',
  'audience_fit',
  'chart_quality',
  'duplicate_coverage',
  'weak_evidence',
  'stale_story',
  'other',
] as const

export type NewsletterEditorialShortlistReasonCode =
  (typeof NEWSLETTER_EDITORIAL_SHORTLIST_REASON_CODES)[number]

export type NewsletterEditorialShortlistDecision =
  | 'retained'
  | 'promoted'
  | 'demoted'
  | 'removed'
  | 'added'

export type { NewsletterEditorialShortlistEvidence }

export interface NewsletterEditorialShortlistEntry {
  itemId: string
  ticker: string
  baselinePosition: number | null
  selectedPosition: number | null
  decision: NewsletterEditorialShortlistDecision
  reasonCode: NewsletterEditorialShortlistReasonCode | null
  note: string | null
  evidence: NewsletterEditorialShortlistEvidence
}

export interface NewsletterEditorialShortlistBaseline {
  algorithmVersion: string
  itemIds: string[]
  fingerprint: string
}

export interface NewsletterEditorialShortlistPresentedItem {
  itemId: string
  status: NewsletterDailyRunItem['status']
  qualityBand: NewsletterDailyRunItem['qualityBand']
  draftId: string | null
  rank: number
  relevanceScore: number
  confidenceScore: number
  evidenceFingerprint: string
}

export interface NewsletterEditorialShortlistPresentation {
  baseline: NewsletterEditorialShortlistBaseline
  catalog: NewsletterEditorialShortlistPresentedItem[]
}

export interface NewsletterEditorialShortlistRevision {
  id: string
  runId: string
  revision: number
  algorithmVersion: string
  baselineFingerprint: string
  actorId: string | null
  baselineItemIds: string[]
  selectedItemIds: string[]
  entries: NewsletterEditorialShortlistEntry[]
  createdAt: string
}

export type NewsletterEditorialShortlistIntentKind =
  | 'added'
  | 'removed'
  | 'moved'

export interface NewsletterEditorialShortlistIntentInput {
  itemId: string
  kind: NewsletterEditorialShortlistIntentKind
  reasonCode: NewsletterEditorialShortlistReasonCode
  note?: string | null
}

export interface SaveNewsletterEditorialShortlistInput {
  runId: string
  expectedRevision: number
  presentation: NewsletterEditorialShortlistPresentation
  selectedItemIds: string[]
  intents?: NewsletterEditorialShortlistIntentInput[]
  idempotencyKey: string
  signal?: AbortSignal
}

export class NewsletterEditorialShortlistValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NewsletterEditorialShortlistValidationError'
  }
}

export class NewsletterEditorialShortlistNotFoundError extends Error {
  constructor(runId: string) {
    super(`Newsletter daily run not found: ${runId}`)
    this.name = 'NewsletterEditorialShortlistNotFoundError'
  }
}

export class NewsletterEditorialShortlistConflictError extends Error {
  readonly currentRevision: number | null

  constructor(message: string, currentRevision: number | null = null) {
    super(message)
    this.name = 'NewsletterEditorialShortlistConflictError'
    this.currentRevision = currentRevision
  }
}

type ShortlistRevisionRow =
  Database['public']['Tables']['newsletter_editorial_shortlist_revisions']['Row']
type ShortlistEntryRow =
  Database['public']['Tables']['newsletter_editorial_shortlist_entries']['Row']

const reasonCodeSet = new Set<string>(
  NEWSLETTER_EDITORIAL_SHORTLIST_REASON_CODES,
)
const selectableStatuses = new Set<NewsletterDailyRunItem['status']>([
  'generated',
  'ready',
  'needs_attention',
  'published',
])

function normalizeId(value: string, label: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new NewsletterEditorialShortlistValidationError(`${label} is required`)
  }
  return normalized
}

function normalizeNote(value: string | null | undefined): string | null {
  const normalized = value?.trim() || null
  if (normalized && normalized.length > 500) {
    throw new NewsletterEditorialShortlistValidationError(
      'Editorial shortlist notes cannot exceed 500 characters',
    )
  }
  return normalized
}

function evidenceFingerprint(
  run: NewsletterDailyRun,
  item: NewsletterDailyRunItem,
): string {
  return fingerprintNewsletterEditorialShortlistEvidence(
    buildNewsletterEditorialShortlistEvidence(run, item),
  )
}

export function buildNewsletterEditorialShortlistBaseline(
  run: NewsletterDailyRun,
): NewsletterEditorialShortlistBaseline {
  const itemById = new Map(run.items.map((item) => [item.id, item]))
  const itemIds = selectNewsletterRecommendedIssues(
    run.items,
    NEWSLETTER_EDITORIAL_SHORTLIST_MAX_ITEMS,
  ).map((entry) => entry.itemId)
  const evidence = itemIds.map((itemId) => {
    const item = itemById.get(itemId)
    if (!item) {
      throw new NewsletterEditorialShortlistValidationError(
        `Baseline shortlist item is missing from this run: ${itemId}`,
      )
    }
    return buildNewsletterEditorialShortlistEvidence(run, item)
  })
  const fingerprint = sha256Hex(JSON.stringify({
    algorithmVersion: NEWSLETTER_SHORTLIST_ALGORITHM_VERSION,
    runId: run.id,
    marketDate: run.marketDate,
    evidence,
  }))
  return {
    algorithmVersion: NEWSLETTER_SHORTLIST_ALGORITHM_VERSION,
    itemIds,
    fingerprint,
  }
}

export function buildNewsletterEditorialShortlistPresentation(
  run: NewsletterDailyRun,
): NewsletterEditorialShortlistPresentation {
  return {
    baseline: buildNewsletterEditorialShortlistBaseline(run),
    catalog: [...run.items]
      .sort((left, right) => {
        if (left.rank !== right.rank) return left.rank - right.rank
        return left.id.localeCompare(right.id)
      })
      .map((item) => ({
        itemId: item.id,
        status: item.status,
        qualityBand: item.qualityBand,
        draftId: item.draftId,
        rank: item.rank,
        relevanceScore: item.relevanceScore,
        confidenceScore: item.confidenceScore,
        evidenceFingerprint: evidenceFingerprint(run, item),
      })),
  }
}

function assertPresentedBaseline(
  run: NewsletterDailyRun,
  presented: NewsletterEditorialShortlistBaseline,
): NewsletterEditorialShortlistBaseline {
  const current = buildNewsletterEditorialShortlistBaseline(run)
  const presentedItemIds = presented.itemIds.map((itemId) =>
    normalizeId(itemId, 'Presented baseline item id'))
  if (
    presented.algorithmVersion !== current.algorithmVersion ||
    presented.fingerprint !== current.fingerprint ||
    presentedItemIds.length !== current.itemIds.length ||
    presentedItemIds.some((itemId, index) => itemId !== current.itemIds[index])
  ) {
    throw new NewsletterEditorialShortlistConflictError(
      'The algorithm suggestion changed after it was presented. Reload the current shortlist before saving editorial decisions.',
    )
  }
  return {
    algorithmVersion: presented.algorithmVersion,
    itemIds: presentedItemIds,
    fingerprint: presented.fingerprint,
  }
}

function assertPresentedCatalog(
  run: NewsletterDailyRun,
  presented: NewsletterEditorialShortlistPresentation,
): NewsletterEditorialShortlistPresentation {
  const baseline = assertPresentedBaseline(run, presented.baseline)
  const current = buildNewsletterEditorialShortlistPresentation(run)
  const presentedCatalog = [...presented.catalog].sort((left, right) =>
    left.itemId.localeCompare(right.itemId))
  const currentCatalog = [...current.catalog].sort((left, right) =>
    left.itemId.localeCompare(right.itemId))
  if (
    presentedCatalog.length !== currentCatalog.length ||
    presentedCatalog.some((item, index) => {
      const latest = currentCatalog[index]
      return !latest ||
        item.itemId !== latest.itemId ||
        item.status !== latest.status ||
        item.qualityBand !== latest.qualityBand ||
        item.draftId !== latest.draftId ||
        item.rank !== latest.rank ||
        item.relevanceScore !== latest.relevanceScore ||
        item.confidenceScore !== latest.confidenceScore
    })
  ) {
    throw new NewsletterEditorialShortlistConflictError(
      'The Morning Report changed after this shortlist was presented. Reload before saving editorial decisions.',
    )
  }
  return { baseline, catalog: presentedCatalog }
}

function assertPresentedEvidenceForItems(
  run: NewsletterDailyRun,
  presentation: NewsletterEditorialShortlistPresentation,
  itemIds: string[],
): void {
  const presented = new Map(
    presentation.catalog.map((item) => [item.itemId, item.evidenceFingerprint]),
  )
  const current = new Map(
    run.items.map((item) => [item.id, evidenceFingerprint(run, item)]),
  )
  for (const itemId of itemIds) {
    if (!presented.has(itemId) || presented.get(itemId) !== current.get(itemId)) {
      throw new NewsletterEditorialShortlistConflictError(
        `Shortlist evidence changed after it was presented for item ${itemId}`,
      )
    }
  }
}

function relativeCommonPositions(
  baselineIds: string[],
  selectedIds: string[],
): {
  baseline: Map<string, number>
  selected: Map<string, number>
} {
  const selectedSet = new Set(selectedIds)
  const baselineSet = new Set(baselineIds)
  const commonBaseline = baselineIds.filter((id) => selectedSet.has(id))
  const commonSelected = selectedIds.filter((id) => baselineSet.has(id))
  return {
    baseline: new Map(commonBaseline.map((id, index) => [id, index + 1])),
    selected: new Map(commonSelected.map((id, index) => [id, index + 1])),
  }
}

function classifyDecision(input: {
  itemId: string
  baselinePosition: number | null
  selectedPosition: number | null
  commonBaselinePosition: number | null
  commonSelectedPosition: number | null
  explicitMove: boolean
}): NewsletterEditorialShortlistDecision {
  if (input.baselinePosition == null) return 'added'
  if (input.selectedPosition == null) return 'removed'
  if (!input.explicitMove) {
    return 'retained'
  }
  const before = input.commonBaselinePosition ?? input.baselinePosition
  const after = input.commonSelectedPosition ?? input.selectedPosition
  return after < before
    ? 'promoted'
    : 'demoted'
}

export function buildNewsletterEditorialShortlistEntries(input: {
  run: NewsletterDailyRun
  presentation: NewsletterEditorialShortlistPresentation
  selectedItemIds: string[]
  intents?: NewsletterEditorialShortlistIntentInput[]
}): NewsletterEditorialShortlistEntry[] {
  const selectedItemIds = input.selectedItemIds.map((id) =>
    normalizeId(id, 'Selected item id'))
  if (selectedItemIds.length > NEWSLETTER_EDITORIAL_SHORTLIST_MAX_ITEMS) {
    throw new NewsletterEditorialShortlistValidationError(
      `An editorial shortlist can contain at most ${NEWSLETTER_EDITORIAL_SHORTLIST_MAX_ITEMS} issues`,
    )
  }
  if (new Set(selectedItemIds).size !== selectedItemIds.length) {
    throw new NewsletterEditorialShortlistValidationError(
      'Editorial shortlist item ids must be unique',
    )
  }

  const baselineItemIds = assertPresentedCatalog(
    input.run,
    input.presentation,
  ).baseline.itemIds
  const itemsById = new Map(input.run.items.map((item) => [item.id, item]))
  for (const itemId of selectedItemIds) {
    const item = itemsById.get(itemId)
    if (
      !item ||
      item.runId !== input.run.id ||
      !item.draftId ||
      !selectableStatuses.has(item.status)
    ) {
      throw new NewsletterEditorialShortlistValidationError(
        `Selected shortlist item is not an actionable issue in this run: ${itemId}`,
      )
    }
  }

  const baselinePositions = new Map(
    baselineItemIds.map((itemId, index) => [itemId, index + 1]),
  )
  const selectedPositions = new Map(
    selectedItemIds.map((itemId, index) => [itemId, index + 1]),
  )
  const commonPositions = relativeCommonPositions(
    baselineItemIds,
    selectedItemIds,
  )

  const intents = new Map<string, NewsletterEditorialShortlistIntentInput>()
  for (const intent of input.intents ?? []) {
    const itemId = normalizeId(intent.itemId, 'Intent item id')
    if (intents.has(itemId)) {
      throw new NewsletterEditorialShortlistValidationError(
        `Editorial intent is duplicated for item ${itemId}`,
      )
    }
    if (!['added', 'removed', 'moved'].includes(intent.kind)) {
      throw new NewsletterEditorialShortlistValidationError(
        `Unknown editorial shortlist intent: ${intent.kind}`,
      )
    }
    if (!reasonCodeSet.has(intent.reasonCode)) {
      throw new NewsletterEditorialShortlistValidationError(
        `Unknown editorial shortlist reason: ${intent.reasonCode}`,
      )
    }
    intents.set(itemId, {
      itemId,
      kind: intent.kind,
      reasonCode: intent.reasonCode,
      note: normalizeNote(intent.note),
    })
  }

  const unionIds = [
    ...baselineItemIds,
    ...selectedItemIds.filter((itemId) => !baselinePositions.has(itemId)),
  ]
  assertPresentedEvidenceForItems(input.run, input.presentation, unionIds)
  for (const intentItemId of intents.keys()) {
    if (!unionIds.includes(intentItemId)) {
      throw new NewsletterEditorialShortlistValidationError(
        `Editorial intent does not belong to this shortlist: ${intentItemId}`,
      )
    }
  }

  const movedIds = new Set<string>()
  for (const itemId of unionIds) {
    const baselinePosition = baselinePositions.get(itemId) ?? null
    const selectedPosition = selectedPositions.get(itemId) ?? null
    const intent = intents.get(itemId)
    const requiredKind = baselinePosition == null
      ? 'added'
      : selectedPosition == null
        ? 'removed'
        : null
    if (requiredKind && intent?.kind !== requiredKind) {
      throw new NewsletterEditorialShortlistValidationError(
        `Record an explicit ${requiredKind} intent for shortlist item ${itemId}`,
      )
    }
    if (!requiredKind && intent?.kind === 'moved') {
      const commonBefore = commonPositions.baseline.get(itemId)
      const commonAfter = commonPositions.selected.get(itemId)
      if (commonBefore === commonAfter) {
        throw new NewsletterEditorialShortlistValidationError(
          `Moved shortlist item did not change position: ${itemId}`,
        )
      }
      movedIds.add(itemId)
    } else if (!requiredKind && intent) {
      throw new NewsletterEditorialShortlistValidationError(
        `Editorial intent ${intent.kind} does not match shortlist item ${itemId}`,
      )
    }
  }

  const commonBaselineIds = baselineItemIds.filter((id) =>
    selectedPositions.has(id))
  const selectedCommonPosition = new Map(
    selectedItemIds
      .filter((id) => baselinePositions.has(id))
      .map((id, index) => [id, index]),
  )
  for (let leftIndex = 0; leftIndex < commonBaselineIds.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < commonBaselineIds.length;
      rightIndex += 1
    ) {
      const leftId = commonBaselineIds[leftIndex]
      const rightId = commonBaselineIds[rightIndex]
      if (
        selectedCommonPosition.get(leftId)! >
          selectedCommonPosition.get(rightId)! &&
        !movedIds.has(leftId) &&
        !movedIds.has(rightId)
      ) {
        throw new NewsletterEditorialShortlistValidationError(
          'Every direct reorder must identify the item the editor intentionally moved',
        )
      }
    }
  }

  return unionIds.map((itemId) => {
    const item = itemsById.get(itemId)
    if (!item) {
      throw new NewsletterEditorialShortlistValidationError(
        `Baseline shortlist item is missing from this run: ${itemId}`,
      )
    }
    const baselinePosition = baselinePositions.get(itemId) ?? null
    const selectedPosition = selectedPositions.get(itemId) ?? null
    const decision = classifyDecision({
      itemId,
      baselinePosition,
      selectedPosition,
      commonBaselinePosition: commonPositions.baseline.get(itemId) ?? null,
      commonSelectedPosition: commonPositions.selected.get(itemId) ?? null,
      explicitMove: movedIds.has(itemId),
    })
    const intent = intents.get(itemId)
    if (intent?.reasonCode === 'other' && !intent.note) {
      throw new NewsletterEditorialShortlistValidationError(
        `Add a note for the “other” shortlist reason on ${item.ticker}`,
      )
    }

    return {
      itemId,
      ticker: item.ticker,
      baselinePosition,
      selectedPosition,
      decision,
      reasonCode: intent?.reasonCode ?? null,
      note: intent?.note ?? null,
      evidence: buildNewsletterEditorialShortlistEvidence(input.run, item),
    }
  })
}

function databaseEntry(entry: NewsletterEditorialShortlistEntry): Json {
  return {
    item_id: entry.itemId,
    baseline_position: entry.baselinePosition,
    selected_position: entry.selectedPosition,
    decision: entry.decision,
    reason_code: entry.reasonCode,
    note: entry.note,
    item_updated_at: entry.evidence.itemUpdatedAt,
    draft_updated_at: entry.evidence.draftUpdatedAt,
    evidence_snapshot: entry.evidence as unknown as Json,
  }
}

function parseEvidence(value: Json): NewsletterEditorialShortlistEvidence {
  const evidence = value as unknown as NewsletterEditorialShortlistEvidence
  return {
    ...evidence,
    sourceKinds: Array.isArray(evidence.sourceKinds)
      ? evidence.sourceKinds.filter((kind): kind is string =>
          typeof kind === 'string')
      : [],
  }
}

function mapEntryRow(row: ShortlistEntryRow): NewsletterEditorialShortlistEntry {
  const evidence = parseEvidence(row.evidence_snapshot)
  return {
    itemId: row.item_id,
    ticker: evidence.ticker,
    baselinePosition: row.baseline_position,
    selectedPosition: row.selected_position,
    decision: row.decision as NewsletterEditorialShortlistDecision,
    reasonCode: row.reason_code as NewsletterEditorialShortlistReasonCode | null,
    note: row.note,
    evidence,
  }
}

async function assertNewsletterEditorialShortlistRunScope(
  scope: NewsletterDailyReadScope,
  runId: string,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted()
  const supabase = createServiceRoleClient()
  let query = supabase
    .from('newsletter_daily_runs')
    .select('id')
    .eq('id', runId)
  query = scope.ownerId
    ? query.eq('owner_id', scope.ownerId)
    : query.is('owner_id', null).eq('session_id', scope.sessionId)
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query.maybeSingle()
  if (error) {
    throw new Error(`Failed to verify editorial shortlist scope: ${error.message}`)
  }
  if (!data) throw new NewsletterEditorialShortlistNotFoundError(runId)
}

async function loadNewsletterEditorialShortlistRevision(
  runId: string,
  revisionId: string,
  signal?: AbortSignal,
): Promise<NewsletterEditorialShortlistRevision> {
  signal?.throwIfAborted()
  const supabase = createServiceRoleClient()
  let revisionQuery = supabase
    .from('newsletter_editorial_shortlist_revisions')
    .select(
      'id,run_id,revision,algorithm_version,baseline_fingerprint,actor_id,idempotency_key,request_payload,baseline_count,selected_count,created_at',
    )
    .eq('id', revisionId)
    .eq('run_id', runId)
  let entriesQuery = supabase
    .from('newsletter_editorial_shortlist_entries')
    .select(
      'revision_id,item_id,baseline_position,selected_position,decision,reason_code,note,evidence_snapshot,created_at',
    )
    .eq('revision_id', revisionId)
  if (signal) {
    revisionQuery = revisionQuery.abortSignal(signal)
    entriesQuery = entriesQuery.abortSignal(signal)
  }
  const [revisionResult, entriesResult] = await Promise.all([
    revisionQuery.maybeSingle(),
    entriesQuery,
  ])
  if (revisionResult.error || entriesResult.error) {
    throw new Error(
      `Failed to load editorial shortlist: ${
        revisionResult.error?.message ?? entriesResult.error?.message
      }`,
    )
  }
  if (!revisionResult.data) {
    throw new NewsletterEditorialShortlistNotFoundError(runId)
  }

  const revision = revisionResult.data as ShortlistRevisionRow
  const entries = ((entriesResult.data ?? []) as ShortlistEntryRow[])
    .map(mapEntryRow)
    .sort((left, right) => {
      const leftPosition = left.selectedPosition ?? left.baselinePosition ?? 99
      const rightPosition = right.selectedPosition ?? right.baselinePosition ?? 99
      if (leftPosition !== rightPosition) return leftPosition - rightPosition
      return left.itemId.localeCompare(right.itemId)
    })

  return {
    id: revision.id,
    runId: revision.run_id,
    revision: revision.revision,
    algorithmVersion: revision.algorithm_version,
    baselineFingerprint: revision.baseline_fingerprint,
    actorId: revision.actor_id,
    baselineItemIds: entries
      .filter((entry) => entry.baselinePosition != null)
      .sort((left, right) => left.baselinePosition! - right.baselinePosition!)
      .map((entry) => entry.itemId),
    selectedItemIds: entries
      .filter((entry) => entry.selectedPosition != null)
      .sort((left, right) => left.selectedPosition! - right.selectedPosition!)
      .map((entry) => entry.itemId),
    entries,
    createdAt: revision.created_at,
  }
}

export async function getNewsletterEditorialShortlist(
  scope: NewsletterDailyReadScope,
  runId: string,
  signal?: AbortSignal,
): Promise<NewsletterEditorialShortlistRevision | null> {
  const normalizedRunId = normalizeId(runId, 'Run id')
  await assertNewsletterEditorialShortlistRunScope(
    scope,
    normalizedRunId,
    signal,
  )
  signal?.throwIfAborted()
  const supabase = createServiceRoleClient()
  let query = supabase
    .from('newsletter_editorial_shortlist_heads')
    .select('revision_id')
    .eq('run_id', normalizedRunId)
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query.maybeSingle()
  if (error) {
    throw new Error(`Failed to load editorial shortlist head: ${error.message}`)
  }
  if (!data) return null
  return loadNewsletterEditorialShortlistRevision(
    normalizedRunId,
    data.revision_id,
    signal,
  )
}

function conflictRevision(message: string): number | null {
  const match = message.match(/current (\d+)/i)
  return match ? Number(match[1]) : null
}

function normalizePresentationForCommand(
  presentation: NewsletterEditorialShortlistPresentation,
): NewsletterEditorialShortlistPresentation {
  const algorithmVersion = presentation.baseline.algorithmVersion.trim()
  const fingerprint = presentation.baseline.fingerprint.trim().toLowerCase()
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(algorithmVersion)) {
    throw new NewsletterEditorialShortlistValidationError(
      'Presented shortlist algorithm version is invalid',
    )
  }
  if (!/^[0-9a-f]{64}$/.test(fingerprint)) {
    throw new NewsletterEditorialShortlistValidationError(
      'Presented shortlist fingerprint is invalid',
    )
  }
  const itemIds = presentation.baseline.itemIds.map((itemId) =>
    normalizeId(itemId, 'Presented baseline item id'))
  if (
    itemIds.length > NEWSLETTER_EDITORIAL_SHORTLIST_MAX_ITEMS ||
    new Set(itemIds).size !== itemIds.length
  ) {
    throw new NewsletterEditorialShortlistValidationError(
      'Presented baseline item ids are invalid',
    )
  }

  const catalog = presentation.catalog.map((item) => ({
    itemId: normalizeId(item.itemId, 'Presented catalog item id'),
    status: item.status,
    qualityBand: item.qualityBand,
    draftId: item.draftId ? normalizeId(item.draftId, 'Presented draft id') : null,
    rank: item.rank,
    relevanceScore: item.relevanceScore,
    confidenceScore: item.confidenceScore,
    evidenceFingerprint: item.evidenceFingerprint.trim().toLowerCase(),
  })).sort((left, right) => left.itemId.localeCompare(right.itemId))
  if (
    catalog.length > 50 ||
    new Set(catalog.map((item) => item.itemId)).size !== catalog.length ||
    catalog.some((item) =>
      !Number.isInteger(item.rank) ||
      item.rank < 1 ||
      !Number.isFinite(item.relevanceScore) ||
      !Number.isFinite(item.confidenceScore) ||
      !/^[0-9a-f]{64}$/.test(item.evidenceFingerprint))
  ) {
    throw new NewsletterEditorialShortlistValidationError(
      'Presented shortlist catalog is invalid',
    )
  }
  return {
    baseline: { algorithmVersion, itemIds, fingerprint },
    catalog,
  }
}

function normalizeIntentsForCommand(
  intents: NewsletterEditorialShortlistIntentInput[] | undefined,
): NewsletterEditorialShortlistIntentInput[] {
  const normalized = (intents ?? []).map((intent) => ({
    itemId: normalizeId(intent.itemId, 'Intent item id'),
    kind: intent.kind,
    reasonCode: intent.reasonCode,
    note: normalizeNote(intent.note),
  })).sort((left, right) => left.itemId.localeCompare(right.itemId))
  if (new Set(normalized.map((intent) => intent.itemId)).size !== normalized.length) {
    throw new NewsletterEditorialShortlistValidationError(
      'Editorial shortlist intents must be unique by item',
    )
  }
  for (const intent of normalized) {
    if (!['added', 'removed', 'moved'].includes(intent.kind)) {
      throw new NewsletterEditorialShortlistValidationError(
        `Unknown editorial shortlist intent: ${intent.kind}`,
      )
    }
    if (!reasonCodeSet.has(intent.reasonCode)) {
      throw new NewsletterEditorialShortlistValidationError(
        `Unknown editorial shortlist reason: ${intent.reasonCode}`,
      )
    }
    if (intent.reasonCode === 'other' && !intent.note) {
      throw new NewsletterEditorialShortlistValidationError(
        'Every “other” shortlist reason needs a note',
      )
    }
  }
  return normalized
}

function commandHashForSave(
  scope: NewsletterDailyReadScope,
  input: {
    runId: string
    expectedRevision: number
    presentation: NewsletterEditorialShortlistPresentation
    selectedItemIds: string[]
    intents: NewsletterEditorialShortlistIntentInput[]
  },
): string {
  return sha256Hex(JSON.stringify({
    runId: input.runId,
    expectedRevision: input.expectedRevision,
    presentation: input.presentation,
    selectedItemIds: input.selectedItemIds,
    intents: input.intents,
    actorId: scope.ownerId,
    sessionId: scope.ownerId ? null : scope.sessionId,
  }))
}

async function findNewsletterEditorialShortlistReplay(
  scope: NewsletterDailyReadScope,
  runId: string,
  idempotencyKey: string,
  commandHash: string,
  signal?: AbortSignal,
): Promise<NewsletterEditorialShortlistRevision | null> {
  signal?.throwIfAborted()
  const supabase = createServiceRoleClient()
  let query = supabase
    .from('newsletter_editorial_shortlist_revisions')
    .select('id,actor_id,session_id,command_hash')
    .eq('run_id', runId)
    .eq('idempotency_key', idempotencyKey)
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query.maybeSingle()
  if (error) {
    throw new Error(`Failed to check editorial shortlist replay: ${error.message}`)
  }
  if (!data) return null
  const expectedSessionId = scope.ownerId ? null : scope.sessionId
  if (data.actor_id !== scope.ownerId || data.session_id !== expectedSessionId) {
    throw new NewsletterEditorialShortlistNotFoundError(runId)
  }
  if (data.command_hash !== commandHash) {
    throw new NewsletterEditorialShortlistValidationError(
      'Editorial shortlist idempotency key was reused with a different request',
    )
  }
  return loadNewsletterEditorialShortlistRevision(runId, data.id, signal)
}

export async function saveNewsletterEditorialShortlist(
  scope: NewsletterDailyReadScope,
  input: SaveNewsletterEditorialShortlistInput,
): Promise<{
  shortlist: NewsletterEditorialShortlistRevision
  changed: boolean
  receiptRevisionId: string
  isCurrent: boolean
}> {
  input.signal?.throwIfAborted()
  const runId = normalizeId(input.runId, 'Run id')
  const idempotencyKey = normalizeId(
    input.idempotencyKey,
    'Idempotency key',
  )
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(idempotencyKey)) {
    throw new NewsletterEditorialShortlistValidationError(
      'Editorial shortlist idempotency key is invalid',
    )
  }
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) {
    throw new NewsletterEditorialShortlistValidationError(
      'Expected shortlist revision must be zero or greater',
    )
  }

  const presentation = normalizePresentationForCommand(input.presentation)
  const selectedItemIds = input.selectedItemIds.map((itemId) =>
    normalizeId(itemId, 'Selected item id'))
  if (
    selectedItemIds.length > NEWSLETTER_EDITORIAL_SHORTLIST_MAX_ITEMS ||
    new Set(selectedItemIds).size !== selectedItemIds.length
  ) {
    throw new NewsletterEditorialShortlistValidationError(
      'Selected shortlist item ids are invalid',
    )
  }
  const intents = normalizeIntentsForCommand(input.intents)
  const commandHash = commandHashForSave(scope, {
    runId,
    expectedRevision: input.expectedRevision,
    presentation,
    selectedItemIds,
    intents,
  })

  const replay = await findNewsletterEditorialShortlistReplay(
    scope,
    runId,
    idempotencyKey,
    commandHash,
    input.signal,
  )
  if (replay) {
    const current = await getNewsletterEditorialShortlist(
      scope,
      runId,
      input.signal,
    )
    if (!current) {
      throw new Error('Editorial shortlist replay has no current revision')
    }
    return {
      shortlist: current,
      changed: false,
      receiptRevisionId: replay.id,
      isCurrent: replay.id === current.id,
    }
  }

  let run: NewsletterDailyRun
  try {
    run = await getNewsletterDailyRun(scope, runId, input.signal)
  } catch (error) {
    if (error instanceof NewsletterDailyRunNotFoundError) {
      throw new NewsletterEditorialShortlistNotFoundError(runId)
    }
    throw error
  }
  let currentPresentation: NewsletterEditorialShortlistPresentation
  let entries: NewsletterEditorialShortlistEntry[]
  try {
    currentPresentation = assertPresentedCatalog(run, presentation)
    entries = buildNewsletterEditorialShortlistEntries({
      run,
      presentation: currentPresentation,
      selectedItemIds,
      intents,
    })
  } catch (error) {
    if (error instanceof NewsletterEditorialShortlistConflictError) {
      const lateReplay = await findNewsletterEditorialShortlistReplay(
        scope,
        runId,
        idempotencyKey,
        commandHash,
        input.signal,
      )
      if (lateReplay) {
        const current = await getNewsletterEditorialShortlist(
          scope,
          runId,
          input.signal,
        )
        if (!current) {
          throw new Error('Editorial shortlist replay has no current revision')
        }
        return {
          shortlist: current,
          changed: false,
          receiptRevisionId: lateReplay.id,
          isCurrent: lateReplay.id === current.id,
        }
      }
    }
    throw error
  }
  input.signal?.throwIfAborted()

  const supabase = createServiceRoleClient()
  let query = supabase.rpc('save_newsletter_editorial_shortlist', {
    p_run_id: runId,
    p_expected_revision: input.expectedRevision,
    p_idempotency_key: idempotencyKey,
    p_algorithm_version: NEWSLETTER_SHORTLIST_ALGORITHM_VERSION,
    p_baseline_fingerprint: currentPresentation.baseline.fingerprint,
    p_command_hash: commandHash,
    p_actor_id: scope.ownerId,
    p_session_id: scope.ownerId ? null : scope.sessionId,
    p_catalog_tokens: currentPresentation.catalog.map((item) => ({
      item_id: item.itemId,
      status: item.status,
      quality_band: item.qualityBand,
      draft_id: item.draftId,
      rank: item.rank,
      relevance_score: item.relevanceScore,
      confidence_score: item.confidenceScore,
      evidence_fingerprint: item.evidenceFingerprint,
    })),
    p_entries: entries.map(databaseEntry),
  })
  if (input.signal) query = query.abortSignal(input.signal)
  const { data, error } = await query
  if (error) {
    if (
      error.message.includes('shortlist revision conflict') ||
      error.message.includes('shortlist presentation conflict')
    ) {
      throw new NewsletterEditorialShortlistConflictError(
        error.message,
        conflictRevision(error.message),
      )
    }
    if (
      error.message.includes('not found') ||
      error.message.includes('does not own')
    ) {
      throw new NewsletterEditorialShortlistNotFoundError(runId)
    }
    if (
      error.message.includes('invalid') ||
      error.message.includes('must') ||
      error.message.includes('cannot') ||
      error.message.includes('idempotency key')
    ) {
      throw new NewsletterEditorialShortlistValidationError(error.message)
    }
    throw new Error(`Failed to save editorial shortlist: ${error.message}`)
  }
  const saved = data?.[0]
  if (!saved) {
    throw new Error('Editorial shortlist save returned no revision')
  }

  const current = await getNewsletterEditorialShortlist(
    scope,
    runId,
    input.signal,
  )
  if (!current) {
    throw new Error('Editorial shortlist save returned no current revision')
  }
  return {
    shortlist: current,
    changed: saved.changed,
    receiptRevisionId: saved.revision_id,
    isCurrent: saved.revision_id === current.id,
  }
}

export const __testOnly = {
  classifyDecision,
  evidenceForItem: buildNewsletterEditorialShortlistEvidence,
  assertPresentedBaseline,
  assertPresentedCatalog,
  relativeCommonPositions,
  commandHashForSave,
  databaseEntry,
}
