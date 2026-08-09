export type ChatbotConversationTargetStatus =
  | 'pending'
  | 'ready'
  | 'not_found'
  | 'overflow'
  | 'unavailable'

export function isChatbotConversationTargetReady(
  requiresAuthoritativeRead: boolean,
  status: ChatbotConversationTargetStatus,
): boolean {
  return !requiresAuthoritativeRead || status === 'ready'
}
