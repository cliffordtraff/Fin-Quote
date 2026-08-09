import { z } from 'zod'
import { isCurrentChatbotIdempotencyKey } from './idempotency-key'
import { isPostgresSafeText } from './postgres-text'

export const CHATBOT_CONVERSATION_LIST_DEFAULT = 20
export const CHATBOT_CONVERSATION_LIST_MAX = 50
export const CHATBOT_CONVERSATION_MAX_COUNT = 100
export const CHATBOT_CONVERSATION_MESSAGE_MAX = 200
export const CHATBOT_CONVERSATION_MESSAGE_PAGE_DEFAULT = 50
export const CHATBOT_CONVERSATION_MESSAGE_PAGE_MAX = 50
export const CHATBOT_CONVERSATION_MESSAGE_PAGE_MAX_BYTES = 768 * 1024
export const CHATBOT_CONVERSATION_TITLE_MAX_CHARACTERS = 120
export const CHATBOT_CONVERSATION_TITLE_MAX_BYTES = 512
export const CHATBOT_USER_MESSAGE_MAX_BYTES = 8 * 1024
export const CHATBOT_ASSISTANT_MESSAGE_MAX_BYTES = 32 * 1024
export const CHATBOT_CHART_CONFIG_MAX_BYTES = 128 * 1024
export const CHATBOT_DATA_USED_MAX_BYTES = 256 * 1024
export const CHATBOT_FOLLOW_UP_MAX = 5
export const CHATBOT_FOLLOW_UP_MAX_CHARACTERS = 240
export const CHATBOT_COMMAND_KEY_MAX_CHARACTERS = 128
export const CHATBOT_JSON_MAX_DEPTH = 32
export const CHATBOT_JSON_MAX_NODES = 4_096

const encoder = new TextEncoder()

function utf8Length(value: string): number {
  return encoder.encode(value).byteLength
}

function codePointLength(value: string): number {
  return Array.from(value).length
}

function jsonByteLength(value: unknown): number | null {
  try {
    const serialized = JSON.stringify(value)
    return typeof serialized === 'string' ? utf8Length(serialized) : null
  } catch {
    return null
  }
}

function expandedJsonNumberLength(value: number): number {
  const serialized = JSON.stringify(value)
  if (!/[eE]/.test(serialized)) return serialized.length
  const match = serialized.match(/^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/)
  if (!match) return Number.MAX_SAFE_INTEGER
  const signLength = match[1]?.length ?? 0
  const whole = match[2] ?? ''
  const fraction = match[3] ?? ''
  const digits = whole + fraction
  const decimalPosition = whole.length + Number(match[4])
  if (!Number.isSafeInteger(decimalPosition)) return Number.MAX_SAFE_INTEGER
  if (decimalPosition <= 0) {
    return signLength + 2 + Math.abs(decimalPosition) + digits.length
  }
  if (decimalPosition >= digits.length) {
    return signLength + decimalPosition
  }
  return signLength + digits.length + 1
}

