import { createHash } from 'node:crypto'
import type { Json } from '@/lib/database.types'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type {
  NewsletterChartLibraryItem,
  NormalizedNewsletterChartLibrarySaveInput,
} from './chart-library'
import { NewsletterChartLibraryRequestConflictError } from './chart-library-errors'
import { normalizeNewsletterCaptureSymbol } from './capture-output-path'

export const NEWSLETTER_CHART_POST_GLOBAL_LIMIT = 4
export const NEWSLETTER_CHART_POST_SCOPE_LIMIT = 2
export const NEWSLETTER_CHART_POST_SCOPE_WINDOW_LIMIT = 12
export const NEWSLETTER_CHART_POST_SCOPE_WINDOW_MS = 10 * 60 * 1_000
export const NEWSLETTER_CHART_POST_DEADLINE_MS = 55 * 1_000
// This must outlive the route's 120-second physical invocation. The logical
// caller deadline is not the lifetime of abort-ignoring renderer/storage I/O.
export const NEWSLETTER_CHART_POST_LEASE_SECONDS = 180
export const NEWSLETTER_CHART_POST_RPC_DEADLINE_MS = 8 * 1_000
export const NEWSLETTER_CHART_POST_REPLAY_TTL_MS = 10 * 60 * 1_000
export const NEWSLETTER_CHART_POST_REPLAY_LIMIT = 64
export const NEWSLETTER_CHART_POST_RETRY_AFTER_SECONDS = 10
export const NEWSLETTER_CHART_POST_BACKGROUND_ERROR_MAX_CHARS = 2_048

const IDEMPOTENCY_KEY_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/

type NewsletterChartPostStatus = 400 | 409 | 429 | 503 | 504

export class NewsletterChartPostError extends Error {
  constructor(
    message: string,
    readonly status: NewsletterChartPostStatus,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message)
    this.name = 'NewsletterChartPostError'
  }
}

export type NewsletterChartPostAcquireDisposition =
  | 'acquired'
  | 'replay'
  | 'conflict'
  | 'in_progress'
  | 'owner_capacity'
  | 'global_capacity'
  | 'rate_limited'

export interface NewsletterChartPostAcquireResult {
  disposition: NewsletterChartPostAcquireDisposition
  leaseToken: string | null
  resultReceipt: unknown
  retryAfterSeconds: number
}

export type NewsletterChartPostCompleteDisposition =
  | 'completed'
  | 'replay'
  | 'conflict'
  | 'lost'

export interface NewsletterChartPostCompleteResult {
  disposition: NewsletterChartPostCompleteDisposition
  resultReceipt: unknown
}

export type NewsletterChartPostFailDisposition =
  | 'released'
  | 'replay'
  | 'conflict'
  | 'lost'

/**
 * Durable authority used by production. Keeping this small interface
 * injectable makes cross-isolate behavior testable without weakening the
 * service-role-only database boundary.
 */
export interface NewsletterChartPostDurableStore {
  acquire(input: {
    ownerId: string
    idempotencyKey: string
    fingerprint: string
    leaseSeconds: number
    signal: AbortSignal
  }): Promise<NewsletterChartPostAcquireResult>
  complete(input: {
    ownerId: string
    idempotencyKey: string
    fingerprint: string
    leaseToken: string
    resultReceipt: NewsletterChartLibraryItem
    signal: AbortSignal
  }): Promise<NewsletterChartPostCompleteResult>
  fail(input: {
    ownerId: string
    idempotencyKey: string
    fingerprint: string
    leaseToken: string
    signal: AbortSignal
  }): Promise<NewsletterChartPostFailDisposition>
}

export type NewsletterChartBackgroundTaskRegistrar = (
  task: Promise<void>,
) => void

interface PhysicalResult {
  value: NewsletterChartLibraryItem
  replayed: boolean
}

interface ActiveEntry {
  kind: 'active'
  fingerprint: string
  logicalPromise: Promise<PhysicalResult>
  operationController: AbortController
  logicalSettled: boolean
  physicalReleased: boolean
  localCapacityReserved: boolean
  waitingCallers: number
  timeout: ReturnType<typeof setTimeout>
}

interface SuccessEntry {
  kind: 'success'
  fingerprint: string
  value: NewsletterChartLibraryItem
  expiresAt: number
}

type Entry = ActiveEntry | SuccessEntry

