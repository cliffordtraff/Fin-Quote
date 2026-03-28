import { EDITORIAL_TEMPLATES } from '@/lib/newsletter/editorial-templates'
import type {
  FundamentalsEditorialChartTemplate,
  FundamentalsNewsletterChartSpec,
  NewsletterPeriodType,
} from '@/lib/newsletter/types'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  DASHBOARD_CHART_OF_THE_DAY_DEFAULT_SELECTION,
  getDashboardChartOfTheDaySpec,
  normalizeDashboardChartOfTheDayChartSpec,
  type DashboardChartOfTheDaySelection,
  normalizeDashboardChartOfTheDaySelection,
} from './chart-of-the-day-spec'

const DASHBOARD_CHART_OF_THE_DAY_SETTINGS_TABLE = 'dashboard_chart_of_day_settings'
const DASHBOARD_CHART_OF_THE_DAY_SETTINGS_ROW_ID = 'default'

interface DashboardChartOfTheDaySettingsRow {
  ticker: string
  template_id: string
  period_type: NewsletterPeriodType | null
  chart_spec: unknown | null
  updated_at: string | null
  updated_by: string | null
}

export interface DashboardChartOfTheDaySetting {
  selection: DashboardChartOfTheDaySelection | null
  chartSpec: FundamentalsNewsletterChartSpec
  source: 'template' | 'chart_spec'
  updatedAt: string | null
  updatedBy: string | null
}

export interface DashboardChartTemplateOption {
  id: string
  label: string
  description: string
  supportedPeriods: NewsletterPeriodType[]
  defaultPeriodType: NewsletterPeriodType
}

function defaultDashboardChartOfTheDaySetting(): DashboardChartOfTheDaySetting {
  return {
    selection: DASHBOARD_CHART_OF_THE_DAY_DEFAULT_SELECTION,
    chartSpec: getDashboardChartOfTheDaySpec(
      DASHBOARD_CHART_OF_THE_DAY_DEFAULT_SELECTION,
    ) as FundamentalsNewsletterChartSpec,
    source: 'template',
    updatedAt: null,
    updatedBy: null,
  }
}

function normalizeSettingRow(
  row: Partial<DashboardChartOfTheDaySettingsRow> | null | undefined,
): DashboardChartOfTheDaySetting {
  const normalizedSelection =
    row?.ticker && row.template_id
      ? normalizeDashboardChartOfTheDaySelection({
          ticker: row.ticker,
          templateId: row.template_id,
          periodType: row.period_type ?? undefined,
        })
      : null
  const normalizedChartSpec = normalizeDashboardChartOfTheDayChartSpec(
    row?.chart_spec as Record<string, unknown> | null | undefined,
  )

  if (normalizedChartSpec) {
    return {
      selection: normalizedSelection,
      chartSpec: normalizedChartSpec,
      source: 'chart_spec',
      updatedAt: row?.updated_at ?? null,
      updatedBy: row?.updated_by ?? null,
    }
  }

  if (!normalizedSelection) {
    return defaultDashboardChartOfTheDaySetting()
  }

  return {
    selection: normalizedSelection,
    chartSpec: getDashboardChartOfTheDaySpec(
      normalizedSelection,
    ) as FundamentalsNewsletterChartSpec,
    source: 'template',
    updatedAt: row?.updated_at ?? null,
    updatedBy: row?.updated_by ?? null,
  }
}

async function loadSettingRow(includeChartSpec: boolean) {
  const supabase = createServiceRoleClient()
  return (supabase as any)
    .from(DASHBOARD_CHART_OF_THE_DAY_SETTINGS_TABLE)
    .select(
      includeChartSpec
        ? 'ticker, template_id, period_type, chart_spec, updated_at, updated_by'
        : 'ticker, template_id, period_type, updated_at, updated_by',
    )
    .eq('id', DASHBOARD_CHART_OF_THE_DAY_SETTINGS_ROW_ID)
    .maybeSingle()
}

export async function getDashboardChartOfTheDaySetting(): Promise<DashboardChartOfTheDaySetting> {
  try {
    const { data, error } = await loadSettingRow(true)

    if (error?.code === '42703' && error.message.includes('chart_spec')) {
      const legacyResult = await loadSettingRow(false)

      if (legacyResult.error) {
        console.error('Failed to load dashboard chart of the day setting:', legacyResult.error)
        return defaultDashboardChartOfTheDaySetting()
      }

      return normalizeSettingRow(legacyResult.data)
    }

    if (error) {
      console.error('Failed to load dashboard chart of the day setting:', error)
      return defaultDashboardChartOfTheDaySetting()
    }

    return normalizeSettingRow(data)
  } catch (error) {
    console.error('Failed to load dashboard chart of the day setting:', error)
    return defaultDashboardChartOfTheDaySetting()
  }
}

export async function getDashboardChartOfTheDaySelection(): Promise<DashboardChartOfTheDaySelection> {
  const setting = await getDashboardChartOfTheDaySetting()
  return setting.selection ?? DASHBOARD_CHART_OF_THE_DAY_DEFAULT_SELECTION
}

export async function getDashboardChartOfTheDayChartSpec(): Promise<FundamentalsNewsletterChartSpec> {
  const setting = await getDashboardChartOfTheDaySetting()
  return setting.chartSpec
}

export function listDashboardChartOfTheDayTemplateOptions(): DashboardChartTemplateOption[] {
  return EDITORIAL_TEMPLATES
    .filter(
      (template): template is FundamentalsEditorialChartTemplate =>
        template.mode !== 'price',
    )
    .map((template) => ({
      id: template.id,
      label: template.label,
      description: template.description,
      supportedPeriods: template.supportedPeriods,
      defaultPeriodType: template.defaultPeriodType,
    }))
}

export {
  DASHBOARD_CHART_OF_THE_DAY_SETTINGS_ROW_ID,
  DASHBOARD_CHART_OF_THE_DAY_SETTINGS_TABLE,
}
