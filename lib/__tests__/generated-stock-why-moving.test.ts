import { describe, expect, it } from 'vitest'

import { __testOnly } from '@/lib/generated-stock-why-moving'

describe('generated stock why moving JSON parsing', () => {
  it('parses clean JSON responses', () => {
    const parsed = __testOnly.parseJsonObject(`{
      "summary": "Shares rose after earnings beat.",
      "key_fact": "EPS beat consensus.",
      "reason_type": "earnings",
      "no_summary_reason": null
    }`)

    expect(parsed.summary).toBe('Shares rose after earnings beat.')
    expect(parsed.reason_type).toBe('earnings')
  })

  it('salvages malformed backslashes from model JSON', () => {
    const parsed = __testOnly.parseJsonObject(String.raw`{
      "summary": "Shares moved after management cited growth in C:\\new\\segment and analyst support.",
      "key_fact": "Expansion in C:\\new\\segment.",
      "reason_type": "other",
      "no_summary_reason": null
    }`)

    expect(parsed.summary).toBe('Shares moved after management cited growth in C:\\new\\segment and analyst support.')
    expect(parsed.key_fact).toBe('Expansion in C:\\new\\segment.')
  })

  it('strips code fences and trailing commas', () => {
    const fencedPayload = [
      '```json',
      '{',
      '  "summary": null,',
      '  "key_fact": null,',
      '  "reason_type": "unclear",',
      '  "no_summary_reason": "quiet_tape",',
      '}',
      '```',
    ].join('\n')
    const parsed = __testOnly.parseJsonObject(fencedPayload)

    expect(parsed.summary).toBeNull()
    expect(parsed.no_summary_reason).toBe('quiet_tape')
  })
})
