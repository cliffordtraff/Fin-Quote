import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copyTextToClipboard } from '@/lib/clipboard'

describe('copyTextToClipboard', () => {
  const originalClipboard = navigator.clipboard
  const originalExecCommand = document.execCommand

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard,
    })

    document.execCommand = originalExecCommand
    document.body.innerHTML = ''
  })

  it('uses navigator.clipboard.writeText when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    const execCommand = vi.fn()
    document.execCommand = execCommand

    await copyTextToClipboard('hello world')

    expect(writeText).toHaveBeenCalledWith('hello world')
    expect(execCommand).not.toHaveBeenCalled()
  })

  it('falls back to execCommand when clipboard write rejects because the document is not focused', async () => {
    const writeText = vi.fn().mockRejectedValue(
      new DOMException(
        "Failed to execute 'writeText' on 'Clipboard': Document is not focused.",
        'NotAllowedError',
      ),
    )

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    const execCommand = vi.fn().mockReturnValue(true)
    document.execCommand = execCommand

    await copyTextToClipboard('<p>Beehiiv HTML</p>')

    expect(writeText).toHaveBeenCalledWith('<p>Beehiiv HTML</p>')
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull()
  })
})