function boundedPlainJsonStats(value: unknown): {
  valid: boolean
  postgresTextExtraBytes: number
} {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }]
  const seen = new WeakSet<object>()
  let nodeCount = 0
  let postgresTextExtraBytes = 0

  while (pending.length > 0) {
    const current = pending.pop()!
    nodeCount += 1
    if (nodeCount > CHATBOT_JSON_MAX_NODES || current.depth > CHATBOT_JSON_MAX_DEPTH) {
      return { valid: false, postgresTextExtraBytes: 0 }
    }

    if (current.value === null || typeof current.value === 'boolean') continue
    if (typeof current.value === 'string') {
      if (!isPostgresSafeText(current.value)) {
        return { valid: false, postgresTextExtraBytes: 0 }
      }
      continue
    }
    if (typeof current.value === 'number') {
      if (!Number.isFinite(current.value)) {
        return { valid: false, postgresTextExtraBytes: 0 }
      }
      const compactLength = JSON.stringify(current.value).length
      postgresTextExtraBytes += Math.max(
        0,
        expandedJsonNumberLength(current.value) - compactLength,
      )
      continue
    }
    if (typeof current.value !== 'object') {
      return { valid: false, postgresTextExtraBytes: 0 }
    }
    if (seen.has(current.value)) return { valid: false, postgresTextExtraBytes: 0 }
    seen.add(current.value)

    let children: unknown[]
    if (Array.isArray(current.value)) {
      if (current.value.length > CHATBOT_JSON_MAX_NODES) {
        return { valid: false, postgresTextExtraBytes: 0 }
      }
      children = []
      for (let index = 0; index < current.value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(current.value, index)) {
          return { valid: false, postgresTextExtraBytes: 0 }
        }
        children.push(current.value[index])
      }
      if (Object.keys(current.value).length !== current.value.length) {
        return { valid: false, postgresTextExtraBytes: 0 }
      }
      if (Reflect.ownKeys(current.value).length !== current.value.length + 1) {
        return { valid: false, postgresTextExtraBytes: 0 }
      }
    } else {
      const prototype = Object.getPrototypeOf(current.value)
      if (prototype !== Object.prototype && prototype !== null) {
        return { valid: false, postgresTextExtraBytes: 0 }
      }
      const keys = Object.keys(current.value)
      if (
        Reflect.ownKeys(current.value).length !== keys.length ||
        keys.some(key => !isPostgresSafeText(key))
      ) {
        return { valid: false, postgresTextExtraBytes: 0 }
      }
      children = keys.map(key => (current.value as Record<string, unknown>)[key])
    }
    // PostgreSQL jsonb::text renders one space after every comma and, for
    // objects, every colon. Account for that representation before comparing
    // with the database byte caps.
    postgresTextExtraBytes += Math.max(0, children.length - 1)
    if (!Array.isArray(current.value)) postgresTextExtraBytes += children.length
    for (const child of children) {
      pending.push({ value: child, depth: current.depth + 1 })
    }
  }

  return { valid: true, postgresTextExtraBytes }
}

const boundedJsonObject = (maxBytes: number, label: string) => z
  .unknown()
  .nullable()
  .superRefine((value, context) => {
    if (value === null) return
    const stats = boundedPlainJsonStats(value)
    if (
      typeof value !== 'object' ||
      Array.isArray(value) ||
      !stats.valid
    ) {
      context.addIssue({
        code: 'custom',
        message: `${label} is invalid or too deeply nested.`,
      })
      return
    }
    const byteLength = jsonByteLength(value)
    if (
      byteLength === null ||
      byteLength + stats.postgresTextExtraBytes > maxBytes
    ) {
      context.addIssue({
        code: 'custom',
        message: `${label} is invalid or too large.`,
      })
    }
  })

export const chatbotConversationIdSchema = z.string().uuid()
export const chatbotConversationRevisionSchema = z.number().int().min(0)
export const chatbotCommandKeySchema = z
  .string()
  .min(8)
  .max(CHATBOT_COMMAND_KEY_MAX_CHARACTERS)
  .refine(
    key => isCurrentChatbotIdempotencyKey(key),
    'Command key is invalid or outside the 30-day retry window.',
  )

export const chatbotConversationTitleSchema = z
  .string()
  .trim()
  .min(1)
  .refine(isPostgresSafeText, 'Conversation title contains invalid text.')
  .refine(
    value => codePointLength(value) <= CHATBOT_CONVERSATION_TITLE_MAX_CHARACTERS,
    'Conversation title is too long.',
  )
  .refine(
    value => utf8Length(value) <= CHATBOT_CONVERSATION_TITLE_MAX_BYTES,
    'Conversation title is too large.',
  )

const boundedContent = (maxBytes: number, label: string) => z
  .string()
  .refine(value => value.trim().length > 0, `${label} cannot be empty.`)
  .refine(isPostgresSafeText, `${label} contains invalid text.`)
  .refine(value => utf8Length(value) <= maxBytes, `${label} is too large.`)

export const chatbotFollowUpQuestionsSchema = z
  .array(
    z.string().trim().min(1)
      .refine(isPostgresSafeText, 'Follow-up question contains invalid text.')
      .refine(
        value => codePointLength(value) <= CHATBOT_FOLLOW_UP_MAX_CHARACTERS,
        'Follow-up question is too long.',
      )
      .refine(value => utf8Length(value) <= 960, 'Follow-up question is too large.'),
  )
  .max(CHATBOT_FOLLOW_UP_MAX)
  .nullable()

export const chatbotTurnPersistenceMetadataSchema = z.object({
  chartConfig: boundedJsonObject(
    CHATBOT_CHART_CONFIG_MAX_BYTES,
    'Chart configuration',
  ),
  dataUsed: boundedJsonObject(CHATBOT_DATA_USED_MAX_BYTES, 'Data used'),
}).strict()

