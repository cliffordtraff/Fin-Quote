import { randomBytes, timingSafeEqual } from 'crypto'
import { auth } from '@modelcontextprotocol/sdk/client/auth.js'
import {
  decryptBeehiivPayload,
  encryptBeehiivPayload,
} from './crypto'
import {
  BeehiivOAuthProvider,
  type BeehiivOAuthCredentials,
  type BeehiivOAuthPendingState,
} from './oauth-provider'

const BEEHIIV_MCP_URL = new URL('https://mcp.beehiiv.com/mcp')
const OAUTH_MAX_AGE_MS = 10 * 60 * 1000

export const BEEHIIV_OAUTH_COOKIE = 'finquote_beehiiv_oauth'
export const BEEHIIV_OAUTH_COOKIE_MAX_AGE_SECONDS = OAUTH_MAX_AGE_MS / 1000

export function sanitizeBeehiivReturnTo(value: string | null): string {
  const fallback = '/newsletter/morning-review'
  if (!value || !value.startsWith('/')) return fallback

  let decoded = value
  try {
    // Decode twice to catch nested encodings such as `%255c` before a browser
    // or proxy gets an opportunity to reinterpret them.
    decoded = decodeURIComponent(decoded)
    decoded = decodeURIComponent(decoded)
  } catch {
    return fallback
  }

  if (
    decoded.startsWith('//') ||
    decoded.includes('\\') ||
    /[\u0000-\u001f\u007f]/.test(decoded)
  ) {
    return fallback
  }

  const sentinelOrigin = 'https://return.theintraday.invalid'
  const resolved = new URL(value, sentinelOrigin)
  if (resolved.origin !== sentinelOrigin) return fallback

  return `${resolved.pathname}${resolved.search}${resolved.hash}`
}

export async function startBeehiivOAuth(input: {
  ownerId: string
  origin: string
  returnTo: string
}): Promise<{
  authorizationUrl: URL
  encryptedPendingState: string
}> {
  const redirectUri = new URL(
    '/api/integrations/beehiiv/callback',
    input.origin,
  ).toString()
  const oauthState = randomBytes(24).toString('base64url')
  const provider = new BeehiivOAuthProvider({
    redirectUri,
    oauthState,
  })

  const result = await auth(provider, {
    serverUrl: BEEHIIV_MCP_URL,
    scope: 'read write',
  })
  const providerState = provider.snapshot()
  if (
    result !== 'REDIRECT' ||
    !provider.authorizationUrl ||
    !providerState.clientInformation ||
    !providerState.codeVerifier
  ) {
    throw new Error('Beehiiv did not start the authorization flow')
  }

  const pending: BeehiivOAuthPendingState = {
    ownerId: input.ownerId,
    oauthState,
    returnTo: sanitizeBeehiivReturnTo(input.returnTo),
    redirectUri,
    clientInformation: providerState.clientInformation,
    codeVerifier: providerState.codeVerifier,
    createdAt: new Date().toISOString(),
  }

  return {
    authorizationUrl: provider.authorizationUrl,
    encryptedPendingState: encryptBeehiivPayload(pending),
  }
}

function statesMatch(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(received)
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  )
}

export async function finishBeehiivOAuth(input: {
  encryptedPendingState: string
  ownerId: string
  state: string
  authorizationCode: string
}): Promise<{
  credentials: BeehiivOAuthCredentials
  returnTo: string
}> {
  const pending = decryptBeehiivPayload<BeehiivOAuthPendingState>(
    input.encryptedPendingState,
  )
  const createdAt = new Date(pending.createdAt).getTime()
  if (
    !Number.isFinite(createdAt) ||
    Date.now() - createdAt > OAUTH_MAX_AGE_MS
  ) {
    throw new Error('Beehiiv authorization expired. Start the connection again.')
  }
  if (pending.ownerId !== input.ownerId) {
    throw new Error('Beehiiv authorization does not match the signed-in user.')
  }
  if (!statesMatch(pending.oauthState, input.state)) {
    throw new Error('Beehiiv authorization state is invalid.')
  }

  const provider = new BeehiivOAuthProvider({
    redirectUri: pending.redirectUri,
    oauthState: pending.oauthState,
    clientInformation: pending.clientInformation,
    codeVerifier: pending.codeVerifier,
  })
  const result = await auth(provider, {
    serverUrl: BEEHIIV_MCP_URL,
    authorizationCode: input.authorizationCode,
    scope: 'read write',
  })
  if (result !== 'AUTHORIZED') {
    throw new Error('Beehiiv authorization did not complete')
  }

  return {
    credentials: provider.credentials(),
    returnTo: sanitizeBeehiivReturnTo(pending.returnTo),
  }
}
