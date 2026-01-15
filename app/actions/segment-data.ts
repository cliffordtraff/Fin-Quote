'use server'

import { createServerClient } from '@/lib/supabase/server'

export type SegmentType = 'product' | 'geographic'
export type PeriodType = 'annual' | 'quarterly' | 'all'

export type SegmentDataPoint = {
  year: number
  quarter?: 1 | 2 | 3 | 4
  period: 'FY' | 'Q1' | 'Q2' | 'Q3' | 'Q4'
  value: number
}

export type SegmentData = {
  segment: string
  data: SegmentDataPoint[]
}

export type SegmentResult = {
  data: SegmentData[] | null
  error: string | null
  segmentType: SegmentType
  periodType: PeriodType
  yearBounds?: { min: number; max: number }
}

// Database row type for segment data
type SegmentMetricRow = {
  year: number
  period: string
  dimension_value: string
  metric_value: number
}

// Product segments in display order
const PRODUCT_SEGMENTS = [
  'iPhone',
  'Services',
  'Wearables, Home and Accessories',
  'Mac',
  'iPad',
]

// Geographic segments in display order
const GEOGRAPHIC_SEGMENTS = [
  'Americas',
  'Europe',
  'Greater China',
  'Japan',
  'Rest of Asia Pacific',
]

export async function getSegmentData(params: {
  segmentType: SegmentType
  periodType?: PeriodType // 'annual' (FY only), 'quarterly' (Q1-Q4), or 'all'
  segments?: string[] // Optional: specific segments to fetch
  quarters?: (1 | 2 | 3 | 4)[] // Optional: specific quarters (for quarterly periodType)
  minYear?: number
  maxYear?: number
}): Promise<SegmentResult> {
  const { segmentType, periodType = 'annual', segments, quarters, minYear, maxYear } = params

  // Validate segment type
  if (segmentType !== 'product' && segmentType !== 'geographic') {
    return { data: null, error: 'Invalid segment type', segmentType, periodType }
  }

  // Validate year range
  if (typeof minYear === 'number' && typeof maxYear === 'number' && minYear > maxYear) {
    return { data: null, error: 'Invalid year range', segmentType, periodType }
  }

  // Determine which segments to fetch
  const allSegments = segmentType === 'product' ? PRODUCT_SEGMENTS : GEOGRAPHIC_SEGMENTS
  const requestedSegments = segments && segments.length > 0
    ? segments.filter(s => allSegments.includes(s))
    : allSegments

  if (requestedSegments.length === 0) {
    return { data: null, error: 'No valid segments specified', segmentType, periodType }
  }

  // Determine which periods to fetch based on periodType
  let periodsToFetch: string[]
  if (periodType === 'annual') {
    periodsToFetch = ['FY']
  } else if (periodType === 'quarterly') {
    if (quarters && quarters.length > 0) {
      periodsToFetch = quarters.map(q => `Q${q}`)
    } else {
      periodsToFetch = ['Q1', 'Q2', 'Q3', 'Q4']
    }
  } else {
    // 'all' - fetch everything
    periodsToFetch = ['FY', 'Q1', 'Q2', 'Q3', 'Q4']
  }

  try {
    const supabase = await createServerClient()

    // Build query - now includes period column
    let query = supabase
      .from('company_metrics')
      .select('year, period, dimension_value, metric_value')
      .eq('symbol', 'AAPL' as never)
      .eq('metric_name', 'segment_revenue' as never)
      .eq('dimension_type', segmentType as never)
      .in('dimension_value', requestedSegments as never)
      .in('period', periodsToFetch as never)
      .order('year', { ascending: true })
      .order('period', { ascending: true })

    if (typeof minYear === 'number') {
      query = query.gte('year', minYear)
    }
    if (typeof maxYear === 'number') {
      query = query.lte('year', maxYear)
    }

    const { data: rawData, error } = await query

    if (error) {
      console.error('Error fetching segment data:', error)
      return { data: null, error: error.message, segmentType, periodType }
    }

    if (!rawData || rawData.length === 0) {
      return { data: null, error: 'No segment data found', segmentType, periodType }
    }

    // Cast to typed rows
    const data = rawData as unknown as SegmentMetricRow[]

    // Organize data by segment
    const segmentDataMap: Record<string, SegmentDataPoint[]> = {}
    for (const row of data) {
      const segment = row.dimension_value
      if (!segmentDataMap[segment]) {
        segmentDataMap[segment] = []
      }

      // Extract quarter number from period string (Q1 -> 1, Q2 -> 2, etc.)
      const period = row.period as 'FY' | 'Q1' | 'Q2' | 'Q3' | 'Q4'
      const quarter = period.startsWith('Q')
        ? (parseInt(period[1]) as 1 | 2 | 3 | 4)
        : undefined

      segmentDataMap[segment].push({
        year: row.year,
        quarter,
        period,
        value: row.metric_value,
      })
    }

    // Sort function for data points: by year, then by period (FY last within year)
    const sortDataPoints = (a: SegmentDataPoint, b: SegmentDataPoint): number => {
      if (a.year !== b.year) return a.year - b.year
      // Within same year: Q1 < Q2 < Q3 < Q4 < FY
      const periodOrder = { Q1: 1, Q2: 2, Q3: 3, Q4: 4, FY: 5 }
      return periodOrder[a.period] - periodOrder[b.period]
    }

    // Build result in display order
    const result: SegmentData[] = requestedSegments
      .filter(segment => segmentDataMap[segment])
      .map(segment => ({
        segment,
        data: segmentDataMap[segment].sort(sortDataPoints),
      }))

    // Get year bounds
    const years = data.map(row => row.year)
    const yearBounds = {
      min: Math.min(...years),
      max: Math.max(...years),
    }

    return { data: result, error: null, segmentType, periodType, yearBounds }
  } catch (err) {
    console.error('Unexpected error in getSegmentData:', err)
    return {
      data: null,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
      segmentType,
      periodType,
    }
  }
}

// Get available segments for a type
export async function getAvailableSegments(segmentType: SegmentType): Promise<{
  segments: string[]
  error: string | null
}> {
  if (segmentType === 'product') {
    return { segments: PRODUCT_SEGMENTS, error: null }
  } else if (segmentType === 'geographic') {
    return { segments: GEOGRAPHIC_SEGMENTS, error: null }
  }
  return { segments: [], error: 'Invalid segment type' }
}

// Get available years with quarterly data
export async function getQuarterlyDataYearRange(): Promise<{
  minYear: number
  maxYear: number
  error: string | null
}> {
  try {
    const supabase = await createServerClient()

    const { data: rawData, error } = await supabase
      .from('company_metrics')
      .select('year')
      .eq('symbol', 'AAPL' as never)
      .eq('metric_name', 'segment_revenue' as never)
      .in('period', ['Q1', 'Q2', 'Q3', 'Q4'] as never)
      .order('year', { ascending: true })

    if (error || !rawData || rawData.length === 0) {
      return { minYear: 2019, maxYear: 2024, error: error?.message || null }
    }

    const data = rawData as unknown as { year: number }[]
    const years = [...new Set(data.map(row => row.year))]
    return {
      minYear: Math.min(...years),
      maxYear: Math.max(...years),
      error: null,
    }
  } catch (err) {
    return {
      minYear: 2019,
      maxYear: 2024,
      error: err instanceof Error ? err.message : 'Unexpected error',
    }
  }
}
