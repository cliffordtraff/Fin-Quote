import { z } from 'zod'
import {
  MAX_CHAT_HISTORY_MESSAGE_LENGTH,
  MAX_CHAT_HISTORY_MESSAGES,
  MAX_CHAT_HISTORY_TOTAL_LENGTH,
  MAX_CHAT_IDEMPOTENCY_KEY_LENGTH,
  MAX_CHAT_QUESTION_LENGTH,
  MAX_CHAT_REQUEST_BYTES,
  MAX_CHAT_SESSION_ID_LENGTH,
} from './constants'
import {
  CHATBOT_IDEMPOTENCY_RETRY_WINDOW_MS,
  chatbotIdempotencyKeyTimestamp,
  isCurrentChatbotIdempotencyKey,
} from './idempotency-key'
import { isPostgresSafeText } from './postgres-text'

export const CHATBOT_PENDING_COMMAND_TTL_MS = 10 * 60 * 1_000
export const CHATBOT_PENDING_COMMAND_MAX_ATTEMPTS = 6
const CHATBOT_PENDING_COMMAND_STORAGE_KEY = 'finquote_pending_chatbot_command_v1'
const CHATBOT_PENDING_RECOVERY_MARKER_STORAGE_KEY =
  'finquote_pending_chatbot_recovery_marker_v1'
const CHATBOT_REQUEST_FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/

const pendingCommandSchema = z.object({
  version: z.literal(1),
  scope: z.string().min(1).max(256),
  principal: z.string().min(1).max(192),
  requestFingerprint: z.string().regex(CHATBOT_REQUEST_FINGERPRINT_PATTERN),
  savedAt: z.number().int().safe().min(0),
  expiresAt: z.number().int().safe().min(0),
  attempt: z.number().int().min(0).max(CHATBOT_PENDING_COMMAND_MAX_ATTEMPTS),
  body: z.object({
    question: z.string().min(1).max(MAX_CHAT_QUESTION_LENGTH)
      .refine(isPostgresSafeText),
    conversationHistory: z.array(z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1).max(MAX_CHAT_HISTORY_MESSAGE_LENGTH)
        .refine(isPostgresSafeText),
      timestamp: z.string().max(64).optional(),
    }).strict()).max(MAX_CHAT_HISTORY_MESSAGES).refine(
      messages => messages.reduce(
        (total, message) => total + message.content.length,
        0,
      ) <= MAX_CHAT_HISTORY_TOTAL_LENGTH,
      'Pending chatbot history is too long.',
    ),
    sessionId: z.string().max(MAX_CHAT_SESSION_ID_LENGTH),
    idempotencyKey: z.string().min(8).max(MAX_CHAT_IDEMPOTENCY_KEY_LENGTH),
    conversationId: z.string().uuid().nullable(),
    expectedRevision: z.number().int().min(0),
  }).strict(),
}).strict().superRefine((command, context) => {
  if (command.expiresAt !== command.savedAt + CHATBOT_PENDING_COMMAND_TTL_MS) {
    context.addIssue({
      code: 'custom',
      path: ['expiresAt'],
      message: 'Pending chatbot retention window is invalid.',
    })
  }
  if (pendingPrincipalForScope(command.scope) !== command.principal) {
    context.addIssue({
      code: 'custom',
      path: ['principal'],
      message: 'Pending chatbot owner binding is invalid.',
    })
  }
  if (
    new TextEncoder().encode(JSON.stringify(command.body)).byteLength >
      MAX_CHAT_REQUEST_BYTES
  ) {
    context.addIssue({
      code: 'custom',
      path: ['body'],
      message: 'Pending chatbot request body is too large.',
    })
  }
})