interface AdmissionState {
  entries: Map<string, Entry>
  activeGlobal: number
  activeByScope: Map<string, number>
  admittedByScope: Map<string, number[]>
}

function createState(): AdmissionState {
  return {
    entries: new Map(),
    activeGlobal: 0,
    activeByScope: new Map(),
    admittedByScope: new Map(),
  }
}

let state = createState()
let durableStoreOverride: NewsletterChartPostDurableStore | null = null

export interface RunNewsletterChartPostInput {
  scopeKey: string
  idempotencyKey: string
  fingerprint: string
  callerSignal: AbortSignal
  /** A production owner UUID enables the Postgres-backed authority. */
  durableOwnerId?: string | null
  durableStore?: NewsletterChartPostDurableStore
  registerBackgroundTask?: NewsletterChartBackgroundTaskRegistrar
  operation: (signal: AbortSignal) => Promise<NewsletterChartLibraryItem>
}

export interface NewsletterChartPostResult {
  value: NewsletterChartLibraryItem
  replayed: boolean
}

export interface NewsletterChartPostPersistenceIdentity {
  chartId: string
  requestKeyHash: string
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`
  }

  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`
}

export function requireNewsletterChartIdempotencyKey(
  rawValue: string | null,
): string {
  if (!rawValue) {
    throw new NewsletterChartPostError(
      'Idempotency-Key header is required.',
      400,
    )
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(rawValue)) {
    throw new NewsletterChartPostError(
      'Idempotency-Key must be 8-128 characters and use only letters, numbers, dots, underscores, colons, or hyphens.',
      400,
    )
  }
  return rawValue
}

export function buildNewsletterChartPostFingerprint(input: {
  scopeKey: string
  saveInput: NormalizedNewsletterChartLibrarySaveInput
  renderOrigin: string
}): string {
  const renderOrigin = new URL(input.renderOrigin).origin
  return createHash('sha256')
    .update(stableJson({
      scope: input.scopeKey,
      title: input.saveInput.title.trim(),
      chartExportSpec: input.saveInput.chartExportSpec,
      renderOrigin,
    }))
    .digest('hex')
}

/**
 * Bind one durable chart row to the authenticated owner and idempotency key.
 * The raw key is never persisted. Version/variant bits make the first 128
 * digest bits a valid deterministic UUID while the full digest backs the
 * unique database identity.
 */
