import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  OpenAIMock,
  responsesCreateMock,
  chatCompletionsCreateMock,
  runCodexCliJsonPromptMock,
} = vi.hoisted(() => {
  const responsesCreateMock = vi.fn()
  const chatCompletionsCreateMock = vi.fn()
  const runCodexCliJsonPromptMock = vi.fn()
  const OpenAIMock = vi.fn().mockImplementation(function MockOpenAI(options) {
    return {
      options,
      responses: {
        create: responsesCreateMock,
      },
      chat: {
        completions: {
          create: chatCompletionsCreateMock,
        },
      },
    }
  })

  return {
    OpenAIMock,
    responsesCreateMock,
    chatCompletionsCreateMock,
    runCodexCliJsonPromptMock,
  }
})

vi.mock('openai', () => ({
  default: OpenAIMock,
}))

vi.mock('@/lib/newsletter/codex-cli', () => ({
  runCodexCliJsonPrompt: runCodexCliJsonPromptMock,
}))

import {
  createNewsletterModelClient,
  resolveNewsletterModelBackend,
  runNewsletterJsonPrompt,
} from '@/lib/newsletter/model-client'

describe('newsletter model client', () => {
  const originalModelBackend = process.env.NEWSLETTER_MODEL_BACKEND
  const originalOpenAiKey = process.env.OPENAI_API_KEY
  const originalOpenAiModel = process.env.OPENAI_MODEL
  const originalOllamaBaseUrl = process.env.NEWSLETTER_OLLAMA_BASE_URL
  const originalOllamaModel = process.env.NEWSLETTER_OLLAMA_MODEL
  const originalOllamaApiKey = process.env.NEWSLETTER_OLLAMA_API_KEY
  const originalCodexModel = process.env.NEWSLETTER_CODEX_MODEL

  beforeEach(() => {
    delete process.env.NEWSLETTER_MODEL_BACKEND
    delete process.env.OPENAI_API_KEY
    delete process.env.OPENAI_MODEL
    delete process.env.NEWSLETTER_OLLAMA_BASE_URL
    delete process.env.NEWSLETTER_OLLAMA_MODEL
    delete process.env.NEWSLETTER_OLLAMA_API_KEY
    delete process.env.NEWSLETTER_CODEX_MODEL
    OpenAIMock.mockClear()
    responsesCreateMock.mockReset()
    chatCompletionsCreateMock.mockReset()
    runCodexCliJsonPromptMock.mockReset()
  })

  afterEach(() => {
    if (originalModelBackend == null) {
      delete process.env.NEWSLETTER_MODEL_BACKEND
    } else {
      process.env.NEWSLETTER_MODEL_BACKEND = originalModelBackend
    }

    if (originalOpenAiKey == null) {
      delete process.env.OPENAI_API_KEY
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiKey
    }

    if (originalOpenAiModel == null) {
      delete process.env.OPENAI_MODEL
    } else {
      process.env.OPENAI_MODEL = originalOpenAiModel
    }

    if (originalOllamaBaseUrl == null) {
      delete process.env.NEWSLETTER_OLLAMA_BASE_URL
    } else {
      process.env.NEWSLETTER_OLLAMA_BASE_URL = originalOllamaBaseUrl
    }

    if (originalOllamaModel == null) {
      delete process.env.NEWSLETTER_OLLAMA_MODEL
    } else {
      process.env.NEWSLETTER_OLLAMA_MODEL = originalOllamaModel
    }

    if (originalOllamaApiKey == null) {
      delete process.env.NEWSLETTER_OLLAMA_API_KEY
    } else {
      process.env.NEWSLETTER_OLLAMA_API_KEY = originalOllamaApiKey
    }

    if (originalCodexModel == null) {
      delete process.env.NEWSLETTER_CODEX_MODEL
    } else {
      process.env.NEWSLETTER_CODEX_MODEL = originalCodexModel
    }
  })

  it('defaults to codex_cli when no model backend env is set', () => {
    expect(resolveNewsletterModelBackend()).toBe('codex_cli')
  })

  it('builds a codex-backed client by default', () => {
    process.env.NEWSLETTER_CODEX_MODEL = 'gpt-5.4-mini'

    const client = createNewsletterModelClient()

    expect(client.backend).toBe('codex_cli')
    expect(client.model).toBe('gpt-5.4-mini')
    expect(OpenAIMock).not.toHaveBeenCalled()
  })

  it('requires OPENAI_API_KEY when the model backend is openai_api', () => {
    expect(() => createNewsletterModelClient('openai_api')).toThrow(
      'OPENAI_API_KEY is required when NEWSLETTER_MODEL_BACKEND=openai_api.',
    )
  })

  it('uses chat completions for ollama json prompts', async () => {
    chatCompletionsCreateMock.mockResolvedValue({
      choices: [{ message: { content: '{"ok":true}' } }],
    })

    const modelClient = createNewsletterModelClient('ollama')
    const output = await runNewsletterJsonPrompt(
      modelClient,
      'msg_test',
      [{ role: 'user', content: 'Return JSON' }],
      { maxOutputTokens: 200, temperature: 0 },
    )

    expect(output).toBe('{"ok":true}')
    expect(chatCompletionsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'llama3.2',
        response_format: { type: 'json_object' },
      }),
    )
  })

  it('delegates codex_cli prompts to the Codex CLI helper', async () => {
    runCodexCliJsonPromptMock.mockResolvedValue('{"ok":true}')

    const modelClient = createNewsletterModelClient('codex_cli')
    const output = await runNewsletterJsonPrompt(
      modelClient,
      'msg_test',
      [{ role: 'user', content: 'Return JSON' }],
      { maxOutputTokens: 200, temperature: 0 },
    )

    expect(output).toBe('{"ok":true}')
    expect(runCodexCliJsonPromptMock).toHaveBeenCalledWith(
      [{ role: 'user', content: 'Return JSON' }],
      { model: undefined },
    )
  })
})
