import sp500Constituents from '@/data/sp500-constituents.json'

export interface SP500Constituent {
  symbol: string
  name: string
  sector: string
  sub_industry: string
  is_active?: boolean
  alternate_symbols?: Record<string, string>
}

const constituents = (sp500Constituents as SP500Constituent[]).filter(
  (constituent) => constituent.is_active !== false,
)

function normalizeSymbolShape(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/-/g, '.')
}

const aliasToCanonical = new Map<string, string>()
const constituentBySymbol = new Map<string, SP500Constituent>()

for (const constituent of constituents) {
  const canonical = normalizeSymbolShape(constituent.symbol)
  aliasToCanonical.set(canonical, canonical)
  constituentBySymbol.set(canonical, { ...constituent, symbol: canonical })

  for (const alias of Object.values(constituent.alternate_symbols ?? {})) {
    const normalizedAlias = normalizeSymbolShape(alias)
    aliasToCanonical.set(normalizedAlias, canonical)
  }
}

/** Set of all current S&P 500 ticker symbols in canonical form. */
export const SP500_SYMBOLS: ReadonlySet<string> = new Set(aliasToCanonical.values())

/** Normalize a symbol into the repo's canonical S&P 500 form when possible. */
export function normalizeSP500Symbol(symbol: string | null | undefined): string | null {
  if (!symbol) return null
  const normalized = normalizeSymbolShape(symbol)
  return aliasToCanonical.get(normalized) ?? normalized
}

/** Check whether a ticker is in the S&P 500. Accepts known vendor aliases like BRK-B. */
export function isSP500(symbol: string | null | undefined): boolean {
  const canonical = normalizeSP500Symbol(symbol)
  return canonical != null && SP500_SYMBOLS.has(canonical)
}

/** Get constituent metadata by symbol or known alias. */
export function getSP500Constituent(symbol: string): SP500Constituent | undefined {
  const canonical = normalizeSP500Symbol(symbol)
  if (!canonical) return undefined
  return constituentBySymbol.get(canonical)
}

/** Filter an array of objects with a `symbol` property to only S&P 500 members. */
export function filterToSP500<T extends { symbol: string }>(items: T[]): T[] {
  return items
    .map((item) => {
      const canonical = normalizeSP500Symbol(item.symbol)
      return canonical ? { ...item, symbol: canonical } : item
    })
    .filter((item) => isSP500(item.symbol))
}
