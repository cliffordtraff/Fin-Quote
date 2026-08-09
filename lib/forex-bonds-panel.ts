export const FOREX_BOND_PANEL = [
  { symbol: 'EURUSD', name: 'EUR/USD' },
  { symbol: 'USDJPY', name: 'USD/JPY' },
  { symbol: 'GBPUSD', name: 'GBP/USD' },
  { symbol: '^FVX', name: '5-Year Treasury' },
  { symbol: '^TNX', name: '10-Year Treasury' },
  { symbol: '^TYX', name: '30-Year Treasury' },
] as const

export const FOREX_BOND_SYMBOLS = FOREX_BOND_PANEL.map(({ symbol }) => symbol)

export interface ForexBondPanelRow {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
}

const EXPECTED_SYMBOLS: ReadonlySet<string> = new Set<string>(
  FOREX_BOND_SYMBOLS,
)

function normalizePanelSymbol(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

/**
 * Normalize a provider/action result only when it contains exactly one usable
 * row for every member of the fixed dashboard panel. Partial, duplicate, and
 * extra rows are all incomplete snapshots rather than cacheable success.
 */
export function normalizeCompleteForexBondPanel(
  value: unknown,
): ForexBondPanelRow[] | null {
  if (!Array.isArray(value) || value.length !== FOREX_BOND_PANEL.length) {
    return null
  }

  const bySymbol = new Map<string, ForexBondPanelRow>()
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return null
    }

    const row = candidate as Record<string, unknown>
    const symbol = normalizePanelSymbol(row.symbol)
    if (!EXPECTED_SYMBOLS.has(symbol) || bySymbol.has(symbol)) {
      return null
    }
    if (
      typeof row.price !== 'number' ||
      !Number.isFinite(row.price) ||
      row.price === 0 ||
      typeof row.change !== 'number' ||
      !Number.isFinite(row.change) ||
      typeof row.changesPercentage !== 'number' ||
      !Number.isFinite(row.changesPercentage)
    ) {
      return null
    }

    const panelEntry = FOREX_BOND_PANEL.find((entry) => entry.symbol === symbol)
    if (!panelEntry) return null
    bySymbol.set(symbol, {
      symbol,
      name: panelEntry.name,
      price: row.price,
      change: row.change,
      changesPercentage: row.changesPercentage,
    })
  }

  if (bySymbol.size !== FOREX_BOND_PANEL.length) return null
  return FOREX_BOND_PANEL.map(({ symbol }) => bySymbol.get(symbol)!)
}

export function hasCompleteForexBondPanel(value: unknown): boolean {
  return normalizeCompleteForexBondPanel(value) !== null
}
