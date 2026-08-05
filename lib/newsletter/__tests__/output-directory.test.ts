import path from 'path'
import { describe, expect, it } from 'vitest'
import {
  __testOnly,
  resolveNewsletterOutputDirectory,
} from '../output-directory'

describe('newsletter output directory', () => {
  it('uses an invocation-scoped writable temp path in production', () => {
    const result = resolveNewsletterOutputDirectory(undefined, {
      nodeEnv: 'production',
      tempDirectory: '/tmp',
      invocationId: 'invocation-123',
    })

    expect(result).toBe(
      path.resolve(
        '/tmp',
        __testOnly.TEMP_OUTPUT_NAMESPACE,
        'invocation-123',
      ),
    )
    expect(result).not.toContain('/var/task')
  })

  it('keeps the familiar repository output folder for local development', () => {
    expect(
      resolveNewsletterOutputDirectory(undefined, {
        nodeEnv: 'development',
      }),
    ).toBe(path.resolve(__testOnly.LOCAL_OUTPUT_DIRECTORY))
  })

  it('honors an explicit output directory in every runtime', () => {
    expect(
      resolveNewsletterOutputDirectory('./custom-newsletter-output', {
        nodeEnv: 'production',
        tempDirectory: '/tmp',
        invocationId: 'ignored',
      }),
    ).toBe(path.resolve('./custom-newsletter-output'))
  })
})
