import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { BeehiivOAuthProvider } from './oauth-provider'
import {
  deleteBeehiivIntegration,
  getBeehiivIntegration,
  saveBeehiivRefreshedCredentials,
} from './store'
import type { BeehiivPostState, BeehiivPublication } from './types'

const BEEHIIV_MCP_URL = new URL('https://mcp.beehiiv.com/mcp')

export class BeehiivReconnectRequiredError extends Error {
  constructor() {
    super('Beehiiv needs to be reconnected before this draft can be synced.')
    this.name = 'BeehiivReconnectRequiredError'
  }
}

export interface BeehiivPostDraftInput {
  publicationId: string
  title: string
  htmlContent: string
  subjectLine: string
  previewText: string
}

export interface BeehiivPostDraftResult {
  postId: string
  previewUrl: string | null
  editorUrl: string
}

interface ToolResultLike {
  content?: Array<{
    type: string
    text?: string
  }>
  structuredContent?: unknown
  isError?: boolean
}

function resultText(result: ToolResultLike): string {
  return (result.content ?? [])
    .filter((item) => item.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('\n')
}

function parseJsonValue(value: string): unknown | null {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function toolResultValues(result: ToolResultLike): unknown[] {
  const values: unknown[] = []
  if (result.structuredContent !== undefined) {
    values.push(result.structuredContent)
  }
  for (const item of result.content ?? []) {
    if (item.type !== 'text' || typeof item.text !== 'string') continue
    const parsed = parseJsonValue(item.text)
    if (parsed !== null) values.push(parsed)
  }
  return values
}

function assertToolResult(result: ToolResultLike, action: string): void {
  if (!result.isError) return
  const detail = resultText(result).trim()
  throw new Error(detail || `Beehiiv could not ${action}`)
}

function walkValues(value: unknown, visit: (entry: unknown) => boolean): boolean {
  if (visit(value)) return true
  if (Array.isArray(value)) {
    return value.some((item) => walkValues(item, visit))
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some((item) => walkValues(item, visit))
  }
  return false
}

function findString(
  values: unknown[],
  predicate: (value: string, key: string | null) => boolean,
): string | null {
  let found: string | null = null
  for (const root of values) {
    walkValues(root, (entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return false
      }
      for (const [key, value] of Object.entries(entry)) {
        if (typeof value === 'string' && predicate(value, key)) {
          found = value
          return true
        }
      }
      return false
    })
    if (found) return found
  }
  return null
}

function parsePostResult(result: ToolResultLike): BeehiivPostDraftResult {
  const values = toolResultValues(result)
  const postId = findString(values, (value, key) => {
    return (
      /^post_[0-9a-f-]+$/i.test(value) &&
      (key === 'id' || key === 'post_id' || key === 'postId')
    )
  })
  if (!postId) {
    throw new Error('Beehiiv created the draft but did not return its post ID.')
  }

  const previewUrl = findString(values, (value, key) => {
    return (
      /^https:\/\//i.test(value) &&
      (key === 'preview_url' || key === 'previewUrl')
    )
  })
  const editorUrl = findString(values, (value, key) => {
    return (
      /^https:\/\/app\.beehiiv\.com\//i.test(value) &&
      ['editor_url', 'editorUrl', 'edit_url', 'editUrl', 'app_url'].includes(
        key ?? '',
      )
    )
  })

  return {
    postId,
    previewUrl,
    editorUrl: editorUrl ?? `https://app.beehiiv.com/posts/${postId}`,
  }
}

function findPostObject(
  values: unknown[],
  postId: string,
): Record<string, unknown> | null {
  let found: Record<string, unknown> | null = null
  for (const root of values) {
    walkValues(root, (entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return false
      }
      const record = entry as Record<string, unknown>
      const id = record.id ?? record.post_id ?? record.postId
      if (id === postId) {
        found = record
        return true
      }
      return false
    })
    if (found) return found
  }
  return null
}

function stringField(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

function parseBeehiivPostState(
  result: ToolResultLike,
  postId: string,
): BeehiivPostState {
  const values = toolResultValues(result)
  const post = findPostObject(values, postId)
  if (!post) {
    throw new Error('Beehiiv did not return the requested post state.')
  }
  const nestedStats =
    post.stats && typeof post.stats === 'object' && !Array.isArray(post.stats)
      ? (post.stats as Record<string, unknown>)
      : {}
  return {
    postId,
    status: stringField(post, ['status', 'post_status', 'postStatus']),
    publishDate: stringField(post, [
      'publish_date',
      'publishDate',
      'scheduled_at',
      'scheduledAt',
    ]),
    webUrl: stringField(post, [
      'web_url',
      'webUrl',
      'url',
      'canonical_url',
      'canonicalUrl',
    ]),
    stats: nestedStats,
  }
}

function collectPublicationCandidates(
  value: unknown,
  publications: BeehiivPublication[],
): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectPublicationCandidates(item, publications))
    return
  }
  if (!value || typeof value !== 'object') return

  const entry = value as Record<string, unknown>
  if (
    typeof entry.id === 'string' &&
    /^pub_[0-9a-f-]+$/i.test(entry.id) &&
    typeof entry.name === 'string'
  ) {
    publications.push({
      id: entry.id,
      name: entry.name,
      description:
        typeof entry.description === 'string' ? entry.description : null,
      url: typeof entry.url === 'string' ? entry.url : null,
    })
    return
  }

  Object.values(entry).forEach((item) =>
    collectPublicationCandidates(item, publications),
  )
}

