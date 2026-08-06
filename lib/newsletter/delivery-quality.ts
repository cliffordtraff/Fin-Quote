export const NEWSLETTER_SUBJECT_MAX_LENGTH = 60
export const NEWSLETTER_PREVIEW_MAX_LENGTH = 120
export const NEWSLETTER_HTML_MAX_BYTES = 90_000

const TRAILING_SUBJECT_FILLER = /\s+(?:a|an|and|as|at|by|for|from|in|of|on|or|the|to|with)$/i
const NEWSLETTER_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g
const UNSAFE_NEWSLETTER_CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/
const NEWSLETTER_ELLIPSIS = /(?:\.{3,}|…+)/g

function normalizePlainText(value: string): string {
  return value
    .replace(NEWSLETTER_CONTROL_CHARACTERS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compactNewsletterSubjectPhrases(value: string): string {
  const compacted = value
    .replace(
      /^([A-Z][A-Z0-9.-]{0,9})(\s+(?:up|down)\s+\d+(?:\.\d+)?%):\s+\1\s+(?=(?:Q\d|FY\d|beats?|posts?|raises?|cuts?|falls?|plunges?|reports?|guidance|revenue|EPS)\b)/i,
      '$1$2: ',
    )
    .replace(/\btops expectations\b/gi, 'beats estimates')
    .replace(/\b(EPS|revenue) beats,(?=\s)/gi, '$1 beats estimates,')
    .replace(
      /\bis scheduled to announce earnings today before (?:the )?market open\b/gi,
      'reports before the open',
    )
    .replace(
      /\bis scheduled to announce earnings today after (?:the )?market close\b/gi,
      'reports after the close',
    )
    .replace(
      /\b(?:is scheduled )?to report earnings(?: today)? before (?:the )?market open\b/gi,
      'reports before the open',
    )
    .replace(
      /\b(?:is scheduled )?to report earnings(?: today)? after (?:the )?(?:market )?close\b/gi,
      'reports after the close',
    )
  return compacted.length > NEWSLETTER_SUBJECT_MAX_LENGTH
    ? compacted.replace(
        /\b(?:Inc\.?|Corp\.?|Corporation|Ltd\.?)\s+(?=reports?\s+(?:before|after)\b)/gi,
        '',
      )
    : compacted
}

function safeGraphemePrefix(value: string, maxUtf16Units: number): string {
  if (value.length <= maxUtf16Units) return value
  const segments =
    typeof Intl.Segmenter === 'function'
      ? Array.from(
          new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
            value,
          ),
          (entry) => entry.segment,
        )
      : Array.from(value)
  let result = ''
  for (const segment of segments) {
    if (result.length + segment.length > maxUtf16Units) break
    result += segment
  }
  return result
}

function truncateAtWord(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  const candidate = safeGraphemePrefix(value, maxLength + 1)
  const minimumClauseLength = Math.floor(maxLength * 0.6)
  const clauseBoundaries = [
    ...candidate.matchAll(/[,;]|\s+(?:and|as|amid|after|before|but|despite|on|while|with)\s+/gi),
  ]
    .map((match) => match.index ?? -1)
    .filter((index) => index >= minimumClauseLength && index <= maxLength)
  const clauseBoundary = clauseBoundaries.at(-1)
  const lastSpace = candidate.lastIndexOf(' ')
  const boundary = clauseBoundary ??
    (lastSpace >= minimumClauseLength ? lastSpace : null)
  const truncated = boundary === null
    ? safeGraphemePrefix(candidate, maxLength)
    : candidate.slice(0, boundary)
  return truncated
    .trim()
    .replace(/[,:;\-–—]+$/, '')
}

/** Normalize generated and manually edited subjects to an inbox-safe length. */
export function normalizeNewsletterSubject(value: string): string {
  const plainText = compactNewsletterSubjectPhrases(
    normalizePlainText(value)
      .replace(NEWSLETTER_ELLIPSIS, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
  let normalized = truncateAtWord(
    plainText,
    NEWSLETTER_SUBJECT_MAX_LENGTH,
  )
  while (TRAILING_SUBJECT_FILLER.test(normalized)) {
    normalized = normalized.replace(TRAILING_SUBJECT_FILLER, '').trim()
  }
  return normalized
}

export function normalizeNewsletterPreviewText(value: string): string {
  return truncateAtWord(
    normalizePlainText(value),
    NEWSLETTER_PREVIEW_MAX_LENGTH,
  )
}

export function hasUnsafeNewsletterControlCharacters(value: string): boolean {
  return UNSAFE_NEWSLETTER_CONTROL_CHARACTER.test(value)
}

export function isSafeNewsletterLink(
  value: string | null | undefined,
): boolean {
  if (!value?.trim()) return false
  try {
    const parsed = new URL(value)
    return (
      parsed.protocol === 'https:' &&
      !parsed.username &&
      !parsed.password &&
      Boolean(parsed.hostname)
    )
  } catch {
    return false
  }
}

export function assertSafeNewsletterLink(value: string, label: string): void {
  if (!isSafeNewsletterLink(value)) {
    throw new Error(`${label} must be a public HTTPS URL.`)
  }
}

export function getNewsletterHtmlByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

export function assertNewsletterHtmlSize(value: string): void {
  const bytes = getNewsletterHtmlByteLength(value)
  if (bytes > NEWSLETTER_HTML_MAX_BYTES) {
    throw new Error(
      `Newsletter HTML is ${bytes.toLocaleString()} bytes; reduce it below ${NEWSLETTER_HTML_MAX_BYTES.toLocaleString()} bytes to avoid inbox clipping.`,
    )
  }
}

export const __testOnly = {
  safeGraphemePrefix,
}
