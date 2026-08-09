import { rmSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { ensureApprovedCatalystNewsletterDraft } from '@/lib/newsletter/catalyst-workflow'
import { recordNewsletterPublication } from '@/lib/newsletter/publication'
import type { ApprovedCatalystNewsletterInput } from '@/lib/newsletter/catalyst-workflow'

async function main() {
  const sessionId = `catalyst-verification-${Date.now()}`
  const scope = { ownerId: null, sessionId }
  const input: ApprovedCatalystNewsletterInput = {
    candidate: {
      reviewKey: '2026-07-29:cash:gainer:GRMN:verification',
      symbol: 'GRMN',
      name: 'Garmin',
      price: 228.15,
      change: 31.4,
      changesPercentage: 15.96,
      direction: 'gainer',
      session: 'cash',
      marketDate: '2026-07-29',
    },
    review: {
      id: 'verification-review',
      reviewKey: '2026-07-29:cash:gainer:GRMN:verification',
      symbol: 'GRMN',
      marketDate: '2026-07-29',
      session: 'cash',
      direction: 'gainer',
      status: 'approved',
      notes: 'Verification run for the automated catalyst workflow.',
      reviewerId: 'verification',
      reviewedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    whyMoving: {
      symbol: 'GRMN',
      status: 'found',
      displayText: 'Garmin beat estimates and raised guidance.',
      headline: 'Garmin beats estimates and raises guidance',
      summary:
        'Record quarterly results and a higher full-year outlook drove the move.',
      bulletPoints: [
        'Quarterly earnings exceeded expectations.',
        'Management raised full-year guidance.',
      ],
      sentiment: 'positive',
      source: 'Verification source',
      sourceTimestamp: new Date().toISOString(),
      isCatalyst: true,
      sourceUrl: 'https://finviz.com/quote.ashx?t=GRMN&p=d',
      fetchedAt: new Date().toISOString(),
      errorMessage: null,
    },
  }

  let chartFilename: string | null = null
  try {
    const automated = await ensureApprovedCatalystNewsletterDraft(scope, input)
    const repeated = await ensureApprovedCatalystNewsletterDraft(scope, input)
    const published = await recordNewsletterPublication(
      scope,
      automated.draft.id,
      'https://theintraday.beehiiv.com/p/catalyst-workflow-verification',
      new Date(),
      automated.draft.updatedAt,
    )

    if (!automated.created || repeated.created) {
      throw new Error('Catalyst workflow idempotency verification failed')
    }
    if (
      automated.chartsAttached < 1 ||
      automated.draft.draft.source?.automationStatus !== 'complete'
    ) {
      throw new Error('Automatic saved-chart attachment verification failed')
    }
    if (published.status !== 'published' || !published.beehiivUrl) {
      throw new Error('Publication tracking verification failed')
    }
    const eventTypes = published.history.map((event) => event.type)
    for (const expected of [
      'created',
      'chart_attached',
      'status_changed',
      'publication_recorded',
    ] as const) {
      if (!eventTypes.includes(expected)) {
        throw new Error(`Missing newsletter history event: ${expected}`)
      }
    }

    chartFilename = basename(
      automated.draft.draft.blocks[0]?.chartImageUrl ?? '',
    )
    console.log(
      JSON.stringify(
        {
          success: true,
          draftId: automated.draft.id,
          chartsAttached: automated.chartsAttached,
          generatedChart: automated.generatedChart,
          repeatedApprovalReusedDraft: repeated.draft.id === automated.draft.id,
          status: published.status,
          beehiivUrl: published.beehiivUrl,
          history: eventTypes,
        },
        null,
        2,
      ),
    )
  } finally {
    rmSync(resolve('.newsletter-drafts', sessionId), {
      recursive: true,
      force: true,
    })
    rmSync(resolve('.newsletter-chart-library', sessionId), {
      recursive: true,
      force: true,
    })
    if (chartFilename) {
      rmSync(resolve('.newsletter-output', chartFilename), { force: true })
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
