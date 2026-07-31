import { randomUUID } from 'crypto'
import type {
  OAuthClientProvider,
} from '@modelcontextprotocol/sdk/client/auth.js'
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js'

export interface BeehiivOAuthCredentials {
  redirectUri: string
  clientInformation: OAuthClientInformationMixed
  tokens: OAuthTokens
}

export interface BeehiivOAuthPendingState {
  ownerId: string
  oauthState: string
  returnTo: string
  redirectUri: string
  clientInformation: OAuthClientInformationMixed
  codeVerifier: string
  createdAt: string
}

interface BeehiivOAuthProviderState {
  clientInformation?: OAuthClientInformationMixed
  tokens?: OAuthTokens
  codeVerifier?: string
}

interface BeehiivOAuthProviderOptions extends BeehiivOAuthProviderState {
  redirectUri: string
  oauthState?: string
  onAuthorizationUrl?: (url: URL) => void | Promise<void>
  onStateChange?: (
    state: BeehiivOAuthProviderState,
  ) => void | Promise<void>
}

export class BeehiivOAuthProvider implements OAuthClientProvider {
  private readonly redirectUriValue: string
  private readonly oauthStateValue: string
  private readonly onAuthorizationUrl?: (url: URL) => void | Promise<void>
  private readonly onStateChange?: (
    state: BeehiivOAuthProviderState,
  ) => void | Promise<void>
  private current: BeehiivOAuthProviderState

  authorizationUrl: URL | null = null

  constructor(options: BeehiivOAuthProviderOptions) {
    this.redirectUriValue = options.redirectUri
    this.oauthStateValue = options.oauthState ?? randomUUID()
    this.onAuthorizationUrl = options.onAuthorizationUrl
    this.onStateChange = options.onStateChange
    this.current = {
      clientInformation: options.clientInformation,
      tokens: options.tokens,
      codeVerifier: options.codeVerifier,
    }
  }

  get redirectUrl(): string {
    return this.redirectUriValue
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'Fin Quote',
      redirect_uris: [this.redirectUriValue],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post',
      scope: 'read write',
    }
  }

  state(): string {
    return this.oauthStateValue
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    return this.current.clientInformation
  }

  async saveClientInformation(
    clientInformation: OAuthClientInformationMixed,
  ): Promise<void> {
    this.current.clientInformation = clientInformation
    await this.notifyStateChange()
  }

  tokens(): OAuthTokens | undefined {
    return this.current.tokens
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    this.current.tokens = tokens
    await this.notifyStateChange()
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    this.authorizationUrl = authorizationUrl
    await this.onAuthorizationUrl?.(authorizationUrl)
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    this.current.codeVerifier = codeVerifier
    await this.notifyStateChange()
  }

  codeVerifier(): string {
    if (!this.current.codeVerifier) {
      throw new Error('Missing Beehiiv OAuth code verifier')
    }
    return this.current.codeVerifier
  }

  async invalidateCredentials(
    scope: 'all' | 'client' | 'tokens' | 'verifier',
  ): Promise<void> {
    if (scope === 'all' || scope === 'client') {
      this.current.clientInformation = undefined
    }
    if (scope === 'all' || scope === 'tokens') {
      this.current.tokens = undefined
    }
    if (scope === 'all' || scope === 'verifier') {
      this.current.codeVerifier = undefined
    }
    await this.notifyStateChange()
  }

  snapshot(): BeehiivOAuthProviderState {
    return { ...this.current }
  }

  credentials(): BeehiivOAuthCredentials {
    if (!this.current.clientInformation || !this.current.tokens) {
      throw new Error('Beehiiv OAuth authorization is incomplete')
    }
    return {
      redirectUri: this.redirectUriValue,
      clientInformation: this.current.clientInformation,
      tokens: this.current.tokens,
    }
  }

  private async notifyStateChange(): Promise<void> {
    await this.onStateChange?.(this.snapshot())
  }
}
