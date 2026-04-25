import type { FeaturedStock, GeneratedCopy } from './types'

const COMPANY_SUFFIX_RE =
  /\b(incorporated|inc|corp|corporation|co|company|companies|ltd|limited|plc|holdings|holding|group|sa|nv|ag|se|class\s+[a-z]|cl\.?\s+[a-z])\b\.?/gi

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeCompanyName(name: string): string {
  return name
    .replace(COMPANY_SUFFIX_RE, '')
    .replace(/[(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildCompanyAliases(stock: Pick<FeaturedStock, 'ticker' | 'name'>): string[] {
  const aliases = new Set<string>()
  const fullName = stock.name.trim()
  const normalizedName = normalizeCompanyName(fullName)

  if (fullName) aliases.add(fullName)
  if (normalizedName) aliases.add(normalizedName)

  return Array.from(aliases)
}

function textMentionsStock(
  text: string | undefined,
  stock: Pick<FeaturedStock, 'ticker' | 'name'>,
): boolean {
  if (!text?.trim()) return false

  const tickerPattern = new RegExp(`\\b${escapeRegExp(stock.ticker)}\\b`, 'i')
  if (tickerPattern.test(text)) {
    return true
  }

  return buildCompanyAliases(stock).some((alias) => {
    if (alias.length < 2) return false
    const aliasPattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'i')
    return aliasPattern.test(text)
  })
}

function getPreferredHeadingLabel(stock: Pick<FeaturedStock, 'ticker' | 'name'>): string {
  const normalizedName = normalizeCompanyName(stock.name)
  if (normalizedName && normalizedName.length <= 18 && normalizedName.split(/\s+/).length <= 3) {
    return normalizedName
  }

  return stock.ticker
}

export function ensureStockMentionInCopy(
  copy: GeneratedCopy,
  stock: Pick<FeaturedStock, 'ticker' | 'name'>,
): GeneratedCopy {
  if (textMentionsStock(copy.headline, stock) || textMentionsStock(copy.body, stock)) {
    return copy
  }

  const label = getPreferredHeadingLabel(stock)
  const headline = copy.headline.trim()

  if (!headline) {
    return {
      ...copy,
      headline: label,
    }
  }

  return {
    ...copy,
    headline: `${label}: ${headline}`,
  }
}
