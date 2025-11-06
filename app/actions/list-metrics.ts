'use server'

/**
 * List Metrics Server Action
 *
 * Returns the catalog of all available financial metrics with metadata.
 * This is the Discovery Layer tool that helps the LLM understand what metrics exist.
 *
 * Data source: data/metrics-catalog.json (auto-generated)
 */

import catalogData from '@/data/metrics-catalog.json'

export interface MetricCatalogEntry {
  metric_name: string
  category: string
  description: string
  unit: string
  data_coverage: string
  common_aliases: string[]
}

export interface ListMetricsParams {
  category?: string
}

export interface ListMetricsResult {
  data: MetricCatalogEntry[] | null
  error: string | null
}

/**
 * Get catalog of all available financial metrics
 *
 * @param params - Optional filters
 * @param params.category - Filter by category (e.g., 'Valuation', 'Profitability & Returns')
 * @returns Array of metric catalog entries
 *
 * @example
 * // Get all metrics
 * const { data } = await listMetrics()
 *
 * @example
 * // Get only valuation metrics
 * const { data } = await listMetrics({ category: 'Valuation' })
 */
export async function listMetrics(params?: ListMetricsParams): Promise<ListMetricsResult> {
  try {
    let metrics = catalogData as MetricCatalogEntry[]

    // Filter by category if specified
    if (params?.category) {
      metrics = metrics.filter(m => m.category === params.category)

      if (metrics.length === 0) {
        return {
          data: null,
          error: `No metrics found for category: ${params.category}`
        }
      }
    }

    return {
      data: metrics,
      error: null
    }
  } catch (err) {
    console.error('Failed to load metrics catalog:', err)
    return {
      data: null,
      error: 'Failed to load metrics catalog'
    }
  }
}

/**
 * Get list of all available categories
 *
 * @returns Array of unique category names
 */
export async function listMetricCategories(): Promise<{
  data: string[] | null
  error: string | null
}> {
  try {
    const metrics = catalogData as MetricCatalogEntry[]
    const categories = [...new Set(metrics.map(m => m.category))].sort()

    return {
      data: categories,
      error: null
    }
  } catch (err) {
    console.error('Failed to load metric categories:', err)
    return {
      data: null,
      error: 'Failed to load metric categories'
    }
  }
}