const pendingRecoveryMarkerSchema = z.object({
  version: z.literal(1),
  scope: z.string().min(1).max(256),
  principal: z.string().min(1).max(192),
  idempotencyKey: z.string().min(8).max(MAX_CHAT_IDEMPOTENCY_KEY_LENGTH),
  requestFingerprint: z.string().regex(CHATBOT_REQUEST_FINGERPRINT_PATTERN),
  createdAt: z.number().int().safe().min(0),
  expiresAt: z.number().int().safe().min(0),
}).strict().superRefine((marker, context) => {
  const issuedAt = chatbotIdempotencyKeyTimestamp(marker.idempotencyKey)
  if (
    pendingPrincipalForScope(marker.scope) !== marker.principal ||
    issuedAt === null ||
    marker.expiresAt !== issuedAt + CHATBOT_IDEMPOTENCY_RETRY_WINDOW_MS ||
    marker.createdAt > marker.expiresAt
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Pending chatbot recovery marker is invalid.',
    })
  }
})

export type PendingChatbotCommand = z.infer<typeof pendingCommandSchema>
export type PendingChatbotRequestBody = PendingChatbotCommand['body']
export type PendingChatbotRecoveryMarker = z.infer<
  typeof pendingRecoveryMarkerSchema
>

export function pendingPrincipalForScope(scope: string): string | null {
  const userMatch = /^user:([^:]{1,128}):conversation:(new|[0-9a-f-]{36})$/.exec(
    scope,
  )
  if (userMatch) return `user:${userMatch[1]}`

  const anonymousMatch = /^anonymous:([^:]{1,128})$/.exec(scope)
  if (anonymousMatch && anonymousMatch[1] !== 'pending') {
    return `anonymous:${anonymousMatch[1]}`
  }
  return null
}

function pendingPathForScope(scope: string): string | null {
  const userMatch = /^user:[^:]{1,128}:conversation:(new|[0-9a-f-]{36})$/.exec(
    scope,
  )
  if (userMatch) {
    return userMatch[1] === 'new' ? '/chatbot' : `/chatbot?id=${userMatch[1]}`
  }
  return scope.startsWith('anonymous:') ? '/chatbot' : null
}

export function isRetryablePendingChatbotResponse(
  status: number,
  code: unknown,
): boolean {
  return status >= 500 ||
    code === 'CHATBOT_AUTH_REFRESH_REQUIRED' ||
    code === 'CHATBOT_SCOPE_BUSY' ||
    code === 'CHATBOT_RATE_LIMIT'
}

function readStoredPendingCommand(storage: Storage): PendingChatbotCommand | null {
  const raw = storage.getItem(CHATBOT_PENDING_COMMAND_STORAGE_KEY)
  if (!raw) return null
  try {
    return pendingCommandSchema.parse(JSON.parse(raw))
  } catch {
    storage.removeItem(CHATBOT_PENDING_COMMAND_STORAGE_KEY)
    return null
  }
}

function readStoredRecoveryMarker(
  storage: Storage,
): PendingChatbotRecoveryMarker | null {
  const raw = storage.getItem(CHATBOT_PENDING_RECOVERY_MARKER_STORAGE_KEY)
  if (!raw) return null
  try {
    return pendingRecoveryMarkerSchema.parse(JSON.parse(raw))
  } catch {
    storage.removeItem(CHATBOT_PENDING_RECOVERY_MARKER_STORAGE_KEY)
    return null
  }
}

function belongsToCurrentPrincipal(
  storage: Storage,
  storedPrincipal: string,
  currentScope: string,
  storageKey: string,
): boolean {
  const currentPrincipal = pendingPrincipalForScope(currentScope)
  if (!currentPrincipal) return false
  if (currentPrincipal === storedPrincipal) return true

  // Auth has resolved to another owner/session. Erase both the content and its
  // exact key so a signed-out or previous account cannot leak data or lock the
  // newly active account. We intentionally do nothing for auth:*:pending.
  storage.removeItem(storageKey)
  return false
}

