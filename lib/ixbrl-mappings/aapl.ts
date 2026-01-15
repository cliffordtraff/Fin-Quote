/**
 * Apple (AAPL) iXBRL Segment Mappings
 *
 * This file defines how to extract segment and disaggregated data from Apple's SEC filings.
 * Apple reports:
 * - Revenue by product line and by geographic region (segment_reporting)
 * - Operating income by geographic region (segment_reporting)
 * - Cost of sales by product vs services (revenue_disaggregation)
 * - Revenue by country (revenue_disaggregation)
 * - Long-lived assets by country (segment_reporting)
 *
 * Data is extracted from Inline XBRL (iXBRL) embedded in 10-K and 10-Q HTML files.
 */

export type SegmentType = 'product' | 'geographic' | 'country' | 'product_type'

export interface SegmentMemberMapping {
  displayName: string
  type: SegmentType
}

export type MetricCategory = 'segment_reporting' | 'revenue_disaggregation' | 'operating_kpi'

export interface MetricMapping {
  xbrlFact: string
  metricName: string
  metricCategory: MetricCategory
  unit: 'currency' | 'count' | 'percentage'
  axes: string[] // Which axes this metric uses
}

export interface CompanyMappings {
  ticker: string
  name: string
  // XBRL axes used for segment dimensions
  axes: {
    product: string
    geographic: string
    country: string
  }
  // Metrics to extract (multiple facts)
  metrics: MetricMapping[]
  // Mapping from XBRL member names to display names
  members: Record<string, SegmentMemberMapping>
  // Fiscal year end month (1-12). Apple's FY ends in September (month 9)
  fiscalYearEndMonth: number
}

/**
 * Apple XBRL Mappings
 *
 * Product segments:
 * - iPhone, Mac, iPad, Services, Wearables/Home/Accessories
 *
 * Geographic segments:
 * - Americas, Europe, Greater China, Japan, Rest of Asia Pacific
 *
 * Country breakdown:
 * - US, China, Other Countries
 */
export const AAPL_MAPPINGS: CompanyMappings = {
  ticker: 'AAPL',
  name: 'Apple Inc.',

  axes: {
    product: 'srt:ProductOrServiceAxis',
    geographic: 'us-gaap:StatementBusinessSegmentsAxis',
    country: 'srt:StatementGeographicalAxis',
  },

  metrics: [
    {
      xbrlFact: 'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax',
      metricName: 'segment_revenue',
      metricCategory: 'segment_reporting',
      unit: 'currency',
      axes: ['srt:ProductOrServiceAxis', 'us-gaap:StatementBusinessSegmentsAxis'],
    },
    {
      xbrlFact: 'us-gaap:OperatingIncomeLoss',
      metricName: 'segment_operating_income',
      metricCategory: 'segment_reporting',
      unit: 'currency',
      axes: ['us-gaap:StatementBusinessSegmentsAxis'],
    },
    {
      xbrlFact: 'us-gaap:CostOfGoodsAndServicesSold',
      metricName: 'cost_of_sales',
      metricCategory: 'revenue_disaggregation',
      unit: 'currency',
      axes: ['srt:ProductOrServiceAxis'],
    },
    {
      xbrlFact: 'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax',
      metricName: 'revenue_by_country',
      metricCategory: 'revenue_disaggregation',
      unit: 'currency',
      axes: ['srt:StatementGeographicalAxis'],
    },
    {
      xbrlFact: 'us-gaap:NoncurrentAssets',
      metricName: 'long_lived_assets',
      metricCategory: 'segment_reporting',
      unit: 'currency',
      axes: ['srt:StatementGeographicalAxis'],
    },
  ],

  fiscalYearEndMonth: 9, // September

  members: {
    // Product segments
    'aapl:IPhoneMember': {
      displayName: 'iPhone',
      type: 'product',
    },
    'aapl:MacMember': {
      displayName: 'Mac',
      type: 'product',
    },
    'aapl:IPadMember': {
      displayName: 'iPad',
      type: 'product',
    },
    'us-gaap:ServiceMember': {
      displayName: 'Services',
      type: 'product',
    },
    'aapl:WearablesHomeandAccessoriesMember': {
      displayName: 'Wearables, Home and Accessories',
      type: 'product',
    },
    // Aggregate product/service members (optional - for totals)
    'us-gaap:ProductMember': {
      displayName: 'Products',
      type: 'product',
    },

    // Geographic segments (reportable segments)
    'aapl:AmericasSegmentMember': {
      displayName: 'Americas',
      type: 'geographic',
    },
    'aapl:EuropeSegmentMember': {
      displayName: 'Europe',
      type: 'geographic',
    },
    'aapl:GreaterChinaSegmentMember': {
      displayName: 'Greater China',
      type: 'geographic',
    },
    'aapl:JapanSegmentMember': {
      displayName: 'Japan',
      type: 'geographic',
    },
    'aapl:RestOfAsiaPacificSegmentMember': {
      displayName: 'Rest of Asia Pacific',
      type: 'geographic',
    },

    // Country breakdown (for revenue and assets by country)
    'country:US': {
      displayName: 'United States',
      type: 'country',
    },
    'country:CN': {
      displayName: 'China',
      type: 'country',
    },
    'aapl:OtherCountriesMember': {
      displayName: 'Other Countries',
      type: 'country',
    },

    // Product type (for cost of sales)
    'us-gaap:ProductMember': {
      displayName: 'Products',
      type: 'product_type',
    },
    'us-gaap:ServiceMember': {
      displayName: 'Services',
      type: 'product_type',
    },
  },
}

