/**
 * Google/Alphabet (GOOGL) iXBRL Segment Mappings
 *
 * This file defines how to extract segment and disaggregated data from Google's SEC filings.
 * Google/Alphabet reports:
 * - Revenue by business segment (Google Services, Google Cloud, Other Bets)
 * - Revenue by product/service (Search, YouTube, Network, Subscriptions)
 * - Revenue by geographic region (US, EMEA, APAC, Other Americas)
 * - Operating income by business segment
 *
 * Data is extracted from Inline XBRL (iXBRL) embedded in 10-K and 10-Q HTML files.
 *
 * Segment Structure History:
 * - Pre-2020: Single "Google" segment reported
 * - Q4 2020: Split into Google Services and Google Cloud
 * - Current: Three segments (Google Services, Google Cloud, Other Bets)
 */

import type { CompanyMappings, SegmentMemberMapping, MetricMapping } from './aapl'

// Re-export types for convenience
export type { SegmentType, SegmentMemberMapping, MetricCategory, MetricMapping, CompanyMappings } from './aapl'

/**
 * Google/Alphabet XBRL Mappings
 *
 * Business segments:
 * - Google Services (Search, YouTube, Android, Chrome, Maps, Play, Devices, Subscriptions)
 * - Google Cloud (Google Cloud Platform, Google Workspace)
 * - Other Bets (Waymo, Verily, Wing, Calico, etc.)
 *
 * Product/Service breakdown (within Google Services):
 * - Google Search & Other
 * - YouTube Advertising
 * - Google Network
 * - Subscriptions, Platforms & Devices
 *
 * Geographic segments:
 * - United States
 * - EMEA (Europe, Middle East, Africa)
 * - Asia Pacific
 * - Other Americas
 */
export const GOOGL_MAPPINGS: CompanyMappings = {
  ticker: 'GOOGL',
  name: 'Alphabet Inc.',

  axes: {
    product: 'srt:ProductOrServiceAxis',
    geographic: 'srt:StatementGeographicalAxis',
    country: 'srt:StatementGeographicalAxis', // Same axis for geographic breakdown
  },

  metrics: [
    // Segment revenue (by business segment)
    {
      xbrlFact: 'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax',
      metricName: 'segment_revenue',
      metricCategory: 'segment_reporting',
      unit: 'currency',
      axes: ['us-gaap:StatementBusinessSegmentsAxis'],
    },
    // Revenue by product/service (within Google Services)
    {
      xbrlFact: 'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax',
      metricName: 'product_revenue',
      metricCategory: 'revenue_disaggregation',
      unit: 'currency',
      axes: ['srt:ProductOrServiceAxis'],
    },
    // Segment operating income
    {
      xbrlFact: 'us-gaap:OperatingIncomeLoss',
      metricName: 'segment_operating_income',
      metricCategory: 'segment_reporting',
      unit: 'currency',
      axes: ['us-gaap:StatementBusinessSegmentsAxis'],
    },
    // Revenue by geographic region
    {
      xbrlFact: 'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax',
      metricName: 'revenue_by_geography',
      metricCategory: 'segment_reporting',
      unit: 'currency',
      axes: ['srt:StatementGeographicalAxis'],
    },
    // Cost of revenue
    {
      xbrlFact: 'us-gaap:CostOfRevenue',
      metricName: 'cost_of_revenue',
      metricCategory: 'revenue_disaggregation',
      unit: 'currency',
      axes: ['us-gaap:StatementBusinessSegmentsAxis'],
    },
  ],

  fiscalYearEndMonth: 12, // December

  members: {
    // ============================================
    // Business Segments (us-gaap:StatementBusinessSegmentsAxis)
    // ============================================
    'goog:GoogleServicesMember': {
      displayName: 'Google Services',
      type: 'product', // Using 'product' type for business segments
    },
    'goog:GoogleCloudMember': {
      displayName: 'Google Cloud',
      type: 'product',
    },
    'us-gaap:AllOtherSegmentsMember': {
      displayName: 'Other Bets',
      type: 'product',
    },

    // ============================================
    // Product/Service Breakdown (srt:ProductOrServiceAxis)
    // Within Google Services - advertising revenue
    // ============================================
    'goog:GoogleSearchOtherMember': {
      displayName: 'Google Search & Other',
      type: 'product',
    },
    'goog:YouTubeAdvertisingRevenueMember': {
      displayName: 'YouTube Advertising',
      type: 'product',
    },
    'goog:GoogleNetworkMember': {
      displayName: 'Google Network',
      type: 'product',
    },
    'goog:GoogleAdvertisingRevenueMember': {
      displayName: 'Google Advertising (Total)',
      type: 'product',
    },
    'goog:SubscriptionsPlatformsAndDevicesRevenueMember': {
      displayName: 'Subscriptions, Platforms & Devices',
      type: 'product',
    },
    'goog:OtherRevenueHedgingGainLossMember': {
      displayName: 'Hedging Gains/Losses',
      type: 'product',
    },

    // ============================================
    // Geographic Segments (srt:StatementGeographicalAxis)
    // ============================================
    'country:US': {
      displayName: 'United States',
      type: 'geographic',
    },
    'us-gaap:EMEAMember': {
      displayName: 'EMEA',
      type: 'geographic',
    },
    'srt:AsiaPacificMember': {
      displayName: 'Asia Pacific',
      type: 'geographic',
    },
    'goog:AmericasExcludingUnitedStatesMember': {
      displayName: 'Other Americas',
      type: 'geographic',
    },
    'us-gaap:NonUsMember': {
      displayName: 'International (Non-US)',
      type: 'geographic',
    },
  },
}