async function withBeehiivClient<T>(
  ownerId: string,
  operation: (client: Client) => Promise<T>,
): Promise<T> {
  const integration = await getBeehiivIntegration(ownerId)
  if (!integration) {
    throw new BeehiivReconnectRequiredError()
  }

  const { credentials } = integration
  const provider = new BeehiivOAuthProvider({
    redirectUri: credentials.redirectUri,
    clientInformation: credentials.clientInformation,
    tokens: credentials.tokens,
    onStateChange: async (state) => {
      if (state.clientInformation && state.tokens) {
        await saveBeehiivRefreshedCredentials(
          ownerId,
          credentials.redirectUri,
          state.clientInformation,
          state.tokens,
        )
      } else {
        await deleteBeehiivIntegration(ownerId)
      }
    },
  })
  const client = new Client(
    { name: 'fin-quote', version: '1.0.0' },
    { capabilities: {} },
  )
  const transport = new StreamableHTTPClientTransport(BEEHIIV_MCP_URL, {
    authProvider: provider,
  })

  try {
    await client.connect(transport)
    return await operation(client)
  } catch (error) {
    if (
      error instanceof UnauthorizedError ||
      (error instanceof Error && error.message === 'Unauthorized')
    ) {
      await deleteBeehiivIntegration(ownerId)
      throw new BeehiivReconnectRequiredError()
    }
    throw error
  } finally {
    await client.close().catch(() => undefined)
  }
}

export async function listBeehiivPublications(
  ownerId: string,
): Promise<BeehiivPublication[]> {
  return withBeehiivClient(ownerId, async (client) => {
    const result = (await client.callTool({
      name: 'list_publications',
      arguments: {
        telemetry: {
          intent: 'Configure the Fin Quote newsletter delivery destination.',
        },
      },
    })) as CallToolResult
    assertToolResult(result, 'list publications')

    const publications: BeehiivPublication[] = []
    for (const value of toolResultValues(result)) {
      collectPublicationCandidates(value, publications)
    }
    return publications
  })
}

export async function createBeehiivPostDraft(
  ownerId: string,
  input: BeehiivPostDraftInput,
): Promise<BeehiivPostDraftResult> {
  return withBeehiivClient(ownerId, async (client) => {
    const result = (await client.callTool({
      name: 'save_post',
      arguments: {
        publication_id: input.publicationId,
        title: input.title,
        html_content: input.htmlContent,
        email_settings: {
          email_subject_line: input.subjectLine,
          email_preview_text: input.previewText,
          display_title_in_email: false,
          display_subtitle_in_email: false,
          display_byline_in_email: false,
        },
        telemetry: {
          intent: 'Create an editable Beehiiv draft from a reviewed Fin Quote issue.',
        },
      },
    })) as CallToolResult
    assertToolResult(result, 'create the newsletter draft')
    return parsePostResult(result)
  })
}

export async function updateBeehiivPostDraft(
  ownerId: string,
  postId: string,
  input: BeehiivPostDraftInput,
): Promise<void> {
  return withBeehiivClient(ownerId, async (client) => {
    const metadataResult = (await client.callTool({
      name: 'edit_post',
      arguments: {
        publication_id: input.publicationId,
        post_id: postId,
        title: input.title,
        email_settings: {
          email_subject_line: input.subjectLine,
          email_preview_text: input.previewText,
          display_title_in_email: false,
          display_subtitle_in_email: false,
          display_byline_in_email: false,
        },
        telemetry: {
          intent: 'Keep an existing Beehiiv draft aligned with the reviewed Fin Quote issue.',
        },
      },
    })) as CallToolResult
    assertToolResult(metadataResult, 'update the newsletter settings')

    const contentResult = (await client.callTool({
      name: 'edit_post_content',
      arguments: {
        publication_id: input.publicationId,
        post_id: postId,
        operations: [
          {
            type: 'replace',
            target: 'doc',
            content: input.htmlContent,
          },
        ],
        telemetry: {
          intent: 'Replace the Beehiiv draft body with the latest reviewed Fin Quote issue.',
        },
      },
    })) as CallToolResult
    assertToolResult(contentResult, 'update the newsletter body')
  })
}

export async function getBeehiivPostState(
  ownerId: string,
  publicationId: string,
  postId: string,
): Promise<BeehiivPostState> {
  return withBeehiivClient(ownerId, async (client) => {
    const result = (await client.callTool({
      name: 'get_post',
      arguments: {
        publication_id: publicationId,
        post_id: postId,
        telemetry: {
          intent:
            'Reconcile a Fin Quote newsletter with its Beehiiv delivery state.',
        },
      },
    })) as CallToolResult
    assertToolResult(result, 'load the newsletter post')
    return parseBeehiivPostState(result, postId)
  })
}

export const __testOnly = {
  parseBeehiivPostState,
}