export function buildNewsletterChartPostPersistenceIdentity(input: {
  ownerId: string
  idempotencyKey: string
}): NewsletterChartPostPersistenceIdentity {
  const digest = createHash('sha256')
    .update('newsletter-chart-post/v1\0')
    .update(input.ownerId)
    .update('\0')
    .update(input.idempotencyKey)
    .digest()
  const uuidBytes = Buffer.from(digest.subarray(0, 16))
  uuidBytes[6] = (uuidBytes[6] & 0x0f) | 0x80
  uuidBytes[8] = (uuidBytes[8] & 0x3f) | 0x80
  const hex = uuidBytes.toString('hex')
  return {
    chartId: [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join('-'),
    requestKeyHash: digest.toString('hex'),
  }
}

function entryKey(scopeKey: string, idempotencyKey: string): string {
  return `${scopeKey.length}:${scopeKey}:${idempotencyKey}`
}

function pruneExpiredEntries(current: AdmissionState, now: number): void {
  for (const [key, entry] of current.entries) {
    if (entry.kind === 'success' && entry.expiresAt <= now) {
      current.entries.delete(key)
    }
  }

  for (const [scopeKey, timestamps] of current.admittedByScope) {
    const recent = timestamps.filter(
      (timestamp) => now - timestamp < NEWSLETTER_CHART_POST_SCOPE_WINDOW_MS,
    )
    if (recent.length > 0) current.admittedByScope.set(scopeKey, recent)
    else current.admittedByScope.delete(scopeKey)
  }
}

function trimReplayLru(current: AdmissionState): void {
  let successCount = 0
  for (const entry of current.entries.values()) {
    if (entry.kind === 'success') successCount += 1
  }

  while (successCount > NEWSLETTER_CHART_POST_REPLAY_LIMIT) {
    const oldestSuccess = Array.from(current.entries.entries()).find(
      ([, entry]) => entry.kind === 'success',
    )
    if (!oldestSuccess) return
    current.entries.delete(oldestSuccess[0])
    successCount -= 1
  }
}

function touchSuccess(
  current: AdmissionState,
  key: string,
  entry: SuccessEntry,
): void {
  current.entries.delete(key)
  current.entries.set(key, entry)
}

function reserveLocalPhysicalSlot(
  current: AdmissionState,
  scopeKey: string,
  now: number,
  enforceRollingRateLimit: boolean,
): void {
  const activeForScope = current.activeByScope.get(scopeKey) ?? 0
  if (activeForScope >= NEWSLETTER_CHART_POST_SCOPE_LIMIT) {
    throw new NewsletterChartPostError(
      'Too many newsletter chart renders are already running for this owner.',
      429,
      NEWSLETTER_CHART_POST_RETRY_AFTER_SECONDS,
    )
  }
  if (current.activeGlobal >= NEWSLETTER_CHART_POST_GLOBAL_LIMIT) {
    throw new NewsletterChartPostError(
      'Newsletter chart rendering is temporarily at capacity.',
      503,
      NEWSLETTER_CHART_POST_RETRY_AFTER_SECONDS,
    )
  }

  const admitted = current.admittedByScope.get(scopeKey) ?? []
  if (
    enforceRollingRateLimit &&
    admitted.length >= NEWSLETTER_CHART_POST_SCOPE_WINDOW_LIMIT
  ) {
    throw new NewsletterChartPostError(
      'Newsletter chart render rate limit exceeded for this owner.',
      429,
      NEWSLETTER_CHART_POST_RETRY_AFTER_SECONDS,
    )
  }

  current.activeGlobal += 1
  current.activeByScope.set(scopeKey, activeForScope + 1)
  if (enforceRollingRateLimit) {
    current.admittedByScope.set(scopeKey, [...admitted, now])
  }
}

function releaseLocalPhysicalSlot(
  current: AdmissionState,
  scopeKey: string,
  entry: ActiveEntry,
): void {
  if (entry.physicalReleased || !entry.localCapacityReserved) return
  entry.physicalReleased = true
  current.activeGlobal = Math.max(0, current.activeGlobal - 1)
  const activeForScope = Math.max(
    0,
    (current.activeByScope.get(scopeKey) ?? 0) - 1,
  )
  if (activeForScope === 0) current.activeByScope.delete(scopeKey)
  else current.activeByScope.set(scopeKey, activeForScope)
}

async function waitForCaller<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    throw signal.reason ?? new Error('Newsletter chart request aborted')
  }

  let removeAbortListener: () => void = () => undefined
  const aborted = new Promise<never>((_resolve, reject) => {
    const onAbort = () =>
      reject(signal.reason ?? new Error('Newsletter chart request aborted'))
    signal.addEventListener('abort', onAbort, { once: true })
    removeAbortListener = () => signal.removeEventListener('abort', onAbort)
  })

  return Promise.race([promise, aborted]).finally(removeAbortListener)
}

async function runWithIndependentRpcDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort(new NewsletterChartPostError(
      'Newsletter chart persistence timed out.',
      503,
      NEWSLETTER_CHART_POST_RETRY_AFTER_SECONDS,
    ))
  }, NEWSLETTER_CHART_POST_RPC_DEADLINE_MS)
  try {
    return await waitForCaller(operation(controller.signal), controller.signal)
  } finally {
    clearTimeout(timeout)
  }
}

async function waitForActiveEntry(
  entry: ActiveEntry,
  signal: AbortSignal,
): Promise<PhysicalResult> {
  entry.waitingCallers += 1
  try {
    return await waitForCaller(entry.logicalPromise, signal)
  } finally {
    entry.waitingCallers = Math.max(0, entry.waitingCallers - 1)
  }
}

function reportDetachedBackgroundFailure(error: unknown): void {
  const diagnostic = error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error)
  console.error(
    '[newsletter-chart-admission] Detached background save failed:',
    diagnostic
      .replace(/[\r\n\t]+/g, ' ')
      .slice(0, NEWSLETTER_CHART_POST_BACKGROUND_ERROR_MAX_CHARS),
  )
}

