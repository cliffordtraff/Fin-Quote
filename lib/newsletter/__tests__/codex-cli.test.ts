import { describe, expect, it } from 'vitest'
import { extractJsonPayload } from '@/lib/newsletter/codex-cli'

describe('extractJsonPayload', () => {
  it('returns plain JSON unchanged', () => {
    expect(extractJsonPayload('{"ok":true}')).toBe('{"ok":true}')
  })

  it('extracts JSON from fenced output', () => {
    expect(extractJsonPayload('```json\n{"ok":true}\n```')).toBe('{"ok":true}')
  })

  it('extracts an object from surrounding prose', () => {
    expect(extractJsonPayload('Result:\n{"ok":true}\nDone.')).toBe('{"ok":true}')
  })
})