export function promotePendingChatbotCommandToRecoveryMarker(
  storage: Storage,
  currentScope: string,
  now = Date.now(),
): PendingChatbotRecoveryMarker | null {
  const command = readStoredPendingCommand(storage)
  if (!command) return null
  if (!belongsToCurrentPrincipal(
    storage,
    command.principal,
    currentScope,
    CHATBOT_PENDING_COMMAND_STORAGE_KEY,
  )) return null

  const issuedAt = chatbotIdempotencyKeyTimestamp(command.body.idempotencyKey)
  if (
    issuedAt === null ||
    !isCurrentChatbotIdempotencyKey(command.body.idempotencyKey, now)
  ) {
    storage.removeItem(CHATBOT_PENDING_COMMAND_STORAGE_KEY)
    return null
  }

  const marker = pendingRecoveryMarkerSchema.parse({
    version: 1,
    scope: command.scope,
    principal: command.principal,
    idempotencyKey: command.body.idempotencyKey,
    requestFingerprint: command.requestFingerprint,
    createdAt: Math.max(command.expiresAt, now),
    expiresAt: issuedAt + CHATBOT_IDEMPOTENCY_RETRY_WINDOW_MS,
  })
  storage.setItem(
    CHATBOT_PENDING_RECOVERY_MARKER_STORAGE_KEY,
    JSON.stringify(marker),
  )
  storage.removeItem(CHATBOT_PENDING_COMMAND_STORAGE_KEY)
  return marker
}

function readCurrentPendingCommand(
  storage: Storage,
  currentScope: string,
  now: number,
): PendingChatbotCommand | null {
  const command = readStoredPendingCommand(storage)
  if (!command) return null
  if (!belongsToCurrentPrincipal(
    storage,
    command.principal,
    currentScope,
    CHATBOT_PENDING_COMMAND_STORAGE_KEY,
  )) return null
  if (command.savedAt > now + 60_000) {
    storage.removeItem(CHATBOT_PENDING_COMMAND_STORAGE_KEY)
    return null
  }
  if (
    command.expiresAt <= now ||
    !isCurrentChatbotIdempotencyKey(command.body.idempotencyKey, now)
  ) {
    promotePendingChatbotCommandToRecoveryMarker(storage, currentScope, now)
    return null
  }
  return command
}

function readCurrentRecoveryMarker(
  storage: Storage,
  currentScope: string,
  now: number,
): PendingChatbotRecoveryMarker | null {
  const marker = readStoredRecoveryMarker(storage)
  if (!marker) return null
  if (!belongsToCurrentPrincipal(
    storage,
    marker.principal,
    currentScope,
    CHATBOT_PENDING_RECOVERY_MARKER_STORAGE_KEY,
  )) return null
  if (
    marker.createdAt > now + 60_000 ||
    marker.expiresAt <= now ||
    !isCurrentChatbotIdempotencyKey(marker.idempotencyKey, now)
  ) {
    storage.removeItem(CHATBOT_PENDING_RECOVERY_MARKER_STORAGE_KEY)
    return null
  }
  return marker
}

export function savePendingChatbotCommand(
  storage: Storage,
  scope: string,
  body: PendingChatbotRequestBody,
  requestFingerprint: string,
  attempt = 0,
  now = Date.now(),
  retention?: Pick<PendingChatbotCommand, 'savedAt' | 'expiresAt'>,
): PendingChatbotCommand {
  const principal = pendingPrincipalForScope(scope)
  if (!principal) throw new Error('Pending chatbot owner scope is unresolved.')

  const existing = readCurrentPendingCommand(storage, scope, now)
  const marker = readCurrentRecoveryMarker(storage, scope, now)
  if (
    (existing && existing.body.idempotencyKey !== body.idempotencyKey) ||
    (marker && marker.idempotencyKey !== body.idempotencyKey)
  ) {
    throw new Error('Another chatbot request is still pending recovery.')
  }
  if (marker) {
    throw new Error('Pending chatbot request content has expired; resolve it first.')
  }

  const savedAt = retention?.savedAt ?? now
  const expiresAt = retention?.expiresAt ?? savedAt + CHATBOT_PENDING_COMMAND_TTL_MS
  if (expiresAt <= now) {
    throw new Error('Pending chatbot request recovery window expired.')
  }
  const command = pendingCommandSchema.parse({
    version: 1,
    scope,
    principal,
    requestFingerprint,
    savedAt,
    expiresAt,
    attempt,
    body,
  })
  if (!isCurrentChatbotIdempotencyKey(command.body.idempotencyKey, now)) {
    throw new Error('Pending chatbot request key is no longer retryable.')
  }
  storage.setItem(CHATBOT_PENDING_COMMAND_STORAGE_KEY, JSON.stringify(command))
  return command
}