export const chatbotConversationListInputSchema = z
  .object({
    beforeUpdatedAt: z.string().datetime({ offset: true }).optional(),
    beforeId: chatbotConversationIdSchema.optional(),
    limit: z.number().int().min(1).max(CHATBOT_CONVERSATION_LIST_MAX)
      .default(CHATBOT_CONVERSATION_LIST_DEFAULT),
  })
  .strict()
  .refine(
    value => Boolean(value.beforeUpdatedAt) === Boolean(value.beforeId),
    'Both conversation cursor fields are required together.',
  )

export const chatbotConversationDetailInputSchema = z
  .object({
    conversationId: chatbotConversationIdSchema,
    beforeCreatedAt: z.string().datetime({ offset: true }).optional(),
    beforeId: chatbotConversationIdSchema.optional(),
    limit: z.number().int().min(1).max(CHATBOT_CONVERSATION_MESSAGE_PAGE_MAX)
      .default(CHATBOT_CONVERSATION_MESSAGE_PAGE_DEFAULT),
  })
  .strict()
  .refine(
    value => Boolean(value.beforeCreatedAt) === Boolean(value.beforeId),
    'Both message cursor fields are required together.',
  )

export const commitChatbotConversationTurnInputSchema = z
  .object({
    conversationId: chatbotConversationIdSchema.nullable(),
    expectedRevision: chatbotConversationRevisionSchema,
    idempotencyKey: chatbotCommandKeySchema,
    userContent: boundedContent(CHATBOT_USER_MESSAGE_MAX_BYTES, 'User message'),
    assistantContent: boundedContent(
      CHATBOT_ASSISTANT_MESSAGE_MAX_BYTES,
      'Assistant message',
    ),
    chartConfig: boundedJsonObject(
      CHATBOT_CHART_CONFIG_MAX_BYTES,
      'Chart configuration',
    ).optional().default(null),
    followUpQuestions: chatbotFollowUpQuestionsSchema.optional().default(null),
    dataUsed: boundedJsonObject(CHATBOT_DATA_USED_MAX_BYTES, 'Data used')
      .optional()
      .default(null),
  })
  .strict()

export const deleteChatbotConversationInputSchema = z
  .object({
    conversationId: chatbotConversationIdSchema,
    expectedRevision: chatbotConversationRevisionSchema,
    idempotencyKey: chatbotCommandKeySchema,
  })
  .strict()

const databaseTimestampSchema = z.string().datetime({ offset: true })
const databaseTitleSchema = z
  .string()
  .refine(value => value.trim().length > 0, 'Conversation title cannot be empty.')
  .refine(isPostgresSafeText, 'Conversation title contains invalid text.')
  .refine(
    value => codePointLength(value) <= CHATBOT_CONVERSATION_TITLE_MAX_CHARACTERS,
    'Conversation title is too long.',
  )
  .refine(
    value => utf8Length(value) <= CHATBOT_CONVERSATION_TITLE_MAX_BYTES,
    'Conversation title is too large.',
  )

export const chatbotConversationDatabaseRowSchema = z.object({
  id: chatbotConversationIdSchema,
  title: databaseTitleSchema,
  created_at: databaseTimestampSchema,
  updated_at: databaseTimestampSchema,
  revision: chatbotConversationRevisionSchema,
}).strict()

export const chatbotConversationMessageDatabaseRowSchema = z.object({
  id: chatbotConversationIdSchema,
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  created_at: databaseTimestampSchema,
  chart_config: boundedJsonObject(
    CHATBOT_CHART_CONFIG_MAX_BYTES,
    'Chart configuration',
  ),
  follow_up_questions: chatbotFollowUpQuestionsSchema,
  data_used: boundedJsonObject(CHATBOT_DATA_USED_MAX_BYTES, 'Data used'),
}).strict().superRefine((row, context) => {
  const maxBytes = row.role === 'user'
    ? CHATBOT_USER_MESSAGE_MAX_BYTES
    : CHATBOT_ASSISTANT_MESSAGE_MAX_BYTES
  if (
    row.content.trim().length === 0 ||
    !isPostgresSafeText(row.content) ||
    utf8Length(row.content) > maxBytes
  ) {
    context.addIssue({
      code: 'custom',
      path: ['content'],
      message: 'Message content is empty or oversized.',
    })
  }
})