/**
 * Get segment display name from XBRL member
 */
export function getSegmentDisplayName(xbrlMember: string): string | null {
  const mapping = GOOGL_MAPPINGS.members[xbrlMember]
  return mapping?.displayName ?? null
}

/**
 * Get segment type from XBRL member
 */
export function getSegmentType(xbrlMember: string): 'product' | 'geographic' | 'country' | 'product_type' | null {
  const mapping = GOOGL_MAPPINGS.members[xbrlMember]
  return mapping?.type ?? null
}

/**
 * Get metric mapping by XBRL fact name and axis
 */
export function getMetricMapping(xbrlFact: string, axis: string): MetricMapping | null {
  return GOOGL_MAPPINGS.metrics.find(
    (m) => m.xbrlFact === xbrlFact && m.axes.includes(axis)
  ) ?? null
}

/**
 * Get all metric mappings
 */
export function getAllMetricMappings(): MetricMapping[] {
  return GOOGL_MAPPINGS.metrics
}

/**
 * Check if an XBRL member is a known segment
 */
export function isKnownSegment(xbrlMember: string): boolean {
  return xbrlMember in GOOGL_MAPPINGS.members
}

/**
 * Get all business segment members (for segment revenue/income)
 */
export function getBusinessSegmentMembers(): string[] {
  return [
    'goog:GoogleServicesMember',
    'goog:GoogleCloudMember',
    'us-gaap:AllOtherSegmentsMember',
  ]
}

/**
 * Get all product/service members (for revenue disaggregation)
 */
export function getProductServiceMembers(): string[] {
  return [
    'goog:GoogleSearchOtherMember',
    'goog:YouTubeAdvertisingRevenueMember',
    'goog:GoogleNetworkMember',
    'goog:SubscriptionsPlatformsAndDevicesRevenueMember',
  ]
}

/**
 * Get all geographic segment members
 */
export function getGeographicSegmentMembers(): string[] {
  return [
    'country:US',
    'us-gaap:EMEAMember',
    'srt:AsiaPacificMember',
    'goog:AmericasExcludingUnitedStatesMember',
  ]
}

/**
 * Calculate fiscal year from period end date
 * Google's fiscal year ends in December, matching calendar year:
 * - Period ending Dec 2024 → FY 2024
 * - Period ending Dec 2023 → FY 2023
 */
export function getFiscalYearFromPeriodEnd(periodEnd: string): number {
  const date = new Date(periodEnd)
  return date.getFullYear()
}

/**
 * Calculate fiscal quarter from period end date
 *
 * Google Fiscal Calendar (FY ends December, matches calendar year):
 * - Q1: Jan 1 - Mar 31
 * - Q2: Apr 1 - Jun 30
 * - Q3: Jul 1 - Sep 30
 * - Q4: Oct 1 - Dec 31 (covered by 10-K)
 */
export function getFiscalQuarterFromPeriodEnd(periodEnd: string): {
  fiscalYear: number
  fiscalQuarter: 1 | 2 | 3 | 4
  period: 'Q1' | 'Q2' | 'Q3' | 'Q4'
} {
  const date = new Date(periodEnd)
  const month = date.getMonth() + 1 // 1-indexed
  const year = date.getFullYear()

  if (month >= 1 && month <= 3) {
    return { fiscalYear: year, fiscalQuarter: 1, period: 'Q1' }
  } else if (month >= 4 && month <= 6) {
    return { fiscalYear: year, fiscalQuarter: 2, period: 'Q2' }
  } else if (month >= 7 && month <= 9) {
    return { fiscalYear: year, fiscalQuarter: 3, period: 'Q3' }
  } else {
    return { fiscalYear: year, fiscalQuarter: 4, period: 'Q4' }
  }
}

/**
 * Check if a duration represents a single quarter (~13 weeks / ~91 days)
 */
export function isQuarterlyDuration(startDate: string, endDate: string): boolean {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))

  // Single quarter is approximately 84-98 days
  return days >= 84 && days <= 98
}

/**
 * Check if a duration represents a full fiscal year (~365 days)
 */
export function isAnnualDuration(startDate: string, endDate: string): boolean {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))

  // Full year is approximately 364-366 days
  return days >= 360 && days <= 370
}