function boundedRetryAfter(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return NEWSLETTER_CHART_POST_RETRY_AFTER_SECONDS
  return Math.max(1, Math.min(180, Math.trunc(numeric)))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

const DURABLE_RECEIPT_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DURABLE_RECEIPT_SHA256_PATTERN = /^[0-9a-f]{64}$/
const DURABLE_RECEIPT_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/
const DURABLE_RECEIPT_MAX_BYTES = 512 * 1_024
// The accepted request may itself be 256 KiB. Materialization adds scene and
// renderer defaults around that export spec, so replay needs deliberate headroom.
const DURABLE_RECEIPT_CHART_SPEC_MAX_BYTES = 384 * 1_024
const DURABLE_PRICE_RANGES = new Set([
  '1d', '5d', '1m', '3m', '6m', '1y', '2y', '5y',
])
const DURABLE_PRICE_INTERVALS = new Set([
  '1sec', '10sec', '1min', '2min', '5min', '15min', '30min',
  '1hour', '4hour', 'D', 'W', 'M',
])
const DURABLE_PRICE_CHART_TYPES = new Set([
  'candles', 'hollow-candles', 'ohlc-bars', 'line', 'heikin-ashi',
])

function isBoundedString(
  value: unknown,
  minLength: number,
  maxLength: number,
): value is string {
  return typeof value === 'string' &&
    value.length >= minLength &&
    value.length <= maxLength
}

function isValidDurableTimestamp(value: unknown): value is string {
  return isBoundedString(value, 20, 40) &&
    DURABLE_RECEIPT_TIMESTAMP_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value))
}

function isValidDurableSymbol(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    return normalizeNewsletterCaptureSymbol(value) === value
  } catch {
    return false
  }
}

function isValidDurableUrl(value: unknown): value is string {
  if (!isBoundedString(value, 1, 8_192)) return false
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
  } catch {
    return false
  }
}

function invalidDurableReceipt(): NewsletterChartPostError {
  return new NewsletterChartPostError(
    'Newsletter chart rendering is temporarily unavailable.',
    503,
    NEWSLETTER_CHART_POST_RETRY_AFTER_SECONDS,
  )
}

function parseDurableReceipt(
  value: unknown,
  ownerId: string,
): NewsletterChartLibraryItem {
  if (!isRecord(value) || !isRecord(value.chartSpec)) {
    throw invalidDurableReceipt()
  }
  const chartSpec = value.chartSpec
  let receiptBytes = Number.POSITIVE_INFINITY
  let chartSpecBytes = Number.POSITIVE_INFINITY
  try {
    receiptBytes = Buffer.byteLength(JSON.stringify(value), 'utf8')
    chartSpecBytes = Buffer.byteLength(JSON.stringify(chartSpec), 'utf8')
  } catch {}
  if (
    receiptBytes > DURABLE_RECEIPT_MAX_BYTES ||
    value.ownerId !== ownerId ||
    !isBoundedString(value.id, 36, 36) ||
    !DURABLE_RECEIPT_UUID_PATTERN.test(value.id) ||
    !isBoundedString(value.sessionId, 1, 512) ||
    !isBoundedString(value.title, 1, 120) ||
    !isValidDurableSymbol(value.symbol) ||
    !isValidDurableUrl(value.chartImageUrl) ||
    !isValidDurableUrl(value.thumbnailUrl) ||
    !isValidDurableUrl(value.chartExportUrl) ||
    !isValidDurableTimestamp(value.capturedAt) ||
    !isBoundedString(value.rendererContract, 1, 128) ||
    !isBoundedString(value.sceneHash, 64, 64) ||
    !DURABLE_RECEIPT_SHA256_PATTERN.test(value.sceneHash) ||
    (
      value.imageSha256 !== null &&
      (
        !isBoundedString(value.imageSha256, 64, 64) ||
        !DURABLE_RECEIPT_SHA256_PATTERN.test(value.imageSha256)
      )
    ) ||
    !isValidDurableTimestamp(value.createdAt) ||
    !isValidDurableTimestamp(value.updatedAt) ||
    chartSpecBytes > DURABLE_RECEIPT_CHART_SPEC_MAX_BYTES ||
    chartSpec.mode !== 'price' ||
    chartSpec.symbol !== value.symbol ||
    typeof chartSpec.range !== 'string' ||
    !DURABLE_PRICE_RANGES.has(chartSpec.range) ||
    typeof chartSpec.interval !== 'string' ||
    !DURABLE_PRICE_INTERVALS.has(chartSpec.interval) ||
    typeof chartSpec.chartType !== 'string' ||
    !DURABLE_PRICE_CHART_TYPES.has(chartSpec.chartType) ||
    (
      chartSpec.chartExportSpec !== undefined &&
      (
        !isRecord(chartSpec.chartExportSpec) ||
        chartSpec.chartExportSpec.symbol !== value.symbol
      )
    )
  ) throw invalidDurableReceipt()
  return value as unknown as NewsletterChartLibraryItem
}

