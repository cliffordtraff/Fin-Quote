import { createServiceRoleClient } from '@/lib/supabase/service-role'

const TABLE = 'newsletter_daily_automation_runs'
const READINESS_SELECT = 'status,newsletter_generated_count'

/**
 * Read-only boundary used by the public home page. Keep this module detached
 * from the automation command graph so checking one persisted flag cannot pull
 * newsletter generation, chart capture, or local evaluation assets into `/`.
 */
export async function hasFinishedNewsletterMorningReport(
  marketDate: string,
): Promise<boolean> {
  const { data, error } = await createServiceRoleClient()
    .from(TABLE)
    .select(READINESS_SELECT)
    .eq('market_date', marketDate)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load newsletter automation: ${error.message}`)
  }

  return Boolean(
    data &&
      (data.status === 'completed' || data.status === 'partial') &&
      data.newsletter_generated_count > 0,
  )
}

export const __testOnly = {
  readinessSelect: READINESS_SELECT,
}
