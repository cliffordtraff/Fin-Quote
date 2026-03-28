'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getEditorialTemplate } from '@/lib/newsletter/editorial-templates'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  DASHBOARD_CHART_OF_THE_DAY_SETTINGS_ROW_ID,
  DASHBOARD_CHART_OF_THE_DAY_SETTINGS_TABLE,
  getDashboardChartOfTheDaySetting,
  type DashboardChartOfTheDaySetting,
} from '@/lib/dashboard/chart-of-the-day-settings'
import {
  DASHBOARD_CHART_OF_THE_DAY_DEFAULT_SELECTION,
  normalizeDashboardChartOfTheDayChartSpec,
  normalizeDashboardChartOfTheDaySelection,
} from '@/lib/dashboard/chart-of-the-day-spec'
import type { ChartExportSpec } from '@/types/chart-export'

const updateDashboardChartOfTheDaySchema = z.object({
  ticker: z
    .string()
    .trim()
    .min(1, 'Ticker is required')
    .regex(/^[A-Za-z]{1,10}(?:\.[A-Za-z]{1,4})?$/, 'Enter a valid ticker symbol'),
  templateId: z.string().trim().min(1, 'Template is required'),
  periodType: z.enum(['annual', 'quarterly']),
})

const updateDashboardChartOfTheDayChartSpecSchema = z.object({
  stocks: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .regex(/^[A-Za-z]{1,10}(?:\.[A-Za-z]{1,4})?$/, 'Enter valid ticker symbols'),
    )
    .min(1, 'Add at least one stock'),
  metrics: z
    .array(z.string().trim().min(1, 'Add at least one metric'))
    .min(1, 'Add at least one metric'),
  periodType: z.enum(['annual', 'quarterly']).optional(),
  minYear: z.number().int().optional(),
  maxYear: z.number().int().optional(),
  showStockPrice: z.boolean().optional(),
  chartType: z.enum(['bar', 'line', 'area']).optional(),
  showLabels: z.boolean().optional(),
  stacked: z.boolean().optional(),
  indexToZero: z.boolean().optional(),
  title: z.string().trim().optional(),
  subtitle: z.string().trim().optional(),
  colors: z.record(z.string(), z.string()).optional(),
})

interface UpdateDashboardChartOfTheDayResult {
  success: boolean
  error: string | null
  setting?: DashboardChartOfTheDaySetting
}

async function getUpdatedByUserId(): Promise<string | null> {
  const supabaseAuth = await createServerClient()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()

  return user?.id ?? null
}

async function upsertDashboardChartOfTheDayRow(payload: {
  ticker: string
  templateId: string
  periodType: 'annual' | 'quarterly'
  chartSpec: ChartExportSpec | null
  updatedBy: string | null
}): Promise<UpdateDashboardChartOfTheDayResult> {
  const supabase = createServiceRoleClient()
  const { error } = await (supabase as any)
    .from(DASHBOARD_CHART_OF_THE_DAY_SETTINGS_TABLE)
    .upsert(
      {
        id: DASHBOARD_CHART_OF_THE_DAY_SETTINGS_ROW_ID,
        ticker: payload.ticker,
        template_id: payload.templateId,
        period_type: payload.periodType,
        chart_spec: payload.chartSpec,
        updated_by: payload.updatedBy,
      },
      {
        onConflict: 'id',
      },
    )

  if (error) {
    console.error('Failed to save dashboard chart of the day:', error)
    return {
      success: false,
      error: error.message,
    }
  }

  revalidatePath('/')
  revalidatePath('/dashboard')
  revalidatePath('/admin')
  revalidatePath('/admin/chart-of-the-day')

  return {
    success: true,
    error: null,
    setting: await getDashboardChartOfTheDaySetting(),
  }
}

export async function updateDashboardChartOfTheDay(input: {
  ticker: string
  templateId: string
  periodType: 'annual' | 'quarterly'
}): Promise<UpdateDashboardChartOfTheDayResult> {
  try {
    const parsed = updateDashboardChartOfTheDaySchema.safeParse(input)

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? 'Invalid chart of the day input',
      }
    }

    const template = getEditorialTemplate(parsed.data.templateId)
    if (!template || template.mode === 'price') {
      return {
        success: false,
        error: 'Select a supported fundamentals template for the dashboard.',
      }
    }

    if (!template.supportedPeriods.includes(parsed.data.periodType)) {
      return {
        success: false,
        error: `${template.label} does not support ${parsed.data.periodType} mode.`,
      }
    }

    const selection = normalizeDashboardChartOfTheDaySelection(parsed.data)
    return upsertDashboardChartOfTheDayRow({
      ticker: selection.ticker,
      templateId: selection.templateId,
      periodType: selection.periodType,
      chartSpec: null,
      updatedBy: await getUpdatedByUserId(),
    })
  } catch (error) {
    console.error('Failed to update dashboard chart of the day:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update chart of the day',
    }
  }
}

export async function updateDashboardChartOfTheDayChartSpec(
  input: ChartExportSpec,
): Promise<UpdateDashboardChartOfTheDayResult> {
  try {
    const parsed = updateDashboardChartOfTheDayChartSpecSchema.safeParse(input)

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? 'Invalid chart of the day input',
      }
    }

    const chartSpec = normalizeDashboardChartOfTheDayChartSpec(parsed.data)
    if (!chartSpec) {
      return {
        success: false,
        error: 'Pick at least one stock and one metric before saving.',
      }
    }

    const currentSetting = await getDashboardChartOfTheDaySetting()
    const fallbackSelection =
      currentSetting.selection ?? DASHBOARD_CHART_OF_THE_DAY_DEFAULT_SELECTION

    return upsertDashboardChartOfTheDayRow({
      ticker: chartSpec.stocks[0] ?? fallbackSelection.ticker,
      templateId: fallbackSelection.templateId,
      periodType: chartSpec.periodType ?? fallbackSelection.periodType,
      chartSpec,
      updatedBy: await getUpdatedByUserId(),
    })
  } catch (error) {
    console.error('Failed to update dashboard chart of the day chart spec:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update chart of the day',
    }
  }
}
