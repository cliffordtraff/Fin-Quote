export const PULSE_TEXT_SYMBOLS = ['GOOGL', 'AAPL', 'NVDA', 'TSLA'] as const

export type PulseTextSymbol = (typeof PULSE_TEXT_SYMBOLS)[number]

export interface PulseTextNewsItem {
  title: string
  publishedDate: string
  site: string
  url: string
}

export interface PulseTextProfile {
  symbol: PulseTextSymbol
  companyName: string
  description: string
  sector: string | null
  industry: string | null
  exchange: string | null
  fullTimeEmployees: number | null
  ipoDate: string | null
  country: string | null
  city: string | null
}

export interface PulseTextContext {
  news: PulseTextNewsItem[]
  profile: PulseTextProfile | null
}

export type PulseTextContextParseResult =
  | { ok: true; value: PulseTextContext }
  | { ok: false }

const SYMBOL_SET = new Set<string>(PULSE_TEXT_SYMBOLS)
const MAX_NEWS_ITEMS = 3

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function boundedString(
  value: unknown,
  maximumLength: number,
  allowEmpty: boolean,
): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!allowEmpty && normalized.length === 0) return null
  return normalized.slice(0, maximumLength)
}

function nullableBoundedString(
  value: unknown,
  maximumLength: number,
): string | null | undefined {
  if (value === null) return null
  const normalized = boundedString(value, maximumLength, true)
  if (normalized === null) return undefined
  return normalized.length > 0 ? normalized : null
}

function normalizeHttpUrl(value: unknown): string | null {
  const candidate = boundedString(value, 2_048, false)
  if (!candidate) return null

  try {
    const url = new URL(candidate)
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : null
  } catch {
    return null
  }
}

export function parsePulseTextSymbol(value: string): PulseTextSymbol | null {
  const normalized = value.toUpperCase()
  return SYMBOL_SET.has(normalized) ? normalized as PulseTextSymbol : null
}

function normalizeNewsItem(value: unknown): PulseTextNewsItem | null {
  if (!isRecord(value)) return null
  const title = boundedString(value.title, 240, false)
  const publishedDate = boundedString(value.publishedDate, 64, true)
  const site = boundedString(value.site, 120, true)
  const url = normalizeHttpUrl(value.url)
  if (title === null || publishedDate === null || site === null || url === null) {
    return null
  }

  return { title, publishedDate, site, url }
}

function normalizeProfile(
  value: unknown,
  symbol: PulseTextSymbol,
): PulseTextProfile | null | undefined {
  if (value === null) return null
  if (!isRecord(value) || value.symbol !== symbol) return undefined

  const companyName = boundedString(value.companyName, 160, false)
  const description = boundedString(value.description, 4_000, true)
  const sector = nullableBoundedString(value.sector, 120)
  const industry = nullableBoundedString(value.industry, 160)
  const exchange = nullableBoundedString(value.exchange, 80)
  const ipoDate = nullableBoundedString(value.ipoDate, 32)
  const country = nullableBoundedString(value.country, 120)
  const city = nullableBoundedString(value.city, 120)
  const employees = value.fullTimeEmployees

  if (
    companyName === null ||
    description === null ||
    sector === undefined ||
    industry === undefined ||
    exchange === undefined ||
    ipoDate === undefined ||
    country === undefined ||
    city === undefined ||
    !(
      employees === null ||
      (typeof employees === 'number' &&
        Number.isSafeInteger(employees) &&
        employees >= 0 &&
        employees <= 10_000_000_000)
    )
  ) {
    return undefined
  }

  return {
    symbol,
    companyName,
    description,
    sector,
    industry,
    exchange,
    fullTimeEmployees: employees,
    ipoDate,
    country,
    city,
  }
}

/**
 * Treat this public payload as an untrusted runtime boundary. The four-symbol
 * allowlist is exact, news is capped at three rows, and every exposed string or
 * number has a finite maximum before it reaches either a cache or the browser.
 */
export function parsePulseTextContext(
  value: unknown,
  symbol: PulseTextSymbol,
): PulseTextContextParseResult {
  if (!isRecord(value) || !Array.isArray(value.news) || !('profile' in value)) {
    return { ok: false }
  }

  const news: PulseTextNewsItem[] = []
  for (const rawItem of value.news.slice(0, MAX_NEWS_ITEMS)) {
    const item = normalizeNewsItem(rawItem)
    if (!item) return { ok: false }
    news.push(item)
  }

  const profile = normalizeProfile(value.profile, symbol)
  if (profile === undefined) return { ok: false }
  return { ok: true, value: { news, profile } }
}
