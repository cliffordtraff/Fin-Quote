'use server'

import { fingerprintChatbotCommand } from '@/lib/chatbot/command-fingerprint'
import { requireCurrentUserContext } from '@/lib/auth/current-user'
import { comparePostgresTimestamps } from '@/lib/chatbot/timestamp-order'
import {
  chatbotConversationDatabaseRowSchema,
  chatbotConversationDetailInputSchema,
  chatbotConversationListInputSchema,
  chatbotConversationPageDatabaseRowSchema,
  deleteChatbotConversationDatabaseRowSchema,
  deleteChatbotConversationInputSchema,
  type ChatbotConversationDetailInput,
  type ChatbotConversationDetailResult,
  type ChatbotConversationListInput,
  type ChatbotConversationListResult,
  type DeleteChatbotConversationInput,
  type DeleteChatbotConversationResult,
} from '@/lib/chatbot/conversation-contract'

const CONVERSATION_DB_DEADLINE_MS = 5_000

function databaseDeadline(): {
  signal: AbortSignal
  clear: () => void
} {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort(new DOMException(
      'Conversation storage exceeded its deadline.',
      'TimeoutError',
    ))
  }, CONVERSATION_DB_DEADLINE_MS)
  return { signal: controller.signal, clear: () => clearTimeout(timeout) }
}

function commandUnavailable(
  error = 'Conversation storage is temporarily unavailable.',
) {
  return { status: 'unavailable' as const, error }
}

function listUnavailable(
  error = 'Conversation storage is temporarily unavailable.',
): Extract<ChatbotConversationListResult, { status: 'unavailable' }> {
  return { status: 'unavailable', conversations: null, nextCursor: null, error }
}

function detailUnavailable(
  error = 'Conversation storage is temporarily unavailable.',
): Extract<ChatbotConversationDetailResult, { status: 'unavailable' }> {
  return {
    status: 'unavailable',
    conversation: null,
    messages: null,
    nextCursor: null,
    error,
  }
}

export async function getConversations(
  input: ChatbotConversationListInput = {},
): Promise<ChatbotConversationListResult> {
  const parsed = chatbotConversationListInputSchema.safeParse(input)
  if (!parsed.success) return listUnavailable('Invalid conversation-list cursor.')

  const deadline = databaseDeadline()
  try {
    const { client: supabase } = await requireCurrentUserContext({
      signal: deadline.signal,
    })
    const { data, error } = await supabase.rpc('list_chatbot_conversations', {
      p_before_updated_at: parsed.data.beforeUpdatedAt ?? null,
      p_before_id: parsed.data.beforeId ?? null,
      p_limit: parsed.data.limit,
    }).abortSignal(deadline.signal)
    if (
      error ||
      !Array.isArray(data) ||
      data.length > parsed.data.limit + 1
    ) return listUnavailable()

    const validatedRows = data.map(row =>
      chatbotConversationDatabaseRowSchema.safeParse(row),
    )
    if (validatedRows.some(result => !result.success)) return listUnavailable()

    const rows = validatedRows.flatMap(result =>
      result.success ? [result.data] : [],
    )
    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1]!
      const current = rows[index]!
      const timestampOrder = comparePostgresTimestamps(
        previous.updated_at,
        current.updated_at,
      )
      if (
        timestampOrder < 0 ||
        (timestampOrder === 0 && previous.id <= current.id)
      ) return listUnavailable()
    }
    const hasMore = rows.length > parsed.data.limit
    const page = rows.slice(0, parsed.data.limit).map(row => ({
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      revision: row.revision,
    }))

    if (page.length === 0 && !parsed.data.beforeId) {
      return { status: 'empty', conversations: [], nextCursor: null }
    }

    const last = page.at(-1)
    return {
      status: 'ready',
      conversations: page,
      nextCursor: hasMore && last
        ? { beforeUpdatedAt: last.updatedAt, beforeId: last.id }
        : null,
    }
  } catch {
    return listUnavailable()
  } finally {
    deadline.clear()
  }
}

