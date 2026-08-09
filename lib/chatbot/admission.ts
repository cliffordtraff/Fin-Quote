import 'server-only'

export const CHATBOT_PHYSICAL_MAX = 4
export const CHATBOT_REQUEST_DEADLINE_MS = 60_000
export const CHATBOT_RETRY_AFTER_SECONDS = 2

export type ChatbotAdmissionErrorCode =
  | 'CHATBOT_SCOPE_BUSY'
  | 'CHATBOT_CAPACITY'
  | 'CHATBOT_TIMEOUT'

export abstract class ChatbotAdmissionError extends Error {
  abstract readonly code: ChatbotAdmissionErrorCode
  abstract readonly status: 429 | 503 | 504
  readonly retryAfterSeconds = CHATBOT_RETRY_AFTER_SECONDS
}

export class ChatbotScopeBusyError extends ChatbotAdmissionError {
  readonly code = 'CHATBOT_SCOPE_BUSY' as const
  readonly status = 429 as const

  constructor() {
    super('A chatbot request is already active for this account.')
    this.name = 'ChatbotScopeBusyError'
  }
}

export class ChatbotCapacityError extends ChatbotAdmissionError {
  readonly code = 'CHATBOT_CAPACITY' as const
  readonly status = 503 as const

  constructor() {
    super('Chatbot capacity is temporarily exhausted.')
    this.name = 'ChatbotCapacityError'
  }
}

export class ChatbotRequestTimeoutError extends ChatbotAdmissionError {
  readonly code = 'CHATBOT_TIMEOUT' as const
  readonly status = 504 as const

  constructor() {
    super('The previous chatbot request exceeded its deadline and is still stopping.')
    this.name = 'ChatbotRequestTimeoutError'
  }
}

export class ChatbotRequestAbortedError extends Error {
  constructor() {
    super('The chatbot request was aborted.')
    this.name = 'ChatbotRequestAbortedError'
  }
}

type TimeoutListener = (error: ChatbotRequestTimeoutError) => void

interface PhysicalEntry {
  scope: string
  controller: AbortController
  deadline: ReturnType<typeof setTimeout>
  logicalPromise: Promise<void>
  physicalPromise: Promise<void> | null
  resolveLogical: () => void
  rejectLogical: (error: unknown) => void
  logicalSettled: boolean
  started: boolean
  timedOut: boolean
  timeoutListeners: Set<TimeoutListener>
}

export interface ChatbotRequestLease {
  readonly signal: AbortSignal
  /** Settles at the logical deadline even if physical work ignores abort. */
  readonly completion: Promise<void>
  /** Settles only after the complete loader truly settles. */
  readonly physicalCompletion: Promise<void>
  start(loader: (signal: AbortSignal) => Promise<void>): Promise<void>
  abortCaller(reason?: unknown): void
  onTimeout(listener: TimeoutListener): () => void
}

const byScope = new Map<string, PhysicalEntry>()
const physicalEntries = new Set<PhysicalEntry>()

function abortReason(reason?: unknown): unknown {
  return reason ?? new DOMException('The chatbot request was aborted.', 'AbortError')
}

function settleLogicalFailure(entry: PhysicalEntry, error: unknown): void {
  if (entry.logicalSettled) return
  entry.logicalSettled = true
  entry.rejectLogical(error)
}

function cleanupPhysical(entry: PhysicalEntry): void {
  clearTimeout(entry.deadline)
  physicalEntries.delete(entry)
  if (byScope.get(entry.scope) === entry) byScope.delete(entry.scope)
}

/**
 * Reserve one complete chatbot pipeline. The authenticated account id is the
 * scope: a caller-controlled session id can label telemetry, but cannot bypass
 * the one-active-request rule by changing a JSON field.
 */
