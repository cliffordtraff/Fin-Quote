import { describe, expect, it } from 'vitest'
import {
  BeehiivPublicationSelectionError,
  selectBeehiivPublication,
} from '../publication'

const publications = [
  {
    id: 'pub_one',
    name: 'First publication',
    description: null,
    url: null,
  },
  {
    id: 'pub_intraday',
    name: 'The Intraday',
    description: null,
    url: null,
  },
]

describe('Beehiiv publication selection', () => {
  it('selects only the exact configured publication', () => {
    expect(selectBeehiivPublication(publications, 'pub_one')?.id).toBe(
      'pub_one',
    )
  })

  it('fails closed when the configured publication is unavailable', () => {
    expect(() =>
      selectBeehiivPublication(publications, 'pub_missing'),
    ).toThrow(BeehiivPublicationSelectionError)
  })

  it('requires configuration when multiple publications are ambiguous', () => {
    expect(() =>
      selectBeehiivPublication(
        publications.map((publication) => ({
          ...publication,
          name: `Other ${publication.id}`,
        })),
        '',
      ),
    ).toThrow(/BEEHIIV_PUBLICATION_ID/)
  })
})
