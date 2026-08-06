import type { BeehiivPublication } from './types'

export class BeehiivPublicationSelectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BeehiivPublicationSelectionError'
  }
}

export function selectBeehiivPublication(
  publications: BeehiivPublication[],
  configuredId = process.env.BEEHIIV_PUBLICATION_ID?.trim() ?? '',
): BeehiivPublication | null {
  const normalizedConfiguredId = configuredId.trim()
  if (normalizedConfiguredId) {
    const configured = publications.find(
      (publication) => publication.id === normalizedConfiguredId,
    )
    if (!configured) {
      throw new BeehiivPublicationSelectionError(
        `Configured Beehiiv publication ${normalizedConfiguredId} is not available to this connection.`,
      )
    }
    return configured
  }

  const namedMatches = publications.filter(
    (publication) => publication.name.trim().toLowerCase() === 'the intraday',
  )
  if (namedMatches.length === 1) return namedMatches[0]
  if (publications.length === 1) return publications[0]
  if (publications.length === 0) return null

  throw new BeehiivPublicationSelectionError(
    'Multiple Beehiiv publications are available. Configure BEEHIIV_PUBLICATION_ID before syncing a draft.',
  )
}