interface AcquireRpcRow {
  disposition: string
  lease_token: string | null
  result_receipt: Json | null
  retry_after_seconds: number
}

interface CompleteRpcRow {
  disposition: string
  result_receipt: Json | null
}

const defaultDurableStore: NewsletterChartPostDurableStore = {
  async acquire(input) {
    const client = createServiceRoleClient()
    const { data, error } = await client
      .rpc('acquire_newsletter_chart_post', {
        p_owner_id: input.ownerId,
        p_idempotency_key: input.idempotencyKey,
        p_fingerprint: input.fingerprint,
        p_lease_seconds: input.leaseSeconds,
      })
      .abortSignal(input.signal)
    const row = (data?.[0] ?? null) as AcquireRpcRow | null
    const allowed = new Set<NewsletterChartPostAcquireDisposition>([
      'acquired',
      'replay',
      'conflict',
      'in_progress',
      'owner_capacity',
      'global_capacity',
      'rate_limited',
    ])
    if (
      error ||
      !row ||
      !allowed.has(row.disposition as NewsletterChartPostAcquireDisposition)
    ) {
      throw new NewsletterChartPostError(
        'Newsletter chart rendering is temporarily unavailable.',
        503,
        NEWSLETTER_CHART_POST_RETRY_AFTER_SECONDS,
      )
    }
    return {
      disposition: row.disposition as NewsletterChartPostAcquireDisposition,
      leaseToken: row.lease_token,
      resultReceipt: row.result_receipt,
      retryAfterSeconds: boundedRetryAfter(row.retry_after_seconds),
    }
  },

  async complete(input) {
    const client = createServiceRoleClient()
    const { data, error } = await client
      .rpc('complete_newsletter_chart_post', {
        p_owner_id: input.ownerId,
        p_idempotency_key: input.idempotencyKey,
        p_fingerprint: input.fingerprint,
        p_lease_token: input.leaseToken,
        p_result_receipt: input.resultReceipt as unknown as Json,
      })
      .abortSignal(input.signal)
    const row = (data?.[0] ?? null) as CompleteRpcRow | null
    const allowed = new Set<NewsletterChartPostCompleteDisposition>([
      'completed',
      'replay',
      'conflict',
      'lost',
    ])
    if (
      error ||
      !row ||
      !allowed.has(row.disposition as NewsletterChartPostCompleteDisposition)
    ) {
      throw new NewsletterChartPostError(
        'Newsletter chart result could not be confirmed.',
        503,
        NEWSLETTER_CHART_POST_RETRY_AFTER_SECONDS,
      )
    }
    return {
      disposition: row.disposition as NewsletterChartPostCompleteDisposition,
      resultReceipt: row.result_receipt,
    }
  },

  async fail(input) {
    const client = createServiceRoleClient()
    const { data, error } = await client
      .rpc('fail_newsletter_chart_post', {
        p_owner_id: input.ownerId,
        p_idempotency_key: input.idempotencyKey,
        p_fingerprint: input.fingerprint,
        p_lease_token: input.leaseToken,
      })
      .abortSignal(input.signal)
    const row = (data?.[0] ?? null) as { disposition?: unknown } | null
    const disposition = row?.disposition
    if (
      error ||
      !['released', 'replay', 'conflict', 'lost'].includes(String(disposition))
    ) {
      throw new Error('Newsletter chart lease release failed')
    }
    return disposition as NewsletterChartPostFailDisposition
  },
}

function durableAcquireError(
  claim: NewsletterChartPostAcquireResult,
): NewsletterChartPostError {
  const retryAfter = boundedRetryAfter(claim.retryAfterSeconds)
  switch (claim.disposition) {
    case 'conflict':
      return new NewsletterChartPostError(
        'Idempotency-Key was already used for a different newsletter chart request.',
        409,
      )
    case 'owner_capacity':
      return new NewsletterChartPostError(
        'Too many newsletter chart renders are already running for this owner.',
        429,
        retryAfter,
      )
    case 'rate_limited':
      return new NewsletterChartPostError(
        'Newsletter chart render rate limit exceeded for this owner.',
        429,
        retryAfter,
      )
    case 'in_progress':
      return new NewsletterChartPostError(
        'This newsletter chart save is still in progress.',
        503,
        retryAfter,
      )
    default:
      return new NewsletterChartPostError(
        'Newsletter chart rendering is temporarily at capacity.',
        503,
        retryAfter,
      )
  }
}