export function reserveChatbotRequest(scope: string): ChatbotRequestLease {
  const existing = byScope.get(scope)
  if (existing) {
    if (existing.timedOut) throw new ChatbotRequestTimeoutError()
    throw new ChatbotScopeBusyError()
  }
  if (physicalEntries.size >= CHATBOT_PHYSICAL_MAX) {
    throw new ChatbotCapacityError()
  }

  const controller = new AbortController()
  let resolveLogical!: () => void
  let rejectLogicalPromise!: (error: unknown) => void
  const logicalPromise = new Promise<void>((resolve, reject) => {
    resolveLogical = resolve
    rejectLogicalPromise = reject
  })
  let resolvePhysical!: () => void
  const physicalCompletion = new Promise<void>((resolve) => {
    resolvePhysical = resolve
  })
  // HTTP callers observe the stream, not this bookkeeping promise. Keep a
  // deadline/caller abort from becoming an unhandled rejection.
  void logicalPromise.catch(() => undefined)

  const entry = {} as PhysicalEntry
  entry.scope = scope
  entry.controller = controller
  entry.logicalPromise = logicalPromise
  entry.physicalPromise = null
  entry.resolveLogical = resolveLogical
  entry.rejectLogical = rejectLogicalPromise
  entry.logicalSettled = false
  entry.started = false
  entry.timedOut = false
  entry.timeoutListeners = new Set()
  entry.deadline = setTimeout(() => {
    if (entry.logicalSettled) return
    entry.timedOut = true
    const error = new ChatbotRequestTimeoutError()
    // Give the route one chance to emit a typed SSE terminal event before the
    // owned signal flips to aborted and normal writes become fenced.
    for (const listener of entry.timeoutListeners) {
      try {
        listener(error)
      } catch {
        // A transport listener must not be able to prevent cancellation or
        // logical timeout settlement for the owned pipeline.
      }
    }
    controller.abort(new DOMException(error.message, 'TimeoutError'))
    settleLogicalFailure(entry, error)
    // Do not remove either map/set entry here. An abort-ignoring model stream,
    // provider, or database request continues to consume physical capacity
    // until the complete loader actually settles.
  }, CHATBOT_REQUEST_DEADLINE_MS)

  byScope.set(scope, entry)
  physicalEntries.add(entry)

  const lease: ChatbotRequestLease = {
    signal: controller.signal,
    completion: logicalPromise,
    physicalCompletion,
    start(loader) {
      if (entry.started) {
        throw new Error('Chatbot request lease was already started.')
      }
      entry.started = true

      const work = Promise.resolve().then(() => loader(controller.signal))
      entry.physicalPromise = work

      work.then(
        () => {
          cleanupPhysical(entry)
          resolvePhysical()
          if (entry.logicalSettled) return
          entry.logicalSettled = true
          entry.resolveLogical()
        },
        (error) => {
          cleanupPhysical(entry)
          resolvePhysical()
          if (entry.logicalSettled) return
          settleLogicalFailure(entry, error)
        },
      )
      return work
    },
    abortCaller(reason) {
      if (!controller.signal.aborted) {
        controller.abort(abortReason(reason))
      }
      settleLogicalFailure(entry, new ChatbotRequestAbortedError())
      // The physical entry deliberately remains until loader settlement.
    },
    onTimeout(listener) {
      entry.timeoutListeners.add(listener)
      return () => entry.timeoutListeners.delete(listener)
    },
  }

  return lease
}

/** Test-only reset. Late work cannot delete a newer same-scope entry. */
export function resetChatbotAdmissionForTests(): void {
  for (const entry of physicalEntries) {
    clearTimeout(entry.deadline)
    entry.controller.abort(
      new DOMException('Chatbot admission reset.', 'AbortError'),
    )
    settleLogicalFailure(entry, new ChatbotRequestAbortedError())
  }
  physicalEntries.clear()
  byScope.clear()
}

export function getChatbotAdmissionStateForTests() {
  return {
    scopes: [...byScope.keys()],
    physicalCount: physicalEntries.size,
    timedOutScopes: [...byScope.entries()]
      .filter(([, entry]) => entry.timedOut)
      .map(([scope]) => scope),
  }
}
