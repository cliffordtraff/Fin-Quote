export * from './operations-read'

import { reconcileBeehiivDeliveryQueue } from './beehiiv-lifecycle'
import {
  advanceNewsletterDailyAutomation,
  getNewsletterDailyAutomationRun,
} from './daily-automation'
import {
  advanceNewsletterMidMorningAutomation,
  getNewsletterMidMorningRun,
} from './mid-morning-automation'
import {
  NewsletterOperationsActionError,
  resolveOperatorScope,
  validMarketDate,
  type NewsletterOperationsActionInput,
  type NewsletterOperationsReconciliationResult,
} from './operations-read'

export async function executeNewsletterOperationsAction(
  userId: string,
  input: NewsletterOperationsActionInput,
) {
  resolveOperatorScope(userId)
  if (input.action === 'reconcile_beehiiv') {
    const result: NewsletterOperationsReconciliationResult =
      await reconcileBeehiivDeliveryQueue(50, 6)
    return result
  }
  if (!validMarketDate(input.marketDate)) {
    throw new NewsletterOperationsActionError('Invalid market date.')
  }

  if (input.pipeline === 'morning') {
    const current = await getNewsletterDailyAutomationRun(input.marketDate)
    if (input.action === 'retry_failed' && current?.status !== 'failed') {
      throw new NewsletterOperationsActionError(
        'The morning pipeline is not in a failed state.',
      )
    }
    return advanceNewsletterDailyAutomation({
      marketDate: input.marketDate,
      retryFailed: input.action === 'retry_failed',
    })
  }

  const current = await getNewsletterMidMorningRun(input.marketDate)
  if (input.action === 'retry_failed' && current?.status !== 'failed') {
    throw new NewsletterOperationsActionError(
      'The mid-morning pipeline is not in a failed state.',
    )
  }
  return advanceNewsletterMidMorningAutomation({
    marketDate: input.marketDate,
    retryFailed: input.action === 'retry_failed',
  })
}
