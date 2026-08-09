import 'server-only'

import { after } from 'next/server'

export type ChatbotBackgroundTaskRegistrar = (task: Promise<void>) => void

let registrarOverride: ChatbotBackgroundTaskRegistrar | null = null

/**
 * Keep the physically-owned chatbot pipeline attached to the invocation after
 * the SSE response closes. This is what lets durable settlement and local
 * capacity release finish even when a provider ignores cancellation.
 */
export const registerChatbotBackgroundTask: ChatbotBackgroundTaskRegistrar = (
  task,
) => {
  if (registrarOverride) {
    registrarOverride(task)
    return
  }

  // Route tests execute without a Next request store.
  if (process.env.VITEST === 'true') {
    void task.catch(() => undefined)
    return
  }

  after(async () => {
    await task
  })
}

export const chatbotBackgroundWorkTestOnly = {
  setRegistrar(registrar: ChatbotBackgroundTaskRegistrar | null): void {
    registrarOverride = registrar
  },
}
