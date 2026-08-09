export class NewsletterChartLibraryNotFoundError extends Error {
  constructor(readonly chartId: string) {
    super(`Newsletter chart library item not found: ${chartId}`)
    this.name = 'NewsletterChartLibraryNotFoundError'
  }
}

export class NewsletterChartLibraryRequestConflictError extends Error {
  constructor() {
    super('Idempotency-Key was already used for a different newsletter chart request.')
    this.name = 'NewsletterChartLibraryRequestConflictError'
  }
}