async function releaseDurableFailure(
  store: NewsletterChartPostDurableStore,
  input: {
    ownerId: string
    idempotencyKey: string
    fingerprint: string
    leaseToken: string
  },
): Promise<void> {
  try {
    await runWithIndependentRpcDeadline((signal) =>
      store.fail({ ...input, signal }),
    )
  } catch {
    // Preserve the renderer/upload error. The lease expires automatically;
    // never expose database diagnostics or pretend it released early.
    console.error('[newsletter-chart-admission] Failed to release render lease')
  }
}

async function runDurablePhysicalOperation(
  input: RunNewsletterChartPostInput & { durableOwnerId: string },
  signal: AbortSignal,
): Promise<PhysicalResult> {
  const store = input.durableStore ?? durableStoreOverride ?? defaultDurableStore
  signal.throwIfAborted()
  const claim = await runWithIndependentRpcDeadline((rpcSignal) =>
    store.acquire({
      ownerId: input.durableOwnerId,
      idempotencyKey: input.idempotencyKey,
      fingerprint: input.fingerprint,
      leaseSeconds: NEWSLETTER_CHART_POST_LEASE_SECONDS,
      signal: rpcSignal,
    }),
  )
  signal.throwIfAborted()

  if (claim.disposition === 'replay') {
    return {
      value: parseDurableReceipt(claim.resultReceipt, input.durableOwnerId),
      replayed: true,
    }
  }
  const leaseToken = claim.leaseToken
  if (claim.disposition !== 'acquired' || !leaseToken) {
    throw durableAcquireError(claim)
  }

  let value: NewsletterChartLibraryItem
  try {
    signal.throwIfAborted()
    value = await input.operation(signal)
  } catch (error) {
    await releaseDurableFailure(store, {
      ownerId: input.durableOwnerId,
      idempotencyKey: input.idempotencyKey,
      fingerprint: input.fingerprint,
      leaseToken,
    })
    if (error instanceof NewsletterChartLibraryRequestConflictError) {
      throw new NewsletterChartPostError(error.message, 409)
    }
    throw error
  }

  // Completion is deliberately outside the renderer failure catch. An
  // ambiguous completion must leave its lease/receipt intact for replay; it
  // must never be released into a duplicate save.
  const completion = await runWithIndependentRpcDeadline((rpcSignal) =>
    store.complete({
      ownerId: input.durableOwnerId,
      idempotencyKey: input.idempotencyKey,
      fingerprint: input.fingerprint,
      leaseToken,
      resultReceipt: value,
      signal: rpcSignal,
    }),
  )
  if (completion.disposition === 'completed') {
    return { value, replayed: false }
  }
  if (completion.disposition === 'replay') {
    return {
      value: parseDurableReceipt(
        completion.resultReceipt,
        input.durableOwnerId,
      ),
      replayed: true,
    }
  }
  if (completion.disposition === 'conflict') {
    throw new NewsletterChartPostError(
      'Idempotency-Key was already used for a different newsletter chart request.',
      409,
    )
  }
  throw new NewsletterChartPostError(
    'Newsletter chart result is being finalized by another worker.',
    503,
    NEWSLETTER_CHART_POST_RETRY_AFTER_SECONDS,
  )
}

/**
 * Admit and track one physical newsletter chart save. The physical operation
 * receives only an admission-owned signal. Every HTTP caller, including the
 * creator, independently detaches from the shared logical promise on abort.
 */