export async function getConversation(
  input: string | ChatbotConversationDetailInput,
): Promise<ChatbotConversationDetailResult> {
  const parsed = chatbotConversationDetailInputSchema.safeParse(
    typeof input === 'string' ? { conversationId: input } : input,
  )
  if (!parsed.success) {
    return {
      status: 'not_found',
      conversation: null,
      messages: null,
      nextCursor: null,
    }
  }

  const deadline = databaseDeadline()
  try {
    const { client: supabase } = await requireCurrentUserContext({
      signal: deadline.signal,
    })
    const { data, error } = await supabase.rpc(
      'get_chatbot_conversation_page',
      {
        p_conversation_id: parsed.data.conversationId,
        p_before_created_at: parsed.data.beforeCreatedAt ?? null,
        p_before_id: parsed.data.beforeId ?? null,
        p_limit: parsed.data.limit,
      },
    ).abortSignal(deadline.signal)
    if (
      error ||
      !Array.isArray(data) ||
      data.length < 1 ||
      data.length > parsed.data.limit
    ) return detailUnavailable()

    const decodedRows = data.map(row =>
      chatbotConversationPageDatabaseRowSchema.safeParse(row),
    )
    if (decodedRows.some(row => !row.success)) return detailUnavailable()
    const rows = decodedRows.flatMap(row => row.success ? [row.data] : [])
    const first = rows[0]
    if (!first) return detailUnavailable()
    if (first.status === 'not_found') {
      if (rows.length !== 1) return detailUnavailable()
      return {
        status: 'not_found',
        conversation: null,
        messages: null,
        nextCursor: null,
      }
    }
    if (first.status === 'overflow') {
      if (rows.length !== 1) return detailUnavailable()
      return {
        status: 'overflow',
        conversation: null,
        messages: null,
        nextCursor: null,
        error: 'This legacy conversation is too large to load safely.',
      }
    }
    if (
      rows.some(row =>
        row.status !== 'ready' ||
        row.conversation_id !== first.conversation_id ||
        row.title !== first.title ||
        row.conversation_created_at !== first.conversation_created_at ||
        row.conversation_updated_at !== first.conversation_updated_at ||
        row.revision !== first.revision ||
        row.has_more !== first.has_more
      ) ||
      !first.conversation_id ||
      !first.title ||
      !first.conversation_created_at ||
      !first.conversation_updated_at ||
      first.revision === null
    ) return detailUnavailable()

    const messageRows = rows.filter(row => row.message_id !== null)
    for (let index = 1; index < messageRows.length; index += 1) {
      const previous = messageRows[index - 1]!
      const current = messageRows[index]!
      if (
        comparePostgresTimestamps(
          previous.message_created_at!,
          current.message_created_at!,
        ) < 0 ||
        (
          comparePostgresTimestamps(
            previous.message_created_at!,
            current.message_created_at!,
          ) === 0 &&
          previous.message_id! <= current.message_id!
        )
      ) return detailUnavailable()
    }

    const oldest = messageRows.at(-1)
    if (first.has_more && !oldest) return detailUnavailable()

    return {
      status: 'ready',
      conversation: {
        id: first.conversation_id,
        title: first.title,
        createdAt: first.conversation_created_at,
        updatedAt: first.conversation_updated_at,
        revision: first.revision,
      },
      messages: [...messageRows].reverse().map(message => ({
        id: message.message_id!,
        role: message.message_role!,
        content: message.message_content!,
        createdAt: message.message_created_at!,
        chartConfig: message.chart_config,
        followUpQuestions: message.follow_up_questions,
        dataUsed: message.data_used,
      })),
      nextCursor: first.has_more && oldest
        ? {
            beforeCreatedAt: oldest.message_created_at!,
            beforeId: oldest.message_id!,
          }
        : null,
    }
  } catch {
    return detailUnavailable()
  } finally {
    deadline.clear()
  }
}

export async function deleteConversation(
  input: DeleteChatbotConversationInput,
): Promise<DeleteChatbotConversationResult> {
  const parsed = deleteChatbotConversationInputSchema.safeParse(input)
  if (!parsed.success) {
    return commandUnavailable('Invalid conversation delete command.')
  }

  const requestFingerprint = await fingerprintChatbotCommand({
    version: 1,
    conversationId: parsed.data.conversationId,
    expectedRevision: parsed.data.expectedRevision,
  })
  const deadline = databaseDeadline()

  try {
    const { client: supabase } = await requireCurrentUserContext({
      signal: deadline.signal,
    })

    const { data, error } = await supabase.rpc('delete_chatbot_conversation', {
      p_conversation_id: parsed.data.conversationId,
      p_expected_revision: parsed.data.expectedRevision,
      p_idempotency_key: parsed.data.idempotencyKey,
      p_request_fingerprint: requestFingerprint,
    }).abortSignal(deadline.signal)

    if (error || !Array.isArray(data) || data.length !== 1) {
      return commandUnavailable()
    }
    const decoded = deleteChatbotConversationDatabaseRowSchema.safeParse(data[0])
    if (!decoded.success) return commandUnavailable()
    const row = decoded.data

    return {
      status: 'ready',
      disposition: row.disposition,
      conversationId: row.conversation_id,
      revision: row.revision,
    }
  } catch {
    return commandUnavailable()
  } finally {
    deadline.clear()
  }
}
