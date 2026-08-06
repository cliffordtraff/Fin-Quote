const COMPANY_SUFFIXES = new Set([
  'co',
  'company',
  'corp',
  'corporation',
  'group',
  'holding',
  'holdings',
  'inc',
  'incorporated',
  'international',
  'ltd',
  'limited',
  'plc',
])

const LEGAL_SUFFIXES = new Set([
  'co',
  'company',
  'corp',
  'corporation',
  'inc',
  'incorporated',
  'ltd',
  'limited',
  'plc',
])

// These words can occur naturally in an unrelated headline. They are useful
// only as part of the complete company name (for example, "Match Group").
const AMBIGUOUS_STANDALONE_TOKENS = new Set([
  'advance',
  'best',
  'booking',
  'capital',
  'crown',
  'discover',
  'dollar',
  'edison',
  'fidelity',
  'first',
  'fortune',
  'global',
  'international',
  'match',
  'news',
  'northern',
  'principal',
  'public',
  'republic',
  'state',
  'southern',
  'target',
  'travelers',
  'universal',
  'western',
])

const GENERIC_COMPANY_TOKENS = new Set([
  'airlines',
  'american',
  'bank',
  'brands',
  'digital',
  'energy',
  'financial',
  'health',
  'products',
  'services',
  'systems',
  'technologies',
  'technology',
])

// Uppercase spelling alone is not enough for symbols that are also ordinary
// English words. They must use explicit market notation such as $ALL,
// NYSE:ALL, or (ALL).
const COMMON_WORD_TICKERS = new Set([
  'A',
  'ALL',
  'ARE',
  'BEN',
  'BRO',
  'CAN',
  'CAT',
  'COST',
  'DAY',
  'DOC',
  'DOW',
  'FAST',
  'FIX',
  'HAS',
  'IT',
  'KEY',
  'LOW',
  'NOW',
  'ON',
  'POOL',
  'SO',
  'TAP',
  'WELL',
])

// These are intentionally conservative, editorially reviewed brand names.
// Product names do not belong here: a product mention is not automatically
// evidence about its public parent.
const CURATED_COMPANY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  A: ['Agilent'],
  BKNG: ['Booking.com'],
  DIS: ['Disney'],
  GOOG: ['Google'],
  GOOGL: ['Google'],
}

function normalizeEntityText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function significantCompanyTokens(companyName: string): string[] {
  return normalizeEntityText(companyName)
    .split(' ')
    .filter(
      (token) =>
        token.length >= 4 &&
        !COMPANY_SUFFIXES.has(token) &&
        !AMBIGUOUS_STANDALONE_TOKENS.has(token),
    )
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function hasExplicitTickerMention(text: string, ticker: string): boolean {
  const normalizedTicker = ticker.trim().toUpperCase()
  if (!normalizedTicker) return false
  const escaped = escapeRegExp(normalizedTicker)
  const prefixed = new RegExp(
    `(?:\\$${escaped}(?=$|[^A-Z0-9])|\\b(?:NYSE|NASDAQ|AMEX)\\s*:\\s*${escaped}(?=$|[^A-Z0-9]))`,
    'i',
  )
  // A bare parenthesized short word such as "(a)" or "(it)" is ordinary
  // prose, not a ticker. Require the original uppercase spelling there.
  const parenthesized = new RegExp(`\\(${escaped}\\)`)
  if (prefixed.test(text) || parenthesized.test(text)) return true

  // Short tickers such as A and IT are ordinary English words. They only
  // count when decorated as a financial symbol; longer tickers must retain
  // their uppercase spelling in the original source text.
  if (
    normalizedTicker.length < 3 ||
    COMMON_WORD_TICKERS.has(normalizedTicker)
  ) {
    return false
  }
  return new RegExp(
    `(?:^|[^A-Za-z0-9])${escaped}(?=$|[^A-Za-z0-9])`,
  ).test(text)
}

export function getNewsletterCompanyAliases(input: {
  ticker: string
  companyName: string
}): string[] {
  const fullCompanyName = normalizeEntityText(input.companyName)
  const aliases = new Set<string>()
  if (fullCompanyName) aliases.add(fullCompanyName)

  for (const suffixes of [LEGAL_SUFFIXES, COMPANY_SUFFIXES]) {
    const alias = fullCompanyName
      .split(' ')
      .filter((token) => token && !suffixes.has(token))
    if (isStrongCompanyAlias(alias)) aliases.add(alias.join(' '))
  }

  for (const alias of CURATED_COMPANY_ALIASES[
    input.ticker.trim().toUpperCase()
  ] ?? []) {
    const normalized = normalizeEntityText(alias)
    if (normalized) aliases.add(normalized)
  }

  return [...aliases]
}

function isStrongCompanyAlias(tokens: string[]): boolean {
  return (
    tokens.length >= 2 ||
    (tokens.length === 1 &&
      !AMBIGUOUS_STANDALONE_TOKENS.has(tokens[0]) &&
      !GENERIC_COMPANY_TOKENS.has(tokens[0]))
  )
}

/**
 * Fail-closed entity check for editorial evidence. A source must mention the
 * ticker, the complete normalized company name, or a genuinely distinctive
 * company token. This prevents collisions such as MTCH/Match Group with the
 * unrelated game title "Triple Match 3D".
 */
export function isNewsletterSourceEntityMatch(input: {
  ticker: string
  companyName: string
  text: string
}): boolean {
  const haystack = ` ${normalizeEntityText(input.text)} `
  if (!haystack.trim()) return false

  if (hasExplicitTickerMention(input.text, input.ticker)) return true

  return getNewsletterCompanyAliases(input).some((alias) =>
    haystack.includes(` ${alias} `),
  )
}

export const __testOnly = {
  normalizeEntityText,
  significantCompanyTokens,
  hasExplicitTickerMention,
}
