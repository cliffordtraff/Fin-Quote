import { generateNewsletter } from './orchestrate'
import { runLocalNewsletterWorker } from './local-worker'
import type {
  NewsletterGenerationBackend,
  NewsletterOptions,
  NewsletterResult,
} from './types'

export function resolveNewsletterGenerationBackend(
  override?: NewsletterGenerationBackend,
): NewsletterGenerationBackend {
  if (override === 'local_worker' || override === 'openai_api') {
    return override
  }

  return process.env.NEWSLETTER_GENERATION_BACKEND === 'openai_api'
    ? 'openai_api'
    : 'local_worker'
}

function stripGenerationBackendOption(
  options?: NewsletterOptions,
): NewsletterOptions | undefined {
  if (!options || options.generationBackend == null) return options

  const { generationBackend: _generationBackend, ...rest } = options
  return rest
}

export async function generateNewsletterWithBackend(
  ticker?: string,
  options?: NewsletterOptions,
): Promise<NewsletterResult> {
  const backend = resolveNewsletterGenerationBackend(options?.generationBackend)
  const normalizedOptions = stripGenerationBackendOption(options)

  if (backend === 'local_worker') {
    return runLocalNewsletterWorker(ticker, normalizedOptions)
  }

  return generateNewsletter(ticker, normalizedOptions)
}