export const chatbotConversationPageDatabaseRowSchema = z.object({
  status: z.enum(['ready', 'not_found', 'overflow']),
  conversation_id: chatbotConversationIdSchema.nullable(),
  title: databaseTitleSchema.nullable(),
  conversation_created_at: databaseTimestampSchema.nullable(),
  conversation_updated_at: databaseTimestampSchema.nullable(),
  revision: chatbotConversationRevisionSchema.nullable(),
  message_id: chatbotConversationIdSchema.nullable(),
  message_role: z.enum(['user', 'assistant']).nullable(),
  message_content: z.string().nullable(),
  message_created_at: databaseTimestampSchema.nullable(),
  chart_config: boundedJsonObject(
    CHATBOT_CHART_CONFIG_MAX_BYTES,
    'Chart configuration',
  ),
  follow_up_questions: chatbotFollowUpQuestionsSchema,
  data_used: boundedJsonObject(CHATBOT_DATA_USED_MAX_BYTES, 'Data used'),
  has_more: z.boolean(),
}).strict().superRefine((row, context) => {
  const hasConversation = row.conversation_id !== null && row.title !== null &&
    row.conversation_created_at !== null &&
    row.conversation_updated_at !== null && row.revision !== null
  const hasNoConversation = row.conversation_id === null && row.title === null &&
    row.conversation_created_at === null &&
    row.conversation_updated_at === null && row.revision === null
  const hasMessageIdentity = row.message_id !== null && row.message_role !== null &&
    row.message_content !== null && row.message_created_at !== null
  const hasNoMessage = row.message_id === null && row.message_role === null &&
    row.message_content === null && row.message_created_at === null &&
    row.chart_config === null && row.follow_up_questions === null &&
    row.data_used === null

  let valid = false
  if (row.status === 'ready') {
    valid = hasConversation && (hasMessageIdentity || (hasNoMessage && !row.has_more))
    if (valid && hasMessageIdentity) {
      valid = chatbotConversationMessageDatabaseRowSchema.safeParse({
        id: row.message_id,
        role: row.message_role,
        content: row.message_content,
        created_at: row.message_created_at,
        chart_config: row.chart_config,
        follow_up_questions: row.follow_up_questions,
        data_used: row.data_used,
      }).success
    }
  } else {
    valid = hasNoConversation && hasNoMessage && !row.has_more
  }

  if (!valid) {
    context.addIssue({
      code: 'custom',
      message: 'Conversation detail RPC returned an invalid row shape.',
    })
  }
})

const commitDispositionSchema = z.enum([
  'applied',
  'replayed',
  'key_conflict',
  'revision_conflict',
  'conversation_quota',
  'message_quota',
  'command_quota',
  'deleted',
  'gone',
])

export const commitChatbotConversationTurnDatabaseRowSchema = z.object({
  disposition: commitDispositionSchema,
  conversation_id: chatbotConversationIdSchema.nullable(),
  revision: chatbotConversationRevisionSchema.nullable(),
  title: databaseTitleSchema.nullable(),
  updated_at: databaseTimestampSchema.nullable(),
  user_message_id: chatbotConversationIdSchema.nullable(),
  assistant_message_id: chatbotConversationIdSchema.nullable(),
}).strict().superRefine((row, context) => {
  const hasConversation = row.conversation_id !== null
  const hasRevision = row.revision !== null
  const hasPresentation = hasConversation && hasRevision && row.title !== null &&
    row.updated_at !== null
  const hasMessagePair = row.user_message_id !== null &&
    row.assistant_message_id !== null
  const hasNoMessages = row.user_message_id === null &&
    row.assistant_message_id === null
  const isContentFree = row.title === null && row.updated_at === null &&
    hasNoMessages

  let valid = false
  switch (row.disposition) {
    case 'applied':
    case 'replayed':
      valid = hasPresentation && hasMessagePair
      break
    case 'key_conflict':
      valid = hasConversation && hasRevision && row.title === null && (
        (row.updated_at !== null && hasMessagePair) ||
        (row.updated_at === null && hasNoMessages)
      )
      break
    case 'revision_conflict':
      valid = hasNoMessages && (
        hasPresentation ||
        (!hasRevision && row.title === null && row.updated_at === null)
      )
      break
    case 'conversation_quota':
      valid = !hasConversation && !hasRevision && isContentFree
      break
    case 'message_quota':
      valid = hasPresentation && hasNoMessages
      break
    case 'command_quota':
      valid = !hasRevision && isContentFree
      break
    case 'deleted':
      valid = hasConversation && row.title === null && (
        (hasRevision && row.updated_at !== null && hasMessagePair) ||
        (!hasRevision && row.updated_at === null && hasNoMessages)
      )
      break
    case 'gone':
      valid = hasConversation && !hasRevision && isContentFree
      break
  }

  if (!valid) {
    context.addIssue({
      code: 'custom',
      message: 'Conversation turn RPC returned an invalid disposition shape.',
    })
  }
})

