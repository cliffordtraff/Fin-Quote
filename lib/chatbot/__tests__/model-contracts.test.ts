import { describe, expect, it } from 'vitest'
import {
  ChatbotModelContractError,
  MAX_CHATBOT_ROUTER_JSON_CHARACTERS,
  parseChatbotFollowUpQuestions,
  parseChatbotToolSelection,
} from '@/lib/chatbot/model-contracts'

describe('chatbot model output contracts', () => {
  it('accepts and normalizes a bounded tool selection', () => {
    expect(parseChatbotToolSelection(JSON.stringify({
      tool: 'getFinancialMetric',
      args: {
        symbol: 'AAPL',
        metricNames: [' P/E ', 'ROE'],
        period: 'quarterly',
        quarters: [1, 3],
        limit: 12,
        ignored: 'not forwarded',
      },
      reasoning: ' Matches the requested ratios. ',
    }))).toEqual({
      tool: 'getFinancialMetric',
      args: {
        symbol: 'AAPL',
        metricNames: ['P/E', 'ROE'],
        period: 'quarterly',
        quarters: [1, 3],
        limit: 12,
      },
      reasoning: 'Matches the requested ratios.',
    })
  })

  it.each([
    JSON.stringify({ tool: 'getRecentFilings', args: { limit: 'many' } }),
    JSON.stringify({ tool: 'getPrices', args: { from: '2026-02-30' } }),
    JSON.stringify({
      tool: 'getFinancialMetric',
      args: { metricNames: Array.from({ length: 6 }, () => 'revenue') },
    }),
    JSON.stringify({ tool: 'madeUpTool', args: {} }),
    'x'.repeat(MAX_CHATBOT_ROUTER_JSON_CHARACTERS + 1),
  ])('rejects unsafe router output before a tool can run', (raw) => {
    expect(() => parseChatbotToolSelection(raw)).toThrow(ChatbotModelContractError)
  })

  it('keeps follow-up suggestions string-only and bounded', () => {
    expect(parseChatbotFollowUpQuestions(JSON.stringify({
      suggestions: [' First? ', 'Second?'],
    }))).toEqual(['First?', 'Second?'])

    expect(() => parseChatbotFollowUpQuestions(JSON.stringify({
      suggestions: ['one', 'two', 'three', 'four'],
    }))).toThrow(ChatbotModelContractError)
    expect(() => parseChatbotFollowUpQuestions(JSON.stringify({
      suggestions: ['bad\u0000suggestion'],
    }))).toThrow(ChatbotModelContractError)
    expect(() => parseChatbotFollowUpQuestions(JSON.stringify({
      suggestions: [String.fromCharCode(0xd800)],
    }))).toThrow(ChatbotModelContractError)
  })
})
