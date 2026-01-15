'use server'

import { createServerClient } from '@/lib/supabase/server'

export type SegmentType = 'product' | 'geographic'

export type SegmentDataPoint = {
  year: number
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
  yearBounds?: { min: number; max: number }
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
  segments?: string[] // Optional: specific segments to fetch
  minYear?: number
  maxYear?: number
}): Promise<SegmentResult> {
  const { segmentType, segments, minYear, maxYear } = params

  // Validate segment type
  if (segmentType !== 'product' && segmentType !== 'geographic') {
    return { data: null, error: 'Invalid segment type', segmentType }
  }

  // Validate year range
  if (typeof minYear === 'number' && typeof maxYear === 'number' && minYear > maxYear) {
    return { data: null, error: 'Invalid year range', segmentType }
  }

  // Determine which segments to fetch
  const allSegments = segmentType === 'product' ? PRODUCT_SEGMENTS : GEOGRAPHIC_SEGMENTS
  const requestedSegments = segments && segments.length > 0
    ? segments.filter(s => allSegments.includes(s))
    : allSegments

  if (requestedSegments.length === 0) {
    return { data: null, error: 'No valid segments specified', segmentType }
  }

  try {
    const supabase = await createServerClient()

    // Build query
    let query = supabase
      .from('company_metrics')
      .select('year, dimension_value, metric_value')
      .eq('symbol', 'AAPL')
      .eq('metric_name', 'segment_revenue')
      .eq('dimension_type', segmentType)
      .in('dimension_value', requestedSegments)
      .order('year', { ascending: true })

    if (typeof minYear === 'number') {
      query = query.gte('year', minYear)
    }
    if (typeof maxYear === 'number') {
      query = query.lte('year', maxYear)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching segment data:', error)
      return { data: null, error: error.message, segmentType }
    }

    if (!data || data.length === 0) {
      return { data: null, error: 'No segment data found', segmentType }
    }

    // Organize data by segment
    const segmentDataMap: Record<string, SegmentDataPoint[]> = {}
    for (const row of data) {
      const segment = row.dimension_value
      if (!segmentDataMap[segment]) {
        segmentDataMap[segment] = []
      }
      segmentDataMap[segment].push({
        year: row.year,
        value: row.metric_value,
      })
    }

    // Build result in display order
    const result: SegmentData[] = requestedSegments
      .filter(segment => segmentDataMap[segment])
      .map(segment => ({
        segment,
        data: segmentDataMap[segment].sort((a, b) => a.year - b.year),
      }))

    // Get year bounds
    const years = data.map(row => row.year)
    const yearBounds = {
      min: Math.min(...years),
      max: Math.max(...years),
    }

    return { data: result, error: null, segmentType, yearBounds }
  } catch (err) {
    console.error('Unexpected error in getSegmentData:', err)
    return {
      data: null,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
      segmentType,
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
