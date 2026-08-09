export const MAX_CHAT_REQUEST_BYTES = 48 * 1024
export const MAX_CHAT_QUESTION_LENGTH = 2_000
export const MAX_CHAT_HISTORY_MESSAGES = 10
export const MAX_CHAT_HISTORY_MESSAGE_LENGTH = 2_000
export const MAX_CHAT_HISTORY_TOTAL_LENGTH = 12_000
export const MAX_CHAT_SESSION_ID_LENGTH = 128
export const MAX_CHAT_IDEMPOTENCY_KEY_LENGTH = 128
export const CHATBOT_AUTH_DEADLINE_MS = 5_000
export const CHATBOT_ROUTE_MAX_DURATION_SECONDS = 120
// The final RLS transaction reuses the JWT captured before model work. Leave
// the full route lifetime plus the normal auth skew so it cannot expire after
// paid work has started.
export const CHATBOT_MINIMUM_AUTH_VALIDITY_SECONDS =
  CHATBOT_ROUTE_MAX_DURATION_SECONDS + 30
export const CHATBOT_EXPECTED_USER_HEADER = 'x-intraday-expected-user-id'

// GPT-5 reasoning tokens count against max_output_tokens. These limits leave
// enough room for the intentionally concise chatbot responses without allowing
// a single request to consume the previous 20,000-token ceiling.
export const CHAT_ROUTING_MAX_OUTPUT_TOKENS = 1_200
export const CHAT_ANSWER_MAX_OUTPUT_TOKENS = 2_000
export const CHAT_FOLLOW_UP_MAX_OUTPUT_TOKENS = 500