export async function runNewsletterChartPost(
  input: RunNewsletterChartPostInput,
): Promise<NewsletterChartPostResult> {
  if (input.callerSignal.aborted) {
    throw input.callerSignal.reason ?? new Error('Newsletter chart request aborted')
  }

  const current = state
  const now = Date.now()
  pruneExpiredEntries(current, now)
  const key = entryKey(input.scopeKey, input.idempotencyKey)
  const existing = current.entries.get(key)
  if (existing) {
    if (existing.fingerprint !== input.fingerprint) {
      throw new NewsletterChartPostError(
        'Idempotency-Key was already used for a different newsletter chart request.',
        409,
      )
    }
    if (existing.kind === 'success') {
      touchSuccess(current, key, existing)
      return {
        value: await waitForCaller(
          Promise.resolve(existing.value),
          input.callerSignal,
        ),
        replayed: true,
      }
    }
    const joined = await waitForActiveEntry(existing, input.callerSignal)
    return { value: joined.value, replayed: true }
  }

  const usesDurableAuthority = Boolean(input.durableOwnerId)
  // Postgres remains the production authority. This same-isolate ceiling is
  // only an outage fuse: it prevents an unavailable acquire RPC from creating
  // an unbounded pile of pre-lease network work. Durable rate accounting stays
  // exclusively in Postgres so isolate churn cannot change the rolling quota.
  reserveLocalPhysicalSlot(
    current,
    input.scopeKey,
    now,
    !usesDurableAuthority,
  )

  const operationController = new AbortController()
  let resolveLogical!: (value: PhysicalResult) => void
  let rejectLogical!: (reason: unknown) => void
  const logicalPromise = new Promise<PhysicalResult>((resolve, reject) => {
    resolveLogical = resolve
    rejectLogical = reject
  })
  // The physical operation can synchronously abort the creator before the
  // creator installs its independent wait race below. Keep the shared promise
  // observed even when that first caller has already detached.
  void logicalPromise.catch(() => undefined)
  const entry: ActiveEntry = {
    kind: 'active',
    fingerprint: input.fingerprint,
    logicalPromise,
    operationController,
    logicalSettled: false,
    physicalReleased: false,
    localCapacityReserved: true,
    waitingCallers: 0,
    timeout: undefined as unknown as ReturnType<typeof setTimeout>,
  }

  entry.timeout = setTimeout(() => {
    if (entry.logicalSettled) return
    entry.logicalSettled = true
    const error = new NewsletterChartPostError(
      'Newsletter chart rendering timed out.',
      504,
    )
    operationController.abort(error)
    rejectLogical(error)
  }, NEWSLETTER_CHART_POST_DEADLINE_MS)

  current.entries.set(key, entry)

  const physicalPromise = input.durableOwnerId
    ? runDurablePhysicalOperation(
      { ...input, durableOwnerId: input.durableOwnerId },
      operationController.signal,
    )
    : Promise.resolve()
      .then(() => input.operation(operationController.signal))
      .then((value) => ({ value, replayed: false }))

  const settlementPromise = physicalPromise.then(
    (result) => {
      clearTimeout(entry.timeout)
      releaseLocalPhysicalSlot(current, input.scopeKey, entry)

      if (current.entries.get(key) === entry) {
        current.entries.delete(key)
        current.entries.set(key, {
          kind: 'success',
          fingerprint: entry.fingerprint,
          value: result.value,
          expiresAt: Date.now() + NEWSLETTER_CHART_POST_REPLAY_TTL_MS,
        })
        trimReplayLru(current)
      }

      if (!entry.logicalSettled) {
        entry.logicalSettled = true
        resolveLogical(result)
      }
    },
    (error) => {
      clearTimeout(entry.timeout)
      releaseLocalPhysicalSlot(current, input.scopeKey, entry)
      if (current.entries.get(key) === entry) current.entries.delete(key)
      const detached = entry.waitingCallers === 0
      if (!entry.logicalSettled) {
        entry.logicalSettled = true
        rejectLogical(error)
      }
      if (detached) reportDetachedBackgroundFailure(error)
    },
  )

  input.registerBackgroundTask?.(settlementPromise)

  return waitForActiveEntry(entry, input.callerSignal)
}

export const newsletterChartPostAdmissionTestOnly = {
  reset(): void {
    for (const entry of state.entries.values()) {
      if (entry.kind !== 'active') continue
      clearTimeout(entry.timeout)
      entry.operationController.abort(
        new Error('Newsletter chart admission was reset.'),
      )
    }
    state = createState()
    durableStoreOverride = null
  },
  setDurableStore(store: NewsletterChartPostDurableStore | null): void {
    durableStoreOverride = store
  },
  snapshot(): {
    activeGlobal: number
    activeByScope: Record<string, number>
    entryCount: number
  } {
    return {
      activeGlobal: state.activeGlobal,
      activeByScope: Object.fromEntries(state.activeByScope),
      entryCount: state.entries.size,
    }
  },
}