/**
 * Get segment display name from XBRL member
 */
export function getSegmentDisplayName(xbrlMember: string): string | null {
  const mapping = AAPL_MAPPINGS.members[xbrlMember]
  return mapping?.displayName ?? null
}

/**
 * Get segment type from XBRL member
 */
export function getSegmentType(xbrlMember: string): SegmentType | null {
  const mapping = AAPL_MAPPINGS.members[xbrlMember]
  return mapping?.type ?? null
}

/**
 * Get segment type from XBRL axis
 */
export function getSegmentTypeFromAxis(axis: string): SegmentType | null {
  if (axis === AAPL_MAPPINGS.axes.product) {
    return 'product'
  }
  if (axis === AAPL_MAPPINGS.axes.geographic) {
    return 'geographic'
  }
  if (axis === AAPL_MAPPINGS.axes.country) {
    return 'country'
  }
  return null
}

/**
 * Get metric mapping by XBRL fact name and axis
 */
export function getMetricMapping(xbrlFact: string, axis: string): MetricMapping | null {
  return AAPL_MAPPINGS.metrics.find(
    (m) => m.xbrlFact === xbrlFact && m.axes.includes(axis)
  ) ?? null
}

/**
 * Get all metric mappings
 */
export function getAllMetricMappings(): MetricMapping[] {
  return AAPL_MAPPINGS.metrics
}

/**
 * Check if an XBRL member is a known segment
 */
export function isKnownSegment(xbrlMember: string): boolean {
  return xbrlMember in AAPL_MAPPINGS.members
}

/**
 * Get all product segment members
 */
export function getProductSegmentMembers(): string[] {
  return Object.entries(AAPL_MAPPINGS.members)
    .filter(([_, mapping]) => mapping.type === 'product')
    .map(([member]) => member)
}

/**
 * Get all geographic segment members
 */
export function getGeographicSegmentMembers(): string[] {
  return Object.entries(AAPL_MAPPINGS.members)
    .filter(([_, mapping]) => mapping.type === 'geographic')
    .map(([member]) => member)
}

/**
 * Calculate fiscal year from period end date
 * Apple's fiscal year ends in late September, so:
 * - Period ending Sep 2024 → FY 2024
 * - Period ending Sep 2023 → FY 2023
 */
export function getFiscalYearFromPeriodEnd(periodEnd: string): number {
  const date = new Date(periodEnd)
  const month = date.getMonth() + 1 // 0-indexed
  const year = date.getFullYear()

  // If period ends in or after the fiscal year end month, it's that fiscal year
  // If it ends before, it's the previous fiscal year
  if (month >= AAPL_MAPPINGS.fiscalYearEndMonth) {
    return year
  }
  return year - 1
}
