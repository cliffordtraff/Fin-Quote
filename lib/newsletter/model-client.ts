import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { runCodexCliJsonPrompt } from './codex-cli'
import type { NewsletterModelBackend } from './types'

const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'
const DEFAULT_OLLAMA_MODEL = 'llama3.2'
const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434/v1'

export interface NewsletterModelClient {
  backend: NewsletterModelBackend
  client?: OpenAI
  model?: string
  isGpt5?: boolean
}

export interface RunNewsletterJsonPromptOptions {
  temperature?: number
  maxOutputTokens: number
}

interface SimplePromptMessage {
  role: 'system' | 'user'
  content: string
}

function normalizeOpenAiCompatibleBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`
}

function buildOpenAiInput(
  prefix: string,
  messages: SimplePromptMessage[],
) {
  return messages.map((message, index) => ({
    id: `${prefix}_${index}`,
    role: message.role,
    content: [{ type: 'input_text' as const, text: message.content }],
    type: 'message' as const,
  }))
}

function getOpenAiClient(): NewsletterModelClient {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is required when NEWSLETTER_MODEL_BACKEND=openai_api.',
    )
  }

  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL
  return {
    backend: 'openai_api',
    client: new OpenAI({ apiKey }),
    model,
    isGpt5: model.includes('gpt-5'),
  }
}

function getOllamaClient(): NewsletterModelClient {
  const baseURL = normalizeOpenAiCompatibleBaseUrl(
    process.env.NEWSLETTER_OLLAMA_BASE_URL?.trim() || DEFAULT_OLLAMA_BASE_URL,
  )
  const model =
    process.env.NEWSLETTER_OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL
  const apiKey =
    process.env.NEWSLETTER_OLLAMA_API_KEY?.trim() || 'ollama'

  return {
    backend: 'ollama',
    client: new OpenAI({
      apiKey,
      baseURL,
    }),
    model,
    isGpt5: false,
  }
}

function getCodexCliClient(): NewsletterModelClient {
  const model = process.env.NEWSLETTER_CODEX_MODEL?.trim() || undefined
  return {
    backend: 'codex_cli',
    model,
    isGpt5: false,
  }
}

function formatPromptExecutionError(
  backend: NewsletterModelBackend,
  error: unknown,
): Error {
  const message = error instanceof Error ? error.message : 'Unknown model error'

  if (backend === 'ollama') {
    if (/ECONNREFUSED|fetch failed|network error|connect/i.test(message)) {
      return new Error(
        'Ollama is not reachable. Start Ollama locally and make sure it is serving on NEWSLETTER_OLLAMA_BASE_URL.',
      )
    }

    if (/404|model .* not found|not found, try pulling it first/i.test(message)) {
      return new Error(
        'The configured Ollama model is not available locally. Pull NEWSLETTER_OLLAMA_MODEL in Ollama and try again.',
      )
    }
  }

  if (backend === 'codex_cli') {
    if (/not installed/i.test(message)) {
      return new Error(
        'Codex CLI is not installed. Run `npm i -g @openai/codex@latest` and sign in with your ChatGPT account.',
      )
    }

    if (/login|authenticate|auth/i.test(message)) {
      return new Error(
        'Codex CLI is not authenticated. Run `codex login` and sign in with your ChatGPT account.',
      )
    }
  }

  return error instanceof Error ? error : new Error(message)
}

export function resolveNewsletterModelBackend(
  override?: NewsletterModelBackend,
): NewsletterModelBackend {
  if (
    override === 'openai_api' ||
    override === 'ollama' ||
    override === 'codex_cli'
  ) {
    return override
  }

  const envBackend = process.env.NEWSLETTER_MODEL_BACKEND
  if (
    envBackend === 'openai_api' ||
    envBackend === 'ollama' ||
    envBackend === 'codex_cli'
  ) {
    return envBackend
  }

  return process.env.NODE_ENV === 'production' ? 'openai_api' : 'codex_cli'
}

export function createNewsletterModelClient(
  override?: NewsletterModelBackend,
): NewsletterModelClient {
  const backend = resolveNewsletterModelBackend(override)
  if (backend === 'openai_api') {
    return getOpenAiClient()
  }
  if (backend === 'ollama') {
    return getOllamaClient()
  }
  return getCodexCliClient()
}

export async function runNewsletterJsonPrompt(
  modelClient: NewsletterModelClient,
  prefix: string,
  messages: SimplePromptMessage[],
  options: RunNewsletterJsonPromptOptions,
): Promise<string> {
  try {
    if (modelClient.backend === 'codex_cli') {
      return await runCodexCliJsonPrompt(messages, {
        model: modelClient.model,
      })
    }

    if (!modelClient.client || !modelClient.model) {
      throw new Error('Model client is missing a provider configuration.')
    }

    if (modelClient.backend === 'openai_api') {
      const response = await modelClient.client.responses.create({
        model: modelClient.model,
        input: buildOpenAiInput(prefix, messages),
        ...(modelClient.isGpt5 ? {} : { temperature: options.temperature ?? 0 }),
        max_output_tokens: modelClient.isGpt5 ? 20000 : options.maxOutputTokens,
        ...(modelClient.isGpt5
          ? { reasoning: { effort: 'minimal' as const } }
          : {}),
        text: { format: { type: 'json_object' } },
      })

      return response.output_text ?? ''
    }

    const response = await modelClient.client.chat.completions.create({
      model: modelClient.model,
      messages: messages as ChatCompletionMessageParam[],
      temperature: options.temperature ?? 0,
      max_tokens: options.maxOutputTokens,
      response_format: { type: 'json_object' },
    })

    return response.choices[0]?.message?.content ?? ''
  } catch (error) {
    throw formatPromptExecutionError(modelClient.backend, error)
  }
}
