export interface LargeInsiderTradeCandidate {
  symbol: string
  reportingName: string
  transactionDate: string
  transactionCode: string
  shares: number
  price: number
  acquisitionDisposition: string
  formType: string
}

export interface LargeInsiderTrade {
  symbol: string
  reportingName: string
  transactionDate: string
  transactionCode: string
  formType: string
  shares: number
  price: number
  value: number
  acquisitionDisposition: string
}

const ELIGIBLE_FORM_TYPES = new Set(['4', '4/A', '5', '5/A', '144', '144/A'])
const ELIGIBLE_TRANSACTION_CODES = new Set(['P', 'S'])

function normalizeDate(date: string): string {
  return date.split('T')[0]
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase()
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

function normalizeCode(code: string): string {
  return code.trim().charAt(0).toUpperCase()
}

function normalizeAcquisitionDisposition(value: string): string {
  return value.trim().charAt(0).toUpperCase()
}

function canonicalizeAcquisitionDisposition(transactionCode: string, acquisitionDisposition: string): string {
  if (transactionCode === 'P') {
    return 'A'
  }

  if (transactionCode === 'S') {
    return 'D'
  }

  return normalizeAcquisitionDisposition(acquisitionDisposition)
}

function normalizeFormType(formType: string): string {
  return formType.trim().toUpperCase()
}

function exactCandidateKey(candidate: LargeInsiderTradeCandidate): string {
  return [
    candidate.symbol,
    candidate.reportingName,
    candidate.transactionDate,
    candidate.transactionCode,
    candidate.shares.toFixed(4),
    candidate.price.toFixed(4),
    candidate.acquisitionDisposition,
    candidate.formType,
  ].join('|')
}

function aggregateCandidateKey(candidate: LargeInsiderTradeCandidate): string {
  return [
    candidate.symbol,
    candidate.reportingName,
    candidate.transactionDate,
    candidate.transactionCode,
    candidate.acquisitionDisposition,
  ].join('|')
}

export function rankLargeInsiderTrades(
  candidates: LargeInsiderTradeCandidate[],
  options: {
    fromDate: string
    toDate: string
    limit: number
  }
): LargeInsiderTrade[] {
  const dedupedCandidates = new Map<string, LargeInsiderTradeCandidate>()

  for (const candidate of candidates) {
    const symbol = normalizeSymbol(candidate.symbol)
    const reportingName = normalizeName(candidate.reportingName)
    const transactionDate = normalizeDate(candidate.transactionDate)
    const transactionCode = normalizeCode(candidate.transactionCode)
    const acquisitionDisposition = canonicalizeAcquisitionDisposition(
      transactionCode,
      candidate.acquisitionDisposition
    )
    const formType = normalizeFormType(candidate.formType)
    const shares = Number(candidate.shares)
    const price = Number(candidate.price)

    if (!symbol || !reportingName || !transactionDate) {
      continue
    }

    if (transactionDate < options.fromDate || transactionDate > options.toDate) {
      continue
    }

    if (!ELIGIBLE_FORM_TYPES.has(formType) || !ELIGIBLE_TRANSACTION_CODES.has(transactionCode)) {
      continue
    }

    if (!Number.isFinite(shares) || !Number.isFinite(price) || shares <= 0 || price <= 0) {
      continue
    }

    const normalizedCandidate: LargeInsiderTradeCandidate = {
      symbol,
      reportingName,
      transactionDate,
      transactionCode,
      shares,
      price,
      acquisitionDisposition,
      formType,
    }

    dedupedCandidates.set(exactCandidateKey(normalizedCandidate), normalizedCandidate)
  }

  const aggregatedTrades = new Map<string, LargeInsiderTrade>()

  for (const candidate of dedupedCandidates.values()) {
    const key = aggregateCandidateKey(candidate)
    const existing = aggregatedTrades.get(key)
    const value = candidate.shares * candidate.price

    if (!existing) {
      aggregatedTrades.set(key, {
        symbol: candidate.symbol,
        reportingName: candidate.reportingName,
        transactionDate: candidate.transactionDate,
        transactionCode: candidate.transactionCode,
        formType: candidate.formType,
        shares: candidate.shares,
        price: candidate.price,
        value,
        acquisitionDisposition: candidate.acquisitionDisposition,
      })
      continue
    }

    const nextShares = existing.shares + candidate.shares
    const nextValue = existing.value + value

    aggregatedTrades.set(key, {
      ...existing,
      shares: nextShares,
      price: nextShares > 0 ? nextValue / nextShares : existing.price,
      value: nextValue,
      formType: candidate.formType,
    })
  }

  return Array.from(aggregatedTrades.values())
    .sort((left, right) => right.value - left.value)
    .slice(0, options.limit)
}
