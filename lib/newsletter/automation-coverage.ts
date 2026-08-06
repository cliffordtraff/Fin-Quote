export interface FinvizCoverageEntry {
  status: string
}

export interface FinvizCoverageState {
  terminalSymbols: Set<string>
  retryableSymbols: string[]
  exhaustedSymbols: string[]
  errorSymbols: string[]
  completedCount: number
  foundCount: number
  done: boolean
}

/**
 * Serializes durable retry checkpoints while allowing Finviz reads to run in
 * parallel. Each returned promise resolves only after that symbol's dispatch
 * is represented in storage, before external work begins. Later snapshots are monotonic, so an
 * older concurrent write can never erase a newer attempt count.
 */
export function createFinvizAttemptCheckpointer(
  attempts: Record<string, number>,
  persist: (snapshot: Record<string, number>, symbol: string) => Promise<void>,
): (symbol: string) => Promise<void> {
  let queue = Promise.resolve()

  return (symbol: string) => {
    attempts[symbol] = (attempts[symbol] ?? 0) + 1
    const snapshot = { ...attempts }
    const checkpoint = queue
      .catch(() => undefined)
      .then(() => persist(snapshot, symbol))
    queue = checkpoint
    return checkpoint
  }
}

export function isTerminalFinvizStatus(status: string): boolean {
  return status === 'found' || status === 'not_found'
}

export function getFinvizCoverageState(
  symbols: string[],
  coverage: Map<string, FinvizCoverageEntry>,
  attempts: Record<string, number>,
  maxAttempts: number,
): FinvizCoverageState {
  const terminalSymbols = new Set(
    symbols.filter((symbol) => {
      const entry = coverage.get(symbol)
      return entry ? isTerminalFinvizStatus(entry.status) : false
    }),
  )
  const incomplete = symbols.filter((symbol) => !terminalSymbols.has(symbol))
  const retryableSymbols = incomplete.filter(
    (symbol) => (attempts[symbol] ?? 0) < maxAttempts,
  )
  const exhaustedSymbols = incomplete.filter(
    (symbol) => (attempts[symbol] ?? 0) >= maxAttempts,
  )
  const errorSymbols = Array.from(
    new Set([
      ...exhaustedSymbols,
      ...incomplete.filter((symbol) => coverage.get(symbol)?.status === 'error'),
    ]),
  )
  const completedCount = terminalSymbols.size + exhaustedSymbols.length

  return {
    terminalSymbols,
    retryableSymbols,
    exhaustedSymbols,
    errorSymbols,
    completedCount,
    foundCount: symbols.filter(
      (symbol) => coverage.get(symbol)?.status === 'found',
    ).length,
    done: completedCount >= symbols.length,
  }
}

export interface SummaryCoverageRow {
  symbol: string
  summary_text: string | null
  no_summary_reason: string | null
}

export interface SummaryCoverageState {
  completedSymbols: Set<string>
  generatedSymbols: Set<string>
  noResultSymbols: Set<string>
  validationRejectedSymbols: Set<string>
}

export function classifySummaryCoverage(
  rows: SummaryCoverageRow[],
): SummaryCoverageState {
  const generatedSymbols = new Set<string>()
  const noResultSymbols = new Set<string>()
  const validationRejectedSymbols = new Set<string>()

  for (const row of rows) {
    if (row.summary_text?.trim()) {
      generatedSymbols.add(row.symbol)
      noResultSymbols.delete(row.symbol)
      validationRejectedSymbols.delete(row.symbol)
    } else if (
      !generatedSymbols.has(row.symbol) &&
      row.no_summary_reason === 'validation_rejected'
    ) {
      validationRejectedSymbols.add(row.symbol)
    } else if (!generatedSymbols.has(row.symbol)) {
      noResultSymbols.add(row.symbol)
      validationRejectedSymbols.delete(row.symbol)
    }
  }

  return {
    completedSymbols: new Set([...generatedSymbols, ...noResultSymbols]),
    generatedSymbols,
    noResultSymbols,
    validationRejectedSymbols,
  }
}

export type NewsletterAutomationFinalStatus =
  | 'completed'
  | 'partial'
  | 'failed'

export function getDailyAutomationFinalStatus(input: {
  selectedCount: number
  readyCount: number
  attentionCount: number
  failedCount: number
  finvizErrorCount: number
  summaryErrorCount: number
}): NewsletterAutomationFinalStatus {
  if (input.selectedCount <= 0 || input.readyCount <= 0) return 'failed'
  if (
    input.readyCount < input.selectedCount ||
    input.attentionCount > 0 ||
    input.failedCount > 0 ||
    input.finvizErrorCount > 0 ||
    input.summaryErrorCount > 0
  ) {
    return 'partial'
  }
  return 'completed'
}

export function getMidMorningAutomationFinalStatus(input: {
  targetCount: number
  generatedCount: number
  finvizErrorCount: number
  summaryErrorCount: number
}): NewsletterAutomationFinalStatus {
  if (input.targetCount <= 0 || input.generatedCount <= 0) return 'failed'
  if (
    input.generatedCount < input.targetCount ||
    input.finvizErrorCount > 0 ||
    input.summaryErrorCount > 0
  ) {
    return 'partial'
  }
  return 'completed'
}
