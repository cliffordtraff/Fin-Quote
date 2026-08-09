import 'server-only'

import { z } from 'zod'
import { isPostgresSafeText } from './postgres-text'

export const MAX_CHATBOT_ROUTER_JSON_CHARACTERS = 12_000
export const MAX_CHATBOT_FOLLOW_UP_JSON_CHARACTERS = 4_000
export const MAX_CHATBOT_ANSWER_CHARACTERS = 32_000

const reasoningSchema = z.string().trim().min(1).max(500).optional()
const tickerSchema = z.string().trim().regex(/^[A-Z][A-Z0-9.-]{0,9}$/).optional()
const limitSchema = z.number().int().min(1).max(40).optional()
const quartersSchema = z.array(z.number().int().min(1).max(4)).max(4).optional()

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  }, 'Date must be a real calendar date.')

const financialMetricSchema = z.enum([
  'revenue',
  'gross_profit',
  'net_income',
  'operating_income',
  'total_assets',
  'total_liabilities',
  'shareholders_equity',
  'operating_cash_flow',
  'eps',
  'debt_to_equity_ratio',
  'gross_margin',
  'roe',
])

const toolSelectionSchema = z.discriminatedUnion('tool', [
  z.object({
    tool: z.enum(['getFinancialsByMetric', 'getAaplFinancialsByMetric']),
    args: z.object({
      symbol: tickerSchema,
      metric: financialMetricSchema,
      limit: limitSchema,
      period: z.enum(['annual', 'quarterly']).optional(),
      quarters: quartersSchema,
    }).strip(),
    reasoning: reasoningSchema,
  }).strip(),
  z.object({
    tool: z.literal('getPrices'),
    args: z.object({
      symbol: tickerSchema,
      from: dateSchema,
      to: dateSchema.optional(),
    }).strip(),
    reasoning: reasoningSchema,
  }).strip(),
  z.object({
    tool: z.literal('getRecentFilings'),
    args: z.object({ limit: z.number().int().min(1).max(10).optional() }).strip(),
    reasoning: reasoningSchema,
  }).strip(),
  z.object({
    tool: z.literal('searchFilings'),
    args: z.object({
      query: z.string().trim().max(500).optional(),
      limit: z.number().int().min(1).max(10).optional(),
    }).strip(),
    reasoning: reasoningSchema,
  }).strip(),
  z.object({
    tool: z.literal('listMetrics'),
    args: z.object({ category: z.string().trim().min(1).max(100).optional() }).strip(),
    reasoning: reasoningSchema,
  }).strip(),
  z.object({
    tool: z.literal('getFinancialMetric'),
    args: z.object({
      symbol: tickerSchema,
      metricNames: z.array(z.string().trim().min(1).max(100)).min(1).max(5),
      limit: limitSchema,
      period: z.enum(['annual', 'quarterly', 'ttm']).optional(),
      quarters: quartersSchema,
    }).strip(),
    reasoning: reasoningSchema,
  }).strip(),
])

const followUpSchema = z.object({
  suggestions: z.array(
    z.string().trim().min(1).max(200)
      .refine(isPostgresSafeText, 'Suggestion contains invalid text.'),
  ).max(3),
}).strip()

export type ChatbotToolSelection = z.infer<typeof toolSelectionSchema>

export class ChatbotModelContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ChatbotModelContractError'
  }
}

function parseBoundedJson(raw: string, maxCharacters: number): unknown {
  if (raw.length > maxCharacters) {
    throw new ChatbotModelContractError('The model response exceeded its size limit.')
  }
  try {
    return JSON.parse(raw.trim())
  } catch {
    throw new ChatbotModelContractError('The model response was not valid JSON.')
  }
}

export function parseChatbotToolSelection(raw: string): ChatbotToolSelection {
  const result = toolSelectionSchema.safeParse(
    parseBoundedJson(raw, MAX_CHATBOT_ROUTER_JSON_CHARACTERS),
  )
  if (!result.success) {
    throw new ChatbotModelContractError(
      result.error.issues[0]?.message ?? 'The model selected an invalid tool.',
    )
  }
  return result.data
}

export function parseChatbotFollowUpQuestions(raw: string): string[] {
  const result = followUpSchema.safeParse(
    parseBoundedJson(raw, MAX_CHATBOT_FOLLOW_UP_JSON_CHARACTERS),
  )
  if (!result.success) {
    throw new ChatbotModelContractError(
      result.error.issues[0]?.message ?? 'The model returned invalid suggestions.',
    )
  }
  return result.data.suggestions
}
