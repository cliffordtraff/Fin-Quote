import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8')
}

describe('chatbot model-spend source boundary', () => {
  it('keeps the feedback action free of model generation exports', () => {
    const action = source('app/actions/ask-question.ts')

    expect(action).not.toMatch(/export\s+(?:async\s+)?function\s+askQuestion\b/)
    expect(action).not.toMatch(/export\s+const\s+askQuestion\b/)
    expect(action).not.toContain("from 'openai'")
    expect(action).not.toContain('responses.create')
  })

  it('keeps the rendered chatbot form on the streaming HTTP route only', () => {
    const page = source('app/chatbot/page.tsx')

    expect(page).toContain("fetch('/api/ask'")
    expect(page).toContain('<form onSubmit={handleSubmitStreaming}>')
    expect(page).toContain('signal: clientRequest.signal')
    expect(page).toContain('requestCoordinator.attachReader')
    expect(page).toContain('createChatbotSseParser(handleEvent)')
    expect(page).toContain('requestCoordinator.cancelCurrent()')
    expect(page).toContain('setQueryLogId(null)')
    expect(page).toContain('requestCoordinator.acceptFeedbackReceipt')
    expect(page).toContain('requestCoordinator.ownsFeedbackReceipt(visibleQueryLogId)')
    expect(page).toContain('!visibleLoading && visibleAnswer && visibleQueryLogId')
    expect(page).toContain('projectChatbotPromptHistory(')
    expect(page).toContain('const requestBody: PendingChatbotRequestBody = projectChatbotRequestBody({')
    expect(page).toContain('body: JSON.stringify(requestBody)')
    expect(page).toContain('savePendingChatbotCommand(')
    expect(page).toContain('requestCoordinator.begin(')
    expect(page).toContain('if (!pendingCommand) {')
    expect(page).toContain('(!streamedAnswer || pendingCommand !== undefined)')
    expect(page).toContain("data.code === 'CHATBOT_COMPLETION_UNCERTAIN'")
    expect(page).toContain('isRetryablePendingChatbotResponse(')
    expect(source('lib/chatbot/pending-command.ts')).toContain(
      "code === 'CHATBOT_RATE_LIMIT'",
    )
    expect(page).toContain('optimisticBaselineRef.current = {')
    expect(page).toContain('setConversationHistory(baseline.history)')
    expect(page).toContain('handleLoadOlderMessages')
    expect(page).toContain('hasPendingChatbotCommand(')
    expect(page).toContain('requestedHistoryScope,')
    expect(page).toContain('navigationLocked={visiblePendingRecoveryLocked}')
    expect(page).toContain('loadPendingChatbotRecoveryMarker(')
    expect(page).toContain('schedulePendingChatbotCommandExpiry(')
    expect(page).toContain('resolvePendingChatbotRequest({')
    expect(page).toContain('requestCoordinator.cancelCurrent(new DOMException(')
    expect(page.indexOf('pendingRecoveryStartedRef.current = clientRequest.idempotencyKey'))
      .toBeLessThan(page.indexOf('setPendingRecoveryCheck(previous => previous + 1)'))
    expect(page).toContain('Return to pending chat')
    expect(page).toContain('historyGenerationFence.invalidate()')
    expect(page.match(/classifyCompletedConversationRecovery\(/g)).toHaveLength(2)
    expect(page).toContain('This completed chat was deleted in another tab.')
    expect(page).toContain('const restored = await getConversation(conversationIdSnapshot)')
    expect(page).toContain('if (!pendingCommand && !conversationTargetReady)')
    expect(page.match(/!conversationTargetReady \|\|/g)).toHaveLength(2)
    expect(page).toContain("setConversationTargetState({ scope: requestScope, status: 'pending' })")
    expect(page).toContain('const authFence = new ChatbotClientAuthFence()')
    expect(page).toContain('authFence.resolveInitialLookup(lookupGeneration, result)')
    expect(page).toContain('authFence.publishAuthEvent(session?.user ?? null)')
    expect(page).toContain("if (resolution.status === 'unavailable')")
    expect(page).toContain('setAuthResolved(false)')
    expect(source('lib/chatbot/pending-command.ts')).toContain(
      'Another chatbot request is still pending recovery.',
    )
    expect(page).not.toContain('commitConversationTurn')
    expect(page).not.toMatch(/\baskQuestion\s*\(/)
    expect(page).not.toMatch(/const\s+handleSubmit\s*=/)

    const renderStart = page.indexOf('  return (\n    <>', page.indexOf('function AskPageContent'))
    const renderEnd = page.indexOf('\n}\n\nexport default', renderStart)
    const renderedPage = page.slice(renderStart, renderEnd)
    expect(renderedPage).toContain('visibleConversationHistory.map')
    expect(renderedPage).toContain('value={visibleQuestion}')
    expect(renderedPage).toContain('currentConversationId={visibleCurrentConversationId}')
    expect(renderedPage).toContain('events={visibleFlowEvents}')
    expect(renderedPage).not.toContain('conversationHistory.map')
    expect(renderedPage).not.toContain('value={question}')
    expect(renderedPage).not.toContain('currentConversationId={currentConversationId}')
    expect(renderedPage).not.toContain('events={flowEvents}')
  })

  it('keeps admission and exact-origin checks in front of the route model call', () => {
    const route = source('app/api/ask/route.ts')
    const origin = route.indexOf('chatbotCommandOriginResponse(req)')
    const admission = route.indexOf('reserveChatbotRequest(currentUser.id)')
    const preflight = route.indexOf('preflightChatbotConversationTarget(')
    const model = route.indexOf('openai.responses.create')

    expect(origin).toBeGreaterThan(-1)
    expect(admission).toBeGreaterThan(origin)
    expect(preflight).toBeGreaterThan(origin)
    expect(model).toBeGreaterThan(preflight)
    expect(model).toBeGreaterThan(admission)
    expect(source('lib/chatbot/complete-turn.ts')).not.toContain("from 'node:")
    expect(source('lib/chatbot/command-fingerprint.ts')).not.toContain("from 'node:")
    expect(source('lib/chatbot/command-fingerprint.ts')).toContain(
      "crypto.subtle.digest(",
    )
    expect(source('lib/chatbot/request-fingerprint.ts')).not.toContain(
      "from 'node:",
    )
  })
})