export function hasPendingChatbotCommand(
  storage: Storage,
  currentScope: string,
  now = Date.now(),
): boolean {
  if (!pendingPrincipalForScope(currentScope)) return false
  const command = readCurrentPendingCommand(storage, currentScope, now)
  return command !== null ||
    readCurrentRecoveryMarker(storage, currentScope, now) !== null
}

export function getPendingChatbotCommandExpiresAt(
  storage: Storage,
  currentScope: string,
  now = Date.now(),
): number | null {
  return readCurrentPendingCommand(storage, currentScope, now)?.expiresAt ?? null
}

export function schedulePendingChatbotCommandExpiry(
  storage: Storage,
  currentScope: string,
  onExpired: (marker: PendingChatbotRecoveryMarker | null) => void,
  now = Date.now(),
): () => void {
  const command = readCurrentPendingCommand(storage, currentScope, now)
  if (!command) return () => undefined
  const expectedKey = command.body.idempotencyKey
  const timer = setTimeout(() => {
    const current = readStoredPendingCommand(storage)
    if (current?.body.idempotencyKey !== expectedKey) return
    onExpired(promotePendingChatbotCommandToRecoveryMarker(
      storage,
      currentScope,
      Date.now(),
    ))
  }, Math.max(0, command.expiresAt - now + 1))
  return () => clearTimeout(timer)
}

export function getPendingChatbotRecoveryPath(
  storage: Storage,
  currentScope: string,
  now = Date.now(),
): string | null {
  const command = readCurrentPendingCommand(storage, currentScope, now)
  if (command) return pendingPathForScope(command.scope)
  const marker = readCurrentRecoveryMarker(storage, currentScope, now)
  return marker ? pendingPathForScope(marker.scope) : null
}

export function loadPendingChatbotCommand(
  storage: Storage,
  scope: string,
  now = Date.now(),
): PendingChatbotCommand | null {
  const command = readCurrentPendingCommand(storage, scope, now)
  if (!command || command.scope !== scope) return null
  return command
}

export function loadPendingChatbotRecoveryMarker(
  storage: Storage,
  scope: string,
  now = Date.now(),
): PendingChatbotRecoveryMarker | null {
  const marker = readCurrentRecoveryMarker(storage, scope, now)
  if (!marker || marker.scope !== scope) return null
  return marker
}

export function clearPendingChatbotCommand(
  storage: Storage,
  expectedIdempotencyKey?: string,
): void {
  if (!expectedIdempotencyKey) {
    storage.removeItem(CHATBOT_PENDING_COMMAND_STORAGE_KEY)
    storage.removeItem(CHATBOT_PENDING_RECOVERY_MARKER_STORAGE_KEY)
    return
  }

  const command = readStoredPendingCommand(storage)
  if (command?.body.idempotencyKey === expectedIdempotencyKey) {
    storage.removeItem(CHATBOT_PENDING_COMMAND_STORAGE_KEY)
  }
  const marker = readStoredRecoveryMarker(storage)
  if (marker?.idempotencyKey === expectedIdempotencyKey) {
    storage.removeItem(CHATBOT_PENDING_RECOVERY_MARKER_STORAGE_KEY)
  }
}
