import {
  isAuthSessionMissingError,
  type User,
} from '@supabase/supabase-js'

export type ChatbotClientAuthResolution =
  | { status: 'resolved'; user: User | null }
  | { status: 'unavailable' }

type InitialUserResult = {
  data: { user: User | null }
  error: unknown
}

export function classifyInitialChatbotUser(
  result: InitialUserResult,
): ChatbotClientAuthResolution {
  if (result.error) {
    return isAuthSessionMissingError(result.error)
      ? { status: 'resolved', user: null }
      : { status: 'unavailable' }
  }

  return { status: 'resolved', user: result.data.user ?? null }
}

/**
 * Auth-state events are authoritative over the mount-time getUser request.
 * Keeping this fence independent of React state makes the ordering contract
 * explicit and prevents a late transport failure from publishing an
 * anonymous principal after a newer signed-in event.
 */
export class ChatbotClientAuthFence {
  private generation = 0
  private disposed = false

  beginInitialLookup(): number {
    this.generation += 1
    return this.generation
  }

  resolveInitialLookup(
    generation: number,
    result: InitialUserResult,
  ): ChatbotClientAuthResolution | null {
    if (this.disposed || generation !== this.generation) return null
    return classifyInitialChatbotUser(result)
  }

  rejectInitialLookup(
    generation: number,
  ): ChatbotClientAuthResolution | null {
    if (this.disposed || generation !== this.generation) return null
    return { status: 'unavailable' }
  }

  publishAuthEvent(user: User | null): ChatbotClientAuthResolution | null {
    if (this.disposed) return null
    this.generation += 1
    return { status: 'resolved', user }
  }

  dispose(): void {
    this.disposed = true
    this.generation += 1
  }
}