const deleteDispositionSchema = z.enum([
  'applied',
  'replayed',
  'key_conflict',
  'revision_conflict',
  'not_found',
  'gone',
  'command_quota',
])

export const deleteChatbotConversationDatabaseRowSchema = z.object({
  disposition: deleteDispositionSchema,
  conversation_id: chatbotConversationIdSchema,
  revision: chatbotConversationRevisionSchema.nullable(),
}).strict().superRefine((row, context) => {
  const requiresRevision = [
    'applied',
    'replayed',
    'key_conflict',
    'revision_conflict',
    'gone',
  ].includes(row.disposition)
  if (requiresRevision !== (row.revision !== null)) {
    context.addIssue({
      code: 'custom',
      message: 'Conversation delete RPC returned an invalid disposition shape.',
    })
  }
})

export type ChatbotConversationListInput = z.input<
  typeof chatbotConversationListInputSchema
>
export type ChatbotConversationDetailInput = z.input<
  typeof chatbotConversationDetailInputSchema
>
export type CommitChatbotConversationTurnInput = z.input<
  typeof commitChatbotConversationTurnInputSchema
>
export type DeleteChatbotConversationInput = z.input<
  typeof deleteChatbotConversationInputSchema
>

export type ChatbotConversationSummary = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  revision: number
}

export type ChatbotConversationMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  chartConfig: unknown | null
  followUpQuestions: string[] | null
  dataUsed: unknown | null
}

export type ChatbotConversationCursor = {
  beforeUpdatedAt: string
  beforeId: string
}

export type ChatbotConversationMessageCursor = {
  beforeCreatedAt: string
  beforeId: string
}

export type ChatbotConversationListResult =
  | {
      status: 'ready'
      conversations: ChatbotConversationSummary[]
      nextCursor: ChatbotConversationCursor | null
    }
  | { status: 'empty'; conversations: []; nextCursor: null }
  | { status: 'unavailable'; conversations: null; nextCursor: null; error: string }

export type ChatbotConversationDetailResult =
  | {
      status: 'ready'
      conversation: ChatbotConversationSummary
      messages: ChatbotConversationMessage[]
      nextCursor: ChatbotConversationMessageCursor | null
    }
  | { status: 'not_found'; conversation: null; messages: null; nextCursor: null }
  | {
      status: 'overflow'
      conversation: null
      messages: null
      nextCursor: null
      error: string
    }
  | {
      status: 'unavailable'
      conversation: null
      messages: null
      nextCursor: null
      error: string
    }

export type ChatbotConversationTurnDisposition =
  | 'applied'
  | 'replayed'
  | 'key_conflict'
  | 'revision_conflict'
  | 'conversation_quota'
  | 'message_quota'
  | 'command_quota'
  | 'deleted'
  | 'gone'

export type ChatbotConversationTurnResult =
  | {
      status: 'ready'
      disposition: ChatbotConversationTurnDisposition
      conversationId: string | null
      revision: number | null
      title: string | null
      updatedAt: string | null
      userMessageId: string | null
      assistantMessageId: string | null
    }
  | { status: 'unavailable'; error: string }

export type DeleteChatbotConversationDisposition =
  | 'applied'
  | 'replayed'
  | 'key_conflict'
  | 'revision_conflict'
  | 'not_found'
  | 'gone'
  | 'command_quota'

export type DeleteChatbotConversationResult =
  | {
      status: 'ready'
      disposition: DeleteChatbotConversationDisposition
      conversationId: string
      revision: number | null
    }
  | { status: 'unavailable'; error: string }
