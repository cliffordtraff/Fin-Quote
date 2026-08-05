import { randomUUID } from 'crypto'
import { tmpdir } from 'os'
import { resolve } from 'path'

const LOCAL_OUTPUT_DIRECTORY = './.newsletter-output'
const TEMP_OUTPUT_NAMESPACE = 'the-intraday-newsletter'

interface NewsletterOutputRuntime {
  nodeEnv?: string
  tempDirectory?: string
  invocationId?: string
}

export function resolveNewsletterOutputDirectory(
  explicitOutputDirectory?: string,
  runtime: NewsletterOutputRuntime = {},
): string {
  if (explicitOutputDirectory?.trim()) {
    return resolve(explicitOutputDirectory)
  }

  const nodeEnv = runtime.nodeEnv ?? process.env.NODE_ENV
  if (nodeEnv === 'production') {
    return resolve(
      runtime.tempDirectory ?? tmpdir(),
      TEMP_OUTPUT_NAMESPACE,
      runtime.invocationId ?? randomUUID(),
    )
  }

  return resolve(LOCAL_OUTPUT_DIRECTORY)
}

export const __testOnly = {
  LOCAL_OUTPUT_DIRECTORY,
  TEMP_OUTPUT_NAMESPACE,
}
